using System.Diagnostics;

namespace Mouser.Capture;

/// <summary>What the panel shows about a running (or finished) capture.</summary>
internal interface ICaptureSession : IDisposable
{
    bool Running { get; }
    string Target { get; }
    ushort Mode { get; }
    long Strokes { get; }
    long Gated { get; }
    long SendErrors { get; }
    (double P50, double P99) Latency();
    void Stop();
}

/// <summary>
/// The real thing: owns the Interception context, the stroke pump, the reporter
/// (which sends the 100 Hz UDP frames and runs the watchdog) and the filter.
///
/// This is the CLI capture path EXTRACTED, not reimplemented - the invariants in
/// DESIGN.md still hold: the pump thread allocates/locks/logs nothing, the reporter
/// is a separate thread, and the watchdog disarms the filter if the pump stalls.
/// The one addition is a creation/teardown API the control panel can drive.
/// </summary>
internal sealed class RealCaptureSession : ICaptureSession
{
    private readonly IntPtr _context;
    private readonly Capture _capture;
    private readonly Thread _pump;
    private readonly Thread _reporter;
    private readonly object _gate = new();
    private UdpSender? _udp;
    private bool _stopped;

    public string Target { get; }

    /// <summary>Raised AFTER the filter was disarmed - the owner must not join us here.</summary>
    public event Action? Stalled;

    private RealCaptureSession(IntPtr context, Capture capture, UdpSender? udp, string target)
    {
        _context = context;
        _capture = capture;
        _udp = udp;
        Target = target;

        _pump = new Thread(capture.Loop) { IsBackground = true, Name = "stroke-pump" };
        _reporter = new Thread(() => capture.Report(_udp, OnStalled)) { IsBackground = true, Name = "reporter" };
    }

    public bool Running
    {
        get { lock (_gate) return !_stopped; }
    }

    public string? FailureReason { get; private set; }

    public ushort Mode => _capture.Mode;
    public long Strokes => _capture.Strokes;
    public long Gated => _capture.Gated;
    public long SendErrors => _capture.SendErrors;
    public (double P50, double P99) Latency() => _capture.LatencyPercentiles();

    public static RealCaptureSession Start(CaptureConfig config, bool modesEnabled)
    {
        if (!Interception.TryPreload(out string loadError))
        {
            throw new ConfigException("could not load interception.dll (" + loadError + ")");
        }

        IntPtr context = Interception.interception_create_context();
        if (context == IntPtr.Zero)
        {
            throw new ConfigException(
                "interception_create_context() returned NULL. The driver is not installed, the machine "
                + "has not been rebooted since installing it, or this process cannot open \\\\.\\interception "
                + "- try again from an elevated prompt.");
        }

        UdpSender? udp = null;

        try
        {
            List<MouseInfo> mice = Interception.EnumerateMice(context);
            if (mice.Count == 0)
            {
                throw new ConfigException("the driver reports no mouse devices.");
            }

            (int device, string label) = ResolveTarget(config, mice);

            var capture = new Capture(
                context,
                device,
                modesEnabled,
                config.RotateButton,
                config.TranslateButton,
                config.PassModeButtons);

            if (Endpoints.TryParse(config.Udp) is { } endpoint)
            {
                udp = new UdpSender(endpoint);
            }

            Interception.SetMouseFilter(context, Interception.FilterMouseAll);

            var session = new RealCaptureSession(context, capture, udp, label);
            session._pump.Start();
            session._reporter.Start();
            return session;
        }
        catch
        {
            udp?.Dispose();
            Interception.interception_destroy_context(context);
            throw;
        }
    }

