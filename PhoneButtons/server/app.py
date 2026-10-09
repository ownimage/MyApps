import os
import io
import json
import sys
import socket
import datetime
import threading
import webbrowser
import ctypes
from ctypes import wintypes

import win32gui
import win32ui
import win32process
import win32api
import win32con
import psutil

_VersionDll = ctypes.windll.version
from PIL import Image

from flask import Flask, jsonify, request, send_from_directory, redirect
from flask_socketio import SocketIO, emit

app = Flask(__name__)
# The front end is served by THIS server (same origin), so no CORS is needed.
# Deliberately NOT wildcard-CORS: this server can inject keystrokes, so it must
# not be drivable by an arbitrary web page.
socketio = SocketIO(app)

# Paths ---------------------------------------------------------------------
# app.py lives in MyApps/PhoneButtons/server; the web app and the shared smd-*
# library are served straight out of the MyApps repo root (two levels up).
SERVER_DIR = os.path.dirname(os.path.abspath(__file__))
REPO_ROOT = os.path.abspath(os.path.join(SERVER_DIR, "..", ".."))

# WinEvent hook for foreground change notifications
_EVENT_SYSTEM_FOREGROUND = 0x0003
_WINEVENT_OUTOFCONTEXT = 0x0000

_user32 = ctypes.windll.user32

_SetWinEventHook = _user32.SetWinEventHook
_SetWinEventHook.argtypes = [
    wintypes.UINT, wintypes.UINT, wintypes.HMODULE,
    ctypes.c_void_p, wintypes.DWORD, wintypes.DWORD, wintypes.DWORD
]
_SetWinEventHook.restype = wintypes.HANDLE

_UnhookWinEvent = _user32.UnhookWinEvent
_UnhookWinEvent.argtypes = [wintypes.HANDLE]
_UnhookWinEvent.restype = wintypes.BOOL

class _MSG(ctypes.Structure):
    _fields_ = [
        ("hwnd", wintypes.HWND),
        ("message", wintypes.UINT),
        ("wParam", wintypes.WPARAM),
        ("lParam", wintypes.LPARAM),
        ("time", wintypes.DWORD),
        ("pt", wintypes.POINT),
    ]

_GetMessageW = _user32.GetMessageW
_GetMessageW.argtypes = [ctypes.POINTER(_MSG), wintypes.HWND, wintypes.UINT, wintypes.UINT]
_GetMessageW.restype = wintypes.BOOL

_TranslateMessage = _user32.TranslateMessage
_TranslateMessage.argtypes = [ctypes.POINTER(_MSG)]
_TranslateMessage.restype = wintypes.BOOL

_DispatchMessageW = _user32.DispatchMessageW
_DispatchMessageW.argtypes = [ctypes.POINTER(_MSG)]
_DispatchMessageW.restype = wintypes.LPARAM

WINEVENTPROC = ctypes.CFUNCTYPE(
    None,
    wintypes.HANDLE,
    wintypes.DWORD,
    wintypes.HWND,
    wintypes.LONG,
    wintypes.LONG,
    wintypes.DWORD,
    wintypes.DWORD
)

_focus_hook_handle = None

def _get_app_template(name):
    try:
        with open(CONFIG_PATH, "r") as f:
            config = json.load(f)
    except (FileNotFoundError, json.JSONDecodeError):
        return None
    tmpl_key = config.get("applications", {}).get(name)
    if not tmpl_key:
        return None
    return config.get("templates", {}).get(tmpl_key)

def _on_foreground_change(hWinEventHook, event, hwnd, idObject, idChild, dwEventThread, dwmsEventTime):
    global _current_app
    try:
        title = win32gui.GetWindowText(hwnd)
        if not title:
            return
        _, pid = win32process.GetWindowThreadProcessId(hwnd)
        proc = psutil.Process(pid)
        exe = proc.exe()
        name = _get_friendly_name(exe)
        if name != _current_app.get("name"):
            _debug(f"Foreground changed (hook): {_current_app.get('name')} -> {name}")
            icon_url = _cache_icon(exe, hwnd, name)
            template = _get_app_template(name)
            _current_app = {"name": name, "icon": icon_url, "template": template}
            socketio.emit("app_change", _current_app)
    except Exception as e:
        _debug(f"Focus hook callback error: {e}")

