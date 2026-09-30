### Run full regression test 
```bash
set SCREENSHOT_THEME=superhero&& .\node_modules\.bin\playwright.cmd test tests --retries=0 --workers=32
``` 
### Re-run last failures
```bash
set SCREENSHOT_THEME=superhero&& .\node_modules\.bin\playwright.cmd test --last-failed --retries=0
```
npx playwright test -g "your test name" --repeat-each=10
npx playwright test tests/pmd-regression.spec.js --repeat-each=100
npx playwright test tests/pmd-screenshot.spec.js
npx playwright test tests/launch-regression.spec.js
npx playwright test tests/qrlinks-regression.spec.js

### Bump the build number
Rewrites the timestamp in BOTH `shared/js/build-number.js` and `sw.js`. The worker is registered at a stable url (no `?v=`), so this byte change in `sw.js` is what makes the browser install a new worker and show "Update available" — both files must move together:
```bash
npm run bump:build
```
Or with an explicit `YYYYMMDDHHMM` timestamp:

### Serve the test origins
Starts both Vite test servers (8080 repo root, 8081 sub-path) from one process. Playwright reuses them, so a full run just needs this started once:
```bash
npm run dev:test
```
Then visit: <http://localhost:8080/storybook/index.html>

The chosen theme is remembered in `localStorage` (`storybook_theme`). Each section shows live demo instances; interactive bits (modal/page open, tab switching, stream-header expand, active toggles, card buttons) emit their normal composed events into the section's event log.

### SampleImages
```bash
npx playwright test tests/sample-images.spec.js --workers 1
```
Writes the shared gallery to `screenshots/sample-images.png`.

Regenerate `sampleImages.json` from the native files in `sampleImages/` (preserves
per-image metadata from the existing JSON and only updates the `data`):
```bash
node shared/regen_sample_images.js
npm run regen:image. Writes the shared gallery to `screenshots/sample-images.png`

```
Extract `sampleImages.json` back into native files in `sampleImages/`:
```bash
node shared/regen_sample_images.js extract
npm run extract:images
```
### Screenshots
```bash
set SCREENSHOT_THEME=&& .\node_modules\.bin\playwright.cmd test tests/cmd-screenshots.spec.js tests/ffox-screenshots.spec.js tests/launch-screenshots.spec.js tests/pmd-screenshots.spec.js tests/qrlinks-screenshots.spec.js --workers 16
```
Screenshots use `screenshots/<app>/<theme>/<light|dark>/<scene>.png`; the viewer also reads legacy `screenshots/<app>/<theme>/<scene>.png` files as `Default` mode.
Run for ONE theme only (defaults to all 27 when the env var is unset; works for every screenshot spec below).

```bash
set SCREENSHOT_THEME=superhero&& .\node_modules\.bin\playwright.cmd test tests/cmd-screenshots.spec.js tests/ffox-screenshots.spec.js tests/launch-screenshots.spec.js tests/pmd-screenshots.spec.js tests/qrlinks-screenshots.spec.js --workers 16
```

### Screenshot viewer
```bash
node screenshots/viewer.js
```

### Component storybook
The storybook is a static page (`storybook/index.html`) that renders every `smd-` and `pmd-` web component and lets you pick the bootswatch theme from a dropdown in the header.

```bash
cd p:\git
python -m http.server 9090
```
Then open http://localhost:9090/

### Code duplication check (PMD CPD)
PMD's Copy/Paste Detector finds duplicated code blocks across the repo. PMD is a
Java tool, so a JDK must be on `PATH` first. Install (no admin needed):

```powershell
# 1) A JDK. This box already has one; otherwise install from https://adoptium.net
$env:Path = "$env:USERPROFILE\.jdks\openjdk-24.0.1\bin;$env:Path"

# 2) PMD binary distribution -> %USERPROFILE%\tools\pmd
$ver = "7.28.0"
Invoke-WebRequest "https://github.com/pmd/pmd/releases/download/pmd_releases/$ver/pmd-dist-$ver-bin.zip" -OutFile "$env:TEMP\pmd.zip"
Expand-Archive "$env:TEMP\pmd.zip" -DestinationPath "$env:TEMP\pmd-x" -Force
New-Item -ItemType Directory "$env:USERPROFILE\tools\pmd" -Force | Out-Null
Copy-Item "$env:TEMP\pmd-x\pmd-bin-$ver\*" "$env:USERPROFILE\tools\pmd\" -Recurse -Force
```

Run it over the app + shared JS (vendor and generated dirs are excluded simply by
not listing them):

```powershell
& "$env:USERPROFILE\tools\pmd\bin\pmd.bat" cpd --minimum-tokens 100 --language ecmascript --format text --skip-lexical-errors --no-fail-on-error --no-fail-on-violation shared/js PlanMyDay/js CountMyDays/js QRLinks/js SolarControlar/js FreeFormOX/js Launch/js
```

Notes:
- `--minimum-tokens 100` sets the smallest duplicated block to report; lower it to surface shorter copies (much noisier). `--format text` is human-readable (also `csv`, `xml`, `markdown` via `-f`).
- `--no-fail-on-error` / `--no-fail-on-violation` keep the exit code at 0 so the command can run in a script; drop them to get PMD's codes instead (5 = parse/lexer error, 4 = duplicates found).
- Output groups look like `Found a 54 line (429 tokens) duplication in the following files:` followed by `Starting at line N of <path>` lines and the code block.
- PMD's ecmascript lexer SKIPS files containing certain non-ASCII characters (e.g. an em dash `—` inside a template literal). `--skip-lexical-errors` hides the error and continues; currently `CountMyDays/js/export.js` and `CountMyDays/js/import-wizard.js` are skipped for this reason, so duplication inside those two files is not reported.
- Last run (min 100 tokens): **0 duplication groups**. The earlier 22 groups were eliminated by (1) the `smd-app.js` app-shell helpers (`smdBindThemeChange`, `smdBindImagePicker` with `manageBackground`, `smdBindImageSelectActions`, `smdBindImagesEditor`, `smdEnablePullToRefresh`), (2) the shared settings-page framework (`smdGetSettingsSections`/`smdBuildSettingsPage`/`smdSetupSettingsPage`/`smdHideSettingsPage`/`smdToggleDangerRows`/`smdChangeShowDanger`/`smdApplyImageSize`/`smdConfirmClearAllData`), (3) `smdDownloadJson`/`smdReadJsonFile`, (4) the new `shared/js/smd-qr.js` (`window.SmdQr`) used by both QR components, and (5) merging `pmd-job-stream-card`/`pmd-job-search-card` into `pmd-job-summary-card`.