    /// <summary>
    /// Exact hardware id first, then a substring, then a normalised comparison -
    /// so a config saved by an older build (a raw instance id) still works.
    /// </summary>
    public static (int Device, string Label) ResolveTarget(CaptureConfig config, List<MouseInfo> mice)
    {
        if (!string.IsNullOrWhiteSpace(config.Device))
        {
            string wanted = config.Device.Trim();
            string wantedKey = DeviceCatalog.NormaliseHardwareKey(wanted);

            MouseInfo? match =
                mice.FirstOrDefault(m => string.Equals(m.HardwareId, wanted, StringComparison.OrdinalIgnoreCase))
                ?? mice.FirstOrDefault(m => m.HardwareId.Contains(wanted, StringComparison.OrdinalIgnoreCase))
                ?? mice.FirstOrDefault(m => string.Equals(
                    DeviceCatalog.NormaliseHardwareKey(m.HardwareId), wantedKey, StringComparison.OrdinalIgnoreCase));

            if (match is null)
            {
                throw new ConfigException(
                    $"no mouse matches \"{wanted}\". Plug it in and refresh the list (the panel shows every mouse the driver sees).");
            }

            return (match.Device, match.HardwareId);
        }

        if (!string.IsNullOrWhiteSpace(config.Filter))
        {
            string filter = config.Filter.Trim();
            MouseInfo? match = mice.FirstOrDefault(m =>
                m.HardwareId.Contains(filter, StringComparison.OrdinalIgnoreCase));

            if (match is null)
            {
                throw new ConfigException($"no mouse hardware id contains \"{filter}\".");
            }

            return (match.Device, match.HardwareId);
        }

        return (0, "all mice");
    }

    private void OnStalled()
    {
        // Runs on the REPORTER thread: disarm first (a dead mouse is the one
        // outcome that is never acceptable), then let the owner tear down.
        try { Interception.SetMouseFilter(_context, Interception.FilterNone); } catch (Exception) { }
        _capture.Stop();
        try { Stalled?.Invoke(); } catch (Exception) { }
    }

    public void Stop()
    {
        lock (_gate)
        {
            if (_stopped) return;
            _stopped = true;

            _capture.Stop();
            bool joined = _pump.Join(2000);

            // Restore normal mouse behaviour even if the pump is wedged.
            Interception.SetMouseFilter(_context, Interception.FilterNone);
            _reporter.Join(1000);

            if (!joined)
            {
                // Invariant 6: never destroy the context while the pump may still be
                // blocked inside interception_wait_with_timeout.
                FailureReason = "the stroke pump did not exit; leaving the driver context alone.";
                return;
            }

            _udp?.Dispose();
            _udp = null;
            Interception.interception_destroy_context(_context);
        }
    }

    public void Dispose() => Stop();
}

/// <summary>
/// `--simulate`: a complete panel with no driver, no hardware and no filter.
/// It exists so the UI can be built, demonstrated and TESTED on a machine that has
/// no Interception driver installed - it never touches a real mouse.
/// </summary>
internal sealed class SimulatedCaptureSession : ICaptureSession
{
    private readonly Timer _timer;
    private long _strokes;
    private long _gated;
    private bool _stopped;

    public SimulatedCaptureSession()
    {
        _timer = new Timer(_ => Tick(), null, 100, 100);
    }

    public bool Running => !_stopped;

    public string Target => "simulated mouse (no driver)";

    public ushort Mode => Wire.ModeOff;

    public long Strokes => Interlocked.Read(ref _strokes);

    public long Gated => Interlocked.Read(ref _gated);

    public long SendErrors => 0;

    public (double P50, double P99) Latency() => (0.08, 0.31);

    private void Tick()
    {
        // ~300 strokes/s, matching a busy mouse, so the panel shows live numbers.
        Interlocked.Add(ref _strokes, 30);
        Interlocked.Add(ref _gated, 0);
    }

    public void Stop()
    {
        if (_stopped) return;
        _stopped = true;
        _timer.Dispose();
    }

    public void Dispose() => Stop();
}

/// <summary>
/// Owns "is the capture running" for the panel: start/stop, the panic hotkey, the
/// stall notification and the rates the UI displays.
/// </summary>
internal sealed class CaptureController : IDisposable
{
    private readonly object _gate = new();
    private readonly bool _simulate;
    private ICaptureSession? _session;