_hook_callback = WINEVENTPROC(_on_foreground_change)

def _run_focus_hook():
    global _focus_hook_handle
    _focus_hook_handle = _SetWinEventHook(
        _EVENT_SYSTEM_FOREGROUND,
        _EVENT_SYSTEM_FOREGROUND,
        0,
        _hook_callback,
        0, 0,
        _WINEVENT_OUTOFCONTEXT
    )
    if not _focus_hook_handle:
        _debug("ERROR: Failed to install foreground hook")
        return
    _debug("Foreground hook installed")
    msg = _MSG()
    while _GetMessageW(ctypes.byref(msg), 0, 0, 0):
        _TranslateMessage(ctypes.byref(msg))
        _DispatchMessageW(ctypes.byref(msg))
    _UnhookWinEvent(_focus_hook_handle)
    _debug("Foreground hook removed")

ICON_DIR = os.path.join(SERVER_DIR, "app-icon-cache")
os.makedirs(ICON_DIR, exist_ok=True)

CONFIG_PATH = os.path.join(SERVER_DIR, "config.json")

_current_app = {"name": "Unknown", "icon": ""}

_app_icon_prefs = {}

DEBUG = True

def _debug(msg):
    if DEBUG:
        ts = datetime.datetime.now().strftime("%H:%M:%S.%f")[:-3]
        print(f"[{ts}] {msg}", file=sys.stderr, flush=True)


def _load_config():
    global _app_icon_prefs
    try:
        with open(CONFIG_PATH, "r") as f:
            _app_icon_prefs = json.load(f).get("app-icon", {})
        _debug(f"Loaded config: {len(_app_icon_prefs)} app-icon prefs")
    except (FileNotFoundError, json.JSONDecodeError) as e:
        _app_icon_prefs = {}
        _debug(f"No config found ({e})")
    return _app_icon_prefs


def _save_config():
    try:
        with open(CONFIG_PATH, "r") as f:
            config = json.load(f)
    except (FileNotFoundError, json.JSONDecodeError):
        config = {}
    if "app-icon" not in config:
        config["app-icon"] = {}
    config["app-icon"].update(_app_icon_prefs)
    with open(CONFIG_PATH, "w", newline="\n") as f:
        json.dump(config, f, indent=2)
    _debug("Config saved")


def _set_app_icon_pref(name, source):
    _app_icon_prefs[name] = source
    _save_config()
    _debug(f"Set icon pref: {name} -> {source}")
    icon_path = os.path.join(ICON_DIR, f"{name}.png")
    try:
        os.remove(icon_path)
        _debug(f"Removed cached icon: {name}.png")
    except FileNotFoundError:
        pass


def _get_friendly_name(exe_path):
    try:
        size = _VersionDll.GetFileVersionInfoSizeW(exe_path, None)
        if not size:
            return os.path.splitext(os.path.basename(exe_path))[0]
        buf = ctypes.create_string_buffer(size)
        if not _VersionDll.GetFileVersionInfoW(exe_path, 0, size, buf):
            return os.path.splitext(os.path.basename(exe_path))[0]
        trans = ctypes.c_wchar_p()
        trans_len = wintypes.UINT()
        if not _VersionDll.VerQueryValueW(
            buf, "\\VarFileInfo\\Translation",
            ctypes.byref(trans), ctypes.byref(trans_len)
        ):
            return os.path.splitext(os.path.basename(exe_path))[0]
        num = trans_len.value // 4
        arr = ctypes.cast(trans, ctypes.POINTER(wintypes.DWORD))
        for i in range(num):
            dword = arr[i]
            path = f"\\StringFileInfo\\{dword & 0xFFFF:04X}{dword >> 16:04X}\\FileDescription"
            desc = ctypes.c_wchar_p()
            desc_len = wintypes.UINT()
            if _VersionDll.VerQueryValueW(
                buf, path, ctypes.byref(desc), ctypes.byref(desc_len)
            ) and desc.value:
                return desc.value
    except Exception:
        pass
    return os.path.splitext(os.path.basename(exe_path))[0]


