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

    private static readonly Guid GuidDevInterfaceMouse = new("378DE44C-56EF-11D1-BC8C-00A0C91405DD");

    private const uint DIGCF_PRESENT = 0x02;
    private const uint DIGCF_DEVICEINTERFACE = 0x10;
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
            Guid mouseInterface = GuidDevInterfaceMouse;
            set = SetupDiGetClassDevsW(ref mouseInterface, IntPtr.Zero, IntPtr.Zero,
                DIGCF_PRESENT | DIGCF_DEVICEINTERFACE);
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
        // Device descriptions arrive as "@%SystemRoot%\...,-123" indirection more
        // often than not; a raw resource key is noise, so show nothing instead.
        return text.StartsWith('@') ? string.Empty : text;
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
}
