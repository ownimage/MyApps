"""Unit tests for the PhoneButtons server (app.py).

The server is the only part of the repo that is Python, so it is covered by
pytest rather than Playwright (tests/phonebuttons-server.spec.js runs this file
as part of the JS suite). Flask's test client drives the HTTP routes and
flask_socketio's test client drives the socket events; the Windows-specific
parts (icon extraction, the foreground hook, real keystroke injection) are
MOCKED - the tests must never press keys or touch the user's real config.json.

Run from the repo root:

    py -3.13 -m pytest remoteHID/server/test_app.py -q
    py -3.13 -m pytest remoteHID/server/test_app.py --cov=app --cov-report=term-missing
"""

import json
import os
import shutil
import sys

import pytest

import app as server


# --------------------------------------------------------------------------- #
# Fixtures
# --------------------------------------------------------------------------- #

CONFIG = {
    "layouts": {
        "powerpoint": {
            "displayName": "PowerPoint",
            "image": "Microsoft PowerPoint.png",
            "rows": 4,
            "cols": 2,
            "buttons": [
                {"name": "Prev slide", "image1": "bi:skip-backward-fill", "image2": "", "key": "left"},
                {"name": "Next slide", "image1": "bi:skip-forward-fill", "image2": "", "key": "right"},
            ],
        },
        "photoshop": {
            "displayName": "Photoshop",
            "rows": 2,
            "cols": 3,
            "buttons": [],
        },
    },
    "app-layouts": {"Microsoft PowerPoint": "powerpoint"},
    "applications": {"Microsoft PowerPoint": "powerpoint"},
    "templates": {"powerpoint": {"rows": 4, "cols": 2, "buttons": [{"key": "left"}]}},
    "app-icon": {"Notepad": "GCL_HICON"},
}


@pytest.fixture(autouse=True)
def isolated(tmp_path, monkeypatch):
    """Redirect every writable path away from the repo and reset module state."""
    icon_dir = tmp_path / "app-icon-cache"
    icon_dir.mkdir()
    monkeypatch.setattr(server, "CONFIG_PATH", str(tmp_path / "config.json"))
    monkeypatch.setattr(server, "ICON_DIR", str(icon_dir))
    monkeypatch.setattr(server, "DEBUG", False)
    monkeypatch.setattr(server, "_app_icon_prefs", {}, raising=False)
    monkeypatch.setattr(server, "_friendly_name_cache", {}, raising=False)
    monkeypatch.setattr(
        server, "_current_app",
        {"name": "Unknown", "icon": "", "layout": None}, raising=False,
    )
    return tmp_path


def write_config(path, data=None):
    with open(path, "w", encoding="utf-8") as fh:
        json.dump(CONFIG if data is None else data, fh)
    return path


def read_config(path):
    with open(path, "r", encoding="utf-8") as fh:
        return json.load(fh)


@pytest.fixture
def config_file():
    write_config(server.CONFIG_PATH)
    return server.CONFIG_PATH


@pytest.fixture
def client():
    return server.app.test_client()


@pytest.fixture
def sock():
    client = server.socketio.test_client(server.app)
    yield client
    client.disconnect()


@pytest.fixture
def keys(monkeypatch):
    """Record every key send instead of injecting real keystrokes."""
    calls = []
    monkeypatch.setattr(server, "_send_key_down", lambda vk: calls.append(("down", vk)))
    monkeypatch.setattr(server, "_send_key_up", lambda vk: calls.append(("up", vk)))
    monkeypatch.setattr(
        server, "send_key",
        lambda vk: calls.extend([("down", vk), ("up", vk)]),
    )
    return calls


# --------------------------------------------------------------------------- #
# _icon_filename — app names become cache FILENAMES
# --------------------------------------------------------------------------- #

class TestIconFilename:
    def test_keeps_spaces_dots_and_parens(self):
        # App names arrive WITHOUT an extension (they come from the exe's
        # FileDescription), and ".png" is appended for the cache file.
        assert server._icon_filename("Windows Terminal Host") == "Windows Terminal Host.png"
        assert server._icon_filename("Adobe Photoshop 2026") == "Adobe Photoshop 2026.png"
        assert server._icon_filename("Intel(R) PROSet") == "Intel(R) PROSet.png"
        assert server._icon_filename("Node.js JavaScript Runtime") == "Node.js JavaScript Runtime.png"

    def test_replaces_windows_illegal_characters(self):
        # The reported bug: a "/" in the app name made open() look for a
        # subdirectory and raised FileNotFoundError -> HTTP 500 on /api/apps.
        assert server._icon_filename("Intel(R) PROSet/Wireless Event Log Service") == \
            "Intel(R) PROSet_Wireless Event Log Service.png"
        assert server._icon_filename('a<b>c:d"e\\f|g?h*i') == "a_b_c_d_e_f_g_h_i.png"

    def test_strips_trailing_dots_and_spaces_and_controls(self):
        assert server._icon_filename("Name...  ") == "Name.png"
        assert server._icon_filename("a\x00b\x1fc") == "a_b_c.png"

    def test_falls_back_when_nothing_is_left(self):
        assert server._icon_filename("...") == "icon.png"
        assert server._icon_filename("") == "icon.png"
        assert server._icon_filename(None) == "None.png"


# --------------------------------------------------------------------------- #
# Config helpers
# --------------------------------------------------------------------------- #

