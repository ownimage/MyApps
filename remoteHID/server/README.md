# PhoneButtons + Mouser server

Local Flask + Flask-SocketIO server that serves the MyApps **Phone Buttons**
front end (and the whole shared `smd-*` library) and replays key presses on this
PC. It is also the receiving end of the **Mouser** 6DOF capture client: UDP
motion frames on port 7801 become real key presses (F13–F24 by default, or the
layout's chosen keys/modifiers) in the focused app.

By default everything is **same-origin**: the browser loads the app from this
server and opens the Socket.IO connection back to the same origin. The app can
also be served from elsewhere (GitHub Pages, or the same server published through
a **Cloudflare tunnel** for a fully-signed https URL) and pointed at this server
via **Settings → Server** (https checkbox / server address / port / Scan QR) —
that is a different origin, so CORS is enabled (see Notes). Do not expose this
server to untrusted networks — it can inject keystrokes.

## Run

From the MyApps repo root:

```powershell
py -3.13 -m pip install -r remoteHID\server\requirements.txt
py -3.13 remoteHID\server\app.py
```

Then open <http://localhost:5000/remoteHID/PhoneButtons/> (or, from a phone on the same
LAN, `http://<PC-LAN-IP>:5000/remoteHID/PhoneButtons/`).

On startup the server also **opens a browser** at
`http://<PC-LAN-IP>:5000/remoteHID/PhoneButtons/?showQr=1`, landing on the Settings page with
the "Share app" QR visible — scan it with your phone to open the app there. Pass
**`--no-qr`** to suppress that browser launch:

```powershell
py -3.13 remoteHID\server\app.py --no-qr
```

`/` redirects to `/remoteHID/PhoneButtons/`.

### Key-send debug (`--debug-keys`)

The general server log is on by default and can be turned off with
**`--no-debug`** (or back on with `--debug`). Key sends are separate and are
**off by default**, because the Mouser ratchet can emit hundreds of presses per
second. Turn on a line for every key the server actually sends with
**`--debug-keys`**:

```powershell
py -3.13 remoteHID\server\app.py --debug-keys
# or, if you only want the key lines:
py -3.13 remoteHID\server\app.py --no-debug --debug-keys
```

Each successful injection is logged to stderr as, for example:

```text
[12:34:56.789] Mouser key sent: 'ctrl+shift+K' (VK=0x4B, mods=['0x11', '0x10'])
```

Turn it off again with **`--no-debug-keys`**. Startup prints
`Key-send debug: on|off` so you can confirm the mode. If the Mouser tab's
press count is increasing but Blender/Unity receives nothing, the keys are being
injected but the target may be focused elsewhere or running at a higher integrity
level (UIPI).

### Cloudflare tunnel + QR (`--tunnel`)

Publish this (plain-http, LAN-only) server on a **real, trusted https URL** and get
that URL as a scannable QR — which is what makes it usable from an https page (the
GitHub-Pages copy cannot talk to an http server):

```powershell
py -3.13 remoteHID\server\app.py --tunnel
# or simply:  remoteHID\PhoneButtonServer.cmd        (passes --tunnel by default)
```

It runs `cloudflared tunnel --url http://127.0.0.1:5000`, echoes cloudflared's
output, parses the `https://<name>.trycloudflare.com` URL, prints the Settings
values to use, and opens `/phonebuttons-qr?value=…` — a big QR rendered with the
shared vendored `qrcode.min.js`. Then in PhoneButtons → **Settings → Server**: tick
**https**, put the hostname in **Server address**, leave **Port EMPTY**.

Already have an address (e.g. your own NAMED tunnel)? Just show a QR for it:
`--qr https://your-domain` (no tunnel is started).

Requires `cloudflared` (`winget install cloudflare.cloudflared`), or set
`PB_CLOUDFLARED` to the exe. If it is missing the server still runs and says so.
Turn the tunnel off with **`--no-tunnel`**.

