using System.Collections.Concurrent;
using System.ComponentModel;
using System.Runtime.InteropServices;
using System.Text;

namespace Mouse.Capture;

/// <summary>
/// A hidden Win32 window with a message pump, used for two things the console
/// client never needed:
///
///  * "which mouse is this?" - raw input gives per-DEVICE motion, so the panel can
///    ask the user to wiggle one and highlight the matching row. This is the same
///    hand-rolled Win32 approach as RawDump (no WinForms: one hidden window must
///    not pull a UI framework into a 70 MB self-contained deploy).
///  * the PANIC hotkey. Arming a filter that swallows motion is only safe if it can
///    always be disarmed, including when the browser tab that started it is gone.
///
/// Nothing here is on the stroke path, so a lock or an allocation is acceptable;
/// the pump thread in Capture.cs stays untouched.
/// </summary>
internal sealed class RawMouseWindow : IDisposable
{
    private const string ClassName = "HidControlPanelWindow";

    private const uint WM_CLOSE = 0x0010;
    private const int WM_INPUT = 0x00FF;
    private const int WM_HOTKEY = 0x0312;

    private const uint RID_INPUT = 0x10000003;
    private const uint RIDI_DEVICENAME = 0x20000007;
    private const uint RIDEV_INPUTSINK = 0x00000100;
    private const uint RIM_TYPEMOUSE = 0;

    private const uint WS_POPUP = 0x80000000;
    private const uint WS_EX_TOOLWINDOW = 0x00000080;

    private const ushort RI_MOUSE_MOVE_ABSOLUTE = 0x0001;

    // Ctrl+Alt+Shift+Q. Deliberately hard to hit by accident and easy to remember.
    private const uint MOD_ALT = 0x0001;
    private const uint MOD_CONTROL = 0x0002;
    private const uint MOD_SHIFT = 0x0004;
    private const uint VK_Q = 0x51;
    private const int HotkeyId = 0x4D51;   // "MQ"

    private static readonly WndProcDelegate WndProcThunk = WndProc;

    private readonly ConcurrentDictionary<IntPtr, string> _names = new();
    private readonly ConcurrentDictionary<string, MotionCounter> _motion = new(StringComparer.OrdinalIgnoreCase);
    private readonly byte[] _buffer = new byte[256];
    private readonly ConcurrentQueue<string> _warnings = new();

    private IntPtr _window;
    private Thread? _thread;
    private bool _hotkeyRegistered;
    private readonly ManualResetEventSlim _ready = new(false);

    /// <summary>Raised on the pump thread - the handler must be quick and non-blocking.</summary>
    public event Action? PanicKey;

    public IReadOnlyList<string> Warnings => _warnings.ToArray();

    public bool HotkeyRegistered => _hotkeyRegistered;

    public void Start()
    {
        Instance = this;
        _thread = new Thread(Pump) { IsBackground = true, Name = "raw-input-identify" };
        _thread.Start();
        // The window MUST be created (and the hotkey registered) on this thread:
        // RegisterHotKey rejects a window that belongs to another thread.
        _ready.Wait(3000);
    }

    private void Pump()
    {
        CreateWindow();

        _hotkeyRegistered = _window != IntPtr.Zero
            && RegisterHotKey(_window, HotkeyId, MOD_CONTROL | MOD_ALT | MOD_SHIFT, VK_Q);

        if (!_hotkeyRegistered && _window != IntPtr.Zero)
        {
            _warnings.Enqueue("could not register the panic hotkey (Ctrl+Alt+Shift+Q): "
                + new Win32Exception(Marshal.GetLastWin32Error()).Message
                + " - another program may already own it");
        }

        _ready.Set();

        if (_window == IntPtr.Zero) return;

        while (GetMessageW(out MSG message, IntPtr.Zero, 0, 0) > 0)
        {
            TranslateMessage(ref message);
            DispatchMessageW(ref message);
        }
    }

    private void CreateWindow()
    {
        try
        {
            IntPtr instance = GetModuleHandleW(IntPtr.Zero);

            var windowClass = new WNDCLASSEXW
            {
                cbSize = (uint)Marshal.SizeOf<WNDCLASSEXW>(),
                lpfnWndProc = Marshal.GetFunctionPointerForDelegate(WndProcThunk),
                hInstance = instance,
                lpszClassName = ClassName,
            };

            if (RegisterClassExW(ref windowClass) == 0)
            {
                int error = Marshal.GetLastWin32Error();
                const int ERROR_CLASS_ALREADY_EXISTS = 1410;
                if (error != ERROR_CLASS_ALREADY_EXISTS)
                {
                    _warnings.Enqueue("could not register the helper window: " + new Win32Exception(error).Message);
                    return;
                }
            }

            _window = CreateWindowExW(
                WS_EX_TOOLWINDOW, ClassName, "mouse-capture", WS_POPUP,
                0, 0, 1, 1, IntPtr.Zero, IntPtr.Zero, instance, IntPtr.Zero);

            if (_window == IntPtr.Zero)
            {
                _warnings.Enqueue("could not create the helper window: "
                    + new Win32Exception(Marshal.GetLastWin32Error()).Message);
                return;
            }

            var device = new RAWINPUTDEVICE
            {
                usUsagePage = 0x01,   // Generic Desktop
                usUsage = 0x02,       // Mouse
                dwFlags = RIDEV_INPUTSINK,
                hwndTarget = _window,
            };

            if (!RegisterRawInputDevices(new[] { device }, 1, (uint)Marshal.SizeOf<RAWINPUTDEVICE>()))
            {
                _warnings.Enqueue("raw input is unavailable, so mice cannot be identified by moving them");
            }
        }
        catch (Exception ex)
        {
            _warnings.Enqueue("input helpers unavailable: " + ex.Message);
        }
    }