class TestConfigHelpers:
    def test_load_config_reads_app_icon_prefs(self):
        write_config(server.CONFIG_PATH)
        assert server._load_config() == {"Notepad": "GCL_HICON"}
        assert server._app_icon_prefs == {"Notepad": "GCL_HICON"}

    def test_load_config_missing_or_broken_file_is_empty(self):
        assert server._load_config() == {}                     # file does not exist
        with open(server.CONFIG_PATH, "w", encoding="utf-8") as fh:
            fh.write("{not json")
        assert server._load_config() == {}

    def test_save_config_merges_prefs_and_keeps_other_keys(self):
        write_config(server.CONFIG_PATH)
        server._app_icon_prefs = {"Notepad": "WM_GETICON BIG", "Chrome": "ExtractIcon(0)"}
        server._save_config()
        saved = read_config(server.CONFIG_PATH)
        assert saved["app-icon"] == {"Notepad": "WM_GETICON BIG", "Chrome": "ExtractIcon(0)"}
        assert "layouts" in saved and "app-layouts" in saved

    def test_save_config_creates_file_when_absent(self):
        server._app_icon_prefs = {"A": "B"}
        server._save_config()
        assert read_config(server.CONFIG_PATH)["app-icon"] == {"A": "B"}

    def test_get_app_template(self, config_file):
        assert server._get_app_template("Microsoft PowerPoint") == \
            {"rows": 4, "cols": 2, "buttons": [{"key": "left"}]}
        assert server._get_app_template("Unknown App") is None

    def test_get_app_template_without_config_file(self):
        assert server._get_app_template("Microsoft PowerPoint") is None

    def test_get_app_layout(self, config_file):
        assert server._get_app_layout("Microsoft PowerPoint") == {
            "key": "powerpoint",
            "rows": 4,
            "cols": 2,
            "buttons": [{"name": "Prev slide", "image1": "bi:skip-backward-fill",
                         "image2": "", "key": "left"},
                        {"name": "Next slide", "image1": "bi:skip-forward-fill",
                         "image2": "", "key": "right"}],
            "mouser": {},
        }

    def test_get_app_layout_defaults_and_missing(self, config_file):
        data = read_config(config_file)
        data["app-layouts"]["Photoshop"] = "photoshop"
        write_config(config_file, data)
        assert server._get_app_layout("Photoshop") == \
            {"key": "photoshop", "rows": 2, "cols": 3, "buttons": [], "mouser": {}}
        assert server._get_app_layout("Not Mapped") is None
        assert server._get_app_layout("Microsoft PowerPoint") is not None

    def test_set_app_icon_pref_persists_and_drops_the_cached_icon(self):
        write_config(server.CONFIG_PATH)
        cached = os.path.join(server.ICON_DIR, "Notepad.png")
        with open(cached, "wb") as fh:
            fh.write(b"png")
        server._set_app_icon_pref("Notepad", "SHGetFileInfoW")
        assert read_config(server.CONFIG_PATH)["app-icon"]["Notepad"] == "SHGetFileInfoW"
        assert not os.path.exists(cached)

    def test_set_app_icon_pref_without_a_cached_icon_is_quiet(self):
        write_config(server.CONFIG_PATH)
        server._set_app_icon_pref("Notepad", "GCL_HICON")       # no file to remove
        assert server._app_icon_prefs["Notepad"] == "GCL_HICON"


# --------------------------------------------------------------------------- #
# Friendly names / foreground window
# --------------------------------------------------------------------------- #

class TestFriendlyName:
    def test_falls_back_to_the_exe_basename(self):
        # A path that cannot be resolved reports no version info, so the exe's
        # own basename (minus the extension) is used. Full paths, because a BARE
        # name is resolved through PATH by the Win32 version APIs.
        assert server._friendly_name_uncached(r"C:\nope\mystery.exe") == "mystery"
        assert server._friendly_name_uncached(r"C:\nope\UPPER.EXE") == "UPPER"
        assert server._friendly_name_uncached(r"C:\nope\no-extension") == "no-extension"

    def test_get_friendly_name_caches_per_path(self, monkeypatch):
        calls = []

        def fake(path):
            calls.append(path)
            return "Name for " + path

        monkeypatch.setattr(server, "_friendly_name_uncached", fake)
        assert server._get_friendly_name("a.exe") == "Name for a.exe"
        assert server._get_friendly_name("a.exe") == "Name for a.exe"
        assert calls == ["a.exe"]

    def test_get_foreground_info(self, monkeypatch):
        monkeypatch.setattr(server.win32gui, "GetForegroundWindow", lambda: 4242)
        monkeypatch.setattr(server.win32gui, "GetWindowText", lambda hwnd: "Untitled - Notepad")
        monkeypatch.setattr(server.win32process, "GetWindowThreadProcessId", lambda hwnd: (1, 77))
        monkeypatch.setattr(server.psutil, "Process", lambda pid: type("P", (), {"exe": lambda self: r"C:\Windows\notepad.exe"})())
        monkeypatch.setattr(server, "_friendly_name_uncached", lambda path: "Notepad")
        assert server._get_foreground_info() == {
            "title": "Untitled - Notepad", "name": "Notepad",
            "exe": r"C:\Windows\notepad.exe", "hwnd": 4242,
        }

    def test_get_foreground_info_without_a_title(self, monkeypatch):
        monkeypatch.setattr(server.win32gui, "GetForegroundWindow", lambda: 1)
        monkeypatch.setattr(server.win32gui, "GetWindowText", lambda hwnd: "")
        assert server._get_foreground_info() is None

    def test_get_foreground_info_survives_a_dead_process(self, monkeypatch):
        monkeypatch.setattr(server.win32gui, "GetForegroundWindow", lambda: 1)
        monkeypatch.setattr(server.win32gui, "GetWindowText", lambda hwnd: "x")
        monkeypatch.setattr(server.win32process, "GetWindowThreadProcessId", lambda hwnd: (1, 2))

        def boom(pid):
            raise server.psutil.NoSuchProcess(pid)

        monkeypatch.setattr(server.psutil, "Process", boom)
        assert server._get_foreground_info() is None


# --------------------------------------------------------------------------- #
# Key parsing (the punctuation / VK regression)
# --------------------------------------------------------------------------- #

class TestKeyParsing:
    def test_named_keys_are_case_insensitive(self):
        assert server._resolve_key("ENTER") == (0x0D, False)
        assert server._resolve_key("enter") == (0x0D, False)
        assert server._resolve_key("F4") == (0x73, False)
        assert server._resolve_key("f13") == (0x7C, False)
        assert server._resolve_key("F24") == (0x87, False)
        assert server._resolve_key("MEDIA_NEXT_TRACK") == (0xB0, False)
        assert server._resolve_key("NOT_A_KEY") == (0, False)
        assert server._resolve_key(None) == (0, False)

    def test_characters_use_vkkeyscan_not_ord(self):
        # ord("[") == 0x5B == VK_LWIN and ord("]") == 0x5D == VK_APPS: the old
        # implementation sent the Windows/context-menu keys for the brackets.
        vk_open, _ = server._char_vk("[")
        vk_close, _ = server._char_vk("]")
        assert vk_open not in (0, 0x5B)
        assert vk_close not in (0, 0x5D)
        assert server._char_vk("a")[0] == 0x41

    def test_shifted_character_reports_shift(self):
        vk, needs_shift = server._char_vk("{")
        assert vk != 0 and needs_shift is True

    def test_unknown_character(self):
        assert server._char_vk("\u2603") == (0, False)

    def test_parse_plain_character(self):
        assert server._parse_key_string("x") == ([], 0x58)

    def test_parse_modifier_combinations(self):
        assert server._parse_key_string("ctrl+c") == ([0x11], 0x43)
        assert server._parse_key_string("ctrl+shift+X") == ([0x11, 0x10], 0x58)
        assert server._parse_key_string("alt+F4") == ([0x12], 0x73)

    def test_parse_modifiers_only(self):
        assert server._parse_key_string("ctrl+shift") == ([0x11, 0x10], 0)
        assert server._parse_key_string("") == ([], 0)
        assert server._parse_key_string(None) == ([], 0)

    def test_parse_folds_the_layouts_shift_into_the_modifiers(self):
        mods, vk = server._parse_key_string("{")
        assert vk != 0 and mods == [0x10]
        # an explicit shift is not duplicated
        mods, _ = server._parse_key_string("shift+{")
        assert mods == [0x10]