def _get_foreground_info():
    try:
        hwnd = win32gui.GetForegroundWindow()
        title = win32gui.GetWindowText(hwnd)
        if not title:
            return None
        _, pid = win32process.GetWindowThreadProcessId(hwnd)
        proc = psutil.Process(pid)
        exe = proc.exe()
        name = _get_friendly_name(exe)
        _debug(f"Foreground: {name} ({exe})")
        return {"title": title, "name": name, "exe": exe, "hwnd": hwnd}
    except (psutil.NoSuchProcess, psutil.AccessDenied) as e:
        _debug(f"Foreground info error: {e}")
        return None
    except Exception as e:
        _debug(f"Foreground info unexpected: {e}")
        return None


_PrivateExtractIconsW = ctypes.windll.user32.PrivateExtractIconsW
_PrivateExtractIconsW.argtypes = [
    wintypes.LPCWSTR, ctypes.c_int, ctypes.c_int, ctypes.c_int,
    ctypes.POINTER(wintypes.HICON), ctypes.POINTER(wintypes.UINT),
    wintypes.UINT, wintypes.UINT
]
_PrivateExtractIconsW.restype = wintypes.UINT

_LookupIconIdFromDirectoryEx = ctypes.windll.user32.LookupIconIdFromDirectoryEx
_LookupIconIdFromDirectoryEx.argtypes = [
    ctypes.c_void_p, ctypes.c_int, ctypes.c_int, ctypes.c_int, ctypes.c_uint
]
_LookupIconIdFromDirectoryEx.restype = ctypes.c_int

_CreateIconFromResourceEx = ctypes.windll.user32.CreateIconFromResourceEx
_CreateIconFromResourceEx.argtypes = [
    ctypes.c_void_p, ctypes.c_uint32, ctypes.c_int, ctypes.c_uint32,
    ctypes.c_int, ctypes.c_int, ctypes.c_uint
]
_CreateIconFromResourceEx.restype = wintypes.HICON


class _SHFILEINFOW(ctypes.Structure):
    _fields_ = [
        ("hIcon", ctypes.c_void_p),
        ("iIcon", ctypes.c_int),
        ("dwAttributes", ctypes.c_uint),
        ("szDisplayName", ctypes.c_wchar * 260),
        ("szTypeName", ctypes.c_wchar * 80),
    ]


def _hicon_to_png(hicon, size=64):
    try:
        hwnd = win32gui.GetDesktopWindow()
        hdc = win32gui.GetDC(hwnd)
        hdc_mem = win32gui.CreateCompatibleDC(hdc)
        hbm = win32gui.CreateCompatibleBitmap(hdc, size, size)
        hbm_old = win32gui.SelectObject(hdc_mem, hbm)
        win32gui.DrawIconEx(hdc_mem, 0, 0, hicon, size, size, 0, None, 3)
        bmp = win32ui.CreateBitmapFromHandle(hbm)
        bits = bmp.GetBitmapBits(True)
        win32gui.SelectObject(hdc_mem, hbm_old)
        win32gui.DeleteDC(hdc_mem)
        win32gui.ReleaseDC(hwnd, hdc)
        img = Image.frombuffer("RGBA", (size, size), bits, "raw", "BGRA", 0, 1)
        buf = io.BytesIO()
        img.save(buf, format="PNG")
        return buf.getvalue()
    except Exception:
        return None


def _hicon_to_png_owned(hicon, size=64):
    try:
        return _hicon_to_png(hicon, size)
    finally:
        try:
            win32gui.DestroyIcon(hicon)
        except Exception:
            pass


