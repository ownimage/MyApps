### Run only the regression tests
```bash
set SCREENSHOT_THEME=superhero&& .\node_modules\.bin\playwright.cmd test tests --retries=0 --workers=32
```
```bash
set SCREENSHOT_THEME=superhero&& .\node_modules\.bin\playwright.cmd test --last-failed --retries=0
```
npx playwright test -g "your test name" --repeat-each=10
npx playwright test tests/pmd-regression.spec.js --repeat-each=100
npx playwright test tests/pmd-screenshot.spec.js
npx playwright test tests/launch-regression.spec.js
npx playwright test tests/qrlinks-regression.spec.js

### Serve the test origins
Starts both Vite test servers (8080 repo root, 8081 sub-path) from one process. Playwright reuses them, so a full run just needs this started once:
```bash
npm run dev:test
```
### SampleImages
```bash
npx playwright test tests/sample-images.spec.js --workers 1
```
Writes the shared gallery to `screenshots/sample-images.png`.

### Bump the build number
Rewrites the timestamp in BOTH `shared/js/build-number.js` and `sw.js`. The worker is registered at a stable url (no `?v=`), so this byte change in `sw.js` is what makes the browser install a new worker and show "Update available" — both files must move together:
```bash
npm run bump:build
```
Or with an explicit `YYYYMMDDHHMM` timestamp:
```bash
node shared/bump-build.js 
```
Regenerate `sampleImages.json` from the native files in `sampleImages/` (preserves
per-image metadata from the existing JSON and only updates the `data`):
```bash
node shared/regen_sample_images.js
npm run regen:images
```
Extract `sampleImages.json` back into native files in `sampleImages/`:
```bash
node shared/regen_sample_images.js extract
npm run extract:images
```
### Screenshots
Screenshots use `screenshots/<app>/<theme>/<light|dark>/<scene>.png`; the viewer also reads legacy `screenshots/<app>/<theme>/<scene>.png` files as `Default` mode.

Run for ONE theme only (defaults to all 26 when the env var is unset; works for every screenshot spec below).

Windows Command Prompt:
```bat
set SCREENSHOT_THEME=superhero&& .\node_modules\.bin\playwright.cmd test tests/pmd-screenshots.spec.js --workers 16
```
Windows PowerShell:
```powershell
$env:SCREENSHOT_THEME="darkly"; .\node_modules\.bin\playwright.cmd test tests/pmd-screenshots.spec.js --workers 16
```
Writes PlanMyDay screenshots for just `darkly` to `screenshots/pmd/darkly/<light|dark>/`. The theme name is validated against the app's `themeConfig` (i.e. a bootswatch theme name).

```bash
.\node_modules\.bin\playwright.cmd test tests/pmd-screenshots.spec.js --workers 16
```
Writes PlanMyDay screenshots to `screenshots/pmd/<theme>/<light|dark>/`.
CountMyDays screenshots (own gallery):
```bash
.\node_modules\.bin\playwright.cmd test tests/cmd-screenshots.spec.js --workers 16
```
Writes to `screenshots/cmd/<theme>/<light|dark>/`.
QRLinks screenshots (own gallery):
```bash
.\node_modules\.bin\playwright.cmd test tests/qrlinks-screenshots.spec.js --workers 16
```
Writes to `screenshots/qrlinks/<theme>/<light|dark>/`.

FreeFormOX screenshots (own gallery):
```bash
.\node_modules\.bin\playwright.cmd test tests/ffox-screenshots.spec.js --workers 16
```
Writes to `screenshots/ffox/<theme>/<light|dark>/`.

Launch screenshots (own gallery):
```bash
.\node_modules\.bin\playwright.cmd test tests/launch-screenshots.spec.js --workers 16
```
Writes to `screenshots/launch/<theme>/<light|dark>/`.

### Screenshot viewer
```bash
node screenshots/viewer.js
```
The header has separate **App**, **Theme** and **Mode** selectors. Theme offers `All themes`; Mode offers `All modes`, `Light` and `Dark`, and adds `Default` only for legacy data. App, theme and mode choices persist in `screenshotViewerGallery`, `screenshotViewerTheme` and `screenshotViewerMode`.

The focused viewer test uses a temporary synthetic directory tree and does not generate screenshots:
```bash
.\node_modules\.bin\playwright.cmd test tests/screenshot-viewer.spec.js --workers=1 --retries=0
```

### Component storybook
The storybook is a static page (`storybook/index.html`) that renders every `smd-` and `pmd-` web component and lets you pick the bootswatch theme from a dropdown in the header.

Serve the project root, then open it in a browser. The existing dev server is reused, so just run:

```bash
npm run dev:test
```

Then visit: <http://localhost:8080/storybook/index.html>

The chosen theme is remembered in `localStorage` (`storybook_theme`). Each section shows live demo instances; interactive bits (modal/page open, tab switching, stream-header expand, active toggles, card buttons) emit their normal composed events into the section's event log.

```bash
cd p:\git
python -m http.server 9090
```
Then open http://localhost:9090/