# PhoneButtons server

Local Flask + Flask-SocketIO server that serves the MyApps **Phone Buttons**
front end (and the whole shared `smd-*` library) and replays key presses on this
PC.

By default everything is **same-origin**: the browser loads the app from this
server and opens the Socket.IO connection back to the same origin. The app can
also be served from elsewhere (an installed PWA / another origin) and pointed at
this LAN server via **Settings → Server** (IP + port, or "Scan QR" of the
Share-app QR) — see the CORS note below. Do not expose this server to untrusted
networks — it can inject keystrokes.

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

### HTTPS

The repo-root launcher `PhoneButtonServer.cmd` runs **HTTPS by default** (ad-hoc
self-signed) and installs the deps; pass `--no-tls` to it for plain HTTP. Running
`app.py` directly serves HTTP unless you pass a TLS option:

Serve over TLS with `--cert`/`--key` (a PEM pair), or `--adhoc` for a throwaway
self-signed certificate (needs the `cryptography` package):

```powershell
py -3.13 MyApps\PhoneButtons\server\app.py --adhoc
py -3.13 MyApps\PhoneButtons\server\app.py --cert server.crt --key server.key --port 5000
```

The URL the server opens (and therefore the Share-app QR) switches to `https://`.
A self-signed cert shows a browser warning AND is **not** a secure context, so the
camera "Scan QR" stays blocked unless the cert is trusted by the device — generate
one with [mkcert](https://github.com/FiloSottile/mkcert) and install its root CA on
the phone.

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

- CORS IS enabled so the app can run from another origin (an installed PWA) and
  reach this server: `/api/*` responses carry `Access-Control-Allow-*` and
  Socket.IO accepts cross-origin connections. This is needed because the server
  injects keystrokes, so **restrict it on an untrusted network** by setting
  `PB_CORS_ORIGINS` (comma-separated origins, or a single origin) before starting
  the server; it defaults to `*`.
- Mixed content: an HTTPS app pointed at this server over plain HTTP is blocked
  regardless of CORS — run the server with TLS (`--cert/--key` or `--adhoc`) so
  both are HTTPS. The camera "Scan QR" also needs a secure context: over plain HTTP
  type the address instead, and a self-signed cert only unblocks the camera if the
  device trusts that cert.
- To add a new shared asset, no server change is needed — it is served straight
  from the repo root.
