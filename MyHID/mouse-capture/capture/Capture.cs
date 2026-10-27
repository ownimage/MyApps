using System.Diagnostics;

namespace Mouse.Capture;

/// <summary>
/// The stroke pump. Runs on its own thread because
/// interception_wait_with_timeout blocks, and nothing in this class is allowed
/// to allocate or block while strokes are in flight.
/// </summary>
internal sealed class Capture
{
    private readonly IntPtr _context;
    private readonly int _targetDevice;
    private readonly bool _modesEnabled;
    private readonly bool _passModeButtons;

    private readonly ushort _rotateDown;
    private readonly ushort _rotateUp;
    private readonly ushort _translateDown;
    private readonly ushort _translateUp;

    private readonly Interception.MouseStroke[] _incoming = new Interception.MouseStroke[64];
    private readonly Interception.MouseStroke[] _outgoing = new Interception.MouseStroke[64];
    private readonly long[] _latencySamples = new long[8192];
    private int _latencyIndex;

    private volatile bool _stop;
    private volatile bool _rotateHeld;
    private volatile bool _translateHeld;
    private bool _rotateDownSwallowed;
    private bool _translateDownSwallowed;
    private long _lastAlive;

    private long _frameDx;
    private long _frameDy;
    private long _frameWheel;
    private long _strokeCount;
    private long _gatedCount;
    private long _sendErrors;

    public Capture(
        IntPtr context,
        int targetDevice,
        bool modesEnabled,
        int rotateButton,
        int translateButton,
        bool passModeButtons)
    {
        _context = context;
        _targetDevice = targetDevice;
        _modesEnabled = modesEnabled;
        _passModeButtons = passModeButtons;

        (_rotateDown, _rotateUp) = ButtonStrokes(rotateButton);
        (_translateDown, _translateUp) = ButtonStrokes(translateButton);

        _lastAlive = Stopwatch.GetTimestamp();
    }

    private static (ushort Down, ushort Up) ButtonStrokes(int button) => button switch
    {
        3 => (Interception.MouseMiddleDown, Interception.MouseMiddleUp),
        4 => (Interception.MouseButton4Down, Interception.MouseButton4Up),
        5 => (Interception.MouseButton5Down, Interception.MouseButton5Up),
        _ => ((ushort)0, (ushort)0),
    };

    /// <summary>0 = off, 1 = rotate (MB4), 2 = translate (MB5).</summary>
    public ushort Mode =>
        !_modesEnabled ? Wire.ModeOff
        : _rotateHeld ? Wire.ModeRotate
        : _translateHeld ? Wire.ModeTranslate
        : Wire.ModeOff;

    public bool GateActive => Mode != Wire.ModeOff;

    /// <summary>Cumulative counters, read by the control panel (never by the pump).</summary>
    public long Strokes => Interlocked.Read(ref _strokeCount);

    public long Gated => Interlocked.Read(ref _gatedCount);

    public long SendErrors => Interlocked.Read(ref _sendErrors);

    // ---- learn mode -------------------------------------------------------
    //
    // "Which button did I just press?" has to be answered by the PUMP, not by raw
    // input: the pump is the only place that sees a stroke AND can swallow it, and
    // swallowing matters because MB4/MB5 are Back/Forward in a browser - a naive
    // listener would navigate the page away mid-learn.
    //
    // The pump may not allocate or lock, so this is a volatile flag plus two
    // Interlocked fields, exactly like the mode state above.

    private volatile bool _learnActive;
    private int _learnButton;

    public bool LearnActive => _learnActive;

    /// <summary>Arms learn mode. False when the pump has already stopped.</summary>
    public bool BeginLearn()
    {
        if (_stop) return false;

        Interlocked.Exchange(ref _learnButton, 0);

        // A mode held when learning starts must not leave the gate armed after it.
        _rotateHeld = false;
        _translateHeld = false;
        _rotateDownSwallowed = false;
        _translateDownSwallowed = false;

        _learnActive = true;
        return true;
    }

    public void EndLearn()
    {
        _learnActive = false;
        // The learn branch swallowed the button edges, so the pump never saw them
        // go up: clear the held flags or the mouse could stay gated afterwards.
        _rotateHeld = false;
        _translateHeld = false;
        _rotateDownSwallowed = false;
        _translateDownSwallowed = false;
    }

    /// <summary>Takes the learned button number (0 = nothing yet).</summary>
    public bool TryTakeLearnedButton(out int button)
    {
        button = Interlocked.Exchange(ref _learnButton, 0);
        return button != 0;
    }