def _collect_icons(hwnd, exe_path, size=64):
    results = []
    visited = set()
    def try_source(label, hicon):
        if hicon and hicon not in visited:
            visited.add(hicon)
            png = _hicon_to_png(hicon, size)
            if png:
                results.append((label, png, hicon))
    # HWND sources (do NOT destroy these handles)
    try_source("WM_GETICON BIG", win32gui.SendMessage(hwnd, win32con.WM_GETICON, win32con.ICON_BIG, 0))
    try_source("WM_GETICON SMALL", win32gui.SendMessage(hwnd, win32con.WM_GETICON, win32con.ICON_SMALL, 0))
    try_source("GCL_HICON", win32gui.GetClassLong(hwnd, win32con.GCL_HICON))
    try_source("GCL_HICONSM", win32gui.GetClassLong(hwnd, win32con.GCL_HICONSM))
    # EXE sources (DestroyIcon required)
    try:
        hicon = win32gui.ExtractIcon(exe_path, 0)
        if hicon:
            try_source("ExtractIcon(0)", hicon)
    except Exception:
        pass
    for idx in (0, 1, -1):
        try:
            large, _ = win32gui.ExtractIconEx(exe_path, idx)
            if large:
                try_source(f"ExtractIconEx({idx})", large[0])
        except Exception:
            pass
    try:
        sfi = _SHFILEINFOW()
        if ctypes.windll.shell32.SHGetFileInfoW(
            exe_path, 0, ctypes.byref(sfi),
            ctypes.sizeof(sfi), 0x000000100
        ) and sfi.hIcon:
            try_source("SHGetFileInfoW", sfi.hIcon)
    except Exception:
        pass
    # Destroy owned icons (ExtractIcon* + SHGetFileInfoW)
    for label, _, hicon in results:
        if label.startswith("ExtractIcon") or label.startswith("SHGetFileInfoW"):
            try:
                win32gui.DestroyIcon(hicon)
            except Exception:
                pass
    return [(label, png) for label, png, _ in results]


def _extract_icon_png_from_hwnd(hwnd, size=64):
    sources = [
        lambda: win32gui.SendMessage(hwnd, win32con.WM_GETICON, win32con.ICON_BIG, 0),
        lambda: win32gui.SendMessage(hwnd, win32con.WM_GETICON, win32con.ICON_SMALL, 0),
        lambda: win32gui.GetClassLong(hwnd, win32con.GCL_HICON),
        lambda: win32gui.GetClassLong(hwnd, win32con.GCL_HICONSM),
    ]
    for src in sources:
        try:
            hicon = src()
            if hicon:
                result = _hicon_to_png(hicon, size)
                if result:
                    return result
        except Exception:
            pass
    return None


def _extract_icon_png(exe_path, size=64):
    try:
        large, _ = win32gui.ExtractIconEx(exe_path, 0)
        if large:
            return _hicon_to_png_owned(large[0], size)
    except Exception:
        pass
    try:
        sfi = _SHFILEINFOW()
        if ctypes.windll.shell32.SHGetFileInfoW(
            exe_path, 0, ctypes.byref(sfi),
            ctypes.sizeof(sfi), 0x000000100
        ) and sfi.hIcon:
            return _hicon_to_png_owned(sfi.hIcon, size)
    except Exception:
        pass
    return None


def _extract_icon_by_source(source, exe_path, hwnd, size=64):
    """Try to extract an icon using a specific named source.
    Returns PNG bytes or None."""
    try:
        if source == "WM_GETICON BIG":
            hicon = win32gui.SendMessage(hwnd, win32con.WM_GETICON, win32con.ICON_BIG, 0)
            return _hicon_to_png(hicon, size) if hicon else None
        if source == "WM_GETICON SMALL":
            hicon = win32gui.SendMessage(hwnd, win32con.WM_GETICON, win32con.ICON_SMALL, 0)
            return _hicon_to_png(hicon, size) if hicon else None
        if source == "GCL_HICON":
            hicon = win32gui.GetClassLong(hwnd, win32con.GCL_HICON)
            return _hicon_to_png(hicon, size) if hicon else None
        if source == "GCL_HICONSM":
            hicon = win32gui.GetClassLong(hwnd, win32con.GCL_HICONSM)
            return _hicon_to_png(hicon, size) if hicon else None
        if source.startswith("ExtractIconEx("):
            idx = int(source[len("ExtractIconEx("):-1])
            large, _ = win32gui.ExtractIconEx(exe_path, idx)
            if large:
                return _hicon_to_png_owned(large[0], size)
        if source == "ExtractIcon(0)":
            hicon = win32gui.ExtractIcon(exe_path, 0)
            if hicon:
                return _hicon_to_png_owned(hicon, size)
        if source == "SHGetFileInfoW":
            sfi = _SHFILEINFOW()
            if ctypes.windll.shell32.SHGetFileInfoW(
                exe_path, 0, ctypes.byref(sfi),
                ctypes.sizeof(sfi), 0x000000100
            ) and sfi.hIcon:
                return _hicon_to_png_owned(sfi.hIcon, size)
    except Exception:
        pass
    return None


