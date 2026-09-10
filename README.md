# PlanMyDay

A static PWA for daily task planning.

## Layout

This repo is set up to host **multiple PWAs off one origin** (GitHub Pages
`ownimage.github.io/MyApps/`):

- `shared/` — the reusable library (components, services, themes, vendor, sample images).
- `PlanMyDay/` — this app, served at `/<project>/PlanMyDay/` (its own `index.html` + `manifest.json`).
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
npx playwright test tests/regression.spec.js
```

### Run a single test

```bash
npx playwright test tests/regression.spec.js --grep "test name"
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

Regenerate all screenshots in the `screenshots/` folder:

```bash
npx playwright test tests/screenshots.spec.js --workers 12
```

### Screenshot viewer

Browse all theme screenshots side by side in a browser:

```bash
node screenshots/viewer.js
```

Opens a local viewer at `http://localhost:3000` with accordion sections per theme, a unified horizontal scrollbar to compare screenshots across themes, and Open All / Collapse All buttons.