class TestFastKeyPath:
    """The Mouser ratchet calls this once per press; it must not use the 10 ms
    sleeps in `button_press` and must still wrap modifiers correctly."""

    def test_presses_and_releases_one_key(self, keys):
        assert server._send_key_string_fast("F13") is True
        assert keys == [("down", 0x7C), ("up", 0x7C)]

    def test_modifiers_wrap_the_main_key(self, keys):
        assert server._send_key_string_fast("ctrl+shift+f24") is True
        assert keys == [
            ("down", 0x11), ("down", 0x10), ("down", 0x87),
            ("up", 0x87), ("up", 0x10), ("up", 0x11),
        ]

    def test_an_unknown_key_sends_nothing(self, keys):
        assert server._send_key_string_fast("NOT_A_KEY") is False
        assert keys == []


# --------------------------------------------------------------------------- #
# HTTP routes
# --------------------------------------------------------------------------- #

class TestHttpRoutes:
    def test_root_redirects_to_the_app(self, client):
        resp = client.get("/")
        assert resp.status_code == 302
        assert resp.headers["Location"].endswith("/remoteHID/PhoneButtons/")

    def test_index_serves_the_app_shell(self, client):
        resp = client.get("/remoteHID/PhoneButtons/")
        assert resp.status_code == 200
        assert b'id="smd-app"' in resp.data

    def test_repo_static_serves_shared_assets(self, client):
        resp = client.get("/shared/css/styles.css")
        assert resp.status_code == 200
        assert b"smd" in resp.data

    def test_repo_static_traversal_is_refused(self, client):
        # Werkzeug may 404, 400 or redirect away a traversal path; what matters
        # is that a file OUTSIDE the repo root is never served. (A path that stays
        # INSIDE the root, e.g. /shared/../AGENTS.md, is legitimately served.)
        for path in ("/%2e%2e/AGENTS.md", "/..%2f..%2fAGENTS.md", "/%2e%2e/%2e%2e/AGENTS.md"):
            resp = client.get(path)
            assert resp.status_code in (301, 302, 308, 400, 404), path
            assert b"Session log" not in resp.data, path

    def test_icon_cache_serves_cached_pngs(self, client):
        with open(os.path.join(server.ICON_DIR, "Notepad.png"), "wb") as fh:
            fh.write(b"\x89PNG\r\n\x1a\n")
        resp = client.get("/app-icon-cache/Notepad.png")
        assert resp.status_code == 200
        assert resp.data.startswith(b"\x89PNG")
        assert client.get("/app-icon-cache/Missing.png").status_code == 404

    def test_icon_cache_traversal_is_refused(self, client):
        write_config(server.CONFIG_PATH)
        for path in ("/app-icon-cache/%2e%2e%2fconfig.json", "/app-icon-cache/..%2fconfig.json"):
            resp = client.get(path)
            assert resp.status_code in (301, 302, 308, 400, 404), path
            assert b"layouts" not in resp.data, path

    def test_cors_headers_are_added_to_every_response(self, client):
        for path in ("/remoteHID/PhoneButtons/", "/api/layouts"):
            resp = client.get(path)
            assert resp.headers["Access-Control-Allow-Origin"] == "*"
            assert "Content-Type" in resp.headers["Access-Control-Allow-Headers"]
            assert resp.headers["Access-Control-Allow-Methods"] == "GET, POST, OPTIONS"


class TestQrRoute:
    def test_missing_value_is_a_400(self, client):
        resp = client.get("/phonebuttons-qr")
        assert resp.status_code == 400
        assert b"Missing" in resp.data
        assert client.get("/phonebuttons-qr?value=%20").status_code == 400

    def test_renders_the_shared_qr_library_and_the_value(self, client):
        url = "https://brave-lion-1234.trycloudflare.com"
        resp = client.get("/phonebuttons-qr", query_string={"value": url})
        text = resp.get_data(as_text=True)
        assert resp.status_code == 200
        assert resp.headers["Content-Type"].startswith("text/html")
        assert "/shared/vendor/qrcode.min.js" in text
        assert f'"{url}"' in text
        assert text.count("<script") == 2 and text.count("</script>") == 2

    def test_hostile_value_cannot_break_out_of_the_script_block(self, client):
        payload = 'https://x.trycloudflare.com/</script><img src=x onerror=alert(1)>?a=1&b=2'
        text = client.get("/phonebuttons-qr", query_string={"value": payload}).get_data(as_text=True)
        # exactly the two real script tags survive - the payload's closer is escaped
        assert text.count("<script") == 2 and text.count("</script>") == 2
        assert "\\u003c/script\\u003e" in text
        assert "\\u0026b=2" in text
        # the human-visible <code> line is HTML-escaped
        assert "&lt;/script&gt;&lt;img src=x" in text
        assert "<img src=x" not in text


class TestApiRoutes:
    def test_api_layouts_catalog(self, client, config_file):
        payload = client.get("/api/layouts").get_json()
        assert [layout["key"] for layout in payload["layouts"]] == ["powerpoint", "photoshop"]
        powerpoint = payload["layouts"][0]
        assert powerpoint["displayName"] == "PowerPoint"
        assert powerpoint["image"] == "Microsoft PowerPoint.png"
        assert powerpoint["rows"] == 4 and powerpoint["cols"] == 2
        assert len(powerpoint["buttons"]) == 2
        assert powerpoint["mouser"] == {}
        assert powerpoint["usedBy"] == ["Microsoft PowerPoint"]
        assert payload["layouts"][1] == {
            "key": "photoshop", "displayName": "Photoshop", "image": "",
            "rows": 2, "cols": 3, "buttons": [], "mouser": {}, "usedBy": [],
        }

    def test_api_layouts_without_a_config(self, client):
        assert client.get("/api/layouts").get_json() == {"layouts": []}

    def test_api_apps_returns_the_running_apps(self, client, monkeypatch):
        fake = [{"name": "Notepad", "icon": "/app-icon-cache/Notepad.png",
                 "background": False, "layout": "powerpoint"}]
        monkeypatch.setattr(server, "_list_running_apps", lambda: fake)
        assert client.get("/api/apps").get_json() == {"apps": fake}

    def test_api_app_icons_lists_only_pngs(self, client):
        for name in ("Notepad.png", "Chrome.png", "notes.txt"):
            with open(os.path.join(server.ICON_DIR, name), "wb") as fh:
                fh.write(b"x")
        assert client.get("/api/app-icons").get_json() == {"icons": ["Chrome.png", "Notepad.png"]}

    def test_api_app_icons_without_the_cache_dir(self, client, monkeypatch):
        monkeypatch.setattr(server, "ICON_DIR", os.path.join(server.ICON_DIR, "gone"))
        assert client.get("/api/app-icons").get_json() == {"icons": []}


