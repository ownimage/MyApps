import os
import io
import re
import json
import sys
import html
import time
import socket
import argparse
import datetime
import subprocess
import threading
import webbrowser
import ctypes
from ctypes import wintypes
from urllib.parse import quote

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

from mouser.engine import MouserEngine
from mouser.udp import MouserUdpReceiver

app = Flask(__name__)

# CORS -----------------------------------------------------------------------
# The app is normally served by THIS server (same origin), but it can also be
# served elsewhere (GitHub Pages, or via a Cloudflare tunnel) and pointed at this
# server through Settings -> Server — a DIFFERENT origin, so /api/* and the
# Socket.IO handshake need CORS. SECURITY: this server injects keystrokes, so
# cross-origin access is only safe on a trusted setup; restrict it with
# PB_CORS_ORIGINS (comma-separated origins, or a single origin) when needed.
_CORS_ORIGINS = os.environ.get("PB_CORS_ORIGINS", "*")
socketio = SocketIO(app, cors_allowed_origins=_CORS_ORIGINS)


@app.after_request
def _add_cors_headers(resp):
    resp.headers["Access-Control-Allow-Origin"] = _CORS_ORIGINS
    resp.headers["Access-Control-Allow-Headers"] = "Content-Type"
    resp.headers["Access-Control-Allow-Methods"] = "GET, POST, OPTIONS"
    return resp

# Paths ---------------------------------------------------------------------
# app.py lives in MyApps/remoteHID/server; the web app and the shared smd-*
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


def _get_app_layout(name):
    """The layout ({key, rows, cols, buttons}) assigned to an application, or
    None when the app has no layout (assigned via the Edit App wizard)."""
    try:
        with open(CONFIG_PATH, "r") as f:
            config = json.load(f)
    except (FileNotFoundError, json.JSONDecodeError):
        return None
    layout_key = config.get("app-layouts", {}).get(name)
    if not layout_key:
        return None
    layout = config.get("layouts", {}).get(layout_key)
    if not layout:
        return None
    return {
        "key": layout_key,
        "rows": layout.get("rows", 2),
        "cols": layout.get("cols", 3),
        "buttons": layout.get("buttons", []),
        "mouser": layout.get("mouser", {}),
    }


def _list_running_apps():
    """Running applications as {name, icon, background, layout}.
    `background` is True for processes with no visible window; `layout` is the
    layout key assigned to the app (or "")."""
    try:
        with open(CONFIG_PATH, "r") as f:
            app_layouts = json.load(f).get("app-layouts", {})
    except (FileNotFoundError, json.JSONDecodeError):
        app_layouts = {}

    visible = {}  # name -> (exe, hwnd)

    def _collect(hwnd, _lparam):
        try:
            if not win32gui.IsWindowVisible(hwnd):
                return True
            if not win32gui.GetWindowText(hwnd):
                return True
            _, pid = win32process.GetWindowThreadProcessId(hwnd)
            exe = psutil.Process(pid).exe()
        except Exception:
            return True
        name = _get_friendly_name(exe)
        if name and name not in visible:
            visible[name] = (exe, hwnd)
        return True

    try:
        win32gui.EnumWindows(_collect, 0)
    except Exception as e:
        _debug(f"EnumWindows error: {e}")

    apps = {}
    for name, (exe, hwnd) in visible.items():
        apps[name] = {
            "name": name,
            "icon": _cache_icon(exe, hwnd, name),
            "background": False,
            "layout": app_layouts.get(name, ""),
        }
    # Background apps: processes without a visible window.
    for proc in psutil.process_iter(["exe"]):
        try:
            exe = proc.info.get("exe")
            if not exe:
                continue
            name = _get_friendly_name(exe)
        except Exception:
            continue
        if not name or name in apps:
            continue
        apps[name] = {
            "name": name,
            "icon": _cache_icon(exe, None, name),
            "background": True,
            "layout": app_layouts.get(name, ""),
        }
    return sorted(apps.values(), key=lambda a: a["name"].lower())

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
            _current_app = {"name": name, "icon": icon_url, "template": template,
                            "layout": _get_app_layout(name)}
            _sync_mouser_profile()
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