def _extract_exe_icons_via_resources(exe_path):
    _debug(f"Resource enumeration for: {exe_path}")
    results = []
    seen = set()
    sizes = [16, 20, 24, 32, 48, 64, 96, 128, 256]

    try:
        LOAD_LIBRARY_AS_DATAFILE = 0x00000002
        hmod = ctypes.windll.kernel32.LoadLibraryExW(exe_path, 0, LOAD_LIBRARY_AS_DATAFILE)
        if not hmod:
            _debug("  LoadLibraryExW failed")
            return results
    except Exception as e:
        _debug(f"  LoadLibraryExW error: {e}")
        return results

    try:
        try:
            group_names = win32api.EnumResourceNames(hmod, 14)
            _debug(f"  Found {len(group_names)} icon groups")
        except Exception:
            group_names = []

        for group_name in group_names:
            try:
                langs = win32api.EnumResourceLanguages(hmod, 14, group_name)
            except Exception:
                continue

            for lang in langs:
                try:
                    hres = win32api.FindResourceEx(hmod, 14, group_name, lang)
                    group_data = win32api.LoadResource(hmod, hres)
                except Exception:
                    continue

                if not group_data:
                    continue

                prefix = str(group_name) if isinstance(group_name, int) else str(group_name)

                for size in sizes:
                    try:
                        buf = ctypes.create_string_buffer(group_data)
                        icon_id = _LookupIconIdFromDirectoryEx(buf, 1, size, size, 0)
                        if not icon_id or icon_id == 0xFFFFFFFF:
                            continue

                        try:
                            icon_langs = win32api.EnumResourceLanguages(hmod, 3, icon_id)
                        except Exception:
                            continue

                        for ilang in icon_langs:
                            try:
                                ihres = win32api.FindResourceEx(hmod, 3, icon_id, ilang)
                                icon_data = win32api.LoadResource(hmod, ihres)
                            except Exception:
                                continue
                            if not icon_data:
                                continue

                            hicon = _CreateIconFromResourceEx(
                                icon_data, len(icon_data), 1, 0x00030000, size, size, 0)
                            if not hicon:
                                hicon = _CreateIconFromResourceEx(
                                    icon_data, len(icon_data), 1, 0x00030000, 0, 0, 0)
                            if hicon and hicon not in seen:
                                seen.add(hicon)
                                png = _hicon_to_png_owned(hicon, size)
                                if png:
                                    results.append((f"Resource #{prefix} {size}x{size}", png))
                            break
                    except Exception:
                        continue
    finally:
        try:
            ctypes.windll.kernel32.FreeLibrary(hmod)
        except Exception:
            pass
    return results