class TestSaveLayout:
    def post(self, client, payload):
        return client.post("/api/save-layout", json=payload)

    def test_missing_key_is_a_400(self, client):
        assert self.post(client, {}).status_code == 400
        assert self.post(client, {"key": "   "}).status_code == 400

    def test_creates_a_layout_and_defaults_the_display_name(self, client):
        resp = self.post(client, {"key": "mine", "rows": 3, "cols": 4})
        assert resp.get_json() == {"ok": True}
        layout = read_config(server.CONFIG_PATH)["layouts"]["mine"]
        assert layout == {"displayName": "mine", "image": "", "rows": 3, "cols": 4,
                          "buttons": [], "mouser": {}}

    def test_merges_into_an_existing_layout_and_keeps_its_buttons(self, client, config_file):
        self.post(client, {"key": "powerpoint", "displayName": "PPT", "image": "x.png", "rows": 6, "cols": 1})
        layout = read_config(server.CONFIG_PATH)["layouts"]["powerpoint"]
        assert layout["displayName"] == "PPT" and layout["image"] == "x.png"
        assert layout["rows"] == 6 and layout["cols"] == 1
        assert len(layout["buttons"]) == 2          # not dropped

    def test_an_explicit_buttons_list_replaces_the_stored_one(self, client, config_file):
        self.post(client, {"key": "powerpoint", "buttons": [{"key": "a"}]})
        assert read_config(server.CONFIG_PATH)["layouts"]["powerpoint"]["buttons"] == [{"key": "a"}]

    def test_saves_the_mouser_block_and_keeps_it_when_omitted(self, client, config_file):
        block = {"enabled": True, "axes": {"rx": {"positive": "F13", "negative": "F14",
                                                    "gain": 0.05, "step": 5, "deadband": 0}}}
        self.post(client, {"key": "powerpoint", "mouser": block})
        assert read_config(server.CONFIG_PATH)["layouts"]["powerpoint"]["mouser"] == block

        # A later save from a screen that does not send `mouser` must not drop it.
        self.post(client, {"key": "powerpoint", "rows": 6})
        assert read_config(server.CONFIG_PATH)["layouts"]["powerpoint"]["mouser"] == block

    def test_rows_and_cols_are_clamped_to_1_12(self, client):
        # 99 clamps down to 12; a negative value clamps up to 1; an explicit 0
        # means "unset" and falls back to the stored value (else the default 3).
        self.post(client, {"key": "a", "rows": 99, "cols": -5})
        assert read_config(server.CONFIG_PATH)["layouts"]["a"]["rows"] == 12
        assert read_config(server.CONFIG_PATH)["layouts"]["a"]["cols"] == 1

    def test_zero_rows_or_cols_fall_back_to_the_default(self, client):
        self.post(client, {"key": "a", "rows": 0, "cols": 0})
        assert read_config(server.CONFIG_PATH)["layouts"]["a"]["rows"] == 2
        assert read_config(server.CONFIG_PATH)["layouts"]["a"]["cols"] == 3

    def test_zero_rows_or_cols_keep_the_stored_value(self, client, config_file):
        self.post(client, {"key": "powerpoint", "rows": 0, "cols": 0})
        layout = read_config(config_file)["layouts"]["powerpoint"]
        assert layout["rows"] == 4 and layout["cols"] == 2

    def test_the_retired_orientation_field_is_removed(self, client, config_file):
        data = read_config(config_file)
        data["layouts"]["photoshop"]["orientation"] = "landscape"
        write_config(config_file, data)
        self.post(client, {"key": "photoshop"})
        assert "orientation" not in read_config(config_file)["layouts"]["photoshop"]

    def test_pushes_app_change_when_the_foreground_app_uses_the_layout(self, client, config_file, monkeypatch):
        emitted = []
        monkeypatch.setattr(server.socketio, "emit", lambda *a, **k: emitted.append((a, k)))
        server._current_app = {"name": "Microsoft PowerPoint", "icon": "", "layout": {"key": "powerpoint"}}
        self.post(client, {"key": "powerpoint", "rows": 5})
        assert len(emitted) == 1
        event, payload = emitted[0][0][0], emitted[0][0][1]
        assert event == "app_change"
        assert payload["layout"]["rows"] == 5

    def test_no_push_for_an_unrelated_layout(self, client, config_file, monkeypatch):
        emitted = []
        monkeypatch.setattr(server.socketio, "emit", lambda *a, **k: emitted.append((a, k)))
        server._current_app = {"name": "Chrome", "icon": "", "layout": {"key": "powerpoint"}}
        self.post(client, {"key": "photoshop"})
        assert emitted == []


class TestSaveLayoutButton:
    def post(self, client, payload):
        return client.post("/api/save-layout-button", json=payload)

    def test_validation(self, client):
        assert self.post(client, {}).status_code == 400
        assert self.post(client, {"layout": "a"}).status_code == 400
        assert self.post(client, {"layout": "a", "index": -1}).status_code == 400

    def test_unknown_layout_is_404(self, client, config_file):
        assert self.post(client, {"layout": "nope", "index": 0}).status_code == 404

    def test_saves_one_button(self, client, config_file):
        resp = self.post(client, {
            "layout": "powerpoint", "index": 0, "name": "Prev",
            "image1": "bi:skip-backward-fill", "image2": "alt.png",
            "key": "ctrl+left", "press": "hold",
        })
        assert resp.get_json() == {"ok": True}
        assert read_config(server.CONFIG_PATH)["layouts"]["powerpoint"]["buttons"][0] == {
            "name": "Prev", "image1": "bi:skip-backward-fill", "image2": "alt.png",
            "key": "ctrl+left", "press": "hold",
        }

    def test_defaults_for_omitted_fields(self, client, config_file):
        self.post(client, {"layout": "powerpoint", "index": 1})
        assert read_config(server.CONFIG_PATH)["layouts"]["powerpoint"]["buttons"][1] == {
            "name": "", "image1": "", "image2": "", "key": "", "press": "regular",
        }

    def test_grows_the_button_list_to_the_index(self, client, config_file):
        self.post(client, {"layout": "photoshop", "index": 3, "name": "Fourth"})
        buttons = read_config(server.CONFIG_PATH)["layouts"]["photoshop"]["buttons"]
        assert len(buttons) == 4
        assert buttons[0] == {} and buttons[1] == {} and buttons[2] == {}
        assert buttons[3]["name"] == "Fourth"


