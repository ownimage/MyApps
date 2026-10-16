# PhoneButtons server

Local Flask + Flask-SocketIO server that serves the MyApps **Phone Buttons**
front end (and the whole shared `smd-*` library) and replays key presses on this
PC.

By default everything is **same-origin**: the browser loads the app from this
server and opens the Socket.IO connection back to the same origin. The app can
also be served from elsewhere (GitHub Pages, or the same server published through
a **Cloudflare tunnel** for a fully-signed https URL) and pointed at this server
via **Settings → Server** (https checkbox / server address / port / Scan QR) —
that is a different origin, so CORS is enabled (see Notes). Do not expose this
server to untrusted networks — it can inject keystrokes.

## Run

```powershell
py -3.13 -m pip install -r MyApps\PhoneButtons\server\requirements.txt
py -3.13 MyApps\PhoneButtons\server\app.py
```

Then open <http://localhost:5000/PhoneButtons/> (or, from a phone on the same
LAN, `http://<PC-LAN-IP>:5000/PhoneButtons/`).

On startup the server also **opens a browser** at
`http://<PC-LAN-IP>:5000/PhoneButtons/?showQr=1`, landing on the Settings page with
the "Share app" QR visible — scan it with your phone to open the app there. Pass
**`--no-qr`** to suppress that browser launch:

```powershell
py -3.13 MyApps\PhoneButtons\server\app.py --no-qr
```

`/` redirects to `/PhoneButtons/`.

### Cloudflare tunnel + QR (`--tunnel`)

Publish this (plain-http, LAN-only) server on a **real, trusted https URL** and get
that URL as a scannable QR — which is what makes it usable from an https page (the
GitHub-Pages copy cannot talk to an http server):

```powershell
py -3.13 MyApps\PhoneButtons\server\app.py --tunnel
# or simply:  PhoneButtonServer.cmd        (passes --tunnel by default)
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

## Layout

- `app.py` — the server. Serves the repo root (`MyApps/`) as static files, so
  `../shared/...` in the app resolves to the shared `smd-*` library.
- `config.json` — the `layouts` catalog plus per-app layout assignments
  (`app-layouts`).
- `app-icon-cache/` — PNGs extracted from the foreground window's process.

## Endpoints

- `GET /api/layouts` — the layout catalog (`config.json` -> `layouts`), used by
  both wizards' "Select Layout" dropdowns.
- `GET /api/apps` — the running applications (each with its icon, a `background`
  flag for windowless processes, and its assigned `layout`), for the Manage App
  page's app dropdown.
- `GET /api/app-icons` — the cached application icons (PNGs in
  `app-icon-cache/`), used by the Manage Layout icon picker.
- `POST /api/save-app-layout` — persist which layout an app uses
  (`{name, layout}`) into `config.json` -> `app-layouts`.
- `POST /api/save-layout` — persist a layout definition
  (`{key, displayName, image, orientation}`) into `config.json` -> `layouts`.
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
- To add a new shared asset, no server change is needed — it is served straight
  from the repo root.
