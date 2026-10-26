using System.Diagnostics;
using System.Net;
using System.Security.Principal;
using System.Text.Json;

namespace Mouser.Capture;

/// <summary>Run-time switches that must NOT be written back to the config file.</summary>
internal sealed class CaptureAppOptions
{
    public bool Simulate { get; init; }
    public bool NoDriver { get; init; }
    public bool NoQr { get; init; }
    public bool? Tunnel { get; init; }
    public bool? BindLan { get; init; }
    public int? PanelPort { get; init; }
    public string? PublicUrl { get; init; }
}

/// <summary>
/// `--ui`: the management socket, the QR/address page, the panic hotkey and the
/// capture session supervisor.
///
/// THE UI ITSELF IS NOT HERE. Configuration lives in the PhoneButtons app
/// (Manage mouser-capture), which talks to this JSON API over the Cloudflare
/// tunnel; the page this serves is only a scan target plus live status. Keeping
/// one UI avoids two divergent copies of the same form, and the app already has
/// the shared smd-* components, the theme engine and the tests.
/// </summary>
internal sealed class CaptureApp : IDisposable
{
    private readonly ConfigStore _store;
    private readonly CaptureAppOptions _options;
    private readonly CaptureController _controller;
    private readonly TunnelRunner _tunnel = new();
    private readonly RawMouseWindow _raw = new();
    private readonly List<MouseDevice> _devices = new();
    private readonly string _token;

    private ControlPanel? _panel;
    private string? _driverError;
    private bool _driverAvailable;
    private volatile bool _quit;

    public CaptureApp(ConfigStore store, CaptureAppOptions options)
    {
        _store = store;
        _options = options;
        _controller = new CaptureController(options.Simulate);
        _token = store.Config.AuthToken ?? CaptureConfig.NewToken();
        store.Config.AuthToken = _token;

        if (options.Simulate)
        {
            _devices.AddRange(DeviceCatalog.Simulated());
            _driverAvailable = false;
            _driverError = null;
            return;
        }

        if (options.NoDriver)
        {
            _driverError = "the driver was disabled with --no-driver, so the panel cannot arm capture.";
            return;
        }

        RefreshDevices();
    }

    private CaptureConfig Config => _store.Config;

    public void RequestQuit() => _quit = true;

    /// <summary>Re-enumerates mice, creating a short-lived Interception context.</summary>
    private void RefreshDevices()
    {
        _devices.Clear();

        if (_options.Simulate)
        {
            _devices.AddRange(DeviceCatalog.Simulated());
            return;
        }

        if (!Interception.TryPreload(out string loadError))
        {
            _driverAvailable = false;
            _driverError = "could not load interception.dll: " + loadError;
            return;
        }

        IntPtr context = Interception.interception_create_context();
        if (context == IntPtr.Zero)
        {
            _driverAvailable = false;
            _driverError = "interception_create_context() returned NULL - the driver is not installed, "
                + "the machine has not been rebooted since installing it, or run this as administrator.";
            return;
        }

        try
        {
            _devices.AddRange(DeviceCatalog.Enumerate(context));
            _driverAvailable = true;
            _driverError = null;
        }
        catch (Exception ex)
        {
            _driverAvailable = false;
            _driverError = "could not enumerate mice: " + ex.Message;
        }
        finally
        {
            Interception.interception_destroy_context(context);
        }
    }