class TestSaveAppLayout:
    def post(self, client, payload):
        return client.post("/api/save-app-layout", json=payload)

    def test_missing_name_is_a_400(self, client):
        assert self.post(client, {"layout": "powerpoint"}).status_code == 400

    def test_assigns_a_layout_to_an_app(self, client, config_file):
        resp = self.post(client, {"name": "Notepad", "layout": "photoshop"})
        assert resp.get_json() == {"ok": True}
        assert read_config(server.CONFIG_PATH)["app-layouts"]["Notepad"] == "photoshop"

    def test_an_empty_layout_never_removes_an_assignment(self, client, config_file):
        self.post(client, {"name": "Microsoft PowerPoint", "layout": ""})
        assert read_config(server.CONFIG_PATH)["app-layouts"]["Microsoft PowerPoint"] == "powerpoint"

    def test_pushes_app_change_for_the_foreground_app(self, client, config_file, monkeypatch):
        emitted = []
        monkeypatch.setattr(server.socketio, "emit", lambda *a, **k: emitted.append((a, k)))
        server._current_app = {"name": "Notepad", "icon": "", "layout": None}
        self.post(client, {"name": "Notepad", "layout": "photoshop"})
        assert len(emitted) == 1
        assert emitted[0][0][0] == "app_change"
        assert emitted[0][0][1]["layout"]["key"] == "photoshop"


# --------------------------------------------------------------------------- #
# Socket.IO events
# --------------------------------------------------------------------------- #

class TestSocketEvents:
    def test_connect_pushes_the_current_app(self, sock):
        received = sock.get_received()
        assert [event["name"] for event in received] == ["app_change"]
        assert received[0]["args"][0]["name"] == "Unknown"

    def test_ping_round_trips_the_timestamp(self, sock):
        server._current_app = {"name": "Notepad", "icon": "", "layout": None}
        sock.get_received()                                   # drop the connect push
        sock.emit("ping", {"t": 1234})
        received = sock.get_received()
        assert received[0]["name"] == "pong"
        assert received[0]["args"][0] == {
            "t": 1234, "service": "phonebuttons", "foreground": "Notepad",
        }

    def test_ping_tolerates_a_non_dict_payload(self, sock):
        sock.get_received()
        sock.emit("ping", "nonsense")
        assert sock.get_received()[0]["args"][0]["t"] is None

    def test_button_press_wraps_the_main_key_in_the_modifiers(self, sock, keys):
        sock.emit("button_press", {"key": "ctrl+shift+X"})
        assert keys == [
            ("down", 0x11), ("down", 0x10),
            ("down", 0x58), ("up", 0x58),
            ("up", 0x10), ("up", 0x11),
        ]

    def test_button_press_ignores_an_unknown_key(self, sock, keys):
        sock.emit("button_press", {"key": "NOT_A_KEY"})
        assert keys == []

    def test_button_press_sends_nothing_for_a_modifiers_only_key(self, sock, keys):
        # <button_press> is the one-shot path and needs a main key; a
        # modifiers-only string is driven by key_down/key_up (press-and-hold).
        sock.emit("button_press", {"key": "ctrl+shift"})
        assert keys == []

    def test_key_down_and_key_up_hold_and_release(self, sock, keys):
        sock.emit("key_down", {"key": "ctrl+shift"})
        assert keys == [("down", 0x11), ("down", 0x10)]
        keys.clear()
        sock.emit("key_up", {"key": "ctrl+shift"})
        assert keys == [("up", 0x10), ("up", 0x11)]

    def test_key_down_with_a_main_key(self, sock, keys):
        sock.emit("key_down", {"key": "alt+F4"})
        assert keys == [("down", 0x12), ("down", 0x73)]
        keys.clear()
        sock.emit("key_up", {"key": "alt+F4"})
        assert keys == [("up", 0x73), ("up", 0x12)]

    def test_key_down_tolerates_a_non_dict_payload(self, sock, keys):
        sock.emit("key_down", "nonsense")
        assert keys == []

    def test_set_default_icon_caches_and_broadcasts(self, sock, monkeypatch):
        write_config(server.CONFIG_PATH)
        monkeypatch.setattr(server, "_get_foreground_info", lambda: None)
        monkeypatch.setattr(server, "_cache_icon",
                            lambda exe, hwnd, name: "/app-icon-cache/Notepad.png")
        sock.get_received()                                   # drop the connect push
        sock.emit("set_default_icon", {"name": "Notepad", "source": "GCL_HICON", "exe": "C:/notepad.exe"})
        assert read_config(server.CONFIG_PATH)["app-icon"]["Notepad"] == "GCL_HICON"
        pushes = [event for event in sock.get_received() if event["name"] == "app_change"]
        assert pushes, "expected a broadcast app_change push"
        assert pushes[-1]["args"][0]["icon"] == "/app-icon-cache/Notepad.png"

    def test_set_default_icon_requires_name_and_source(self, sock, monkeypatch):
        write_config(server.CONFIG_PATH)
        called = []
        monkeypatch.setattr(server, "_set_app_icon_pref",
                            lambda *a: called.append(a))
        sock.emit("set_default_icon", {"name": "Notepad"})
        sock.emit("set_default_icon", {"source": "GCL_HICON"})
        sock.emit("set_default_icon", {})
        assert called == []
        assert read_config(server.CONFIG_PATH)["app-icon"] == {"Notepad": "GCL_HICON"}

    def test_set_default_icon_uses_the_foreground_exe_when_it_matches(self, sock, monkeypatch):
        write_config(server.CONFIG_PATH)
        cached = []
        monkeypatch.setattr(server, "_get_foreground_info", lambda: {
            "title": "x", "name": "Notepad", "exe": "C:/real/notepad.exe", "hwnd": 99,
        })
        monkeypatch.setattr(server, "_cache_icon",
                            lambda exe, hwnd, name: cached.append((exe, hwnd, name)) or "/i.png")
        sock.emit("set_default_icon", {"name": "Notepad", "source": "GCL_HICON", "exe": "C:/stale.exe"})
        assert cached == [("C:/real/notepad.exe", 99, "Notepad")]


# --------------------------------------------------------------------------- #
# Tunnel / QR / LAN helpers
# --------------------------------------------------------------------------- #

