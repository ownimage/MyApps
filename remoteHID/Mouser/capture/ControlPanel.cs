using System.Globalization;
using System.Net;
using System.Net.Sockets;
using System.Text;
using System.Text.Json;

namespace Mouser.Capture;

internal sealed record PanelRequest(
    string Method,
    string Path,
    Dictionary<string, string> Query,
    Dictionary<string, string> Headers,
    string Body,
    string Remote);

internal sealed class PanelResponse
{
    public int Status { get; init; } = 200;
    public string ContentType { get; init; } = "application/json; charset=utf-8";
    public byte[] Body { get; init; } = Array.Empty<byte>();

    public static PanelResponse Json(object value, int status = 200) => new()
    {
        Status = status,
        ContentType = "application/json; charset=utf-8",
        Body = JsonSerializer.SerializeToUtf8Bytes(value, PanelJson.Options),
    };

    public static PanelResponse Html(string html, int status = 200) => new()
    {
        Status = status,
        ContentType = "text/html; charset=utf-8",
        Body = Encoding.UTF8.GetBytes(html),
    };

    public static PanelResponse Script(string javascript, int status = 200) => new()
    {
        Status = status,
        ContentType = "application/javascript; charset=utf-8",
        Body = Encoding.UTF8.GetBytes(javascript),
    };

    public static PanelResponse Error(int status, string message) =>
        Json(new { ok = false, error = message }, status);
}

internal static class PanelJson
{
    public static readonly JsonSerializerOptions Options = new()
    {
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
    };
}

/// <summary>
/// The management socket: a deliberately small HTTP/1.1 server on a TcpListener.
///
/// Why not HttpListener: binding an HTTP.sys prefix needs a URL ACL (admin) on
/// Windows, which would make an unelevated panel fail with an obscure error. A
/// hand-rolled socket listener has no such prerequisite, and this API is eight
/// routes and a few KB of JSON - there is nothing to gain from a framework.
///
/// SECURITY: this API can ARM a filter that swallows mouse motion, so:
///   * it binds loopback unless the same-box server mode asked for LAN,
///   * every route (including the page) requires the token, compared in constant
///     time - the token is the only thing between a public tunnel and your mouse,
///   * CORS is wide (`*`) because the app is served from another origin, but no
///     credentials are allowed and the token is a header, which a cross-site form
///     cannot set,
///   * bodies are capped and connections time out, so a hostile caller cannot tie
///     up the listener.
/// </summary>
internal sealed class ControlPanel : IDisposable
{
    private const int MaxHeaderBytes = 64 * 1024;
    private const int MaxBodyBytes = 256 * 1024;
    private static readonly byte[] HeaderTerminator = { 13, 10, 13, 10 };

    private readonly TcpListener _listener;
    private readonly string _token;
    private readonly Func<PanelRequest, PanelResponse> _handler;
    private readonly Thread _accept;
    private volatile bool _stopping;

    public int Port { get; }

    public string BindAddress { get; }

    public ControlPanel(int port, bool bindLan, string token, Func<PanelRequest, PanelResponse> handler)
    {
        _token = token;
        _handler = handler;

        IPAddress address = bindLan ? IPAddress.Any : IPAddress.Loopback;
        _listener = new TcpListener(address, port);
        _listener.Start();

        var endpoint = (IPEndPoint)_listener.LocalEndpoint;
        Port = endpoint.Port;
        BindAddress = address.ToString();

        _accept = new Thread(AcceptLoop) { IsBackground = true, Name = "panel-accept" };
        _accept.Start();
    }

    private void AcceptLoop()
    {
        while (!_stopping)
        {
            TcpClient client;
            try
            {
                client = _listener.AcceptTcpClient();
            }
            catch (SocketException)
            {
                if (_stopping) return;
                continue;
            }
            catch (ObjectDisposedException)
            {
                return;
            }

            ThreadPool.QueueUserWorkItem(_ => Serve(client));
        }
    }