    public int Run()
    {
        // Persist the token immediately: it is the QR/phone credential, so it must
        // survive a crash even if nothing else is ever saved.
        TrySave(Config);

        bool bindLan = _options.BindLan ?? Config.BindLan;
        int port = _options.PanelPort ?? Config.PanelPort;
        string? publicUrl = string.IsNullOrWhiteSpace(_options.PublicUrl) ? Config.PublicUrl : _options.PublicUrl;

        try
        {
            _panel = new ControlPanel(port, bindLan, _token, Handle);
        }
        catch (Exception ex)
        {
            Console.Error.WriteLine($"error: could not open the management socket on port {port}: {ex.Message}");
            Console.Error.WriteLine("       pass --panel-port <n> to choose another one, or 0 for any free port.");
            return 8;
        }

        _raw.Start();
        _raw.PanicKey += () => _controller.Panic();

        Console.WriteLine("mouser-capture control panel");
        Console.WriteLine($"  build  : {Program.BuildVersion}");
        Console.WriteLine($"  config : {_store.Path}");
        Console.WriteLine($"  bind   : {_panel.BindAddress}:{_panel.Port}");
        // The exact line a launcher (and the tests) parse. Always loopback so it is
        // reachable even when the panel also listens on the LAN.
        Console.WriteLine($"panel: http://127.0.0.1:{_panel.Port}/?t={_token}");
        if (bindLan)
        {
            Console.WriteLine($"  lan    : http://{NetworkInfo.LanAddress()}:{_panel.Port}/?t={_token}");
        }

        Console.WriteLine($"  driver : {(_options.Simulate ? "simulated (--simulate)" : _driverAvailable ? "ready" : _driverError)}");
        Console.WriteLine($"  hotkey : Ctrl+Alt+Shift+Q disarms the filter");
        foreach (string warning in _raw.Warnings) Console.WriteLine("  warning: " + warning);

        bool tunnelRequested = _options.Tunnel ?? Config.Tunnel;
        if (tunnelRequested)
        {
            _tunnel.Start(_panel.Port, publicUrl);
            Console.WriteLine($"  tunnel : {_tunnel.State}{(_tunnel.Url is null ? "" : " " + _tunnel.Url)}");
            if (_tunnel.Error is not null) Console.WriteLine("  tunnel : " + _tunnel.Error);
            if (_tunnel.Url is not null)
            {
                Console.WriteLine("  phone  : scan the QR below, or paste into PhoneButtons -> Manage mouser-capture");
            }
        }
        else
        {
            Console.WriteLine("  tunnel : off (pass --tunnel to publish the panel through Cloudflare)");
        }

        if (Config.AutoStart)
        {
            Console.WriteLine("  autoStart: replaying the previous session ...");
            if (!_controller.Start(Config, out string? error))
            {
                Console.WriteLine("  autoStart: could not start: " + error);
            }
        }

        if (!_options.NoQr) OpenBrowser();

        WaitForQuit();

        Console.WriteLine("stopping capture ...");
        _controller.Stop("shutdown");
        _tunnel.Dispose();
        _raw.Dispose();
        _panel?.Dispose();
        return 0;
    }

    private void WaitForQuit()
    {
        while (!_quit)
        {
            if (!Console.IsInputRedirected)
            {
                try
                {
                    while (Console.KeyAvailable)
                    {
                        ConsoleKey key = Console.ReadKey(intercept: true).Key;
                        if (key is ConsoleKey.Q or ConsoleKey.Escape) _quit = true;
                    }
                }
                catch (InvalidOperationException)
                {
                    Thread.Sleep(100);
                }
            }

            Thread.Sleep(100);
        }
    }

    private void OpenBrowser()
    {
        string url = "http://127.0.0.1:" + _panel!.Port + "/?t=" + _token;
        try
        {
            Process.Start(new ProcessStartInfo(url) { UseShellExecute = true });
        }
        catch (Exception ex)
        {
            Console.WriteLine("  could not open a browser: " + ex.Message + " (open " + url + ")");
        }
    }

    private void TrySave(CaptureConfig config)
    {
        try { _store.Save(config); }
        catch (ConfigException ex) { Console.Error.WriteLine("warning: could not save settings: " + ex.Message); }
    }

    // ---- HTTP routes -------------------------------------------------------

    private PanelResponse Handle(PanelRequest request)
    {
        string path = request.Path.TrimEnd('/');
        if (path.Length == 0) path = "/";

        if (request.Method == "GET" && path == "/") return PanelResponse.Html(PageHtml());
        if (request.Method == "GET" && path == "/qrcode.min.js") return PanelResponse.Script(EmbeddedText("ui.qrcode.js"));

        if (request.Method == "GET" && path == "/api/state") return PanelResponse.Json(State());
        if (request.Method == "GET" && path == "/api/devices") return PanelResponse.Json(new { devices = DeviceRows() });

        if (request.Method == "POST" && path == "/api/devices") return RefreshDevicesRoute();
        if (request.Method == "POST" && path == "/api/config") return SaveConfigRoute(request);
        if (request.Method == "POST" && path == "/api/capture/start") return StartRoute();
        if (request.Method == "POST" && path == "/api/capture/stop") return StopRoute();
        if (request.Method == "POST" && path == "/api/ping") return PingRoute(request);
        if (request.Method == "POST" && path == "/api/tunnel/start") return TunnelStartRoute();
        if (request.Method == "POST" && path == "/api/tunnel/stop") return TunnelStopRoute();

        return PanelResponse.Error(404, "no such route: " + request.Path);
    }

    private PanelResponse RefreshDevicesRoute()
    {
        if (!_options.Simulate) RefreshDevices();
        return PanelResponse.Json(new { devices = DeviceRows() });
    }