class TestHelpers:
    def test_find_cloudflared_prefers_the_env_var(self, tmp_path, monkeypatch):
        exe = tmp_path / "cloudflared.exe"
        exe.write_bytes(b"")
        monkeypatch.setenv("PB_CLOUDFLARED", str(exe))
        assert server._find_cloudflared() == str(exe)

    def test_find_cloudflared_falls_back_to_path(self, monkeypatch):
        monkeypatch.delenv("PB_CLOUDFLARED", raising=False)
        monkeypatch.setattr(shutil, "which", lambda name: r"C:\tools\cloudflared.exe")
        assert server._find_cloudflared() == r"C:\tools\cloudflared.exe"

    def test_find_cloudflared_checks_the_usual_install_dirs(self, tmp_path, monkeypatch):
        monkeypatch.delenv("PB_CLOUDFLARED", raising=False)
        monkeypatch.setattr(shutil, "which", lambda name: None)
        monkeypatch.setenv("ProgramFiles", str(tmp_path))
        monkeypatch.setenv("LOCALAPPDATA", str(tmp_path / "local"))
        monkeypatch.setenv("USERPROFILE", str(tmp_path / "user"))
        target = tmp_path / "cloudflared" / "cloudflared.exe"
        target.parent.mkdir(parents=True)
        target.write_bytes(b"")
        assert server._find_cloudflared() == str(target)

    def test_find_cloudflared_returns_none_when_missing(self, tmp_path, monkeypatch):
        monkeypatch.delenv("PB_CLOUDFLARED", raising=False)
        monkeypatch.setattr(shutil, "which", lambda name: None)
        monkeypatch.setenv("ProgramFiles", str(tmp_path / "nope"))
        monkeypatch.setenv("LOCALAPPDATA", str(tmp_path / "nope"))
        monkeypatch.setenv("USERPROFILE", str(tmp_path / "nope"))
        assert server._find_cloudflared() is None

    def test_lan_ip_returns_an_address(self):
        value = server._lan_ip()
        assert isinstance(value, str) and value

    def test_show_qr_quotes_the_value(self, monkeypatch):
        opened = []
        monkeypatch.setattr(server.webbrowser, "open", lambda url: opened.append(url))
        monkeypatch.setattr(server, "_QR_ENABLED", True)
        server._show_qr("https://a.trycloudflare.com/x?y=1&z=2")
        assert len(opened) == 1
        assert opened[0] == (
            "http://127.0.0.1:5000/phonebuttons-qr?value="
            "https%3A%2F%2Fa.trycloudflare.com%2Fx%3Fy%3D1%26z%3D2"
        )

    def test_show_qr_is_disabled_by_no_qr(self, monkeypatch):
        opened = []
        monkeypatch.setattr(server.webbrowser, "open", lambda url: opened.append(url))
        monkeypatch.setattr(server, "_QR_ENABLED", False)
        server._show_qr("https://a.trycloudflare.com")
        assert opened == []

    def test_show_qr_ignores_an_empty_value(self, monkeypatch):
        opened = []
        monkeypatch.setattr(server.webbrowser, "open", lambda url: opened.append(url))
        monkeypatch.setattr(server, "_QR_ENABLED", True)
        server._show_qr("")
        assert opened == []

    def test_start_tunnel_returns_none_without_cloudflared(self, monkeypatch):
        monkeypatch.setattr(server, "_find_cloudflared", lambda: None)
        assert server._start_tunnel() is None

    def test_start_tunnel_parses_the_trycloudflare_url(self, monkeypatch):
        class FakeStdout:
            def __init__(self, lines):
                self._lines = list(lines)

            def readline(self):
                return self._lines.pop(0) if self._lines else ""

        class FakeProc:
            def __init__(self, lines):
                self.stdout = FakeStdout(lines)

            def poll(self):
                return None

        lines = [
            "2026-10-18 INF +--------------------------------------------------------------------------------------------+\n",
            "2026-10-18 INF |  https://brave-lion-1234.trycloudflare.com                                                 |\n",
        ]
        monkeypatch.setattr(server, "_find_cloudflared", lambda: r"C:\cloudflared.exe")
        monkeypatch.setattr(server.subprocess, "Popen", lambda *a, **k: FakeProc(lines))
        assert server._start_tunnel() == "https://brave-lion-1234.trycloudflare.com"

    def test_open_browser_uses_the_lan_address(self, monkeypatch):
        opened = []
        monkeypatch.setattr(server.webbrowser, "open", lambda url: opened.append(url))
        monkeypatch.setattr(server, "_lan_ip", lambda: "192.168.1.50")
        server._open_browser()
        assert opened == ["http://192.168.1.50:5000/remoteHID/PhoneButtons/?showQr=1"]


# --------------------------------------------------------------------------- #
# Windows integration (mocked): running apps, the focus hook, key injection
# --------------------------------------------------------------------------- #

class TestRunningApps:
    def test_windowed_and_background_apps(self, monkeypatch, config_file):
        class Proc:
            def __init__(self, exe):
                self._exe = exe
                self.info = {"exe": exe}

            def exe(self):
                return self._exe

        monkeypatch.setattr(server.win32gui, "IsWindowVisible", lambda hwnd: hwnd != 2)
        monkeypatch.setattr(server.win32gui, "GetWindowText",
                            lambda hwnd: "Title" if hwnd == 1 else "")
        monkeypatch.setattr(server.win32process, "GetWindowThreadProcessId", lambda hwnd: (1, 100 + hwnd))
        monkeypatch.setattr(server.psutil, "Process", lambda pid: Proc("C:/apps/app%d.exe" % pid))
        monkeypatch.setattr(server.psutil, "process_iter",
                            lambda attrs: [Proc("C:/apps/bg.exe"), Proc(None)])
        monkeypatch.setattr(server, "_friendly_name_uncached",
                            lambda path: os.path.splitext(os.path.basename(path))[0])
        monkeypatch.setattr(server, "_cache_icon", lambda exe, hwnd, name: "/icon/%s.png" % name)
        monkeypatch.setattr(server.win32gui, "EnumWindows",
                            lambda cb, lp: [cb(hwnd, lp) for hwnd in (1, 2, 3)])

        apps = server._list_running_apps()
        assert apps == [
            # hwnd 1: visible + titled -> pid 101. hwnd 2: not visible. hwnd 3: no title.
            {"name": "app101", "icon": "/icon/app101.png", "background": False, "layout": ""},
            # a windowless process lands in the background list
            {"name": "bg", "icon": "/icon/bg.png", "background": True, "layout": ""},
        ]

    def test_layout_assignment_is_reported(self, monkeypatch, config_file):
        monkeypatch.setattr(server.win32gui, "EnumWindows", lambda cb, lp: None)
        monkeypatch.setattr(
            server.psutil, "process_iter",
            lambda attrs: [type("P", (), {"info": {"exe": "C:/x/nope.exe"}})()],
        )
        monkeypatch.setattr(server, "_friendly_name_uncached", lambda path: "Microsoft PowerPoint")
        monkeypatch.setattr(server, "_cache_icon", lambda exe, hwnd, name: "/i.png")
        apps = server._list_running_apps()
        assert apps == [{"name": "Microsoft PowerPoint", "icon": "/i.png",
                         "background": True, "layout": "powerpoint"}]

    def test_enumwindows_failure_still_returns_the_background_apps(self, monkeypatch, config_file):
        def boom(cb, lp):
            raise OSError("enum failed")

        monkeypatch.setattr(server.win32gui, "EnumWindows", boom)
        monkeypatch.setattr(server.psutil, "process_iter", lambda attrs: [])
        assert server._list_running_apps() == []