# App names double as the cached-icon FILENAME, but they can contain path
# characters - e.g. "Intel(R) PROSet/Wireless Event Log Service", whose "/" made
# open() look for a subdirectory and raised FileNotFoundError (HTTP 500 on
# /api/apps). Map the characters Windows forbids in a filename to "_", keeping
# spaces/dots/parens so existing cache entries and their URLs are unchanged.
_ICON_NAME_BAD = re.compile(r'[<>:"/\\|?*\x00-\x1f]')


def _icon_filename(name):
    safe = _ICON_NAME_BAD.sub("_", str(name)).strip(" .")
    return f"{safe or 'icon'}.png"

CONFIG_PATH = os.path.join(SERVER_DIR, "config.json")

_current_app = {"name": "Unknown", "icon": "", "layout": None}

# Mouser is optional: the engine is created after the key-injection helpers
# below, and the UDP receiver only starts under __main__.
mouser_engine = None
_mouser_udp = None


def _mouser_global_config():
    """The top-level `mouser` block (enabled / udp_port / press limits)."""
    try:
        with open(CONFIG_PATH, "r") as f:
            config = json.load(f)
    except (FileNotFoundError, json.JSONDecodeError):
        config = {}
    return config.get("mouser") or {}


def _sync_mouser_profile():
    """Push the foreground layout's `mouser` block into the engine."""
    if mouser_engine is None:
        return
    settings = _mouser_global_config()
    mouser_engine.set_profile(
        _current_app.get("layout"),
        app_name=_current_app.get("name"),
        global_enabled=bool(settings.get("enabled", True)),
    )

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
    icon_path = os.path.join(ICON_DIR, _icon_filename(name))
    try:
        os.remove(icon_path)
        _debug(f"Removed cached icon: {_icon_filename(name)}")
    except FileNotFoundError:
        pass


_friendly_name_cache = {}


def _get_friendly_name(exe_path):
    name = _friendly_name_cache.get(exe_path)
    if name is not None:
        return name
    name = _friendly_name_uncached(exe_path)
    _friendly_name_cache[exe_path] = name
    return name


def _friendly_name_uncached(exe_path):
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
            hicon = win32gui.ExtractIcon(0, exe_path, 0)
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






def _cache_icon(exe_path, hwnd, name):
    icon_filename = _icon_filename(name)
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
    # The remote UI is the MyApps front end in remoteHID/PhoneButtons/, served from the
    # repo root by the catch-all route below.
    return redirect("/remoteHID/PhoneButtons/")


@app.route("/remoteHID/PhoneButtons/")
def phonebuttons_index():
    return send_from_directory(REPO_ROOT, "remoteHID/PhoneButtons/index.html")


@app.route("/app-icon-cache/<path:filename>")
def app_icon_cache(filename):
    return send_from_directory(ICON_DIR, filename)