def _extract_uwp_icons(hwnd):
    results = []
    try:
        class_name = win32gui.GetClassName(hwnd)
    except Exception:
        return results
    if class_name != "ApplicationFrameWindow":
        return results
    _debug("UWP extraction: ApplicationFrameWindow detected")

    actual_hwnd = [hwnd]
    def enum_cb(child, _):
        try:
            cn = win32gui.GetClassName(child)
        except Exception:
            cn = ""
        if "ApplicationFrame" not in cn:
            actual_hwnd[0] = child
            return False
        return True
    try:
        win32gui.EnumChildWindows(hwnd, enum_cb, 0)
    except Exception:
        pass

    target = actual_hwnd[0]
    pid_val = wintypes.DWORD()
    ctypes.windll.user32.GetWindowThreadProcessId(target, ctypes.byref(pid_val))

    PROCESS_QUERY_LIMITED_INFORMATION = 0x1000
    hproc = ctypes.windll.kernel32.OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, False, pid_val)
    if not hproc:
        return results

    try:
        length = wintypes.UINT()
        ret = ctypes.windll.kernel32.GetPackageFullName(hproc, ctypes.byref(length), None)
        if ret == 15700:
            return results
        full_name = ctypes.create_unicode_buffer(length.value + 1)
        ret = ctypes.windll.kernel32.GetPackageFullName(hproc, ctypes.byref(length), full_name)
        if ret != 0:
            return results

        length2 = wintypes.UINT()
        ret2 = ctypes.windll.kernel32.GetPackagePathByFullName(full_name, ctypes.byref(length2), None)
        if ret2 != 122:
            return results
        pkg_path = ctypes.create_unicode_buffer(length2.value)
        ret2 = ctypes.windll.kernel32.GetPackagePathByFullName(full_name, ctypes.byref(length2), pkg_path)
        if ret2 != 0:
            return results

        manifest = os.path.join(pkg_path.value, "AppXManifest.xml")
        if not os.path.exists(manifest):
            return results

        import xml.etree.ElementTree as ET
        ns = {"uap": "http://schemas.microsoft.com/appx/manifest/uap/windows10"}
        root = ET.parse(manifest).getroot()
        velem = root.find(".//VisualElements") or root.find(".//uap:VisualElements", ns) or root.find(".//{http://schemas.microsoft.com/appx/manifest/uap/windows10}VisualElements")
        if velem is None:
            return results

        logo_attrs = [k for k in velem.attrib if k.lower().endswith("logo")]
        for attr in logo_attrs:
            rel_path = velem.attrib[attr]
            if not rel_path:
                continue
            p = os.path.join(pkg_path.value, os.path.dirname(rel_path))
            stem = os.path.splitext(os.path.basename(rel_path))[0]
            import glob as globmod
            pattern = os.path.join(p, "**", stem + "*")
            matches = sorted(globmod.glob(pattern, recursive=True))
            for match in matches:
                try:
                    img = Image.open(match)
                    buf = io.BytesIO()
                    img.save(buf, format="PNG")
                    png_data = buf.getvalue()
                    label = f"UWP {attr} {os.path.basename(match)}"
                    results.append((label, png_data))
                except Exception:
                    continue
    finally:
        try:
            ctypes.windll.kernel32.CloseHandle(hproc)
        except Exception:
            pass
    return results


def _cache_icon(exe_path, hwnd, name):
    icon_filename = f"{name}.png"
    icon_path = os.path.join(ICON_DIR, icon_filename)
    if os.path.exists(icon_path):
        _debug(f"Cache hit: {icon_filename}")
        return f"/app-icon-cache/{icon_filename}"
    if not _app_icon_prefs:
        _load_config()
    preferred = _app_icon_prefs.get(name)
    _debug(f"Cache miss for {name}, preferred source: {preferred}")
    png_data = None
    if preferred:
        png_data = _extract_icon_by_source(preferred, exe_path, hwnd)
        if not png_data:
            _debug(f"Preferred source '{preferred}' failed for {name}")
    else:
        png_data = _extract_icon_png_from_hwnd(hwnd)
        if not png_data:
            png_data = _extract_icon_png(exe_path)
    if png_data:
        with open(icon_path, "wb") as f:
            f.write(png_data)
        _debug(f"Cached icon saved: {icon_filename} ({len(png_data)} bytes)")
        return f"/app-icon-cache/{icon_filename}"
    _debug(f"No icon could be extracted for {name}")
    return ""





@app.route("/")
def index():
    # The remote UI is the MyApps front end in PhoneButtons/, served from the
    # repo root by the catch-all route below.
    return redirect("/PhoneButtons/")


@app.route("/PhoneButtons/")
def phonebuttons_index():
    return send_from_directory(REPO_ROOT, "PhoneButtons/index.html")


@app.route("/app-icon-cache/<path:filename>")
def app_icon_cache(filename):
    return send_from_directory(ICON_DIR, filename)


@app.route("/<path:filename>")
def repo_static(filename):
    # Serves the app folder AND the shared smd-* library (shared/css, shared/js,
    # shared/vendor) straight from the MyApps repo root. The explicit API and
    # socket routes above are more specific and win over this catch-all.
    return send_from_directory(REPO_ROOT, filename)


@app.route("/api/layouts")
def api_layouts():
    """The layout catalog for the Edit App wizard's "Select Layout" dropdown."""
    try:
        with open(CONFIG_PATH, "r") as f:
            config = json.load(f)
    except (FileNotFoundError, json.JSONDecodeError):
        config = {}
    layouts = config.get("layouts", {})
    result = [{
        "key": key,
        "displayName": value.get("displayName", key),
        "image": value.get("image", ""),
        "orientation": value.get("orientation", "landscape"),
        "buttons": value.get("buttons", []),
    } for key, value in layouts.items()]
    return jsonify({"layouts": result})