class TestForegroundHook:
    def make_app(self, monkeypatch, exe=r"C:\Windows\notepad.exe"):
        monkeypatch.setattr(server.win32gui, "GetWindowText", lambda hwnd: "Doc - Notepad")
        monkeypatch.setattr(server.win32process, "GetWindowThreadProcessId", lambda hwnd: (1, 7))
        monkeypatch.setattr(server.psutil, "Process",
                            lambda pid: type("P", (), {"exe": lambda self: exe})())
        monkeypatch.setattr(server, "_friendly_name_uncached", lambda path: "Notepad")
        monkeypatch.setattr(server, "_cache_icon", lambda exe, hwnd, name: "/i/Notepad.png")
        emitted = []
        monkeypatch.setattr(server.socketio, "emit", lambda *a, **k: emitted.append((a, k)))
        return emitted

    def test_changed_app_is_cached_and_pushed(self, monkeypatch, tmp_path):
        write_config(server.CONFIG_PATH, {
            "applications": {"Notepad": "notepad"},
            "templates": {"notepad": {"rows": 4, "cols": 2, "buttons": [{"key": "left"}]}},
            "app-layouts": {"Notepad": "powerpoint"},
            "layouts": {"powerpoint": {"rows": 3, "cols": 3, "buttons": [{"key": "right"}]}},
        })
        emitted = self.make_app(monkeypatch)
        server._on_foreground_change(None, None, 5, 0, 0, 0, 0)
        assert len(emitted) == 1
        state = emitted[0][0][1]
        assert state["name"] == "Notepad"
        assert state["icon"] == "/i/Notepad.png"
        # template + layout come from the config
        assert state["template"] == {"rows": 4, "cols": 2, "buttons": [{"key": "left"}]}
        assert state["layout"] == {"key": "powerpoint", "rows": 3, "cols": 3,
                                   "buttons": [{"key": "right"}], "mouser": {}}
        assert server._current_app["name"] == "Notepad"

    def test_same_app_is_not_pushed_again(self, monkeypatch, config_file):
        emitted = self.make_app(monkeypatch)
        server._current_app = {"name": "Notepad", "icon": "", "layout": None}
        server._on_foreground_change(None, None, 5, 0, 0, 0, 0)
        assert emitted == []

    def test_a_window_without_a_title_is_ignored(self, monkeypatch, config_file):
        emitted = self.make_app(monkeypatch)
        monkeypatch.setattr(server.win32gui, "GetWindowText", lambda hwnd: "")
        server._on_foreground_change(None, None, 5, 0, 0, 0, 0)
        assert emitted == []

    def test_callback_errors_are_swallowed(self, monkeypatch, config_file):
        emitted = self.make_app(monkeypatch)

        def boom(hwnd):
            raise OSError("gone")

        monkeypatch.setattr(server.win32gui, "GetWindowText", boom)
        server._on_foreground_change(None, None, 5, 0, 0, 0, 0)   # must not raise
        assert emitted == []


class TestFocusHookRunner:
    def test_returns_when_the_hook_cannot_be_installed(self, monkeypatch):
        monkeypatch.setattr(server, "_SetWinEventHook", lambda *a: 0)
        server._run_focus_hook()
        assert server._focus_hook_handle == 0

    def test_pumps_messages_and_unhooks_at_the_end(self, monkeypatch):
        monkeypatch.setattr(server, "_SetWinEventHook", lambda *a: 1234)
        monkeypatch.setattr(server, "_GetMessageW", lambda *a: 0)
        monkeypatch.setattr(server, "_TranslateMessage", lambda *a: 0)
        monkeypatch.setattr(server, "_DispatchMessageW", lambda *a: 0)
        unhooked = []
        monkeypatch.setattr(server, "_UnhookWinEvent", lambda handle: unhooked.append(handle))
        server._run_focus_hook()
        assert server._focus_hook_handle == 1234
        assert unhooked == [1234]


class TestKeyInjection:
    def test_key_down_up_and_send_key_flags(self, monkeypatch):
        sent = []
        monkeypatch.setattr(
            server.win32api, "keybd_event",
            lambda vk, scan, flags, extra: sent.append((vk, flags)),
        )
        server._send_key_down(0x41)
        server._send_key_up(0x41)
        server.send_key(0x42)
        assert sent == [(0x41, 0), (0x41, 2), (0x42, 0), (0x42, 2)]

    def test_char_vk_without_a_keyboard_api(self, monkeypatch):
        monkeypatch.setattr(server, "_user32", None)
        assert server._char_vk("a") == (0, False)

    def test_char_vk_for_an_unmappable_character(self, monkeypatch):
        monkeypatch.setattr(server, "_user32", type("F", (), {"VkKeyScanW": lambda self, ch: -1})())
        assert server._char_vk("a") == (0, False)

    def test_char_vk_survives_a_failure(self, monkeypatch):
        def boom(self, ch):
            raise OSError("no layout")

        monkeypatch.setattr(server, "_user32", type("F", (), {"VkKeyScanW": boom})())
        assert server._char_vk("a") == (0, False)


# --------------------------------------------------------------------------- #
# Failure branches
# --------------------------------------------------------------------------- #

class TestFailureBranches:
    def test_lan_ip_falls_back_to_loopback(self, monkeypatch):
        class OfflineSocket:
            def __init__(self, *args, **kwargs):
                pass

            def connect(self, *args):
                raise OSError("offline")

            def close(self):
                pass

        monkeypatch.setattr(server.socket, "socket", OfflineSocket)
        assert server._lan_ip() == "127.0.0.1"

    def test_open_browser_swallows_a_browser_error(self, monkeypatch):
        def boom(url):
            raise RuntimeError("no browser")

        monkeypatch.setattr(server.webbrowser, "open", boom)
        server._open_browser()                                     # must not raise

    def test_show_qr_swallows_a_browser_error(self, monkeypatch):
        def boom(url):
            raise RuntimeError("no browser")

        monkeypatch.setattr(server, "_QR_ENABLED", True)
        monkeypatch.setattr(server.webbrowser, "open", boom)
        server._show_qr("https://a.trycloudflare.com")             # must not raise

    def test_start_tunnel_reports_a_popen_failure(self, monkeypatch):
        def boom(*args, **kwargs):
            raise OSError("cannot start cloudflared")

        monkeypatch.setattr(server, "_find_cloudflared", lambda: r"C:\cloudflared.exe")
        monkeypatch.setattr(server.subprocess, "Popen", boom)
        assert server._start_tunnel() is None

    def test_start_tunnel_reports_an_early_exit(self, monkeypatch):
        class FakeProc:
            stdout = type("S", (), {"readline": lambda self: ""})()

            def poll(self):
                return 1

        monkeypatch.setattr(server, "_find_cloudflared", lambda: r"C:\cloudflared.exe")
        monkeypatch.setattr(server.subprocess, "Popen", lambda *a, **k: FakeProc())
        assert server._start_tunnel() is None

    def test_start_tunnel_times_out(self, monkeypatch):
        class FakeProc:
            stdout = type("S", (), {"readline": lambda self: "still starting\n"})()

            def poll(self):
                return None

        calls = {"n": 0}

        def fake_time():
            calls["n"] += 1
            return 0 if calls["n"] == 1 else 1000      # deadline 60, then past it

        monkeypatch.setattr(server, "_find_cloudflared", lambda: r"C:\cloudflared.exe")
        monkeypatch.setattr(server.subprocess, "Popen", lambda *a, **k: FakeProc())
        monkeypatch.setattr(server.time, "time", fake_time)
        assert server._start_tunnel() is None

    def test_tunnel_and_qr_prints_the_settings_and_shows_the_qr(self, monkeypatch, capsys):
        shown = []
        monkeypatch.setattr(server, "_start_tunnel",
                            lambda: "https://brave-lion-1234.trycloudflare.com")
        monkeypatch.setattr(server, "_show_qr", lambda value: shown.append(value))
        server._tunnel_and_qr()
        out = capsys.readouterr().out
        assert "https://brave-lion-1234.trycloudflare.com" in out
        assert "brave-lion-1234.trycloudflare.com" in out
        assert shown == ["https://brave-lion-1234.trycloudflare.com"]

    def test_tunnel_and_qr_does_nothing_without_a_url(self, monkeypatch):
        shown = []
        monkeypatch.setattr(server, "_start_tunnel", lambda: None)
        monkeypatch.setattr(server, "_show_qr", lambda value: shown.append(value))
        server._tunnel_and_qr()
        assert shown == []


