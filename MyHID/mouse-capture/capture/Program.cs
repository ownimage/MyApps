using System.Buffers.Binary;
using System.Diagnostics;
using System.Globalization;
using System.Net;
using System.Net.Sockets;
using System.Reflection;
using System.Text;

namespace Mouse.Capture;

internal sealed class OptionException : Exception
{
    public OptionException(string message) : base(message) { }
}

internal sealed class Options
{
    public string Mode { get; set; } = string.Empty;
    public string? Filter { get; set; }
    public string? Device { get; set; }
    public IPEndPoint? UdpTarget { get; set; }
    public int Port { get; set; } = 7801;
    public int RotateButton { get; set; } = 4;
    public int TranslateButton { get; set; } = 5;
    public bool PassModeButtons { get; set; }

    // Only meaningful for --ui; a switch that was not given leaves the saved value.
    public bool RotateGiven { get; set; }
    public bool TranslateGiven { get; set; }
    public string? ConfigPath { get; set; }
    public int? PanelPort { get; set; }
    public bool? TunnelOverride { get; set; }
    public string? PublicUrl { get; set; }
    public bool BindLan { get; set; }
    public bool Simulate { get; set; }
    public bool NoDriver { get; set; }
    public bool NoQr { get; set; }
    public bool? AutoStartOverride { get; set; }

    public static Options Parse(string[] args)
    {
        var options = new Options();

        for (int i = 0; i < args.Length; i++)
        {
            string arg = args[i];
            switch (arg)
            {
                case "--list": options.Mode = "list"; break;
                case "--passthrough": options.Mode = "passthrough"; break;
                case "--gate": options.Mode = "gate"; break;
                case "--rawdump": options.Mode = "rawdump"; break;
                case "--recv": options.Mode = "recv"; break;
                case "--ping": options.Mode = "ping"; break;
                case "--ui": options.Mode = "ui"; break;
                case "--version": options.Mode = "version"; break;
                case "-h":
                case "--help": options.Mode = "help"; break;

                case "--filter":
                    options.Filter = Value(args, ref i, arg);
                    break;

                case "--device":
                    options.Device = Value(args, ref i, arg);
                    break;

                case "--udp":
                    options.UdpTarget = ParseEndpoint(Value(args, ref i, arg));
                    break;

                case "--port":
                    options.Port = ParseInt(Value(args, ref i, arg), arg);
                    break;

                case "--panel-port":
                    options.PanelPort = ParseInt(Value(args, ref i, arg), arg);
                    break;

                case "--config":
                    options.ConfigPath = Value(args, ref i, arg);
                    break;

                case "--public-url":
                    options.PublicUrl = Value(args, ref i, arg);
                    break;

                case "--tunnel":
                    options.TunnelOverride = true;
                    break;

                case "--no-tunnel":
                    options.TunnelOverride = false;
                    break;

                case "--bind-lan":
                    options.BindLan = true;
                    break;

                case "--simulate":
                    options.Simulate = true;
                    break;

                case "--no-driver":
                    options.NoDriver = true;
                    break;

                case "--no-qr":
                    options.NoQr = true;
                    break;

                case "--auto-start":
                    options.AutoStartOverride = true;
                    break;

                case "--no-auto-start":
                    options.AutoStartOverride = false;
                    break;

                case "--rotate-button":
                    options.RotateButton = ParseButton(Value(args, ref i, arg), arg);
                    options.RotateGiven = true;
                    break;

                case "--translate-button":
                    options.TranslateButton = ParseButton(Value(args, ref i, arg), arg);
                    options.TranslateGiven = true;
                    break;

                case "--pass-mode-buttons":
                    options.PassModeButtons = true;
                    break;

                default:
                    throw new OptionException($"unknown argument '{arg}'");
            }
        }

        return options;
    }

