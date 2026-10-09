# PhoneButtons server

Local Flask + Flask-SocketIO server that serves the MyApps **Phone Buttons**
front end (and the whole shared `smd-*` library) and replays key presses on this
PC.

Everything is **same-origin**: the browser loads the app from this server and
opens the Socket.IO connection back to the same origin, so there is no CORS and
no HTTPS/mixed-content problem. Do not expose this server to untrusted networks
— it can inject keystrokes.

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
on the phone.

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
- `GET /api/app-icons` — the cached application icons (PNGs in
  `app-icon-cache/`), used by the Edit Layout icon picker.
- `POST /api/save-app-layout` — persist which layout an app uses
  (`{name, layout}`) into `config.json` -> `app-layouts`.
- `POST /api/save-layout` — persist a layout definition
  (`{key, displayName, image, orientation}`) into `config.json` -> `layouts`.
- `POST /api/save-layout-button` — persist one layout button
  (`{layout, index, image, key}`) into `config.json` -> `layouts[key].buttons[index]`.
- Socket.IO: the server emits `app_change` on connect and on foreground change;
  the client sends `button_press { key }`; `ping` -> `pong` for diagnostics.

## Notes

- Wildcard CORS is intentionally NOT enabled: the front end is same-origin, and
  a wildcard would let any web page drive this machine's keyboard.
- To add a new shared asset, no server change is needed — it is served straight
  from the repo root.