class TestSaveEndpointsWithoutAConfig:
    def test_save_layout_creates_the_config(self, client):
        resp = client.post("/api/save-layout", json={"key": "fresh", "rows": 2, "cols": 2})
        assert resp.status_code == 200
        assert read_config(server.CONFIG_PATH)["layouts"]["fresh"]["displayName"] == "fresh"

    def test_save_layout_button_tolerates_a_missing_config(self, client):
        resp = client.post("/api/save-layout-button", json={"layout": "x", "index": 0})
        assert resp.status_code == 404

    def test_save_app_layout_creates_the_config(self, client):
        resp = client.post("/api/save-app-layout", json={"name": "Fresh", "layout": "powerpoint"})
        assert resp.status_code == 200
        saved = read_config(server.CONFIG_PATH)
        assert saved["app-layouts"] == {"Fresh": "powerpoint"}
        assert "layouts" not in saved


# --------------------------------------------------------------------------- #
# The real GDI icon pipeline (read-only; asserts the CONTRACT, not pixels)
# --------------------------------------------------------------------------- #

class TestIconPipelineSmoke:
    """The real GDI pipeline, driven against notepad.exe (which has icon
    resources) - these are the only tests that touch the Windows APIs for real,
    so they assert the observable CONTRACT: PNG bytes and the source labels."""

    PNG = b"\x89PNG\r\n\x1a\n"
    EXE = r"C:\Windows\notepad.exe"

    def test_hicon_to_png(self):
        import win32gui
        # pywin32's signature is ExtractIcon(hInst, exeName, index).
        hicon = win32gui.ExtractIcon(0, self.EXE, 0)
        try:
            assert hicon
            assert server._hicon_to_png(hicon, 32).startswith(self.PNG)
        finally:
            win32gui.DestroyIcon(hicon)

    def test_extract_icon_png_from_an_exe(self):
        assert server._extract_icon_png(self.EXE).startswith(self.PNG)

    def test_extract_icon_png_from_a_window(self):
        # hwnd 0 has no icon: the sources all come back empty -> None.
        assert server._extract_icon_png_from_hwnd(0) is None

    def test_extract_icon_by_an_unknown_source(self):
        assert server._extract_icon_by_source("NOT A SOURCE", self.EXE, 0) is None

    def test_extract_icon_by_source_name(self):
        for source in ("ExtractIcon(0)", "ExtractIconEx(0)", "SHGetFileInfoW", "GCL_HICON"):
            png = server._extract_icon_by_source(source, self.EXE, 0)
            assert png is None or png.startswith(self.PNG), source

    def test_extract_icon_by_the_extracticon_source(self):
        # REGRESSION: app.py called win32gui.ExtractIcon(exe_path, 0) with TWO
        # args, but pywin32 requires ExtractIcon(hInst, exeName, index). The
        # TypeError was swallowed by the surrounding try/except, so the
        # "ExtractIcon(0)" icon source silently never produced anything.
        png = server._extract_icon_by_source("ExtractIcon(0)", self.EXE, 0)
        assert png and png.startswith(self.PNG)

    def test_friendly_name_reads_the_file_description(self):
        assert server._friendly_name_uncached(self.EXE) == "Notepad"
        assert server._friendly_name_uncached(r"C:\nope\mystery.exe") == "mystery"


class TestCacheIcon:
    def test_cache_hit_returns_the_url_without_extracting(self, monkeypatch):
        with open(os.path.join(server.ICON_DIR, "Notepad.png"), "wb") as fh:
            fh.write(b"cached")
        called = []
        monkeypatch.setattr(server, "_extract_icon_png", lambda exe: called.append(exe) or b"x")
        assert server._cache_icon(r"C:\x\notepad.exe", 1, "Notepad") == \
            "/app-icon-cache/Notepad.png"
        assert called == []

    def test_uses_the_preferred_source_and_writes_the_file(self, monkeypatch):
        write_config(server.CONFIG_PATH)
        server._load_config()
        monkeypatch.setattr(server, "_extract_icon_by_source",
                            lambda source, exe, hwnd: b"\x89PNG-preferred")
        assert server._cache_icon(r"C:\x\notepad.exe", 1, "Notepad") == \
            "/app-icon-cache/Notepad.png"
        with open(os.path.join(server.ICON_DIR, "Notepad.png"), "rb") as fh:
            assert fh.read() == b"\x89PNG-preferred"

    def test_a_failing_preferred_source_returns_empty(self, monkeypatch):
        write_config(server.CONFIG_PATH)
        server._load_config()
        monkeypatch.setattr(server, "_extract_icon_by_source", lambda *a: None)
        assert server._cache_icon(r"C:\x\notepad.exe", 1, "Notepad") == ""
        assert not os.path.exists(os.path.join(server.ICON_DIR, "Notepad.png"))

    def test_without_a_preference_it_tries_the_window_then_the_exe(self, monkeypatch):
        monkeypatch.setattr(server, "_extract_icon_png_from_hwnd", lambda hwnd: None)
        monkeypatch.setattr(server, "_extract_icon_png", lambda exe: b"\x89PNG-exe")
        assert server._cache_icon(r"C:\x\noname.exe", 7, "NoName") == \
            "/app-icon-cache/NoName.png"

    def test_nothing_extractable_returns_empty(self, monkeypatch):
        monkeypatch.setattr(server, "_extract_icon_png_from_hwnd", lambda hwnd: None)
        monkeypatch.setattr(server, "_extract_icon_png", lambda exe: None)
        assert server._cache_icon(r"C:\x\noname.exe", 7, "NoName") == ""