    public static void PrintUsage()
    {
        Console.WriteLine("""
            mouse-capture - read a mouse below raw input and stop it propagating

            usage:
              mouse-capture --list
              mouse-capture --passthrough [--filter <text>]
              mouse-capture --gate        [--filter <text>] [--rotate-button 3|4|5]
                                           [--translate-button 3|4|5] [--pass-mode-buttons]
                                           [--udp host:port]
              mouse-capture --rawdump
              mouse-capture --recv        [--port 7801]
              mouse-capture --ping        --udp host:port
              mouse-capture --ui          [--config <file>] [--panel-port <n>]
                                           [--tunnel | --no-tunnel] [--public-url <url>]
                                           [--bind-lan] [--simulate] [--no-driver] [--no-qr]
              mouse-capture --version

            modes:
              --list         show mouse/keyboard hardware ids as seen by the driver
              --passthrough  re-send every stroke unchanged; the mouse must feel normal
              --gate         drop motion and scroll while a mode button is held; the configured
                             mode buttons are consumed too, so they do not click through
              --rawdump      independent raw-input reader; proves we sit below raw input
              --recv         UDP receiver for telemetry and ping echo
              --ping         round-trip probe against --recv / the MyHID server
              --ui           serve the management socket + QR/address page and hold the
                             capture session (configured from MyHID > Manage
                             mouse-capture). With a saved config this is also the default.

            options:
              --filter <t>   only manage devices whose hardware id contains <t> (case-insensitive)
              --device <id>  manage exactly this hardware id (wins over --filter)
              --rotate-button <n>     hold mouse button n to rotate (default 4)
              --translate-button <n>  hold mouse button n to translate (default 5)
                                      (0 disables that mode; 3 = middle, 4 = MB4, 5 = MB5)
              --pass-mode-buttons     do NOT consume the mode buttons (old click-through behaviour)
              --udp <h:p>    send 32-byte telemetry frames at ~100 Hz to <h:p>
              --port <n>     UDP port for --recv (default 7801)

            ui options:
              --config <file>      settings file (default: mouse-capture.json next to the exe)
              --panel-port <n>     management port; 0 picks a free one (default 7802)
              --bind-lan           listen on the LAN too, not just loopback
              --tunnel             publish the panel through a Cloudflare quick tunnel
              --no-tunnel          override a saved "tunnel on" for this run
              --public-url <url>   advertise an address you already have (a named tunnel)
              --simulate           fake devices + capture, no driver needed (demos/tests)
              --no-driver          do not touch the driver at all
              --no-qr              do not open the QR/address page in a browser
              --auto-start / --no-auto-start  override the saved replay setting

            keys:
              Q  quit      Ctrl+C  quit      Ctrl+Alt+Shift+Q  disarm the filter (panic)

            Suggested order: --list, then --passthrough, then --gate --filter <your mouse>.
            """);
    }

    private static string Value(string[] args, ref int index, string name)
    {
        if (index + 1 >= args.Length) throw new OptionException($"{name} needs a value");
        return args[++index];
    }

    private static int ParseInt(string text, string name)
    {
        if (!int.TryParse(text, NumberStyles.Integer, CultureInfo.InvariantCulture, out int value))
        {
            throw new OptionException($"{name}: '{text}' is not a number");
        }
        return value;
    }

    private static int ParseButton(string text, string name)
    {
        int value = ParseInt(text, name);
        if (value is not (0 or 3 or 4 or 5))
        {
            throw new OptionException($"{name} must be 0 (off), 3, 4 or 5");
        }
        return value;
    }

    private static IPEndPoint ParseEndpoint(string text)
    {
        try
        {
            return Endpoints.Parse(text);
        }
        catch (ConfigException ex)
        {
            throw new OptionException("--udp " + ex.Message);
        }
    }
}

internal static class Program
{
    private static volatile bool _cancel;

    /// <summary>
    /// Printed by --version and in the capture banner. build.ps1 appends the git
    /// commit, so a stale binary on the test machine is obvious at a glance.
    /// </summary>
    internal static string BuildVersion =>
        typeof(Program).Assembly.GetCustomAttribute<AssemblyInformationalVersionAttribute>()?.InformationalVersion
        ?? typeof(Program).Assembly.GetName().Version?.ToString()
        ?? "unknown";