@app.route("/phonebuttons-qr")
def phonebuttons_qr():
    """A big scannable QR for ?value=<url> — used by `--tunnel` / `--qr` to show the
    Cloudflare tunnel address on screen. Rendered with the SHARED vendored QR library,
    so there is no extra dependency. This explicit route is more specific than the
    `/<path:filename>` catch-all below and therefore wins."""
    value = (request.args.get("value") or "").strip()
    if not value:
        return ("Missing ?value=", 400)
    # JSON-encode for the JS string AND neutralise the HTML-significant characters:
    # this route is reachable through the tunnel, so a raw `</script>` in the value
    # would otherwise escape the script block (reflected XSS).
    js_value = (json.dumps(value)
                .replace("<", "\\u003c").replace(">", "\\u003e").replace("&", "\\u0026"))
    return (
        "<!DOCTYPE html><html><head><meta charset='utf-8'>"
        "<title>PhoneButtons QR</title>"
        "<meta name='viewport' content='width=device-width,initial-scale=1'>"
        "<style>body{font-family:system-ui,-apple-system,Segoe UI,sans-serif;background:#fff;"
        "color:#111;margin:0;min-height:100vh;display:flex;flex-direction:column;align-items:center;"
        "justify-content:center;gap:16px;text-align:center;padding:16px;box-sizing:border-box}"
        "#qr{padding:12px;background:#fff}code{font-size:15px;word-break:break-all;max-width:92vw}</style>"
        "</head><body><div id='qr'></div>"
        f"<code>{html.escape(value)}</code>"
        "<script src='/shared/vendor/qrcode.min.js'></script>"
        "<script>new QRCode(document.getElementById('qr'),{text:" + js_value +
        ",width:320,height:320,correctLevel:QRCode.CorrectLevel.M});</script>"
        "</body></html>"
    )


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
    app_layouts = config.get("app-layouts", {})
    result = [{
        "key": key,
        "displayName": value.get("displayName", key),
        "image": value.get("image", ""),
        "rows": value.get("rows", 2),
        "cols": value.get("cols", 3),
        "buttons": value.get("buttons", []),
        "mouser": value.get("mouser", {}),
        "usedBy": [app for app, layout_key in app_layouts.items() if layout_key == key],
    } for key, value in layouts.items()]
    return jsonify({"layouts": result})


@app.route("/api/apps")
def api_apps():
    """The running applications (for the Manage App page's app dropdown)."""
    return jsonify({"apps": _list_running_apps()})


@app.route("/api/app-icons")
def api_app_icons():
    """The cached application icons (PNGs extracted from foreground windows).
    The Manage Layout icon picker is populated from this list."""
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
    """Save a layout definition (display name + icon + grid dims)."""
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
    # Buttons are edited separately; MERGE here so saving the icon/grid
    # never drops them, and honour an explicit `buttons` list if one is sent.
    layout = config["layouts"].setdefault(key, {})
    layout["displayName"] = data.get("displayName") or key
    layout["image"] = data.get("image", "")
    layout.pop("orientation", None)   # orientation is no longer used
    layout["rows"] = min(12, max(1, int(data.get("rows") or layout.get("rows") or 2)))
    layout["cols"] = min(12, max(1, int(data.get("cols") or layout.get("cols") or 3)))
    if isinstance(data.get("buttons"), list):
        layout["buttons"] = data["buttons"]
    else:
        layout.setdefault("buttons", [])
    if isinstance(data.get("mouser"), dict):
        layout["mouser"] = data["mouser"]
    else:
        layout.setdefault("mouser", {})
    with open(CONFIG_PATH, "w", newline="\n") as f:
        json.dump(config, f, indent=2)
    _debug(f"Saved layout: {key}")
    # If the foreground app uses this layout, push the updated grid/buttons.
    global _current_app
    if (_current_app.get("layout") or {}).get("key") == key:
        _current_app = dict(_current_app, layout=_get_app_layout(_current_app.get("name")))
        _sync_mouser_profile()
        socketio.emit("app_change", _current_app)
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
        "image1": data.get("image1", ""),
        "image2": data.get("image2", ""),
        "key": data.get("key", ""),
        "press": data.get("press", "regular"),
    }
    with open(CONFIG_PATH, "w", newline="\n") as f:
        json.dump(config, f, indent=2)
    _debug(f"Saved layout button: {key}[{index}]")
    # If the foreground app uses this layout, push the updated buttons.
    global _current_app
    if (_current_app.get("layout") or {}).get("key") == key:
        _current_app = dict(_current_app, layout=_get_app_layout(_current_app.get("name")))
        socketio.emit("app_change", _current_app)
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
    # Only SET; never remove, so an unselected layout can't drop an assignment.
    if layout:
        config["app-layouts"][name] = layout
    with open(CONFIG_PATH, "w", newline="\n") as f:
        json.dump(config, f, indent=2)
    _debug(f"Saved app layout: {name} -> {layout}")
    # If the affected app is the foreground one, push its new layout.
    global _current_app
    if _current_app.get("name") == name:
        _current_app = dict(_current_app, layout=_get_app_layout(name))
        _sync_mouser_profile()
        socketio.emit("app_change", _current_app)
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
    "F13": 0x7C, "F14": 0x7D, "F15": 0x7E, "F16": 0x7F,
    "F17": 0x80, "F18": 0x81, "F19": 0x82, "F20": 0x83,
    "F21": 0x84, "F22": 0x85, "F23": 0x86, "F24": 0x87,
    "LEFT": 0x25, "RIGHT": 0x27, "UP": 0x26, "DOWN": 0x28,
    "VOLUME_MUTE": 0xAD, "VOLUME_DOWN": 0xAE, "VOLUME_UP": 0xAF,
    "MEDIA_NEXT_TRACK": 0xB0, "MEDIA_PREV_TRACK": 0xB1, "MEDIA_STOP": 0xB2,
    "MEDIA_PLAY_PAUSE": 0xB3,
}