**SECURITY:** a quick tunnel is on the public internet — anyone with the (random)
URL can drive this machine's keyboard. Keep `PB_CORS_ORIGINS` tight and stop the
tunnel when you are done.

The next three sections are for the PC with the mouse, not the server host.

## Build mouser-capture.exe

`mouser-capture.exe` is the C# capture client in `remoteHID/Mouser`; it runs on the
PC with the physical mouse, not on this server. Build it where the .NET 8 SDK is
installed, from the MyApps repo root:

```powershell
.\remoteHID\Mouser\build.ps1 -InterceptionDir C:\path\to\Interception\library\x64
```

That publishes a self-contained folder to `remoteHID\Mouser\out\`, copies
`interception.dll` beside the exe, and creates `remoteHID\Mouser\mouser-capture.zip`.
If you omit `-InterceptionDir`, the publish still succeeds but warns that the DLL is
missing; copy `library\x64\interception.dll` into `out\` yourself.

Compile-check only:

```powershell
dotnet build remoteHID\Mouser\capture\Mouser.Capture.csproj -c Release
```

See [`remoteHID/Mouser/README.md`](../Mouser/README.md) for prerequisites,
`-FrameworkDependent`, `-NoZip`, and deployment options.

## Run mouser-capture.exe

On the PC with the mouse, from the published/copied folder:

```powershell
.\mouser-capture.exe --help
```

The help text is the authoritative option list. For the normal capture path:

```powershell
# Find the mouse's hardware-id substring (e.g. VID_046D)
.\mouser-capture.exe --list

# Optional: confirm normal forwarding before gating
.\mouser-capture.exe --passthrough --filter VID_046D

# Send gated MB4/MB5 motion to this server
.\mouser-capture.exe --gate --filter VID_046D --udp 192.168.1.50:7801