@app.route("/api/app-icons")
def api_app_icons():
    """The cached application icons (PNGs extracted from foreground windows).
    The Edit Layout icon picker is populated from this list."""
    icons = []
    try:
        for fname in sorted(os.listdir(ICON_DIR)):
            if fname.lower().endswith(".png"):
                icons.append(fname)
    except FileNotFoundError:
        pass
    return jsonify({"icons": icons})


@app.route("/api/save-layout", methods=["POST"])
def api_save_layout():
    """Save a layout definition (display name + icon + orientation)."""
    data = request.get_json() or {}
    key = (data.get("key") or "").strip()
    if not key:
        return jsonify({"error": "Missing key"}), 400
    try:
        with open(CONFIG_PATH, "r") as f:
            config = json.load(f)
    except (FileNotFoundError, json.JSONDecodeError):
        config = {}
    if "layouts" not in config:
        config["layouts"] = {}
    # Buttons are edited separately; MERGE here so saving the icon/orientation
    # never drops them, and honour an explicit `buttons` list if one is sent.
    layout = config["layouts"].setdefault(key, {})
    layout["displayName"] = data.get("displayName") or key
    layout["image"] = data.get("image", "")
    layout["orientation"] = data.get("orientation", "landscape")
    if isinstance(data.get("buttons"), list):
        layout["buttons"] = data["buttons"]
    else:
        layout.setdefault("buttons", [])
    with open(CONFIG_PATH, "w", newline="\n") as f:
        json.dump(config, f, indent=2)
    _debug(f"Saved layout: {key}")
    return jsonify({"ok": True})


@app.route("/api/save-layout-button", methods=["POST"])
def api_save_layout_button():
    """Save one button (shared image name + key combination) of a layout."""
    data = request.get_json() or {}
    key = (data.get("layout") or "").strip()
    index = data.get("index")
    if not key or not isinstance(index, int) or index < 0:
        return jsonify({"error": "Missing layout or index"}), 400
    try:
        with open(CONFIG_PATH, "r") as f:
            config = json.load(f)
    except (FileNotFoundError, json.JSONDecodeError):
        config = {}
    layouts = config.get("layouts", {})
    if key not in layouts:
        return jsonify({"error": "Unknown layout"}), 404
    buttons = layouts[key].setdefault("buttons", [])
    while len(buttons) <= index:
        buttons.append({})
    buttons[index] = {
        "name": data.get("name", ""),
        "image": data.get("image", ""),
        "key": data.get("key", ""),
    }
    with open(CONFIG_PATH, "w", newline="\n") as f:
        json.dump(config, f, indent=2)
    _debug(f"Saved layout button: {key}[{index}]")
    return jsonify({"ok": True})


@app.route("/api/save-app-layout", methods=["POST"])
def api_save_app_layout():
    """Persist the Edit App wizard's result: which layout an app uses."""
    data = request.get_json() or {}
    name = data.get("name")
    layout = data.get("layout", "")
    if not name:
        return jsonify({"error": "Missing name"}), 400
    try:
        with open(CONFIG_PATH, "r") as f:
            config = json.load(f)
    except (FileNotFoundError, json.JSONDecodeError):
        config = {}
    if "app-layouts" not in config:
        config["app-layouts"] = {}
    if layout:
        config["app-layouts"][name] = layout
    else:
        config["app-layouts"].pop(name, None)
    with open(CONFIG_PATH, "w", newline="\n") as f:
        json.dump(config, f, indent=2)
    _debug(f"Saved app layout: {name} -> {layout}")
    return jsonify({"ok": True})


@socketio.on("connect")
def on_connect():
    emit("app_change", _current_app)
    return True


@socketio.on("ping")
def handle_ping(data):
    """Round-trip probe so a client can confirm the socket works end to end."""
    t = data.get("t") if isinstance(data, dict) else None
    emit("pong", {"t": t, "service": "phonebuttons", "foreground": _current_app.get("name")})




def send_key(vk):
    win32api.keybd_event(vk, 0, 0, 0)
    win32api.keybd_event(vk, 0, 2, 0)