_MOD_KEY_MAP = {
    "ctrl": 0x11, "alt": 0x12, "shift": 0x10,
}

# Character -> virtual-key must use the ACTIVE keyboard layout (VkKeyScanW).
# ord() is NOT the VK for punctuation: ord("[") == 0x5B == VK_LWIN and
# ord("]") == 0x5D == VK_APPS, so brackets were sent as the Windows / context
# menu keys (same class of bug for ; ' , . / \ ` - = ...). VkKeyScan also
# reports whether the character needs SHIFT, which we fold into the modifiers.
_user32 = None
try:
    _user32 = ctypes.windll.user32
    _user32.VkKeyScanW.argtypes = [ctypes.c_wchar]
    _user32.VkKeyScanW.restype = ctypes.c_short
except Exception:
    _user32 = None


def _char_vk(ch):
    """(virtual-key, needs_shift) for one character on the active layout."""
    if not _user32:
        return 0, False
    try:
        res = _user32.VkKeyScanW(ch)
    except Exception:
        return 0, False
    if res == -1:
        return 0, False
    return res & 0xFF, bool(res & 0x100)


def _resolve_key(value):
    """(virtual-key, needs_shift) for a single character or a named key."""
    if value is None:
        return 0, False
    v = str(value)
    if len(v) == 1:
        return _char_vk(v)
    return _KEY_MAP.get(v.upper(), 0), False


def _parse_key_string(key_value):
    """Split "ctrl+shift+X" -> (list of modifier VKs in order, main VK or 0).
    A modifiers-only string (e.g. "ctrl+shift") yields main VK 0. A character
    that needs SHIFT on the active layout (e.g. "{") adds SHIFT to the mods."""
    parts = str(key_value or "").split("+")
    mods = []
    while parts and parts[0].lower() in _MOD_KEY_MAP:
        mods.append(_MOD_KEY_MAP[parts.pop(0).lower()])
    final = "+".join(parts)
    vk = 0
    if final:
        vk, needs_shift = _resolve_key(final)
        if needs_shift and _MOD_KEY_MAP["shift"] not in mods:
            mods.append(_MOD_KEY_MAP["shift"])
    return mods, vk

def _send_key_down(vk):
    win32api.keybd_event(vk, 0, 0, 0)

def _send_key_up(vk):
    win32api.keybd_event(vk, 0, 2, 0)

def send_key(vk):
    _send_key_down(vk)
    _send_key_up(vk)


def _send_key_string_fast(key_value):
    """Parse + press one key string with NO sleeps. The ratchet can emit several
    presses per frame, so the 10 ms sleeps in `button_press` would add up."""
    mods, vk = _parse_key_string(key_value)
    if not vk:
        return False
    for m in mods:
        _send_key_down(m)
    _send_key_down(vk)
    _send_key_up(vk)
    for m in reversed(mods):
        _send_key_up(m)
    return True