    private PanelResponse SaveConfigRoute(PanelRequest request)
    {
        CaptureConfig incoming;
        try
        {
            incoming = JsonSerializer.Deserialize<CaptureConfig>(request.Body, CaptureConfig.JsonOptions)
                ?? throw new ConfigException("the request body is empty");
        }
        catch (JsonException ex)
        {
            return PanelResponse.Error(400, "invalid JSON: " + ex.Message);
        }
        catch (ConfigException ex)
        {
            return PanelResponse.Error(400, ex.Message);
        }

        // The token is the phone's credential: the API must never change it, or a
        // stale tab could lock a working phone out.
        incoming.AuthToken = Config.AuthToken;

        try
        {
            incoming.Validate();
        }
        catch (ConfigException ex)
        {
            return PanelResponse.Error(400, ex.Message);
        }

        try
        {
            _store.Save(incoming);
        }
        catch (ConfigException ex)
        {
            return PanelResponse.Error(400, ex.Message);
        }

        return PanelResponse.Json(new { ok = true, config = Config, configPath = _store.Path });
    }

    private PanelResponse StartRoute()
    {
        if (_controller.Running)
        {
            return PanelResponse.Error(409, "capture is already running");
        }

        if (!Config.AutoStart)
        {
            Config.AutoStart = true;
            TrySave(Config);
        }

        if (_controller.Start(Config, out string? error))
        {
            return PanelResponse.Json(new { ok = true, capture = CaptureState() });
        }

        return PanelResponse.Json(new { ok = false, error }, 400);
    }

    private PanelResponse StopRoute()
    {
        // An explicit stop is a decision, so do not re-arm it on the next launch.
        if (Config.AutoStart)
        {
            Config.AutoStart = false;
            TrySave(Config);
        }

        _controller.Stop("stopped from the app");
        return PanelResponse.Json(new { ok = true, capture = CaptureState() });
    }

    private PanelResponse TunnelStartRoute()
    {
        if (_options.Simulate)
        {
            return PanelResponse.Error(409, "--simulate never publishes anything: it exists to exercise the panel without a driver.");
        }

        if (_panel is null) return PanelResponse.Error(409, "the panel is not running");

        _tunnel.Start(_panel.Port, Config.PublicUrl);
        return PanelResponse.Json(new { ok = true, tunnel = TunnelState() });
    }

    private PanelResponse TunnelStopRoute()
    {
        _tunnel.Stop();
        return PanelResponse.Json(new { ok = true, tunnel = TunnelState() });
    }

    private sealed class PingBody
    {
        public string? Udp { get; set; }
        public int Attempts { get; set; } = 5;
        public int TimeoutMs { get; set; } = 500;
    }

    private PanelResponse PingRoute(PanelRequest request)
    {
        PingBody body = new();
        if (!string.IsNullOrWhiteSpace(request.Body))
        {
            try
            {
                body = JsonSerializer.Deserialize<PingBody>(request.Body, PanelJson.Options) ?? body;
            }
            catch (JsonException ex)
            {
                return PanelResponse.Error(400, "invalid JSON: " + ex.Message);
            }
        }

        string target = string.IsNullOrWhiteSpace(body.Udp) ? Config.Udp ?? string.Empty : body.Udp;

        IPEndPoint endpoint;
        try
        {
            endpoint = Endpoints.Parse(target);
        }
        catch (ConfigException ex)
        {
            return PanelResponse.Json(new
            {
                ok = false,
                replies = 0,
                message = ex.Message + " - set the server address in the app first.",
            });
        }

        int attempts = Math.Clamp(body.Attempts, 1, 20);
        int timeout = Math.Clamp(body.TimeoutMs, 50, 5000);
        (int replies, double? rtt, string? error) = UdpPing.Run(endpoint, attempts, timeout);

        return PanelResponse.Json(new
        {
            ok = error is null,
            target = endpoint.ToString(),
            attempts,
            replies,
            rttMs = rtt,
            message = error,
        });
    }

    // ---- state -------------------------------------------------------------

    private object CaptureState()
    {
        (double strokes, double gated) = _controller.Rates();
        (double p50, double p99) = _controller.Latency();
        ushort mode = _controller.Mode;

        return new
        {
            running = _controller.Running,
            mode = (int)mode,
            modeName = Capture.ModeName(mode),
            target = _controller.Target,
            strokes = _controller.TotalStrokes,
            gated = _controller.TotalGated,
            strokesPerSecond = Math.Round(strokes, 1),
            gatedPerSecond = Math.Round(gated, 1),
            sendErrors = _controller.SendErrors,
            loopP50Ms = Math.Round(p50, 3),
            loopP99Ms = Math.Round(p99, 3),
            udp = Config.Udp,
            error = _controller.Error,
            stopReason = _controller.StopReason,
            restartRequired = _controller.Running && !Config.SameCaptureAs(_controller.StartedWith ?? Config),
        };
    }