    private static int Main(string[] args)
    {
        try { Console.OutputEncoding = Encoding.UTF8; } catch { }
        Console.CancelKeyPress += (_, e) =>
        {
            e.Cancel = true;
            _cancel = true;
        };

        Options options;
        try
        {
            options = Options.Parse(args);
        }
        catch (OptionException ex)
        {
            Console.Error.WriteLine("error: " + ex.Message);
            Console.Error.WriteLine();
            Options.PrintUsage();
            return 2;
        }

        // Double-clicking the exe on the target machine should open the panel, not
        // flash a usage page: with a saved config, no mode means --ui.
        string mode = options.Mode;
        if (mode.Length == 0 && File.Exists(ConfigStore.DefaultPath())) mode = "ui";

        switch (mode)
        {
            case "":
                Options.PrintUsage();
                return 2;
            case "help":
                Options.PrintUsage();
                return 0;
            case "version":
                Console.WriteLine(BuildVersion);
                return 0;
            case "rawdump":
                return RawDump.Run(() => _cancel);
            case "ui":
                return RunUi(options);
        }

        if (mode is "list" or "passthrough" or "gate"
            && !Interception.TryPreload(out string loadError))
        {
            Console.Error.WriteLine("error: could not load interception.dll");
            Console.Error.WriteLine("       " + loadError);
            Console.Error.WriteLine();
            Console.Error.WriteLine("       Copy the x64 interception.dll next to mouse-capture.exe.");
            Console.Error.WriteLine("       See README.md, section 'Deploy'.");
            return 3;
        }

        try
        {
            return mode switch
            {
                "list" => ListDevices(),
                "passthrough" => RunCapture(options, modesEnabled: false),
                "gate" => RunCapture(options, modesEnabled: true),
                "recv" => Receive(options),
                "ping" => Ping(options),
                _ => Unknown(mode),
            };
        }
        catch (Exception ex)
        {
            Console.Error.WriteLine("fatal: " + ex);
            return 1;
        }
    }

    private static int Unknown(string mode)
    {
        Console.Error.WriteLine($"error: unhandled mode '{mode}'");
        return 2;
    }

    private static int DriverUnavailable()
    {
        Console.Error.WriteLine("error: interception_create_context() returned NULL.");
        Console.Error.WriteLine();
        Console.Error.WriteLine("  The driver is not installed, the machine has not been rebooted");
        Console.Error.WriteLine("  since installing it, or this process cannot open \\\\.\\interception.");
        Console.Error.WriteLine("  Try again from an elevated prompt. See README.md, 'Troubleshooting'.");
        return 4;
    }

    private static int ListDevices()
    {
        IntPtr context = Interception.interception_create_context();
        if (context == IntPtr.Zero) return DriverUnavailable();

        try
        {
            Console.WriteLine("Interception devices (ids are driver slots, not stable across replug):");
            Console.WriteLine();

            bool anyMouse = false;
            for (int index = 0; index < Interception.MaxMouse; index++)
            {
                int device = Interception.MouseDevice(index);
                string id = Interception.GetHardwareId(context, device);
                if (id.Length == 0) continue;
                anyMouse = true;
                Console.WriteLine($"  mouse   {device,3}  {id}");
            }

            if (!anyMouse) Console.WriteLine("  (no mouse devices)");

            Console.WriteLine();
            for (int index = 0; index < Interception.MaxKeyboard; index++)
            {
                int device = Interception.KeyboardDevice(index);
                string id = Interception.GetHardwareId(context, device);
                if (id.Length == 0) continue;
                Console.WriteLine($"  keyboard {device,2}  {id}");
            }
        }
        finally
        {
            Interception.interception_destroy_context(context);
        }

        return 0;
    }

    /// <summary>
    /// `--ui`: the management socket (and the capture it drives). Configuration is
    /// done from the MyHID app; see CaptureApp.
    /// </summary>
    private static int RunUi(Options options)
    {
        ConfigStore store;
        try
        {
            store = ConfigStore.Load(options.ConfigPath);
        }
        catch (ConfigException ex)
        {
            Console.Error.WriteLine("error: " + ex.Message);
            return 2;
        }

        CaptureConfig config = store.Config;

        // Command-line overrides live for this run only; they are never saved.
        if (options.Device is not null) config.Device = options.Device;
        if (options.Filter is not null) config.Filter = options.Filter;
        if (options.RotateGiven) config.RotateButton = options.RotateButton;
        if (options.TranslateGiven) config.TranslateButton = options.TranslateButton;
        if (options.PassModeButtons) config.PassModeButtons = true;
        if (options.UdpTarget is not null)
        {
            config.Udp = options.UdpTarget.Address + ":" + options.UdpTarget.Port;
        }
        if (options.AutoStartOverride is { } autoStart) config.AutoStart = autoStart;

        try
        {
            config.Validate();
        }
        catch (ConfigException ex)
        {
            Console.Error.WriteLine("error: " + ex.Message);
            return 2;
        }

        var appOptions = new CaptureAppOptions
        {
            Simulate = options.Simulate,
            NoDriver = options.NoDriver || options.Simulate,
            NoQr = options.NoQr,
            Tunnel = options.TunnelOverride,
            BindLan = options.BindLan ? true : null,
            PanelPort = options.PanelPort,
            PublicUrl = options.PublicUrl,
        };

        using var app = new CaptureApp(store, appOptions);
        Console.CancelKeyPress += (_, e) =>
        {
            e.Cancel = true;
            app.RequestQuit();
        };

        try
        {
            return app.Run();
        }
        catch (Exception ex)
        {
            Console.Error.WriteLine("fatal: " + ex);
            return 1;
        }
    }