# Prove the UDP hop before blaming the keys (the server answers PONG)
.\mouser-capture.exe --ping --udp 192.168.1.50:7801
```

`--filter` matches a substring from `--list`; without it every mouse is gated. The
server must be reachable on UDP 7801 (see Notes). In v0.3.1 the configured mode
buttons are consumed; add `--pass-mode-buttons` for the old click-through behaviour.

Use the **server PC's own LAN address** (the one its startup banner/`ipconfig`
shows) - the examples here are illustrative, and a DHCP lease change silently
breaks an old command line. **UDP is not tunnelled**: a `--udp` target on the
Cloudflare hostname can never arrive.

**Quote a full hardware id in `cmd.exe`/PowerShell.** `&` is a command separator
there, so an unquoted
`--filter HID\VID_046D&PID_C52B&REV_1210&MI_01&Col01 --udp 1.2.3.4:7801` is cut at
the first `&`: the capture starts with `--filter HID\VID_046D` and **`--udp` is
never passed** (the mouse is gated, no frames are sent, and the banner warns
`--gate without --udp`). Quote the value:

```powershell
.\mouser-capture.exe --gate --filter "HID\VID_046D&PID_C52B&REV_1210&MI_01&Col01" --udp 192.168.1.69:7801
```

## Installing Interception

This is already covered in detail in
[`remoteHID/Mouser/README.md`](../Mouser/README.md) under **Install the driver**;
the full procedure is not duplicated here. On the mouse PC, once, from an elevated
prompt:

```powershell
Unblock-File .\install-interception.exe
.\install-interception.exe /install
# reboot
```

Download it from <https://github.com/oblitum/Interception/releases>. Check Memory
Integrity / HVCI first; it is the most common reason the driver refuses to load
(details and troubleshooting are in the Mouser README). Uninstall with
`.\install-interception.exe /uninstall`.

## Layout

- `app.py` — the server. Serves the repo root (`MyApps/`) as static files, so
  `../../shared/...` in the app resolves to the shared `smd-*` library.
- `config.json` — the `layouts` catalog plus per-app layout assignments
  (`app-layouts`) and the top-level `mouser` settings (`enabled`, `udp_port`,
  `max_presses_per_frame`, `min_press_interval_ms`).
- `mouser/` — pure Mouser code: wire format, six ratchets, engine, UDP receiver.
- `app-icon-cache/` — PNGs extracted from the foreground window's process.

## Endpoints

- `GET /api/layouts` — the layout catalog (`config.json` -> `layouts`), used by
  both wizards' "Select Layout" dropdowns. Each entry carries its optional
  `mouser` block and a `usedBy` list of app names.
- `GET /api/apps` — the running applications (each with its icon, a `background`
  flag for windowless processes, and its assigned `layout`), for the Manage App
  page's app dropdown.
- `GET /api/app-icons` — the cached application icons (PNGs in
  `app-icon-cache/`), used by the Manage Layout icon picker.
- `POST /api/save-app-layout` — persist which layout an app uses
  (`{name, layout}`) into `config.json` -> `app-layouts`.
- `POST /api/save-layout` — persist a layout definition
  (`{key, displayName, image, rows, cols, buttons, mouser}`) into
  `config.json` -> `layouts`. Omitting `mouser` keeps the stored block.
- `POST /api/save-layout-button` — persist one layout button
  (`{layout, index, image, key}`) into `config.json` -> `layouts[key].buttons[index]`.
- `GET /app-icon-cache/<name>.png` — one cached application icon. Paths returned by
  the API are ROOT-RELATIVE, so the app prefixes the configured server base
  (`pbServerUrl()`).
- `GET /phonebuttons-qr?value=<url>` — a big QR page (shared vendored
  `qrcode.min.js`), used by `--tunnel` / `--qr`.
- Socket.IO: the server emits `app_change` on connect and on foreground change;
  the client sends `button_press { key }` (a full press), `key_down { key }` /
  `key_up { key }` (press-and-hold — a modifiers-only key such as `"ctrl+shift"`
  holds the modifiers with no main key); `ping` -> `pong` for diagnostics.
  It also emits `mouser_state` at 10 Hz: `{enabled, mode, app, layout,
  pressesPerSecond, axes: {rx: {value, presses}, ...}}`, which drives the live
  readout on the Mouser tab.
- UDP `0.0.0.0:7801` — Mouser capture frames. No HTTP endpoint and no browser
  involvement: the capture client sends 32-byte frames directly.

## Notes

- CORS IS enabled so the app can run from another origin (GitHub Pages, or a
  Cloudflare-tunnelled https address) and reach this server: `/api/*` responses
  carry `Access-Control-Allow-*` and Socket.IO accepts cross-origin connections.
  The server can inject keystrokes, so on an untrusted network restrict it with
  `PB_CORS_ORIGINS` (comma-separated origins, or a single origin); default `*`.
- Tunnel note: point the tunnel at `http://127.0.0.1:5000`; it advertises a
  `https://…` URL with no port, so leave the app's **Port** field EMPTY (an empty
  port uses the scheme default, 443) and tick **https**. If `cloudflared` is not on
  PATH, set **`PB_CLOUDFLARED`** to its full path. A QUICK tunnel gets a new random
  hostname on every start — use a NAMED tunnel for a stable one, then `--qr <url>`.
- Application icons are returned as ROOT-RELATIVE paths; the app must resolve them
  against the server base or they are requested from the APP's host.
- **Mouser UDP is not tunnelled.** The Cloudflare tunnel publishes only HTTP, so
  the capture client must reach port 7801 on the LAN. If the server's firewall
  blocks it, run (elevated):
  `New-NetFirewallRule -DisplayName 'Mouser UDP 7801' -Direction Inbound -Protocol UDP -LocalPort 7801 -Action Allow`.
- The server injects real keystrokes, so it and the target app (Blender/Unity)
  must run at the same integrity level; Windows UIPI blocks a normal process from
  injecting into an elevated one.
- To add a new shared asset, no server change is needed — it is served straight
  from the repo root.