    private DateTime _sampledAt = DateTime.UtcNow;
    private long _lastStrokes;
    private long _lastGated;
    private double _strokesPerSecond;
    private double _gatedPerSecond;

    public CaptureController(bool simulate) => _simulate = simulate;

    /// <summary>Set when a start failed or a session ended for an unexpected reason.</summary>
    public string? Error { get; private set; }

    /// <summary>Why the last session stopped ("" while running).</summary>
    public string? StopReason { get; private set; }

    public bool Running => Current is { Running: true };

    public string? Target { get; private set; }

    /// <summary>The config the running session was armed with (for "restart me").</summary>
    public CaptureConfig? StartedWith { get; private set; }

    public bool Simulate => _simulate;

    public ushort Mode => Current?.Mode ?? Wire.ModeOff;

    public long SendErrors => Current?.SendErrors ?? 0;

    public long TotalStrokes => Current?.Strokes ?? 0;

    public long TotalGated => Current?.Gated ?? 0;

    public (double P50, double P99) Latency() => Current?.Latency() ?? (0, 0);

    private ICaptureSession? Current
    {
        get { lock (_gate) return _session; }
    }

    public bool Start(CaptureConfig config, out string? error)
    {
        lock (_gate)
        {
            if (_session is { Running: true })
            {
                error = "capture is already running";
                return false;
            }

            _session?.Dispose();
            _session = null;

            try
            {
                if (_simulate)
                {
                    _session = new SimulatedCaptureSession();
                }
                else
                {
                    var real = RealCaptureSession.Start(config, modesEnabled: true);
                    real.Stalled += OnStalled;
                    _session = real;
                }

                Target = _session.Target;
                StartedWith = config.Clone();
                _sampledAt = DateTime.UtcNow;
                _lastStrokes = 0;
                _lastGated = 0;
                _strokesPerSecond = 0;
                _gatedPerSecond = 0;
                Error = null;
                StopReason = null;
                error = null;
                return true;
            }
            catch (ConfigException ex)
            {
                Error = ex.Message;
                error = ex.Message;
                return false;
            }
        }
    }

    private void OnStalled()
    {
        // Called from the reporter thread; the teardown joins it, so never inline.
        Error = "the stroke pump stalled - the filter was disarmed so the mouse keeps working.";
        ThreadPool.QueueUserWorkItem(_ => Stop("stalled"));
    }

    public void Stop(string reason)
    {
        lock (_gate)
        {
            if (_session is null) return;
            _session.Stop();
            _session.Dispose();
            _session = null;
            StopReason = reason;
            StartedWith = null;
            _strokesPerSecond = 0;
            _gatedPerSecond = 0;
        }
    }

    /// <summary>The panic hotkey: disarm, keep the process (and the panel) alive.</summary>
    public void Panic()
    {
        Error = "stopped by the panic hotkey (Ctrl+Alt+Shift+Q)";
        Stop("hotkey");
    }

    /// <summary>Rates since the previous call; a poll interval below 200 ms reuses them.</summary>
    public (double Strokes, double Gated) Rates()
    {
        ICaptureSession? session = Current;
        if (session is null) return (0, 0);

        DateTime now = DateTime.UtcNow;
        double elapsed = (now - _sampledAt).TotalSeconds;
        if (elapsed < 0.2) return (_strokesPerSecond, _gatedPerSecond);

        long strokes = session.Strokes;
        long gated = session.Gated;

        _strokesPerSecond = Math.Max(0, (strokes - _lastStrokes) / elapsed);
        _gatedPerSecond = Math.Max(0, (gated - _lastGated) / elapsed);
        _lastStrokes = strokes;
        _lastGated = gated;
        _sampledAt = now;

        return (_strokesPerSecond, _gatedPerSecond);
    }

    public void Dispose()
    {
        Stop("shutdown");
    }
}