    private void Serve(TcpClient client)
    {
        using (client)
        {
            try
            {
                client.NoDelay = true;
                client.ReceiveTimeout = 5000;
                client.SendTimeout = 5000;

                NetworkStream stream = client.GetStream();
                PanelRequest? request = Read(stream);
                if (request is null) return;

                // The remote address is only used for the rejection log.
                request = request with { Remote = client.Client.RemoteEndPoint?.ToString() ?? "?" };

                PanelResponse response = Handle(request);
                Write(stream, response);
            }
            catch (Exception ex) when (ex is IOException or SocketException or ObjectDisposedException)
            {
                // A dropped connection is not interesting.
            }
            catch (Exception ex)
            {
                try { Write(client.GetStream(), PanelResponse.Error(500, "internal error: " + ex.Message)); }
                catch (Exception) { /* nothing left to say */ }
            }
        }
    }

    private PanelResponse Handle(PanelRequest request)
    {
        // A preflight never carries the token (browsers forbid custom headers on
        // OPTIONS), so it must be answered before the check.
        if (request.Method == "OPTIONS")
        {
            return new PanelResponse { Status = 204 };
        }

        string supplied = request.Headers.TryGetValue("x-mouser-token", out string? header) && header.Length > 0
            ? header
            : request.Query.TryGetValue("t", out string? query) ? query : string.Empty;

        if (!TokensMatch(supplied, _token))
        {
            // Say WHY on the console: "wrong token" and "no token at all" look
            // identical from the app, and this is the one failure a user can fix.
            Console.WriteLine(supplied.Length == 0
                ? $"panel: rejected {request.Method} {request.Path} from {request.Remote} - no token supplied"
                : $"panel: rejected {request.Method} {request.Path} from {request.Remote} - token mismatch "
                  + $"(got {supplied.Length} chars, expected {_token.Length})");

            // The hint (last 4 characters) lets the app tell the user WHICH token
            // the panel wants without ever putting the secret in an error message.
            return PanelResponse.Json(new
            {
                ok = false,
                error = "missing or invalid token - open the address the capture panel printed (it carries ?t=)",
                tokenHint = TokenHint(_token),
            }, 403);
        }

        try
        {
            return _handler(request);
        }
        catch (ConfigException ex)
        {
            return PanelResponse.Error(400, ex.Message);
        }
        catch (Exception ex)
        {
            return PanelResponse.Error(500, ex.Message);
        }
    }

    /// <summary>Length-independent, early-exit-free comparison.</summary>
    private static bool TokensMatch(string supplied, string expected)
    {
        if (expected.Length == 0) return false;
        int diff = supplied.Length ^ expected.Length;
        for (int i = 0; i < expected.Length; i++)
        {
            char candidate = i < supplied.Length ? supplied[i] : '\0';
            diff |= candidate ^ expected[i];
        }
        return diff == 0;
    }