    private static CaptureConfig ConfigFrom(Options options, bool modesEnabled)
    {
        return new CaptureConfig
        {
            Device = options.Device,
            Filter = options.Filter,
            RotateButton = modesEnabled ? options.RotateButton : 0,
            TranslateButton = modesEnabled ? options.TranslateButton : 0,
            PassModeButtons = options.PassModeButtons,
            Udp = options.UdpTarget?.ToString(),
        };
    }

    private static int RunCapture(Options options, bool modesEnabled)
    {
        CaptureConfig config = ConfigFrom(options, modesEnabled);
        bool allMice = string.IsNullOrWhiteSpace(config.Device) && string.IsNullOrWhiteSpace(config.Filter);

        Console.WriteLine("mouse-capture");
        Console.WriteLine($"  mode   : {(modesEnabled ? "gate (MB4 rotate / MB5 translate)" : "passthrough")}");
        Console.WriteLine($"  build  : {BuildVersion}");

        if (modesEnabled)
        {
            string rotate = config.RotateButton == 0 ? "off" : $"hold MB{config.RotateButton}";
            string translate = config.TranslateButton == 0 ? "off" : $"hold MB{config.TranslateButton}";
            Console.WriteLine($"  engage : rotate = {rotate}, translate = {translate}");
            Console.WriteLine($"  buttons: {(config.PassModeButtons ? "mode buttons click through" : "mode buttons swallowed")}");
        }

        if (options.UdpTarget is not null)
        {
            Console.WriteLine($"  udp    : {options.UdpTarget}");
        }
        else
        {
            Console.WriteLine("  udp    : not set - no frames will be sent (add --udp host:port)");
        }

        // The capture client is UDP-only. The server's Socket.IO/WebSocket
        // transport is for the browser UI, not for these frames.
        Console.WriteLine("  websocket: none - capture uses UDP; Socket.IO is browser-only");
        Console.WriteLine("  keys   : Q quit");
        Console.WriteLine();

        if (modesEnabled && allMice)
        {
            Console.WriteLine("  WARNING: --filter not given, so every mouse will be gated.");
            Console.WriteLine();
        }

        if (modesEnabled && options.UdpTarget is null)
        {
            Console.WriteLine("  WARNING: --gate without --udp sends nothing to the server.");
            Console.WriteLine();
        }

        RealCaptureSession session;
        try
        {
            session = RealCaptureSession.Start(config, modesEnabled);
        }
        catch (ConfigException ex)
        {
            Console.Error.WriteLine("error: " + ex.Message);
            return ex.Message.Contains("no mouse", StringComparison.OrdinalIgnoreCase) ? 6 : 4;
        }

        Console.WriteLine($"  device : {session.Target}");
        Console.WriteLine("  filter armed. Ctrl+C, Q, or killing this process restores the mouse.");
        Console.WriteLine();

        session.Stalled += () =>
        {
            Console.Error.WriteLine();
            Console.Error.WriteLine("!! stroke pump stalled; disabling the filter so the mouse keeps working.");
            _cancel = true;
        };

        WaitForQuit();

        session.Stop();

        if (session.FailureReason is not null)
        {
            Console.Error.WriteLine("warning: " + session.FailureReason);
            Console.Out.Flush();
            Environment.Exit(0);
        }

        return 0;
    }

    private static void WaitForQuit()
    {
        while (!_cancel)
        {
            if (Console.IsInputRedirected)
            {
                Thread.Sleep(200);
                continue;
            }

            try
            {
                while (!_cancel && Console.KeyAvailable)
                {
                    ConsoleKey key = Console.ReadKey(intercept: true).Key;

                    if (key == ConsoleKey.Q)
                    {
                        _cancel = true;
                        break;
                    }
                }
            }
            catch (InvalidOperationException)
            {
                Thread.Sleep(200);
                continue;
            }

            Thread.Sleep(20);
        }
    }

