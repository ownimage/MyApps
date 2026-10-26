using System.Diagnostics;
using System.Net;
using System.Net.Sockets;
using System.Text.RegularExpressions;

namespace Mouser.Capture;

/// <summary>
/// Publishes the management socket through a Cloudflare QUICK TUNNEL, exactly the
/// way the PhoneButtons server does it (`remoteHID/server/app.py`): run
/// `cloudflared tunnel --url http://127.0.0.1:&lt;port&gt;`, echo its output, and pick
/// the `https://&lt;name&gt;.trycloudflare.com` URL out of it. That URL carries a real,
/// trusted certificate, so a phone needs no certificate install.
///
/// SECURITY: a quick tunnel is on the PUBLIC internet. The panel still demands the
/// token on every route, but the tunnel must be OFF unless asked for (`--tunnel`,
/// or the panel's toggle) and stopped when you are done.
///
/// A tunnel failure must never stop the capture: the panel keeps serving on
/// loopback/an LAN address and reports why.
/// </summary>
internal sealed class TunnelRunner : IDisposable
{
    private static readonly Regex TunnelUrl = new(
        @"https://[a-z0-9][a-z0-9-]*\.trycloudflare\.com", RegexOptions.IgnoreCase | RegexOptions.Compiled);

    private readonly object _gate = new();
    private Process? _process;
    private string _state = "off";
    private string? _url;
    private string? _error;
    private bool _starting;

    /// <summary>"off" | "starting" | "up" | "down" | "error"</summary>
    public string State { get { lock (_gate) return _state; } }

    public string? Url { get { lock (_gate) return _url; } }

    public string? Error { get { lock (_gate) return _error; } }

    public bool Enabled => State is "starting" or "up";

    /// <summary>The command that would be run, for the panel's diagnostics.</summary>
    public string CloudflaredPath { get; private set; } = string.Empty;

    /// <summary>
    /// Starts the tunnel, or - when <paramref name="publicUrl"/> is set - simply
    /// advertises an address you already have (e.g. a NAMED tunnel).
    /// </summary>
    public void Start(int panelPort, string? publicUrl)
    {
        Stop();

        if (!string.IsNullOrWhiteSpace(publicUrl))
        {
            lock (_gate)
            {
                _state = "up";
                _url = publicUrl.TrimEnd('/');
                _error = null;
            }
            return;
        }

        string exe = Cloudflared.Locate();
        CloudflaredPath = exe;

        if (exe.Length == 0)
        {
            lock (_gate)
            {
                _state = "error";
                _url = null;
                _error = "cloudflared was not found. Install it (winget install cloudflare.cloudflared), "
                    + "set PB_CLOUDFLARED to its full path, or pass --public-url with an address you already have.";
            }
            return;
        }

        lock (_gate)
        {
            _state = "starting";
            _url = null;
            _error = null;
            _starting = true;
        }

        var info = new ProcessStartInfo(exe)
        {
            UseShellExecute = false,
            CreateNoWindow = true,
            RedirectStandardOutput = true,
            RedirectStandardError = true,
        };
        info.ArgumentList.Add("tunnel");
        info.ArgumentList.Add("--url");
        info.ArgumentList.Add("http://127.0.0.1:" + panelPort);

        try
        {
            Process process = Process.Start(info) ?? throw new InvalidOperationException("cloudflared did not start");
            process.EnableRaisingEvents = true;
            process.OutputDataReceived += (_, e) => OnLine(e.Data);
            process.ErrorDataReceived += (_, e) => OnLine(e.Data);
            process.Exited += (_, _) => OnExited();

            lock (_gate) { _process = process; }

            process.BeginOutputReadLine();
            process.BeginErrorReadLine();

            // cloudflared normally reports a URL in a couple of seconds; 60 s is the
            // same ceiling app.py uses, and a failure here is reported, not fatal.
            var timeout = new Thread(() =>
            {
                DateTime deadline = DateTime.UtcNow.AddSeconds(60);
                while (DateTime.UtcNow < deadline)
                {
                    lock (_gate)
                    {
                        if (!_starting || _state != "starting") return;
                    }
                    Thread.Sleep(250);
                }

                lock (_gate)
                {
                    if (_state != "starting") return;
                    _state = "error";
                    _error = "cloudflared did not report a tunnel URL within 60 s.";
                    _starting = false;
                }
            })
            {
                IsBackground = true,
                Name = "tunnel-timeout",
            };
            timeout.Start();
        }
        catch (Exception ex)
        {
            lock (_gate)
            {
                _state = "error";
                _starting = false;
                _error = "could not start cloudflared: " + ex.Message;
            }
        }
    }

    private void OnLine(string? line)
    {
        if (string.IsNullOrWhiteSpace(line)) return;
        Console.WriteLine("[cloudflared] " + line.TrimEnd());

        Match match = TunnelUrl.Match(line);
        if (!match.Success) return;

        lock (_gate)
        {
            if (_state == "up") return;
            _state = "up";
            _url = match.Value;
            _error = null;
            _starting = false;
        }
    }

    private void OnExited()
    {
        lock (_gate)
        {
            if (_state == "off") return;
            // A tunnel that dies after being up leaves the capture untouched: the
            // phone loses the remote path, the mouse does not care.
            _state = _url is null ? "error" : "down";
            _starting = false;
            _error ??= "cloudflared exited; the panel is still available locally.";
        }
    }

    public void Stop()
    {
        Process? process;
        lock (_gate)
        {
            process = _process;
            _process = null;
            _state = "off";
            _url = null;
            _error = null;
            _starting = false;
        }

        if (process is null) return;

        try
        {
            if (!process.HasExited) process.Kill(entireProcessTree: true);
        }
        catch (Exception)
        {
            // Already gone.
        }
        finally
        {
            process.Dispose();
        }
    }

    public void Dispose() => Stop();
}

internal static class Cloudflared
{
    /// <summary>Same lookup order as the Python server's `_find_cloudflared()`.</summary>
    public static string Locate()
    {
        string env = Environment.GetEnvironmentVariable("PB_CLOUDFLARED") ?? string.Empty;
        if (env.Length > 0 && File.Exists(env)) return env;

        string? onPath = Environment.GetEnvironmentVariable("PATH")
            ?.Split(';', StringSplitOptions.RemoveEmptyEntries)
            .Select(dir => Path.Combine(dir.Trim(), "cloudflared.exe"))
            .FirstOrDefault(File.Exists);
        if (!string.IsNullOrEmpty(onPath)) return onPath;

        string[] candidates =
        {
            Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles), "cloudflared", "cloudflared.exe"),
            Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "cloudflared", "cloudflared.exe"),
            Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.UserProfile), "cloudflared.exe"),
        };

        return candidates.FirstOrDefault(File.Exists) ?? string.Empty;
    }
}

/// <summary>Loopback / LAN address helpers for the panel URLs.</summary>
internal static class NetworkInfo
{
    /// <summary>
    /// The primary LAN address. A UDP "connect" picks the outbound interface and
    /// sends no packets, so this works offline too.
    /// </summary>
    public static string LanAddress()
    {
        try
        {
            using var socket = new Socket(AddressFamily.InterNetwork, SocketType.Dgram, ProtocolType.Udp);
            socket.Connect(new IPEndPoint(IPAddress.Parse("8.8.8.8"), 80));
            return ((IPEndPoint)socket.LocalEndPoint!).Address.ToString();
        }
        catch (Exception)
        {
            return "127.0.0.1";
        }
    }
}
