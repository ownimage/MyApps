using System.Runtime.InteropServices;
using System.Text;

namespace Mouser.Capture;

/// <summary>
/// One mouse as the control panel presents it. <paramref name="Slot"/> is the
/// Interception driver slot (not stable across replug), <paramref name="HardwareId"/>
/// is the stable id kept in the config, and <paramref name="Name"/> is the Windows
/// friendly name when SetupAPI can supply one.
/// </summary>
internal sealed record MouseDevice(int Slot, string HardwareId, string Name, bool Moving, bool Simulated);

/// <summary>
/// Maps Interception slots to the names Windows shows.
///
/// Interception reports a hardware id ("HID\VID_046D&amp;PID_C52B&amp;MI_01&amp;Col01")
/// while SetupAPI reports the *instance* id for the same device
/// ("...\Col01\2&amp;2b3f..."), and raw input reports a device-interface path
/// ("\\?\HID#VID_...#{guid}"). All three start with the same enumerator + hardware
/// id, so <see cref="NormaliseHardwareKey"/> reduces each to that pair, which is
/// also exactly what the config stores.
///
/// Every lookup here is best-effort: names are decoration, and RDP sessions can
/// deny SetupAPI entirely. A failure falls back to the hardware id, never an error.
/// </summary>
internal static class DeviceCatalog
{
    public static string NormaliseHardwareKey(string path)
    {
        string value = (path ?? string.Empty).Trim();
        if (value.Length == 0) return string.Empty;
        if (value.StartsWith(@"\\?\", StringComparison.Ordinal)) value = value[4..];

        // Device-interface paths use '#' where instance ids use '\'.
        value = value.Replace('#', '\\');

        string[] parts = value.Split('\\', StringSplitOptions.RemoveEmptyEntries);
        if (parts.Length == 0) return string.Empty;
        // enumerator + hardware id; anything after that is an instance/interface tail.
        return parts.Length == 1 ? parts[0] : parts[0] + "\\" + parts[1];
    }

    /// <summary>
    /// The canonical key raw input and Interception are matched by.
    ///
    /// Interception reports a hardware id ("HID\VID_046D&amp;PID_C52B&amp;REV_1210&amp;MI_01&amp;Col01")
    /// and raw input reports a device-interface path
    /// ("\\?\HID#VID_046D&amp;PID_C52B&amp;MI_01&amp;Col01#7&amp;...#{guid}"). They USUALLY agree
    /// after <see cref="NormaliseHardwareKey"/>, but the REV_ segment, the instance
    /// tail and the collection suffix differ between Windows versions - and a mismatch
    /// is invisible: every device simply reports zero motion, which looks exactly like
    /// "the mouse did not move". Reducing both sides to VID/PID (+ MI/Col when present)
    /// makes "which mouse is moving?" reliable.
    /// </summary>
    public static string MotionKey(string path)
    {
        string loose = MotionKeyLoose(path);
        if (!loose.StartsWith("VIDPID:", StringComparison.Ordinal)) return loose;

        string upper = (path ?? string.Empty).ToUpperInvariant();
        string? mi = Match(upper, @"MI_([0-9A-F]{2})");
        string? col = Match(upper, @"COL([0-9A-F]{2})");

        string key = loose;
        if (mi is not null) key += ":MI" + mi;
        if (col is not null) key += ":C" + col;
        return key;
    }

    /// <summary>VID/PID only - the fallback when one side omits MI/Col.</summary>
    public static string MotionKeyLoose(string path)
    {
        string value = path ?? string.Empty;
        string upper = value.ToUpperInvariant();
        string? vid = Match(upper, @"VID_([0-9A-F]{4})");
        string? pid = Match(upper, @"PID_([0-9A-F]{4})");

        return vid is not null && pid is not null
            ? "VIDPID:" + vid + ":" + pid
            : "KEY:" + NormaliseHardwareKey(value).ToUpperInvariant();
    }

    private static string? Match(string text, string pattern)
    {
        System.Text.RegularExpressions.Match match = System.Text.RegularExpressions.Regex.Match(text, pattern);
        return match.Success ? match.Groups[1].Value : null;
    }

    /// <summary>Interception devices, newest context, ordered by slot.</summary>
    public static List<MouseDevice> Enumerate(IntPtr context)
    {
        Dictionary<string, string> names = FriendlyNames();
        var devices = new List<MouseDevice>(Interception.MaxMouse);

        foreach (MouseInfo mouse in Interception.EnumerateMice(context))
        {
            string key = NormaliseHardwareKey(mouse.HardwareId);
            string name = names.TryGetValue(key, out string? friendly) ? friendly : key;
            devices.Add(new MouseDevice(mouse.Device, mouse.HardwareId, name, false, false));
        }

        return devices;
    }

    /// <summary>What `--simulate` shows: no driver, no hardware, but a full panel.</summary>
    public static List<MouseDevice> Simulated()
    {
        return new List<MouseDevice>
        {
            new(11, @"HID\VID_046D&PID_C52B&REV_1210&MI_01&Col01", "Logitech USB Receiver (simulated)", true, true),
            new(12, @"HID\VID_046D&PID_C52B&REV_1210&MI_02&Col02", "Logitech MX Master (simulated)", false, true),
        };
    }

    // ---- SetupAPI ----------------------------------------------------------

    // GUID_DEVCLASS_MOUSE - the SETUP class, which is what SetupDiEnumDeviceInfo is
    // documented for. Enumerating the device-INTERFACE class instead made
    // EnumDeviceInfo return nothing, so every name silently degraded to the hardware
    // id (the reported "list of ids as headers, and the same ids underneath").
    private static readonly Guid GuidDevClassMouse = new("4D36E96F-E325-11CE-BFC1-08002BE10318");

    private const uint DIGCF_PRESENT = 0x02;
    private const uint SPDRP_DEVICEDESC = 0x00;
    private const uint SPDRP_FRIENDLYNAME = 0x0C;
    private static readonly IntPtr InvalidHandleValue = new(-1);

    /// <summary>hardware key -> friendly name (empty when SetupAPI says nothing).</summary>
    private static Dictionary<string, string> FriendlyNames()
    {
        var map = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
        IntPtr set = IntPtr.Zero;

        try
        {
            // A static readonly field cannot be passed by ref; copy it.
            Guid mouseClass = GuidDevClassMouse;
            set = SetupDiGetClassDevsW(ref mouseClass, IntPtr.Zero, IntPtr.Zero, DIGCF_PRESENT);
            if (set == IntPtr.Zero || set == InvalidHandleValue) return map;

            for (uint index = 0; index < 256; index++)
            {
                var info = new SP_DEVINFO_DATA { cbSize = (uint)Marshal.SizeOf<SP_DEVINFO_DATA>() };
                if (!SetupDiEnumDeviceInfo(set, index, ref info)) break;

                string instanceId = InstanceId(set, ref info);
                if (instanceId.Length == 0) continue;

                string key = NormaliseHardwareKey(instanceId);
                if (key.Length == 0 || map.ContainsKey(key)) continue;

                string name = Property(set, ref info, SPDRP_FRIENDLYNAME);
                if (name.Length == 0) name = Property(set, ref info, SPDRP_DEVICEDESC);
                if (name.Length > 0) map[key] = name;
            }
        }
        catch (Exception)
        {
            // Names are decoration: a denied or unsupported call must not stop us.
        }
        finally
        {
            if (set != IntPtr.Zero && set != InvalidHandleValue) SetupDiDestroyDeviceInfoList(set);
        }

        return map;
    }

    private static string InstanceId(IntPtr set, ref SP_DEVINFO_DATA info)
    {
        var buffer = new StringBuilder(512);
        return SetupDiGetDeviceInstanceIdW(set, ref info, buffer, (uint)buffer.Capacity, out _)
            ? buffer.ToString()
            : string.Empty;
    }

    private static string Property(IntPtr set, ref SP_DEVINFO_DATA info, uint property)
    {
        var buffer = new byte[1024];
        if (!SetupDiGetDeviceRegistryPropertyW(set, ref info, property, out _, buffer,
                (uint)buffer.Length, out uint needed))
        {
            return string.Empty;
        }

        int length = (int)Math.Min(needed, (uint)buffer.Length);
        string text = Encoding.Unicode.GetString(buffer, 0, length).TrimEnd('\0').Trim();
        return ResolveIndirect(text);
    }

    /// <summary>
    /// Windows usually stores a device description as an INDIRECT string
    /// ("@%SystemRoot%\System32\drivers\...,-123"). Showing that raw is useless, and
    /// showing nothing is what made every row fall back to its hardware id.
    /// </summary>
    private static string ResolveIndirect(string text)
    {
        if (text.Length == 0) return string.Empty;
        if (!text.StartsWith('@')) return text;

        try
        {
            var buffer = new StringBuilder(512);
            int hr = SHLoadIndirectString(text, buffer, (uint)buffer.Capacity, IntPtr.Zero);
            string resolved = buffer.ToString().Trim();
            return hr == 0 ? resolved : string.Empty;
        }
        catch (Exception)
        {
            return string.Empty;
        }
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct SP_DEVINFO_DATA
    {
        public uint cbSize;
        public Guid ClassGuid;
        public uint DevInst;
        public IntPtr Reserved;
    }

    [DllImport("setupapi.dll", EntryPoint = "SetupDiGetClassDevsW", CharSet = CharSet.Unicode, SetLastError = true)]
    private static extern IntPtr SetupDiGetClassDevsW(ref Guid classGuid, IntPtr enumerator, IntPtr hwndParent, uint flags);

    [DllImport("setupapi.dll", SetLastError = true)]
    private static extern bool SetupDiEnumDeviceInfo(IntPtr deviceInfoSet, uint memberIndex, ref SP_DEVINFO_DATA deviceInfoData);

    [DllImport("setupapi.dll", EntryPoint = "SetupDiGetDeviceInstanceIdW", CharSet = CharSet.Unicode, SetLastError = true)]
    private static extern bool SetupDiGetDeviceInstanceIdW(
        IntPtr deviceInfoSet, ref SP_DEVINFO_DATA deviceInfoData,
        StringBuilder deviceInstanceId, uint deviceInstanceIdSize, out uint requiredSize);

    [DllImport("setupapi.dll", EntryPoint = "SetupDiGetDeviceRegistryPropertyW", CharSet = CharSet.Unicode, SetLastError = true)]
    private static extern bool SetupDiGetDeviceRegistryPropertyW(
        IntPtr deviceInfoSet, ref SP_DEVINFO_DATA deviceInfoData, uint property,
        out uint propertyRegDataType, byte[] propertyBuffer, uint propertyBufferSize, out uint requiredSize);

    [DllImport("setupapi.dll", SetLastError = true)]
    private static extern bool SetupDiDestroyDeviceInfoList(IntPtr deviceInfoSet);

    [DllImport("shlwapi.dll", EntryPoint = "SHLoadIndirectString", CharSet = CharSet.Unicode)]
    private static extern int SHLoadIndirectString(string source, StringBuilder buffer, uint bufferSize, IntPtr reserved);
}