    /// <summary>1 = left, 2 = right, 3 = middle, 4/5 = the side buttons; 0 = not a press.</summary>
    private static int DownButton(ushort state)
    {
        if ((state & Interception.MouseLeftDown) != 0) return 1;
        if ((state & Interception.MouseRightDown) != 0) return 2;
        if ((state & Interception.MouseMiddleDown) != 0) return 3;
        if ((state & Interception.MouseButton4Down) != 0) return 4;
        if ((state & Interception.MouseButton5Down) != 0) return 5;
        return 0;
    }

    public static string ModeName(ushort mode) => mode switch
    {
        Wire.ModeRotate => "ROT",
        Wire.ModeTranslate => "TRA",
        _ => "off",
    };

    public void Stop() => _stop = true;

    /// <summary>True when the pump has not ticked for long enough to worry.</summary>
    public bool IsStalled => ElapsedMs(ref _lastAlive) > 500.0;

    private bool IsTarget(int device) => _targetDevice == 0 || device == _targetDevice;

    public void Loop()
    {
        while (!_stop)
        {
            int device = Interception.interception_wait_with_timeout(_context, 50);
            Interlocked.Exchange(ref _lastAlive, Stopwatch.GetTimestamp());

            if (device <= 0) continue;
            if (Interception.interception_is_mouse(device) == 0) continue;

            int count = Interception.interception_receive(_context, device, _incoming, (uint)_incoming.Length);
            if (count <= 0) continue;

            long start = Stopwatch.GetTimestamp();
            bool target = IsTarget(device);
            int keep = 0;

            for (int i = 0; i < count; i++)
            {
                ref Interception.MouseStroke mouse = ref _incoming[i];

                // Re-read the mode per stroke: a batch can contain the mode
                // button press followed by motion in the same receive.
                // A mouse stroke carries no type tag. Motion is the stroke with no
                // button or wheel bits set; 0x1000 is a filter bit, never a stroke
                // flag. ATTRIBUTES_CHANGED is excluded so a display change still
                // reaches the OS while gated.
                bool motion = mouse.state == 0
                    && (mouse.flags & Interception.FlagAttributesChanged) == 0;

                // Learn mode: report the first button press and SWALLOW it, so MB4/MB5
                // cannot navigate the foreground app while the panel asks "click a
                // mouse button". Motion still passes - nothing is gated while learning.
                if (target && _learnActive)
                {
                    if ((mouse.state & Interception.ButtonMask) != 0)
                    {
                        int pressed = DownButton(mouse.state);
                        if (pressed != 0) Interlocked.Exchange(ref _learnButton, pressed);
                        continue;
                    }

                    _outgoing[keep++] = mouse;
                    continue;
                }

                bool rotateSwallowed = false;
                bool translateSwallowed = false;
                if (target && _modesEnabled)
                {
                    // Track the mode buttons before deciding whether to forward
                    // this stroke. By default the configured mode buttons are
                    // consumed as well, so MB4/MB5 do not also click in the
                    // foreground app (MB4 is usually browser Back).
                    if (_rotateDown != 0)
                    {
                        if ((mouse.state & _rotateDown) != 0)
                        {
                            _rotateHeld = true;
                            _rotateDownSwallowed = !_passModeButtons;
                            rotateSwallowed = _rotateDownSwallowed;
                        }
                        if ((mouse.state & _rotateUp) != 0)
                        {
                            _rotateHeld = false;
                            // Only consume an up if we consumed its down. If the
                            // client started while the button was already held,
                            // pass the up through so the OS can clear any state
                            // it saw before the filter was armed.
                            rotateSwallowed = _rotateDownSwallowed;
                            _rotateDownSwallowed = false;
                        }
                    }

                    if (_translateDown != 0)
                    {
                        if ((mouse.state & _translateDown) != 0)
                        {
                            _translateHeld = true;
                            _translateDownSwallowed = !_passModeButtons;
                            translateSwallowed = _translateDownSwallowed;
                        }
                        if ((mouse.state & _translateUp) != 0)
                        {
                            _translateHeld = false;
                            translateSwallowed = _translateDownSwallowed;
                            _translateDownSwallowed = false;
                        }
                    }
                }

                bool swallow = rotateSwallowed || translateSwallowed;

                // The mode changes on this stroke, so a press takes effect
                // immediately and a release restores normal motion immediately.
                bool gating = target && !_learnActive && GateActive;

                if (gating && motion)
                {
                    Interlocked.Add(ref _frameDx, mouse.x);
                    Interlocked.Add(ref _frameDy, mouse.y);
                    Interlocked.Increment(ref _gatedCount);
                    continue;
                }

                if (gating && (mouse.state & Interception.WheelMask) != 0)
                {
                    Interlocked.Add(ref _frameWheel, mouse.rolling);
                    Interlocked.Increment(ref _gatedCount);

                    // Drop the wheel bits, but keep any button bits in the same
                    // stroke so an unrelated click is not lost.
                    mouse.state = (ushort)(mouse.state & ~Interception.WheelMask);
                    if (mouse.state == 0) continue;
                }

                if (swallow)
                {
                    // Do not lose an unrelated button bit if a single stroke
                    // happens to carry it alongside a mode-button edge. Only
                    // mask the edges that were actually consumed: an up whose
                    // down we never saw must still reach the OS.
                    ushort modeMask = 0;
                    if (rotateSwallowed) modeMask |= (ushort)(_rotateDown | _rotateUp);
                    if (translateSwallowed) modeMask |= (ushort)(_translateDown | _translateUp);

                    ushort remaining = (ushort)(mouse.state & ~modeMask);

                    if (remaining != 0)
                    {
                        Interception.MouseStroke forwarded = mouse;
                        forwarded.state = remaining;
                        _outgoing[keep++] = forwarded;
                    }

                    continue;
                }

                _outgoing[keep++] = mouse;
            }

            if (keep > 0 && Interception.interception_send(_context, device, _outgoing, (uint)keep) == 0)
            {
                Interlocked.Increment(ref _sendErrors);
            }

            Interlocked.Add(ref _strokeCount, count);

            long elapsed = Stopwatch.GetTimestamp() - start;
            long nanoseconds = (long)(elapsed * (1_000_000_000.0 / Stopwatch.Frequency));
            Interlocked.Exchange(ref _latencySamples[_latencyIndex], nanoseconds);
            _latencyIndex = (_latencyIndex + 1) & 8191;
        }
    }