@socketio.on("set_default_icon")
def handle_set_default_icon(data):
    name = data.get("name")
    source = data.get("source")
    exe = data.get("exe")
    _debug(f"set_default_icon: name={name}, source={source}, exe={exe}")
    if name and source:
        _set_app_icon_pref(name, source)
        hwnd = None
        info = _get_foreground_info()
        if info and info["name"] == name:
            exe = info["exe"]
            hwnd = info["hwnd"]
            _debug(f"  Foreground matches, re-caching with exe={exe}, hwnd={hwnd}")
        else:
            _debug(f"  Foreground is '{info.get('name') if info else None}', using exe from event")
        if exe and name:
            icon_url = _cache_icon(exe, hwnd, name)
            _current_app["icon"] = icon_url
            emit("app_change", _current_app, broadcast=True)
            _debug(f"  Emitted app_change with icon: {icon_url}")
    else:
        _debug(f"  Invalid data (missing name or source)")


_KEY_MAP = {
    "BACKSPACE": 0x08, "TAB": 0x09, "ENTER": 0x0D, "ESCAPE": 0x1B,
    "SPACE": 0x20, "DELETE": 0x2E,
    "F1": 0x70, "F2": 0x71, "F3": 0x72, "F4": 0x73,
    "F5": 0x74, "F6": 0x75, "F7": 0x76, "F8": 0x77,
    "F9": 0x78, "F10": 0x79, "F11": 0x7A, "F12": 0x7B,
    "LEFT": 0x25, "RIGHT": 0x27, "UP": 0x26, "DOWN": 0x28,
    "VOLUME_MUTE": 0xAD, "VOLUME_DOWN": 0xAE, "VOLUME_UP": 0xAF,
    "MEDIA_NEXT_TRACK": 0xB0, "MEDIA_PREV_TRACK": 0xB1, "MEDIA_STOP": 0xB2,
    "MEDIA_PLAY_PAUSE": 0xB3,
}

_MOD_KEY_MAP = {
    "ctrl": 0x11, "alt": 0x12, "shift": 0x10,
}

def _resolve_key(value):
    if len(value) == 1:
        return ord(value.upper())
    return _KEY_MAP.get(value.upper(), 0)

def _send_key_down(vk):
    win32api.keybd_event(vk, 0, 0, 0)

def _send_key_up(vk):
    win32api.keybd_event(vk, 0, 2, 0)

def send_key(vk):
    _send_key_down(vk)
    _send_key_up(vk)


@socketio.on("button_press")
def handle_button_press(data):
    key_value = data.get("key", "")
    # Parse modifier prefix: e.g. "ctrl+shift+Z" or "alt+F4"
    parts = key_value.split("+")
    mods = []
    while parts and parts[0].lower() in _MOD_KEY_MAP:
        mods.append(_MOD_KEY_MAP[parts.pop(0).lower()])
    final_key = "+".join(parts)
    vk = _resolve_key(final_key)
    if vk:
        _debug(f"Sending key: {key_value} (VK=0x{vk:02X}, mods={[hex(m) for m in mods]})")
        # Press modifiers in order (Ctrl, Alt, Shift)
        for m in mods:
            _send_key_down(m)
        import time
        time.sleep(0.01)
        # Press and release main key
        send_key(vk)
        time.sleep(0.01)
        # Release modifiers in reverse order
        for m in reversed(mods):
            _send_key_up(m)
    else:
        _debug(f"Unknown key: {key_value}")


def _lan_ip():
    """Best-effort primary LAN address. A UDP 'connect' picks the outbound
    interface but sends no packets, so this works offline too."""
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        s.connect(("8.8.8.8", 80))
        return s.getsockname()[0]
    except OSError:
        return "127.0.0.1"
    finally:
        s.close()


def _open_browser():
    # Open on the LAN address (not localhost) so the "Share app" QR encodes a URL
    # a phone on the same network can actually reach.
    url = f"http://{_lan_ip()}:5000/PhoneButtons/?showQr=1"
    _debug(f"Opening browser: {url}")
    try:
        webbrowser.open(url)
    except Exception as e:
        _debug(f"Could not open browser: {e}")


if __name__ == "__main__":
    t = threading.Thread(target=_run_focus_hook, daemon=True)
    t.start()
    # Open a browser once the server is listening, showing the Share QR so it can
    # be scanned with a phone straight away.
    threading.Timer(1.5, _open_browser).start()
    socketio.run(app, host="0.0.0.0", port=5000, allow_unsafe_werkzeug=True)