    private object TunnelState() => new
    {
        state = _tunnel.State,
        url = _tunnel.Url,
        error = _tunnel.Error,
        enabled = _tunnel.Enabled,
        available = _options.Simulate
            ? false
            : !string.IsNullOrWhiteSpace(Config.PublicUrl) || Cloudflared.Locate().Length > 0,
        cloudflared = _tunnel.CloudflaredPath,
        requested = _options.Tunnel ?? Config.Tunnel,
        publicUrl = Config.PublicUrl,
    };

    private object PanelState()
    {
        string loopback = "http://127.0.0.1:" + _panel!.Port + "/?t=" + _token;
        string lan = "http://" + NetworkInfo.LanAddress() + ":" + _panel.Port + "/?t=" + _token;

        return new
        {
            port = _panel.Port,
            bind = _panel.BindAddress,
            urls = new { loopback, lan, tunnel = _tunnel.Url },
            publicUrl = PublicUrl(),
            configPath = _store.Path,
            configWarning = _store.Warning,
        };
    }

    /// <summary>The address to encode in the QR: the tunnel when up, else LAN, else loopback.</summary>
    public string PublicUrl()
    {
        string baseUrl = _tunnel.Url
            ?? (_panel is not null && (_options.BindLan == true || Config.BindLan)
                ? "http://" + NetworkInfo.LanAddress() + ":" + _panel.Port
                : "http://127.0.0.1:" + (_panel?.Port ?? Config.PanelPort));

        return baseUrl.TrimEnd('/') + "/?t=" + _token;
    }

    private object[] DeviceRows()
    {
        Dictionary<string, long> motion = _raw.DrainMotion();

        return _devices.Select(device =>
        {
            string key = DeviceCatalog.NormaliseHardwareKey(device.HardwareId);
            return (object)new
            {
                slot = device.Slot,
                hardwareId = device.HardwareId,
                name = device.Name,
                moving = device.Simulated ? device.Moving : motion.ContainsKey(key),
                simulated = device.Simulated,
            };
        }).ToArray();
    }

    private object State() => new
    {
        build = Program.BuildVersion,
        simulate = _options.Simulate,
        elevated = IsElevated(),
        canStart = _options.Simulate || _driverAvailable,
        blockReason = _options.Simulate || _driverAvailable
            ? null
            : _driverError ?? "the Interception driver is not available",
        driver = new
        {
            available = _driverAvailable,
            simulated = _options.Simulate,
            disabled = _options.NoDriver,
            error = _driverError,
        },
        capture = CaptureState(),
        config = Config,
        devices = DeviceRows(),
        tunnel = TunnelState(),
        panel = PanelState(),
        hotkey = new { keys = "Ctrl+Alt+Shift+Q", registered = _raw.HotkeyRegistered },
        warnings = Warnings(),
    };

    private string[] Warnings()
    {
        var all = new List<string>(_raw.Warnings);
        if (_store.Warning is not null) all.Add(_store.Warning);
        if (!_options.Simulate && _driverError is not null) all.Add(_driverError);
        return all.ToArray();
    }

    private static bool IsElevated()
    {
        try
        {
            using WindowsIdentity identity = WindowsIdentity.GetCurrent();
            return new WindowsPrincipal(identity).IsInRole(WindowsBuiltInRole.Administrator);
        }
        catch (Exception)
        {
            return false;
        }
    }

    // ---- page --------------------------------------------------------------

    private string PageHtml()
    {
        string html = EmbeddedText("ui.index.html");
        return html
            .Replace("{{TOKEN}}", _token)
            .Replace("{{BUILD}}", Program.BuildVersion)
            .Replace("{{ADDRESS}}", System.Net.WebUtility.HtmlEncode(PublicUrl()));
    }

    private static string EmbeddedText(string name)
    {
        System.Reflection.Assembly assembly = typeof(CaptureApp).Assembly;
        using Stream? stream = assembly.GetManifestResourceStream(name);
        if (stream is null)
        {
            return "/* missing embedded resource: " + name + " */";
        }

        using var reader = new StreamReader(stream);
        return reader.ReadToEnd();
    }

    public void Dispose()
    {
        _controller.Dispose();
        _tunnel.Dispose();
        _raw.Dispose();
        _panel?.Dispose();
    }
}