    private static IntPtr WndProc(IntPtr hwnd, uint message, IntPtr wParam, IntPtr lParam)
    {
        if (Instance is not null)
        {
            return Instance.Handle(hwnd, message, wParam, lParam);
        }

        return DefWindowProcW(hwnd, message, wParam, lParam);
    }

    /// <summary>The one live instance, so the static thunk can reach it.</summary>
    private static RawMouseWindow? Instance { get; set; }

    private IntPtr Handle(IntPtr hwnd, uint message, IntPtr wParam, IntPtr lParam)
    {
        switch (message)
        {
            case WM_INPUT:
                Count(lParam);
                return DefWindowProcW(hwnd, message, wParam, lParam);

            case WM_HOTKEY:
                try { PanicKey?.Invoke(); } catch (Exception) { /* never kill the pump */ }
                return IntPtr.Zero;

            case WM_CLOSE:
                if (_hotkeyRegistered)
                {
                    UnregisterHotKey(hwnd, HotkeyId);
                    _hotkeyRegistered = false;
                }
                DestroyWindow(hwnd);
                PostQuitMessage(0);
                return IntPtr.Zero;

            default:
                return DefWindowProcW(hwnd, message, wParam, lParam);
        }
    }

    private void Count(IntPtr rawHandle)
    {
        uint size = (uint)_buffer.Length;
        uint read = GetRawInputData(rawHandle, RID_INPUT, _buffer, ref size, (uint)Marshal.SizeOf<RAWINPUTHEADER>());
        if (read == uint.MaxValue || size < (uint)Marshal.SizeOf<RAWINPUTHEADER>()) return;

        RAWINPUTHEADER header = MemoryMarshal.Read<RAWINPUTHEADER>(_buffer);
        if (header.dwType != RIM_TYPEMOUSE) return;

        RAWMOUSE mouse = MemoryMarshal.Read<RAWMOUSE>(_buffer.AsSpan(Marshal.SizeOf<RAWINPUTHEADER>()));

        // Absolute devices (RDP, tablets) report a screen POSITION, not motion, so
        // they would look permanently busy. Only relative movement identifies a mouse.
        if ((mouse.usFlags & RI_MOUSE_MOVE_ABSOLUTE) != 0) return;

        int delta = Math.Abs(mouse.lLastX) + Math.Abs(mouse.lLastY);
        if (delta == 0) return;

        string key = _names.GetOrAdd(header.hDevice, Describe);
        if (key.Length == 0) return;

        MotionCounter counter = _motion.GetOrAdd(key, _ => new MotionCounter());
        Interlocked.Add(ref counter.Value, delta);
    }

    private string Describe(IntPtr device)
    {
        int bytes = 4096 * sizeof(char);
        IntPtr memory = Marshal.AllocHGlobal(bytes);

        try
        {
            for (int i = 0; i < bytes; i++) Marshal.WriteByte(memory, i, 0);

            uint size = 4096;
            uint written = GetRawInputDeviceInfoW(device, RIDI_DEVICENAME, memory, ref size);

            if (written == 0 || written == uint.MaxValue) return string.Empty;

            string? name = Marshal.PtrToStringUni(memory);
            return string.IsNullOrEmpty(name) ? string.Empty : DeviceCatalog.MotionKey(name);
        }
        finally
        {
            Marshal.FreeHGlobal(memory);
        }
    }

    /// <summary>
    /// Motion per device since the process started (never reset). The panel diffs two
    /// snapshots, so two consumers polling cannot steal each other's motion - which is
    /// what "identify the mouse by moving it" depends on.
    /// </summary>
    public Dictionary<string, long> SnapshotMotion()
    {
        var result = new Dictionary<string, long>(StringComparer.OrdinalIgnoreCase);
        foreach (KeyValuePair<string, MotionCounter> entry in _motion)
        {
            result[entry.Key] = Interlocked.Read(ref entry.Value.Value);
        }
        return result;
    }

    public void Dispose()
    {
        try
        {
            if (_window != IntPtr.Zero) PostMessageW(_window, WM_CLOSE, IntPtr.Zero, IntPtr.Zero);
            _thread?.Join(1500);
        }
        catch (Exception)
        {
            // Shutting down anyway.
        }
        finally
        {
            if (_window != IntPtr.Zero) UnregisterClassW(ClassName, GetModuleHandleW(IntPtr.Zero));
            _window = IntPtr.Zero;
            Instance = null;
        }
    }