    /// <summary>
    /// Reporting, UDP framing, and the watchdog. Deliberately on a different
    /// thread from the pump so a slow socket or a slow console can never delay
    /// stroke forwarding.
    /// </summary>
    public void Report(UdpSender? udp, Action onStall)
    {
        long lastReport = Stopwatch.GetTimestamp();
        long lastStrokes = 0;
        long lastGated = 0;
        bool stallReported = false;

        while (!_stop)
        {
            Thread.Sleep(10);

            long dx = Interlocked.Exchange(ref _frameDx, 0);
            long dy = Interlocked.Exchange(ref _frameDy, 0);
            long dz = Interlocked.Exchange(ref _frameWheel, 0);
            ushort mode = Mode;
            udp?.Send(dx, dy, dz, mode);

            if (IsStalled)
            {
                if (!stallReported)
                {
                    stallReported = true;
                    onStall();
                }
                continue;
            }

            long now = Stopwatch.GetTimestamp();
            double elapsed = (now - lastReport) / (double)Stopwatch.Frequency;
            if (elapsed < 1.0) continue;

            long strokes = Interlocked.Read(ref _strokeCount);
            long gated = Interlocked.Read(ref _gatedCount);
            (double p50, double p99) = LatencyPercentiles();

            Console.WriteLine(string.Format(
                System.Globalization.CultureInfo.InvariantCulture,
                "{0:HH:mm:ss}  mode={1,-3}  strokes {2,6:F0}/s  gated {3,6:F0}/s  loop p50 {4:F3} ms  p99 {5:F3} ms  err {6}",
                DateTime.Now,
                ModeName(mode),
                (strokes - lastStrokes) / elapsed,
                (gated - lastGated) / elapsed,
                p50,
                p99,
                Interlocked.Read(ref _sendErrors)));

            lastReport = now;
            lastStrokes = strokes;
            lastGated = gated;
        }
    }

    public (double P50, double P99) LatencyPercentiles()
    {
        var samples = new List<long>(4096);
        for (int i = 0; i < _latencySamples.Length; i++)
        {
            long value = Interlocked.Read(ref _latencySamples[i]);
            if (value > 0) samples.Add(value);
        }

        if (samples.Count == 0) return (0, 0);

        samples.Sort();
        int p50 = (int)(samples.Count * 0.50);
        int p99 = Math.Min(samples.Count - 1, (int)(samples.Count * 0.99));
        return (samples[p50] / 1_000_000.0, samples[p99] / 1_000_000.0);
    }

    private static double ElapsedMs(ref long timestamp)
    {
        long value = Interlocked.Read(ref timestamp);
        return (Stopwatch.GetTimestamp() - value) * 1000.0 / Stopwatch.Frequency;
    }
}
