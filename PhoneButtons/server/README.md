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
`http://<PC-LAN-IP>:5000/PhoneButtons/?showQr=1`, which lands on the Settings
page with the "Share app" QR visible — scan it with your phone to open the app
on the phone. Pass **`--no-qr`** to suppress that browser launch:

```powershell
py -3.13 MyApps\PhoneButtons\server\app.py --no-qr
```

`/` redirects to `/PhoneButtons/`.

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
  port uses the scheme default, 443) and tick **https**.
- To add a new shared asset, no server change is needed — it is served straight
  from the repo root.