    private sealed class MotionCounter
    {
        public long Value;
    }

    // ---- Win32 -------------------------------------------------------------

    [UnmanagedFunctionPointer(CallingConvention.Winapi)]
    private delegate IntPtr WndProcDelegate(IntPtr hwnd, uint message, IntPtr wParam, IntPtr lParam);

    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
    private struct WNDCLASSEXW
    {
        public uint cbSize;
        public uint style;
        public IntPtr lpfnWndProc;
        public int cbClsExtra;
        public int cbWndExtra;
        public IntPtr hInstance;
        public IntPtr hIcon;
        public IntPtr hCursor;
        public IntPtr hbrBackground;
        [MarshalAs(UnmanagedType.LPWStr)] public string? lpszMenuName;
        [MarshalAs(UnmanagedType.LPWStr)] public string lpszClassName;
        public IntPtr hIconSm;
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct POINT
    {
        public int x;
        public int y;
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct MSG
    {
        public IntPtr hwnd;
        public uint message;
        public IntPtr wParam;
        public IntPtr lParam;
        public uint time;
        public POINT pt;
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct RAWINPUTDEVICE
    {
        public ushort usUsagePage;
        public ushort usUsage;
        public uint dwFlags;
        public IntPtr hwndTarget;
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct RAWINPUTHEADER
    {
        public uint dwType;
        public uint dwSize;
        public IntPtr hDevice;
        public IntPtr wParam;
    }

    [StructLayout(LayoutKind.Explicit)]
    private struct RAWMOUSE
    {
        [FieldOffset(0)] public ushort usFlags;
        [FieldOffset(4)] public ushort usButtonFlags;
        [FieldOffset(6)] public ushort usButtonData;
        [FieldOffset(8)] public uint ulRawButtons;
        [FieldOffset(12)] public int lLastX;
        [FieldOffset(16)] public int lLastY;
        [FieldOffset(20)] public uint ulExtraInformation;
    }

    [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
    private static extern IntPtr GetModuleHandleW(IntPtr moduleName);

    [DllImport("user32.dll", EntryPoint = "RegisterClassExW", CharSet = CharSet.Unicode, SetLastError = true)]
    private static extern ushort RegisterClassExW(ref WNDCLASSEXW windowClass);

    [DllImport("user32.dll", EntryPoint = "UnregisterClassW", CharSet = CharSet.Unicode, SetLastError = true)]
    private static extern bool UnregisterClassW(string className, IntPtr instance);

    [DllImport("user32.dll", EntryPoint = "CreateWindowExW", CharSet = CharSet.Unicode, SetLastError = true)]
    private static extern IntPtr CreateWindowExW(
        uint exStyle, string className, string windowName, uint style,
        int x, int y, int width, int height,
        IntPtr parent, IntPtr menu, IntPtr instance, IntPtr param);

    [DllImport("user32.dll", EntryPoint = "DefWindowProcW")]
    private static extern IntPtr DefWindowProcW(IntPtr hwnd, uint message, IntPtr wParam, IntPtr lParam);

    [DllImport("user32.dll", EntryPoint = "GetMessageW")]
    private static extern int GetMessageW(out MSG message, IntPtr hwnd, uint min, uint max);

    [DllImport("user32.dll")]
    private static extern bool TranslateMessage(ref MSG message);

    [DllImport("user32.dll", EntryPoint = "DispatchMessageW")]
    private static extern IntPtr DispatchMessageW(ref MSG message);

    [DllImport("user32.dll")]
    private static extern void PostQuitMessage(int exitCode);

    [DllImport("user32.dll", EntryPoint = "PostMessageW")]
    private static extern bool PostMessageW(IntPtr hwnd, uint message, IntPtr wParam, IntPtr lParam);

    [DllImport("user32.dll", SetLastError = true)]
    private static extern bool DestroyWindow(IntPtr hwnd);

    [DllImport("user32.dll", SetLastError = true)]
    private static extern bool RegisterHotKey(IntPtr hwnd, int id, uint modifiers, uint virtualKey);

    [DllImport("user32.dll", SetLastError = true)]
    private static extern bool UnregisterHotKey(IntPtr hwnd, int id);

    [DllImport("user32.dll", SetLastError = true)]
    private static extern bool RegisterRawInputDevices(RAWINPUTDEVICE[] devices, uint count, uint size);

    [DllImport("user32.dll", SetLastError = true)]
    private static extern uint GetRawInputData(IntPtr rawInput, uint command, [Out] byte[] data, ref uint size, uint headerSize);

    [DllImport("user32.dll", EntryPoint = "GetRawInputDeviceInfoW", CharSet = CharSet.Unicode, SetLastError = true)]
    private static extern uint GetRawInputDeviceInfoW(IntPtr device, uint command, IntPtr data, ref uint size);
}
