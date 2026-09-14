### Run only the regression tests
```bash
.\node_modules\.bin\playwright.cmd test tests --retries=0
```
```bash
.\node_modules\.bin\playwright.cmd test --last-failed
```
npx playwright test -g "your test name" --repeat-each=10
npx playwright test tests/pmd-regression.spec.js --repeat-each=100
npx playwright test tests/pmd-screenshot.spec.js
npx playwright test tests/launch-regression.spec.js
npx playwright test tests/qrlinks-regression.spec.js

```bash
python tests/http-server.py
```
### SampleImages
```bash
npx playwright test tests/sample-images.spec.js --workers 1
```
Writes the shared gallery to `screenshots/sample-images.png`.
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
```bash
.\node_modules\.bin\playwright.cmd test tests/pmd-screenshots.spec.js --workers 16
```
Writes per-theme screenshots to `screenshots/pmd/<theme>/`.
CountMyDays screenshots (own gallery):
```bash
.\node_modules\.bin\playwright.cmd test tests/cmd-screenshots.spec.js --workers 16
```
Writes to `screenshots/cmd/<theme>/`.
QRLinks screenshots (own gallery):
```bash
.\node_modules\.bin\playwright.cmd test tests/qrlinks-screenshots.spec.js --workers 16
```
Writes to `screenshots/qrlinks/<theme>/`.
Launch screenshots (own gallery):
```bash
.\node_modules\.bin\playwright.cmd test tests/launch-screenshots.spec.js --workers 16
```
Writes to `screenshots/launch/<theme>/`.

### Screenshot viewer
```bash
node screenshots/viewer.js
```
The header has a **Folder** selector to switch between galleries (e.g. `pmd`).

### Component storybook
The storybook is a static page (`storybook/index.html`) that renders every `smd-` and `pmd-` web component and lets you pick the bootswatch theme from a dropdown in the header.

Serve the project root, then open it in a browser. The existing dev server is reused, so just run:

```bash
python tests/http-server.py
```

Then visit: <http://localhost:8080/storybook/index.html>

The chosen theme is remembered in `localStorage` (`storybook_theme`). Each section shows live demo instances; interactive bits (modal/page open, tab switching, stream-header expand, active toggles, card buttons) emit their normal composed events into the section's event log.

```bash
cd p:\git
python -m http.server 9090
```
Then open http://localhost:9090/