    private static int Receive(Options options)
    {
        using var socket = new Socket(AddressFamily.InterNetwork, SocketType.Dgram, ProtocolType.Udp);
        socket.Bind(new IPEndPoint(IPAddress.Any, options.Port));
        socket.ReceiveTimeout = 250;

        Console.WriteLine($"listening on udp/{options.Port} - Ctrl+C to stop");
        Console.WriteLine("frame: magic u32 | seq u32 | qpc i64 | dx f32 | dy f32 | wheel f32 | mode u16 | pad u16");
        Console.WriteLine();

        var buffer = new byte[2048];
        long packets = 0;
        long bytes = 0;
        long gaps = 0;
        long lastPackets = 0;
        long lastBytes = 0;
        long lastTimestamp = Stopwatch.GetTimestamp();
        uint lastSequence = 0;
        bool haveSequence = false;
        ushort lastMode = Wire.ModeOff;

        while (!_cancel)
        {
            EndPoint from = new IPEndPoint(IPAddress.Any, 0);
            int read;

            try
            {
                read = socket.ReceiveFrom(buffer, ref from);
            }
            catch (SocketException ex) when (ex.SocketErrorCode is SocketError.TimedOut or SocketError.ConnectionReset)
            {
                read = 0;
            }

            if (read > 0)
            {
                if (read == Wire.PingSize && BinaryPrimitives.ReadUInt32LittleEndian(buffer) == Wire.MagicPing)
                {
                    BinaryPrimitives.WriteUInt32LittleEndian(buffer, Wire.MagicPong);
                    try
                    {
                        socket.SendTo(buffer, 0, read, SocketFlags.None, from);
                    }
                    catch (SocketException)
                    {
                        // A lost pong is not interesting.
                    }

                    Console.WriteLine($"{DateTime.Now:HH:mm:ss.fff}  ping from {from}");
                    continue;
                }

                if (read >= Wire.DataSize && BinaryPrimitives.ReadUInt32LittleEndian(buffer) == Wire.MagicData)
                {
                    uint sequence = BinaryPrimitives.ReadUInt32LittleEndian(buffer.AsSpan(4));

                    if (haveSequence)
                    {
                        int delta = unchecked((int)(sequence - lastSequence));
                        if (delta > 1) gaps += delta - 1;
                    }

                    lastSequence = sequence;
                    haveSequence = true;
                    packets++;
                    bytes += read;

                    ushort mode = BinaryPrimitives.ReadUInt16LittleEndian(buffer.AsSpan(28));
                    if (mode != lastMode)
                    {
                        lastMode = mode;
                        Console.WriteLine($"{DateTime.Now:HH:mm:ss.fff}  mode -> {Capture.ModeName(mode)}");
                    }
                }
            }

            long now = Stopwatch.GetTimestamp();
            double elapsed = (now - lastTimestamp) / (double)Stopwatch.Frequency;
            if (elapsed < 1.0) continue;

            Console.WriteLine(string.Format(
                CultureInfo.InvariantCulture,
                "{0:HH:mm:ss}  {1,5:F0} pkt/s  {2,7:F1} KB/s  gaps {3}",
                DateTime.Now,
                (packets - lastPackets) / elapsed,
                (bytes - lastBytes) / elapsed / 1024.0,
                gaps));

            lastTimestamp = now;
            lastPackets = packets;
            lastBytes = bytes;
        }

        return 0;
    }

    private static int Ping(Options options)
    {
        if (options.UdpTarget is null)
        {
            Console.Error.WriteLine("error: --ping needs --udp host:port");
            return 2;
        }

        Console.WriteLine($"pinging {options.UdpTarget} (start --recv on the other machine first)");
        Console.WriteLine();

        var samples = new List<double>(32);

        for (int i = 0; i < 20 && !_cancel; i++)
        {
            (int replies, double? rtt, string? error) = UdpPing.Run(options.UdpTarget, 1, 1000);

            if (replies == 0 || rtt is null)
            {
                Console.WriteLine($"  seq {i,2}  timeout{(error is null ? "" : " (" + error + ")")}");
            }
            else
            {
                samples.Add(rtt.Value);
                Console.WriteLine(string.Format(CultureInfo.InvariantCulture, "  seq {0,2}  rtt {1,6:F2} ms", i, rtt.Value));
            }

            Thread.Sleep(100);
        }

        if (samples.Count == 0)
        {
            Console.Error.WriteLine("no replies - is --recv running, and is the firewall open?");
            return 7;
        }

        samples.Sort();
        Console.WriteLine();
        Console.WriteLine(string.Format(
            CultureInfo.InvariantCulture,
            "rtt  min {0:F2}  median {1:F2}  p95 {2:F2}  max {3:F2} ms  ({4} replies)",
            samples[0],
            samples[samples.Count / 2],
            samples[Math.Min(samples.Count - 1, (int)(samples.Count * 0.95))],
            samples[^1],
            samples.Count));

        return 0;
    }
}
