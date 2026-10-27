using System.Net;
using System.Net.Sockets;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using System.Text.Json.Serialization;

namespace Mouse.Capture;

/// <summary>A configuration problem that is the user's, not a bug: report and stop.</summary>
internal sealed class ConfigException : Exception
{
    public ConfigException(string message) : base(message) { }
}

/// <summary>
/// Everything the control panel (and the command line) can configure.
///
/// This is the SAME object that is serialised to mouse-capture.json and posted by
/// the MyHID app, so the property names are part of a contract: do not
/// rename them without updating the app (and the tests).
/// </summary>
internal sealed class CaptureConfig
{
    /// <summary>Exact Interception hardware id of the mouse to manage ("" = all).</summary>
    public string? Device { get; set; }

    /// <summary>Legacy substring match (--filter); only used when Device is empty.</summary>
    public string? Filter { get; set; }

    public int RotateButton { get; set; } = 4;
    public int TranslateButton { get; set; } = 5;
    public bool PassModeButtons { get; set; }

    /// <summary>host:port the telemetry frames go to.</summary>
    public string? Udp { get; set; }

    /// <summary>Replay the last session when the panel opens (Stop clears it).</summary>
    public bool AutoStart { get; set; }

    /// <summary>Management port; 0 picks a free one on each start.</summary>
    public int PanelPort { get; set; } = 7802;

    /// <summary>Also listen on the LAN, not just loopback (the same-box server mode).</summary>
    public bool BindLan { get; set; }

    /// <summary>Publish the panel through a Cloudflare quick tunnel.</summary>
    public bool Tunnel { get; set; }

    /// <summary>Address to advertise instead of a quick tunnel (a named tunnel).</summary>
    public string? PublicUrl { get; set; }

    /// <summary>
    /// Shared secret for the management API. Generated once and never changed by
    /// the API itself - a stale phone must not be able to lock itself out.
    /// </summary>
    public string? AuthToken { get; set; }

    public static readonly JsonSerializerOptions JsonOptions = new()
    {
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
        PropertyNameCaseInsensitive = true,
        WriteIndented = true,
        ReadCommentHandling = JsonCommentHandling.Skip,
        AllowTrailingCommas = true,
        // A typo in the app (or a hand-edited file) is an error, not silently lost.
        UnmappedMemberHandling = JsonUnmappedMemberHandling.Disallow,
    };

    public CaptureConfig Clone()
    {
        return JsonSerializer.Deserialize<CaptureConfig>(JsonSerializer.Serialize(this, JsonOptions), JsonOptions)
            ?? new CaptureConfig();
    }

    /// <summary>True when the two configs would arm the same filter + stream.</summary>
    public bool SameCaptureAs(CaptureConfig other)
    {
        return string.Equals(Device ?? "", other.Device ?? "", StringComparison.OrdinalIgnoreCase)
            && string.Equals(Filter ?? "", other.Filter ?? "", StringComparison.OrdinalIgnoreCase)
            && RotateButton == other.RotateButton
            && TranslateButton == other.TranslateButton
            && PassModeButtons == other.PassModeButtons
            && string.Equals(Udp ?? "", other.Udp ?? "", StringComparison.OrdinalIgnoreCase);
    }

    /// <summary>Throws <see cref="ConfigException"/> with an actionable message.</summary>
    public void Validate()
    {
        if (RotateButton is not (0 or 3 or 4 or 5))
        {
            throw new ConfigException("rotateButton must be 0 (off), 3 (middle), 4 (MB4) or 5 (MB5)");
        }

        if (TranslateButton is not (0 or 3 or 4 or 5))
        {
            throw new ConfigException("translateButton must be 0 (off), 3 (middle), 4 (MB4) or 5 (MB5)");
        }

        if (RotateButton != 0 && RotateButton == TranslateButton)
        {
            throw new ConfigException("rotateButton and translateButton cannot be the same button");
        }

        if (PanelPort is < 0 or > 65535 || PanelPort is > 0 and < 1024)
        {
            throw new ConfigException("panelPort must be 0 (auto) or 1024-65535");
        }

        if (!string.IsNullOrWhiteSpace(Device) && Device.Trim().Length < 4)
        {
            throw new ConfigException("device must be an Interception hardware id (or empty for every mouse)");
        }

        if (!string.IsNullOrWhiteSpace(Udp))
        {
            // Resolves the host too, so a typo is caught here and not at start.
            Endpoints.Parse(Udp);
        }

        if (!string.IsNullOrWhiteSpace(PublicUrl)
            && !Uri.TryCreate(PublicUrl.Trim(), UriKind.Absolute, out Uri? uri))
        {
            throw new ConfigException("publicUrl must be an absolute URL (e.g. https://hid.example.com)");
        }
        else if (!string.IsNullOrWhiteSpace(PublicUrl)
                 && Uri.TryCreate(PublicUrl.Trim(), UriKind.Absolute, out Uri? parsed)
                 && parsed.Scheme is not ("http" or "https"))
        {
            throw new ConfigException("publicUrl must start with http:// or https://");
        }
    }

    public CaptureConfig Normalised()
    {
        Device = string.IsNullOrWhiteSpace(Device) ? null : Device.Trim();
        Filter = string.IsNullOrWhiteSpace(Filter) ? null : Filter.Trim();
        Udp = string.IsNullOrWhiteSpace(Udp) ? null : Udp.Trim();
        PublicUrl = string.IsNullOrWhiteSpace(PublicUrl) ? null : PublicUrl.Trim().TrimEnd('/');
        AuthToken = string.IsNullOrWhiteSpace(AuthToken) ? null : AuthToken.Trim();
        return this;
    }

