# PlanMyDay

A static PWA for daily task planning.

## Layout

This repo is set up to host **multiple PWAs off one origin** (GitHub Pages
`ownimage.github.io/MyApps/`):

- `shared/` — the reusable library (components, services, themes, vendor, sample images).
- `PlanMyDay/` — this app, served at `/<project>/PlanMyDay/` (its own `index.html` + `manifest.json`).
- `CountMyDays/` — countdown app, served at `/<project>/CountMyDays/` (same structure; own `manifest.json` + icons).
- `QRLinks/` — link/QR app, served at `/<project>/QRLinks/` (same structure; own `manifest.json` + icons).
- `SolarControlar/` — solar energy monitoring dashboard (front-end for the Flask server), served at `/<project>/SolarControlar/` (same structure; own `manifest.json` + icons).
- `FreeFormOX/` — free-form noughts & crosses app, served at `/<project>/FreeFormOX/` (same structure; own `manifest.json` + icons).
- `Launch/` + the repo-root `index.html` — the launcher (grid of the available apps), served at `/<project>/`. Its support files live in `Launch/`; the entry is the root `index.html`.
- `sw.js` — a **single site-wide service worker at the repo root**. It must live at
  the root because a service worker can only intercept requests inside its scope,
  and each app's assets are siblings of `shared/`. To add an app, add an entry to
  the `APPS` map in `sw.js`.

Each app folder is its own installable PWA; add one by copying the
`PlanMyDay/` folder shape (own manifest + icons) and registering `../sw.js`.

## Development

Serve the repo root locally, then open the app folder:

```
python -m http.server 8080
```

Then open <http://localhost:8080/PlanMyDay/>.

## Tests

Powered by [Playwright](https://playwright.dev).

### Install

```bash
npm install
npx playwright install chromium
```

### Run all tests

```bash
npm test
```

### Run only the regression tests

```bash
npx playwright test tests/pmd-regression.spec.js
npx playwright test tests/cmd-regression.spec.js
npx playwright test tests/qrlinks-regression.spec.js
npx playwright test tests/ffox-regression.spec.js
npx playwright test tests/launch-regression.spec.js
```

### Run a single test

```bash
npx playwright test tests/pmd-regression.spec.js --grep "test name"
```

### Useful flags

| Flag | Purpose |
|------|---------|
| `--headed` | See the browser window |
| `--ui` | Playwright UI inspector |
| `--debug` | Step-by-step with pause |
| `--workers 1` | Run serially (one browser at a time) |

### Test report

After a run, open the HTML report:

```bash
npx playwright show-report
```

### Coverage

JS coverage is collected automatically during tests (via `monocart-coverage-reports`). After running the tests, open the report:

```
coverage-report/index.html
```

### Screenshots

Screenshots use the structure `screenshots/<app>/<theme>/<light|dark>/<scene>.png`. The viewer also supports the legacy layout `screenshots/<app>/<theme>/<scene>.png`, which is shown as the synthetic `Default` mode.

Regenerate all PlanMyDay screenshots in `screenshots/pmd/<theme>/<light|dark>/`:

```bash
npx playwright test tests/pmd-screenshots.spec.js --workers 16
```

CountMyDays screenshots use `screenshots/cmd/<theme>/<light|dark>/`:

```bash
npx playwright test tests/cmd-screenshots.spec.js --workers 16
```

QRLinks, FreeFormOX and Launch use the corresponding `screenshots/qrlinks/`, `screenshots/ffox/` and `screenshots/launch/` galleries:

```bash
npx playwright test tests/qrlinks-screenshots.spec.js --workers 16
npx playwright test tests/ffox-screenshots.spec.js --workers 16
npx playwright test tests/launch-screenshots.spec.js --workers 16
```

### Screenshot viewer

Browse screenshots side by side in a browser:

```bash
node screenshots/viewer.js
```

The viewer opens at `http://localhost:3000` with separate **App**, **Theme** and **Mode** selectors. Theme includes `All themes`; Mode includes `All modes`, `Light` and `Dark`, plus `Default` when legacy data is present. Each accordion section is labelled with its app, theme and mode, and uses the mode directory for image URLs. The selected app, theme and mode are remembered in `screenshotViewerGallery`, `screenshotViewerTheme` and `screenshotViewerMode`.