_mouser_settings = _mouser_global_config()
mouser_engine = MouserEngine(
    press_key=_send_key_string_fast,
    max_presses_per_frame=int(_mouser_settings.get("max_presses_per_frame", 3)),
    min_press_interval_ms=float(_mouser_settings.get("min_press_interval_ms", 10)),
)
_mouser_udp = MouserUdpReceiver(
    mouser_engine,
    "0.0.0.0",
    int(_mouser_settings.get("udp_port", 7801)),
)


def _mouser_state_loop():
    """Push a small telemetry snapshot to the browser at 10 Hz."""
    while True:
        time.sleep(0.1)
        try:
            socketio.emit("mouser_state", mouser_engine.snapshot())
        except Exception:
            pass


@socketio.on("button_press")
def handle_button_press(data):
    key_value = data.get("key", "")
    # Parse "ctrl+shift+Z" / "alt+F4" (or a bare character like "[").
    mods, vk = _parse_key_string(key_value)
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


# Press-and-hold: the phone sends key_down while a button is held and key_up on
# release, so modifiers (and/or a main key) stay down while the user uses the
# PC's mouse. A modifiers-only string (e.g. "ctrl+shift") has no main key.
@socketio.on("key_down")
def handle_key_down(data):
    key_value = data.get("key", "") if isinstance(data, dict) else ""
    mods, vk = _parse_key_string(key_value)
    _debug(f"key_down: '{key_value}' (vk=0x{vk:02X}, mods={[hex(m) for m in mods]})")
    for m in mods:
        _send_key_down(m)
    if vk:
        _send_key_down(vk)


@socketio.on("key_up")
def handle_key_up(data):
    key_value = data.get("key", "") if isinstance(data, dict) else ""
    mods, vk = _parse_key_string(key_value)
    _debug(f"key_up: '{key_value}' (vk=0x{vk:02X}, mods={[hex(m) for m in mods]})")
    if vk:
        _send_key_up(vk)
    for m in reversed(mods):
        _send_key_up(m)


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
    url = f"http://{_lan_ip()}:5000/remoteHID/PhoneButtons/?showQr=1"
    _debug(f"Opening browser: {url}")
    try:
        webbrowser.open(url)
    except Exception as e:
        _debug(f"Could not open browser: {e}")


# ---- Cloudflare quick tunnel + QR -------------------------------------------
# `--tunnel` publishes this server through a Cloudflare QUICK TUNNEL (a random
# https://<name>.trycloudflare.com URL carrying a REAL, trusted certificate — so
# the phone needs no cert install), parses that URL out of cloudflared's output and
# shows it as a QR code to scan. Needs `cloudflared` on PATH or PB_CLOUDFLARED set;
# `--qr <url>` just shows a QR for an address you already have (e.g. your own NAMED
# tunnel).
#
# SECURITY: a quick tunnel is on the PUBLIC internet — anyone with the (random) URL
# can drive this machine's keyboard. Keep PB_CORS_ORIGINS tight and stop the tunnel
# when you are done.

_QR_ENABLED = True  # mirrors --no-qr, read by the background tunnel thread


def _find_cloudflared():
    env = os.environ.get("PB_CLOUDFLARED")
    if env and os.path.exists(env):
        return env
    from shutil import which
    found = which("cloudflared")
    if found:
        return found
    for cand in (
        os.path.join(os.environ.get("ProgramFiles", r"C:\Program Files"), "cloudflared", "cloudflared.exe"),
        os.path.join(os.environ.get("LOCALAPPDATA", ""), "cloudflared", "cloudflared.exe"),
        os.path.join(os.environ.get("USERPROFILE", ""), "cloudflared.exe"),
    ):
        if cand and os.path.exists(cand):
            return cand
    return None