    private static PanelRequest? Read(NetworkStream stream)
    {
        var head = new MemoryStream();
        var buffer = new byte[8192];
        int headerEnd = -1;

        while (headerEnd < 0)
        {
            int read = stream.Read(buffer, 0, buffer.Length);
            if (read <= 0) return null;
            head.Write(buffer, 0, read);
            headerEnd = FindHeaderEnd(head.GetBuffer(), (int)head.Length);
            if (headerEnd < 0 && head.Length > MaxHeaderBytes) return null;
        }

        byte[] headBytes = head.GetBuffer();
        string headerText = Encoding.ASCII.GetString(headBytes, 0, headerEnd);
        string[] lines = headerText.Split("\r\n");
        if (lines.Length == 0) return null;

        string[] requestLine = lines[0].Split(' ');
        if (requestLine.Length < 2) return null;

        string method = requestLine[0].ToUpperInvariant();
        string target = requestLine[1];

        var headers = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
        for (int i = 1; i < lines.Length; i++)
        {
            int colon = lines[i].IndexOf(':');
            if (colon <= 0) continue;
            headers[lines[i][..colon].Trim()] = lines[i][(colon + 1)..].Trim();
        }

        string path = target;
        string queryString = string.Empty;
        int question = target.IndexOf('?');
        if (question >= 0)
        {
            path = target[..question];
            queryString = target[(question + 1)..];
        }

        var query = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
        foreach (string pair in queryString.Split('&', StringSplitOptions.RemoveEmptyEntries))
        {
            int equals = pair.IndexOf('=');
            string key = equals < 0 ? pair : pair[..equals];
            string value = equals < 0 ? string.Empty : pair[(equals + 1)..];
            query[Decode(key)] = Decode(value);
        }

        int contentLength = 0;
        if (headers.TryGetValue("content-length", out string? lengthText)
            && !int.TryParse(lengthText, NumberStyles.Integer, CultureInfo.InvariantCulture, out contentLength))
        {
            return null;
        }

        if (contentLength is < 0 or > MaxBodyBytes) return null;

        var bodyBytes = new byte[contentLength];
        int already = (int)head.Length - (headerEnd + 4);
        if (already > contentLength) already = contentLength;
        if (already > 0) Buffer.BlockCopy(headBytes, headerEnd + 4, bodyBytes, 0, already);

        int offset = already;
        while (offset < contentLength)
        {
            int read = stream.Read(bodyBytes, offset, contentLength - offset);
            if (read <= 0) break;
            offset += read;
        }

        return new PanelRequest(method, path, query, headers, Encoding.UTF8.GetString(bodyBytes, 0, offset), string.Empty);
    }

    /// <summary>The last four characters of the token - enough to compare by eye.</summary>
    internal static string TokenHint(string token) =>
        token.Length <= 4 ? token : token[^4..];

    private static int FindHeaderEnd(byte[] buffer, int length)
    {
        for (int i = 0; i + 3 < length; i++)
        {
            if (buffer[i] == HeaderTerminator[0] && buffer[i + 1] == HeaderTerminator[1]
                && buffer[i + 2] == HeaderTerminator[2] && buffer[i + 3] == HeaderTerminator[3])
            {
                return i;
            }
        }
        return -1;
    }

    private static string Decode(string value)
    {
        try { return Uri.UnescapeDataString(value.Replace('+', ' ')); }
        catch (Exception) { return value; }
    }

    private static void Write(NetworkStream stream, PanelResponse response)
    {
        string reason = response.Status switch
        {
            200 => "OK",
            204 => "No Content",
            400 => "Bad Request",
            403 => "Forbidden",
            404 => "Not Found",
            409 => "Conflict",
            _ => "Error",
        };

        var head = new StringBuilder();
        head.Append("HTTP/1.1 ").Append(response.Status).Append(' ').Append(reason).Append("\r\n");
        head.Append("Content-Type: ").Append(response.ContentType).Append("\r\n");
        head.Append("Content-Length: ").Append(response.Body.Length).Append("\r\n");
        // Wide-open CORS: the app is served from GitHub Pages, localhost, or the
        // server itself. The token - not the origin - is the authorisation.
        head.Append("Access-Control-Allow-Origin: *\r\n");
        head.Append("Access-Control-Allow-Headers: Content-Type, X-Mouser-Token\r\n");
        head.Append("Access-Control-Allow-Methods: GET, POST, OPTIONS\r\n");
        head.Append("Access-Control-Max-Age: 600\r\n");
        head.Append("Cache-Control: no-store\r\n");
        head.Append("X-Content-Type-Options: nosniff\r\n");
        head.Append("Connection: close\r\n\r\n");

        byte[] headBytes = Encoding.ASCII.GetBytes(head.ToString());
        stream.Write(headBytes, 0, headBytes.Length);
        if (response.Body.Length > 0) stream.Write(response.Body, 0, response.Body.Length);
        stream.Flush();
    }

    public void Dispose()
    {
        _stopping = true;
        try { _listener.Stop(); } catch (Exception) { }
        _accept.Join(1000);
    }
}