    /// <summary>32 hex characters from the OS CSPRNG.</summary>
    public static string NewToken() => Convert.ToHexString(RandomNumberGenerator.GetBytes(16)).ToLowerInvariant();
}

/// <summary>
/// Loads and saves <see cref="CaptureConfig"/>.
///
/// The file lives next to the exe so the "copy this folder" deploy carries its
/// settings. If that folder is read-only (Program Files, a locked download) the
/// store falls back to %LOCALAPPDATA%\Hid and reports the path it actually
/// used, so the panel can show it.
/// </summary>
internal sealed class ConfigStore
{
    public const string FileName = "mouse-capture.json";

    public string Path { get; private set; }
    public CaptureConfig Config { get; private set; }
    public string? Warning { get; private set; }

    private ConfigStore(string path, CaptureConfig config)
    {
        Path = path;
        Config = config;
    }

    public static string DefaultPath() => System.IO.Path.Combine(AppContext.BaseDirectory, FileName);

    public static string FallbackPath()
    {
        string dir = System.IO.Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "MyHID");
        return System.IO.Path.Combine(dir, FileName);
    }

    /// <summary>
    /// Loads, or starts a fresh one. A MALFORMED file is an error (silently
    /// discarding a user's settings is worse than refusing to start); a MISSING
    /// file is not.
    /// </summary>
    public static ConfigStore Load(string? explicitPath)
    {
        string path = string.IsNullOrWhiteSpace(explicitPath) ? DefaultPath() : System.IO.Path.GetFullPath(explicitPath);

        CaptureConfig config;
        string? warning = null;

        if (File.Exists(path))
        {
            string text;
            try
            {
                text = File.ReadAllText(path, Encoding.UTF8);
            }
            catch (Exception ex) when (ex is IOException or UnauthorizedAccessException)
            {
                throw new ConfigException($"could not read {path}: {ex.Message}");
            }

            try
            {
                config = JsonSerializer.Deserialize<CaptureConfig>(text, CaptureConfig.JsonOptions)
                    ?? new CaptureConfig();
            }
            catch (JsonException ex)
            {
                throw new ConfigException($"{path} is not valid: {ex.Message}");
            }
        }
        else
        {
            config = new CaptureConfig();
            if (string.IsNullOrWhiteSpace(explicitPath) && !CanCreateIn(System.IO.Path.GetDirectoryName(path) ?? "."))
            {
                path = FallbackPath();
                warning = "the program folder is read-only, so settings live in " + path;
            }
        }

        config.Normalised();
        return new ConfigStore(path, config) { Warning = warning };
    }

    private static bool CanCreateIn(string directory)
    {
        try
        {
            Directory.CreateDirectory(directory);
            string probe = System.IO.Path.Combine(directory, ".hid-write-probe");
            File.WriteAllText(probe, "x");
            File.Delete(probe);
            return true;
        }
        catch (Exception ex) when (ex is IOException or UnauthorizedAccessException)
        {
            return false;
        }
    }

    /// <summary>Persists; falls back to %LOCALAPPDATA% when the target is read-only.</summary>
    public void Save(CaptureConfig config)
    {
        config.Normalised();
        string json = JsonSerializer.Serialize(config, CaptureConfig.JsonOptions);

        try
        {
            Write(Path, json);
        }
        catch (Exception ex) when (ex is UnauthorizedAccessException or IOException)
        {
            string fallback = FallbackPath();
            if (string.Equals(fallback, Path, StringComparison.OrdinalIgnoreCase)) throw new ConfigException(ex.Message);
            Write(fallback, json);
            Warning = $"could not write {Path} ({ex.Message}); settings now live in {fallback}";
            Path = fallback;
        }

        Config = config;
    }

    private static void Write(string path, string json)
    {
        string? dir = System.IO.Path.GetDirectoryName(path);
        if (!string.IsNullOrEmpty(dir)) Directory.CreateDirectory(dir);
        // Write-then-replace so a crash cannot leave a truncated settings file.
        string temp = path + ".tmp";
        File.WriteAllText(temp, json, new UTF8Encoding(false));
        File.Move(temp, path, overwrite: true);
    }
}

/// <summary>host:port parsing shared by the CLI, the config and the ping route.</summary>
internal static class Endpoints
{
    public static IPEndPoint Parse(string text)
    {
        string value = (text ?? string.Empty).Trim();
        if (value.Length == 0) throw new ConfigException("a UDP target is required (host:port)");

        if (IPEndPoint.TryParse(value, out IPEndPoint? endpoint)) return endpoint;

        int colon = value.LastIndexOf(':');
        if (colon <= 0) throw new ConfigException($"expected host:port, got '{value}'");

        string host = value[..colon];
        if (!int.TryParse(value[(colon + 1)..], out int port) || port is < 1 or > 65535)
        {
            throw new ConfigException($"'{value}' does not end in a valid port");
        }

        try
        {
            foreach (IPAddress address in Dns.GetHostAddresses(host))
            {
                if (address.AddressFamily == AddressFamily.InterNetwork)
                {
                    return new IPEndPoint(address, port);
                }
            }
        }
        catch (SocketException)
        {
            // reported below
        }

        throw new ConfigException($"could not resolve '{host}'");
    }

    public static IPEndPoint? TryParse(string? text)
    {
        try { return string.IsNullOrWhiteSpace(text) ? null : Parse(text); }
        catch (ConfigException) { return null; }
    }
}