def _show_qr(value):
    if not _QR_ENABLED or not value:
        return
    page = "http://127.0.0.1:5000/phonebuttons-qr?value=" + quote(str(value), safe="")
    _debug(f"Opening QR page: {page}")
    try:
        webbrowser.open(page)
    except Exception as e:
        _debug(f"Could not open the QR page: {e}")


def _start_tunnel():
    """Start cloudflared, echo its output, and return the trycloudflare URL."""
    exe = _find_cloudflared()
    if not exe:
        print("cloudflared not found - install it (winget install cloudflare.cloudflared),")
        print("set PB_CLOUDFLARED to its full path, or pass --qr <url> for an address you have.")
        return None
    print(f"Starting Cloudflare quick tunnel ({exe}) ...")
    try:
        proc = subprocess.Popen(
            [exe, "tunnel", "--url", "http://127.0.0.1:5000"],
            stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
            text=True, bufsize=1, encoding="utf-8", errors="replace",
        )
    except Exception as e:
        print(f"Could not start cloudflared: {e}")
        return None
    deadline = time.time() + 60
    while time.time() < deadline:
        line = proc.stdout.readline()
        if not line:
            if proc.poll() is not None:
                print("cloudflared exited before it reported a URL.")
                return None
            continue
        print("[cloudflared] " + line.rstrip())
        m = re.search(r"https://[a-z0-9][a-z0-9-]*\.trycloudflare\.com", line)
        if m:
            return m.group(0)
    print("Timed out waiting for cloudflared to report a URL.")
    return None


def _tunnel_and_qr():
    url = _start_tunnel()
    if not url:
        return
    host = url.split("://", 1)[1]
    print("=" * 62)
    print(f"  Cloudflare tunnel : {url}")
    print(f"  In PhoneButtons, Settings -> Server enter:")
    print(f"      https [x]   Server address: {host}   Port: (leave EMPTY)")
    print("=" * 62)
    _show_qr(url)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="PhoneButtons server")
    parser.add_argument(
        "--no-qr",
        action="store_true",
        help="Do not open a browser page on startup (the Share QR / tunnel QR)",
    )
    parser.add_argument(
        "--tunnel",
        action="store_true",
        help="Start a Cloudflare quick tunnel, print its https URL and show it as a QR code",
    )
    parser.add_argument(
        "--no-tunnel",
        action="store_true",
        help="Do NOT start a Cloudflare tunnel (overrides --tunnel; the launcher passes --tunnel by default)",
    )
    parser.add_argument(
        "--qr",
        metavar="URL",
        help="Show a QR code for URL (e.g. a named tunnel you started yourself) and skip the tunnel",
    )
    args = parser.parse_args()

    _QR_ENABLED = not args.no_qr

    t = threading.Thread(target=_run_focus_hook, daemon=True)
    t.start()
    # Prime the foreground state so Mouser has a profile before the first alt-tab.
    try:
        _on_foreground_change(0, 0, win32gui.GetForegroundWindow(), 0, 0, 0, 0)
    except Exception as e:
        _debug(f"Initial foreground read failed: {e}")
    try:
        _mouser_udp.start()
        print(f"Mouser UDP listening on udp/{_mouser_udp.port}")
    except OSError as e:
        print(f"Mouser UDP disabled: {e}")
    threading.Thread(target=_mouser_state_loop, daemon=True).start()
    # Open a browser once the server is listening, showing the Share QR so it can
    # be scanned with a phone straight away (skip with --no-qr).
    if args.tunnel and not args.no_tunnel:
        # The tunnel QR is the useful page then; skip the local Share-QR page.
        threading.Timer(2.0, _tunnel_and_qr).start()
    elif args.qr:
        threading.Timer(1.5, lambda: _show_qr(args.qr)).start()
    elif not args.no_qr:
        threading.Timer(1.5, _open_browser).start()
    socketio.run(app, host="0.0.0.0", port=5000, allow_unsafe_werkzeug=True)
