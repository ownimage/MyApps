### 1. Run full regression tests (main + contrast; contrast starts first, in parallel)
```bash
.\CleanTestServerStart.cmd && set "EXTERNAL_SERVERS=1" && set "SCREENSHOT_THEME=superhero" && npm test -- --retries=0 --workers=32 && type MyHID\server\coverage.txt && echo %date% %time%
```

### 1a. Run specific regression test
```bash
.\CleanTestServerStart.cmd && set "EXTERNAL_SERVERS=1" && set "SCREENSHOT_THEME=" && npx playwright test tests/form-field-states.spec.js --retries=0 --workers=32 && echo %date% %time%
```

### 2. Run full regression tests without the contrast suite
```bash
.\CleanTestServerStart.cmd && set "EXTERNAL_SERVERS=1" && set "SCREENSHOT_THEME=superhero" && npm run test:main -- --retries=0 --workers=32 && type MyHID\server\coverage.txt && echo %date% %time%
```

### 3. Run the contrast tests only
```bash
.\CleanTestServerStart.cmd && set "EXTERNAL_SERVERS=1" && npm run test:contrast && echo %date% %time%
```

### Re-run last failures
```bash
set "SCREENSHOT_THEME=superhero" && .\node_modules\.bin\playwright.cmd test --last-failed --retries=0
```
npx playwright test -g "your test name" --repeat-each=10
npx playwright test tests/pmd-regression.spec.js --repeat-each=100
npx playwright test tests/pmd-screenshots.spec.js
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

### Blender add-on tests (My HID Step Controls)
The add-on is Blender Python (`bpy`), so it is NOT collected by Playwright
directly - `tests/blender-addon.spec.js` runs it inside Blender from the JS suite,
so `npm test` (any shard included) covers it automatically. That wrapper SKIPS
with a clear reason when Blender is not installed; `BLENDER_EXE` overrides the
install it finds. Run the checks on their own with:
```bash
"C:\Program Files\Blender Foundation\Blender 4.4\blender.exe" -b --python MyHID\blender\test_step_controls.py
```
One `PASS`/`FAIL` line per check, exit code 1 on failure.

### HID control panel (mouse-capture.exe --ui)

The capture client serves a management API + QR page; the CONFIGURATION UI is in
MyHID (hamburger -> Manage mouse-capture). Build and run it:
```bash
# build (publish + bundle interception.dll); add -NoZip to skip the zip
powershell -NoProfile -ExecutionPolicy Bypass -File MyHID\mouse-capture\build.ps1

# demo/test the panel with NO driver installed (prints a "panel:" URL)
MyHID\mouse-capture\out\mouse-capture.exe --ui --simulate --no-tunnel --panel-port 0

# on the PC with the mouse: tunnel is opt-in
StartMouseCapture.cmd
StartMouseCapture.cmd --tunnel

# one box (server + capture), autoconfigured, no QR scan
StartMyHIDServer.cmd --mouse-capture
```
Its tests (the panel one spawns the built exe with `--simulate` and SKIPS when
`out/mouse-capture.exe` is missing):
```bash
.\node_modules\.bin\playwright.cmd test tests/mouse-capture-ui.spec.js tests/myhid-mouse-capture.spec.js --workers=3 --retries=0
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
npm run regen:image. Writes the shared gallery to `screenshots/sample-images.png`

```
Extract `sampleImages.json` back into native files in `sampleImages/`:
```bash
node shared/regen_sample_images.js extract
npm run extract:images
```
### Screenshots
Regenerate every gallery that EXISTS (all seven suites, in alphabetical order - the
apps without a gallery yet are SolarControlar, MyHID and the storybook).
ALWAYS pass `--workers 16`; add a new `tests/<app>-screenshots.spec.js` here, in
alphabetical position, when an app gains one:
```bash
.\CleanTestServerStart.cmd && set "EXTERNAL_SERVERS=1" && set SCREENSHOT_THEME=&& .\node_modules\.bin\playwright.cmd test tests/cmd-screenshots.spec.js tests/ffox-screenshots.spec.js tests/launch-screenshots.spec.js tests/lol-screenshots.spec.js tests/pmd-screenshots.spec.js tests/qrlinks-screenshots.spec.js tests/storyboard-screenshots.spec.js --workers 16
```
NOTE: do NOT "tidy" the list into a glob (`tests/*-screenshots.spec.js`) - neither
cmd.exe nor PowerShell expands it and Playwright does not glob CLI paths, so the run
silently collects **0 tests** (verified).
Screenshots use `screenshots/<app>/<theme>/<light|dark>/<scene>.png`; the viewer also reads legacy `screenshots/<app>/<theme>/<scene>.png` files as `Default` mode.
Scene filenames follow `<noun>-<verb>-<detail>` (`job-view-general`, `stream-add`, `minio-import`, `onedrive-open`); see AGENTS.md, Screenshots.
Run for ONE theme only (defaults to all 27 when the env var is unset; works for every screenshot spec above):

```bash
.\CleanTestServerStart.cmd && set SCREENSHOT_THEME=superhero&& .\node_modules\.bin\playwright.cmd test tests/cmd-screenshots.spec.js tests/ffox-screenshots.spec.js tests/launch-screenshots.spec.js tests/lol-screenshots.spec.js tests/pmd-screenshots.spec.js tests/qrlinks-screenshots.spec.js tests/storyboard-screenshots.spec.js --workers 16
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