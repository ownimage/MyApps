using System.Buffers.Binary;
using System.Diagnostics;
using System.Net;
using System.Net.Sockets;

namespace Mouser.Capture;

internal static class Wire
{
    /// <summary>"M6S1" — one telemetry frame (v2: the u16 at offset 28 is the mode).</summary>
    public const uint MagicData = 0x4D365331;

    /// <summary>"PING" — round-trip probe.</summary>
    public const uint MagicPing = 0x50494E47;

    /// <summary>"PONG" — reply to PING, payload echoed verbatim.</summary>
    public const uint MagicPong = 0x504F4E47;

    public const int DataSize = 32;
    public const int PingSize = 16;

    /// <summary>u16 at offset 28: no mode held.</summary>
    public const ushort ModeOff = 0;

    /// <summary>u16 at offset 28: MB4 held — rotate X/Y/Z.</summary>
    public const ushort ModeRotate = 1;

    /// <summary>u16 at offset 28: MB5 held — translate X/Y/Z.</summary>
    public const ushort ModeTranslate = 2;
}

/// <summary>
/// The ping probe shared by the CLI's `--ping` and the panel's /api/ping route.
/// A timeout is a RESULT, not an exception: the app shows "no reply" far more often
/// than it shows a failure, usually because the server is not started yet.
/// </summary>
internal static class UdpPing
{
    public static (int Replies, double? MedianMs, string? Error) Run(IPEndPoint target, int attempts, int timeoutMs)
    {
        using var socket = new Socket(AddressFamily.InterNetwork, SocketType.Dgram, ProtocolType.Udp);
        socket.ReceiveTimeout = Math.Clamp(timeoutMs, 50, 5000);

        var buffer = new byte[64];
        var samples = new List<double>(attempts);

        for (int i = 0; i < Math.Clamp(attempts, 1, 20); i++)
        {
            var packet = new byte[Wire.PingSize];
            BinaryPrimitives.WriteUInt32LittleEndian(packet.AsSpan(0), Wire.MagicPing);
            BinaryPrimitives.WriteUInt32LittleEndian(packet.AsSpan(4), (uint)i);
            BinaryPrimitives.WriteInt64LittleEndian(packet.AsSpan(8), Stopwatch.GetTimestamp());

            long start = Stopwatch.GetTimestamp();

            try
            {
                socket.SendTo(packet, target);
                EndPoint from = new IPEndPoint(IPAddress.Any, 0);
                int read = socket.ReceiveFrom(buffer, ref from);
                if (read >= Wire.PingSize && BinaryPrimitives.ReadUInt32LittleEndian(buffer) == Wire.MagicPong)
                {
                    samples.Add((Stopwatch.GetTimestamp() - start) * 1000.0 / Stopwatch.Frequency);
                }
            }
            catch (SocketException)
            {
                // counted as no reply
            }

            Thread.Sleep(50);
        }

        if (samples.Count == 0)
        {
            return (0, null,
                $"timeout - no reply from {target} in {attempts} attempts. Is the PhoneButtons server running "
                + "and is UDP open on this network? (UDP is not tunnelled, so a Cloudflare hostname cannot deliver it.)");
        }

        samples.Sort();
        return (samples.Count, samples[samples.Count / 2], null);
    }
}

/// <summary>
/// Frame-oriented UDP sender. The capture side accumulates stroke deltas and
/// flushes them at ~100 Hz, which is what a 6DOF consumer actually wants; sending
/// one datagram per 1 kHz stroke would be pointless.
/// </summary>
internal sealed class UdpSender : IDisposable
{
    private readonly Socket _socket;
    private readonly IPEndPoint _target;
    private readonly byte[] _buffer = new byte[Wire.DataSize];
    private uint _sequence;

    public UdpSender(IPEndPoint target)
    {
        _target = target;
        _socket = new Socket(AddressFamily.InterNetwork, SocketType.Dgram, ProtocolType.Udp);
    }

    public void Send(long dx, long dy, long wheel, ushort mode)
    {
        Span<byte> span = _buffer;
        BinaryPrimitives.WriteUInt32LittleEndian(span[0..4], Wire.MagicData);
        BinaryPrimitives.WriteUInt32LittleEndian(span[4..8], _sequence++);
        BinaryPrimitives.WriteInt64LittleEndian(span[8..16], Stopwatch.GetTimestamp());
        BinaryPrimitives.WriteSingleLittleEndian(span[16..20], dx);
        BinaryPrimitives.WriteSingleLittleEndian(span[20..24], dy);
        BinaryPrimitives.WriteSingleLittleEndian(span[24..28], wheel);
        BinaryPrimitives.WriteUInt16LittleEndian(span[28..30], mode);
        span[30] = 0;
        span[31] = 0;

        try
        {
            _socket.SendTo(_buffer, _target);
        }
        catch (SocketException)
        {
            // Link-local trouble must never stall the input path.
        }
    }

    public void Dispose() => _socket.Dispose();
}
