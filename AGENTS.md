1: Ask questions if anything is not clear
2: Ask questions if there are implementation options
3: When running playwright use the command '.\node_modules\.bin\playwright.cmd' to make sure the correct version loads. 
4: Please capture all the output needed when running a test the first time so that you do not need to rerun the test.
5: `shared/js/build-number.js` `BUILD_NUMBER` is a TIMESTAMP in `YYYYMMDDHH24MI` format (e.g. `202609131400` = 2026-09-13 14:00); it is the single cache-busting version for every app + shared asset. BUMP IT WITH `npm run bump:build` (`node shared/bump-build.js`, optional explicit `YYYYMMDDHHMM` arg) — the script rewrites BOTH `shared/js/build-number.js` AND `sw.js` in one go. Never hand-edit the two apart: a bump is what ships a build. The worker is registered at a STABLE url (`../sw.js`, no `?v=` — a versioned url makes the app "update twice"), so a BYTE change in sw.js is the only signal that installs a new worker; `npm run bump:build` writes both in one go. If they ever do drift, the page detects it at runtime (GET_BUILD) and re-registers, so a forgotten bump self-heals instead of pinning users to the old build.
5: FULL-SUITE RUNS use the ITERATIVE PER-SHARD approach (2026-09-19, ALWAYS): play `--shard=$i/40 --workers=1 --retries=0 --reporter=line` with `EXTERNAL_SERVERS=1` (start `npm run dev:test` ONCE — one Vite process serves BOTH origins, 8080 root + 8081 sub-path — and verify both ports accept a TCP connection first) ONE SHARD AT A TIME in order: run shard 1/40, tell the user WHAT FAILED, fix every failure AND apply the same root-cause fix EVERYWHERE it can happen (use `--grep "a|b"` to re-verify just the fixed tests), then run shard 2/40, and so on. Report progress between shards. This catches a shared root cause in shard 1 instead of failing 30 shards; it also keeps the "wait" granularity small. Do NOT run the whole 40-shard batch blind. `--workers="50%"` also works for speed (or any worker ratio) — BUT be aware it raises infra failures (client ephemeral-port exhaustion in this box → mid-run `ERR_CONNECTION_REFUSED` / "Target page, context or browser has been closed"), so treat a burst of infra-style failures as spurious and re-run the affected tests before calling them real bugs. The old waves-of-10 recipe only applies if a parallel sweep is ever required again: 40 `--shard` processes would exhaust client ephemeral ports (`ERR_CONNECTION_REFUSED`), so build waves as `for ($start=1; $start -le 40; $start += 10)` over `$start..($start+9)` — NEVER `@(,@(1..10)),@(11..20),…`: that nests the first array (its `$i` becomes the whole wave) and `--shard` errors with "expected format current/all". Without `EXTERNAL_SERVERS=1` each Playwright process may start its own `tests/serve-tests.mjs`; `reuseExistingServer` makes a later process reuse one that is already listening, but the process that DID start it owns and kills it on exit. Config sets `retries: 1`, so always pass `--retries=0` while iterating. Fix a failure in one shard everywhere before continuing.
6: After fixing issues with the regression tests apply them to pmd-screenshots.spec.js and validate them using one theme only.
7: Fail-fast test iterations: after a code/test change, DON'T run a whole batch at once — run only the first 2-3 affected tests first (`--grep "a|b" --workers=2 --retries=0`) to debug on a small surface; grow the batch only once those pass. The config sets `retries: 1`, so pass `--retries=0` while iterating (otherwise failures take twice as long).
8: A change that ONLY touches `storybook/index.html` and/or `AGENTS.md` does NOT need the regression suite (or screenshot/sample-image specs). Just verify the storybook loads with zero console/page errors and no failed requests.
9: UPSTREAM APP COPIES: `temp/<AppName>/` (e.g. `temp/CountMyDays/`) holds the NEWER standalone version of that app. It is NOT a fork/branch — it is always a later version of the same app. When asked to "update to the temp version", do NOT copy the folder over the repo app: diff the temp sources against the repo app and port the new features/edits into the shared-library architecture (smd-page/smd-components, `smdKey()` storage prefix, root `sw.js` APPS entry, tests). Keep function/feature names close to temp where practical so the next port is a small diff.
10: AGENTS.md NOTES: whenever you discover something a future session needs (architecture decisions, gotchas, upstream workflow, test recipes), add a useful, dated note to AGENTS.md — not just a session-log line. Keep notes concrete (file paths, function names, exact commands) and delete/condense notes that have gone stale.
11: LIGHT-DOM CHROMIUM RULE (2026-09-19): a custom element whose CONSTRUCTOR appends child nodes to `this` (e.g. `this.appendChild(TEMPLATE.content.cloneNode(true))`) THROWS `NotSupportedError: Failed to execute 'createElement' on 'Document': The result must not have children` the moment an app creates it via `document.createElement(tag)`. Deferred, guarded append in `connectedCallback()` is safe; `attachShadow()` in the constructor is safe. This is why `shared/js/components/{smd-image-card,smd-image-select,smd-image-dropdown,smd-date-picker}.js` all build via `_build()` from `connectedCallback` (they were the last four hanging onto the constructor pattern and broke `cmd-regression.spec.js` test 444's images editor + the 3x "must not have children" pageerrors seen in test 615). When converting shadow→light DOM, ALWAYS move template cloning into `connectedCallback`, never the constructor. Watch for `setAttribute("hidden", "true"/"false")` too: `hidden` is a BOOLEAN attribute, so ANY presence hides the element (fine as `.hidden = true/false` property only); `CountMyDays/js/dates-editor.js` + `googleCalendarEditor.js` had this and it made every `cmd-date-card` 0x0/display:none.
12: THEME TEXT VARS ARE LIVE AGAIN (2026-09-19): the light-DOM refactor reduced `applySmdVars()` in `shared/js/smd-settings.js` to a no-op AND dropped `color: var(--smd-tab-text)` from the inactive-tab rule in `shared/css/styles.css` → inactive tabs fell back to hardcoded `#fff`, failing pmd-regression:641 "inactive tabs use the Bootswatch secondary button text colour" (white instead of the theme's `btn btn-secondary` text, e.g. `rgb(73,80,87)` on cerulean). RESTORED the REAL `applySmdVars()` (hidden `.btn btn-secondary` probe → publishes `--smd-tab-text` + the `--smd-{primary,secondary,success,danger,info,warning}-text` vars on `:root`) with `applyTheme()` re-running it on the theme `<link>` `load`, plus DOMContentLoaded + window `load` hooks; tab CSS now `color: var(--smd-tab-text, #fff)`. Rule: a light-DOM component sitting on a theme-coloured surface must consume `var(--smd-<variant>-text)` / `var(--smd-tab-text)` — NEVER a hardcoded colour — or it won't match the Bootswatch theme. The stubs `smdBootstrapStyle/smdBootstrapColor` are real functions again.
13: CONTRAST IS BAKED INTO THE THEME CSS (2026-10-19): no runtime code measures or repaints colours. Each theme's per-mode sheet carries a generated block (`smd-contrast:start` / `:end`); `tests/contrast-css.spec.js` fails when it drifts and `SMD_CONTRAST_FIX=1 npx playwright test --project=contrast --workers=1` regenerates it (the theme sheets carry NO explanatory comment - only the two markers and the generated rules; this is the regeneration recipe), while `tests/contrast.spec.js` asserts the rendered result meets WCAG AA 4.5:1 across all themes/modes and fails if anything injects a normaliser at runtime. The older centralized-generator design (2026-09-22: `SmdContrast`, `applySmdVars()`, published `--smd-on-*`/`--smd-*-text` variables, a hidden `smd-probe` element) and the 2026-10-18 runtime module at the same path are BOTH gone - do not reintroduce a runtime contrast layer. The generated rules treat a control's surface as the DARKEST extent of its `background-image` gradient (a flat `background-color` read hid slate dark's secondary button, whose ramp runs to #62686d), and sketchy + slate additionally make PRIMARY borrow the DANGER palette for `<smd-button>`/`<smd-tabs>` via a hand-written block ABOVE the markers (see that note).
14: STORYBOOK `_bound` GUARD FOR LIGHT-DOM COMPONENTS (2026-09-22): the pmd-* light-DOM cards/headers (`pmd-stream-header`, `pmd-stream-job-card`, `pmd-job-today-card`, `pmd-job-search-card`) each clone their template in `connectedCallback` under a `this._bound` flag, but their `attributeChangedCallback` used to gate `_render` on only `this.isConnected`. When the storybook's demo code does `host.innerHTML = '<pmd-stream-header ...>'` on an ALREADY-CONNECTED host, the HTML parser fires `attributeChangedCallback` for each attribute BEFORE `connectedCallback` clones the template, so `_render` hit missing nodes (`Cannot set properties of null (setting 'textContent')`, 45 page errors). Chromium's incremental parser inserts the element into the live tree (isConnected=true) before the upgrade finishes, so `isConnected` alone is NOT a sufficient guard. FIX (applied to all four): `attributeChangedCallback() { if (this._bound && this.isConnected) this._render(); }`. Rule: any light-DOM component that builds in `connectedCallback` must gate attribute-triggered renders on the built flag too, NEVER `isConnected` alone. Verify with `tests/storybook-regression.spec.js` (Storybook - Regression: boots with no console/page errors/no failed requests, component demos render their host elements, theme swap re-renders sections without page errors) — run it whenever storybook or the pmd-* components change.
15: Do not write non UTF-8 characters to AGENTS.md
17: ACCESS (2026-10-05): at the START of every session, ALWAYS ask for access to the WHOLE of `p:\git\MyApps` (the entire repo tree, not a subfolder) before reading, editing or running anything. Never assume the working directory or a partial scope is enough; confirm full-repo access first.
16: TDD IS THE APPROACH FOR FIXING ISSUES (2026-10-01): whenever you fix a bug or
    oddity in the app (drag-drop, theming, layout, edge cases, etc.), use
    TEST-DRIVEN DEVELOPMENT: FIRST write the regression test that reproduces the
    reported scenario, run it and confirm it FAILS on the old behaviour (red),
    THEN change the code, and confirm the same test PASSES (green) — do not just
    verify manually. "It works when I probe it" is not enough: without a test the
    exact same bug can silently come back in a later edit. Concretely:
    (a) write the test that reproduces the reported scenario (drag A1 to X,
    assert order/classes/render/scroll position), run it to see it fail on the
    current code, then fix, then re-run to see it pass;
    (b) if an existing test asserts the OLD behaviour, UPDATE it to the new
    behaviour in the same change (e.g. when the drop-target highlight was
    normalized, the "bottom half vs top half" assertions had to change);
    (c) after the fix + test, run the whole targeted spec (`--grep` the affected
    area, then the full spec) with `--retries=0` so flakes don't hide failures;
    (d) assert the RENDERED RESULT (final order, classes, computed styles,
    scrollTop), not just that no error was thrown. This repo's
    `tests/pmd-gantt.spec.js` grew the drag-drop and scroll-anchor regression
    sets exactly this way; keep that pattern for every future fix.
    (e) if a long-standing test fails only in a FULL run (not alone), it is
    usually a TIMING FLAKE in the test itself (e.g. an interval firing between a
    mid-action capture and the release that clears it) — fix the test to assert
    the invariant (e.g. "scroll stopped", two post-release samples equal) rather
    than masking it; re-run the full suite twice to confirm stability.
18: NEVER HARDCODE A DATE IN A TEST (2026-10-16, restating the 2026-10-05 rule
    because it was violated and cost a debugging round): compute every date at
    RUN TIME from `new Date()` (`today + N` / `today - N`), or compare the value
    only against ITSELF / a mocked payload. A fixed date does not just "go stale"
    — it can silently move LAYOUT. Real failure: `pmd-gantt` seeded
    `sleepUntil: "2026-10-05"` while other jobs started at today; the chart range
    begins 2 days before its earliest job, so each passing day shifted the
    today-based bars one 44px column right until their labels reached x=1269 on a
    1280px viewport. `document.elementFromPoint` then returned null and
    `parse(null).slice` threw `TypeError: Cannot read properties of null`.
    AUDIT (`rg '20[0-9]{2}-[0-9]{2}-[0-9]{2}' tests/`): a literal is OK only when
    (a) it is echoed straight back out of a mock, (b) it is intentionally PAST
    (2020-01-01, 2000-01-01) and asserted as such, (c) it is a display-only fixture
    (Minio XML `LastModified`), or (d) every expectation is DERIVED from that same
    literal (the Gantt weekend-phase base). If any assertion compares it to "now",
    or if the value drives a POSITION/size, it is a time bomb. Bundled sample data
    with fixed dates is the same trap — rewrite one cached event to `today + 7`
    (see `cmd-regression` "loads sample Google data..."). Also guard the test so a
    bad sample fails clearly (`parse()` throws `not a colour: ...`, and clamp
    off-viewport sample points into the viewport).

## Self-improving playbook
At the START of every session, read this file fully and apply all rules.

At the END of every session (or once a task is complete), BEFORE finishing, do the following:
1. Add a dated entry under "Session log" below with:
   - What was done
   - What worked
   - What did not work
   - Anything learned that improves future work
2. Update any stale rule above that no longer matches reality.
3. Keep this file concise. Remove or condense entries that are no longer useful.

Keep this file up to date with things that will improve the project.
If there are ways to run code for test purposes that do or do not work, note them in here so you learn from them.

## Project status & useful techniques

Architecture:
- Dialog system is custom-web-component based. Only remaining bootstrap modal: `imageEditModal`.
  - `smd-modal` = a shared custom element driven by `showSmdModal(options)`; it renders light-DOM `.smd-overlay`, `.smd-dialog`, `.smd-header`, `.smd-body`, and `.smd-footer` markup, and buttons emit `smd-modal-action`. Styles live in `shared/css/styles.css`.
  - `smd-page` = full-screen overlay pages: `settingsPage`, `streamsEditor`, `jobSearchEditor`, `imagesEditor`, `jobEditPage`, `streamEditPage`, `minioImportPage`, `imagePickerPage`. Footer buttons fire `smd-page-action` (`cancel`/`done`/`add` etc).
  - z-index stack: smd-page 1040 < smd-modal 1050. `imagePickerPage` is an smd-page and uses the page layer; no z-index hacks are needed.
- Shared components are LIGHT DOM. `shared/css/styles.css` now holds ONLY theme colour + spatial-size declarations; every layout MECHANIC (display/flex/position/gap/margin/padding/transform/transition/border-reset/cursor/opacity) lives in the component's own `injectSmdComponentStyle()` block (or, for the app shell, `injectSettingsLayout()` in `shared/js/smd-settings.js`). Do not reintroduce constructable stylesheets or shadow-root styling for these components. `smd-modal`, `smd-page`, `smd-tabs`, and the pmd-* cards expose stable light-DOM classes for shared selectors and tests. `smd-tabs` tab definitions may include `panelClass` (for example `no-padding`) for panel-specific layout.
- Colour/typography conventions: smd-tabs active = `--bs-primary`, inactive = `--bs-secondary`, with `#smd-app` scoping for priority; the Streams Editor header is `--bs-primary` when expanded and `--bs-info` when collapsed; modal/page headers use theme surfaces (`--bs-body-bg`, `--bs-secondary-bg`, `--bs-border-color`) rather than hardcoded colours. Bootstrap/Bootswatch remains authoritative; the runtime contrast layer is not used.
- TYPESCALE TOKENS (2026-09-18): one shared ramp in `shared/css/styles.css` — `body { --smd-type-base: 1rem }` plus `body.font-size-xsmall/small/large/xlarge/jumbo` overrides (0.8/0.925/1/1.125/1.3/1.6rem) — drives exactly four tokens `--smd-type-badge` (base×0.75), `--smd-type-p` (base), `--smd-type-h2` (base×1.25), `--smd-type-h1` (base×2), all declared on `body` (NOT `:root`: the ramp must recompute per font-size body class, and body custom props pierce shadow DOM while `:host-context()` doesn't). Tag map: h1→h1; h2/h3/h4→h2; h5/h6→p; text/inputs/tables→p; badges→badge. BUTTONS ARE h2 (one step above text): `<button>`, `.btn`, `.smd-tab-btn` all use `var(--smd-type-h2)`; `.btn-sm` stays at `var(--smd-type-p)`. Light-DOM home is `shared/css/styles.css` (`button, .btn` / `.btn-sm`); the shared `btnBadgeSheet` covers shadow buttons. Scaffold the h2/p rules inline wherever a shadow root does NOT adopt btnBadgeSheet: the 4 apps' `editor-styles.js`, `smd-settings.js`, `smd-minio.js`, `smd-modal.js`, `smd-image-picker.js`, `smd-image-dropdown.js`. Don't re-add per-component `.btn` font-size rules. Every component + app style now uses `var(--smd-type-*, original-value)` (original as fallback so behaviour is unchanged wherever the token is missing). Media-fit sizes are token CALCs (e.g. CM/QR title `calc(var(--smd-type-h1,1.5rem)*0.7667)`, CM count `*0.8333`, CM container h1 `*0.625`, Solar 480px block). Compact density = `--…-title-size: var(--smd-type-p)` overrides. Deliberate non-token exceptions: the 22px hamburger icon in `smd-app.js`, `smd-checkbox` 1.2em/2em + `smd-draghandle` FIXED 1.2rem/1.6rem touch sizes, vendor CSS, storybook chrome. Tests assert heading ELEMENT tags (now `h1` for main-view date/"Today!"/"From …" headings) and pmd-touch.spec.js:119 asserts the NEW pixel values (xlarge 41.6, jumbo 51.2, compact-jumbo 25.6) — update those literals together with any ramp change.
- THEME TEXT COLOURS (2026-09-12): shadow-DOM buttons/tabs cannot use Bootswatch's `.btn-*` rules (document CSS doesn't cross the boundary, and `--bs-btn-*` is set on the `.btn-*` element, not `:root`). `applySmdVars()` reads a hidden light-DOM `<button class="btn btn-<variant>">` probe (`smdBootstrapColor()`) and publishes `--smd-primary/secondary/success/danger/info/warning-text` + `--smd-tab-text` on `<html>`; every shadow `.btn-*`/variant uses those vars. `applyTheme()` re-runs `applySmdVars` on the theme `<link>`'s `load`. Never hardcode white text for a theme-coloured surface; if Bootswatch's own `.btn-*` rule disagrees with its `--bs-btn-color` var (e.g. cerulean's later `.btn-secondary { color: ... }`), the probe wins — always match the probe.
- BADGES (2026-09-12): use the shared `<smd-badge variant="primary|secondary|success|danger|warning|info|light|dark" pill?>` component everywhere — never a `<span class="badge bg-*">` (Bootstrap's badge vars live on the `.badge` element and can't reach shadow roots). `applySmdVars()` probes a hidden light-DOM `.badge.text-bg-<variant>` (`smdBootstrapStyle()`) and publishes `--smd-badge-<variant>-{bg,text}`; the component's own sheet consumes them, so text colour follows Bootswatch exactly (white on cerulean's navy info, black on its light secondary, etc.). `btnBadgeSheet` now only carries `.btn*` rules despite its name; `smd-page`'s badge/bg rules were removed.
- PWA TITLE BAR COLOUR (2026-10-24): Windows 11 paints an installed PWA's
  title bar from the manifest `theme_color`; the page's
  `<meta name="theme-color">` overrides it once loaded. There is NO manifest
  option for "follow the OS accent" (W3C manifest issue #695); omitting
  `theme_color` gives the OS default but also loses the mobile/task-switcher
  branding. CHOSEN FALLBACK: the meta follows the app's TOP-BAR SURFACE,
  `--bs-body-bg`, so the OS title bar matches the in-app menu bar and follows
  BOTH theme and mode. Do NOT use `--bs-secondary`: Yeti's secondary is #eee in
  light AND dark (dark title bar went white) and superhero's #4e5d6c does not
  match its navy bar. `applyThemeColor()` + `smdRefreshThemeColor()` /
  `smdBindThemeColorLink()` in `shared/js/smd-settings.js` read the live
  `--bs-body-bg` and re-run when a theme/mode sheet's `load` fires;
  `applyTheme`/`applyThemeMode` call them. STATIC `theme_color`/meta values are
  only the pre-load/install default - the old Android green `#3ddc84` was the
  reported "weird green", now `#212529` in the Launch and PMD/CMD/LoL/QRLinks
  manifests + metas (other apps keep their brand colour until the meta loads).
  Chromium updates an installed app's manifest theme_color on a later launch
  after its windows close; the page meta takes effect when the page loads.
  Test: `tests/pwa-theme-color.spec.js`.
- WINDOW CONTROLS OVERLAY (2026-10-24, user request): ALL 9 manifests opt in
  with `"display_override": ["window-controls-overlay"]` (keep
  `"display": "standalone"`). The overlay is USER-enabled (PWA menu -> Hide
  title bar) and starts OFF; the app cannot force it, so the normal nav row must
  keep working. `smdInitWindowControlsOverlay()` in `shared/js/smd-app.js`
  toggles `body.smd-wco` from `navigator.windowControlsOverlay.visible` on init,
  `geometrychange` and the `(display-mode: window-controls-overlay)` media
  query. CSS in `injectSettingsLayout()` (smd-settings.js) then moves
  `#mainNav` into the strip (`env(titlebar-area-x/y/width/height)`, 33px
  fallbacks), gives body the same `padding-top`, pins `transform:none
  !important`, drops the auto-hide container padding, and marks the nav
  `app-region: drag` with every button/link/input/`.dropdown`/`.dropdown-menu`
  `no-drag`. CONSEQUENCE: the Auto-hide menu setting is irrelevant while the
  overlay is on (nav is always in the title bar), but works again when off.
  GOTCHA: don't put `overflow:hidden` on the nav - it clips the hamburger
  dropdown. Storyboard's left rail sits directly under the title-bar hamburger,
  so `body.smd-wco #sbToolbar { top: 24px }` (storyboard.css) doubles its normal
  12px inset; the web app keeps 12px. Tests: `tests/wco.spec.js` (all manifests;
  Storyboard title-bar geometry + body inset + rail gap >= 24px + hamburger
  opens + `hideNav()` cannot slide it; transition off restores the row and the
  12px rail inset; PlanMyDay shell).
- IMAGE DROPDOWN (2026-09-18): the shared `<smd-image-dropdown>` (`shared/js/components/smd-image-dropdown.js`) is the generic image+name picker — the old PlanMyDay `pmd-stream-select` was folded into it and deleted. It is DATA-driven, not DOM: host sets `options = [{name, image}]` (image OPTIONAL → text-only rows, e.g. CountMyDays' no-image "All") and `selected` = the chosen option's NAME string; picks dispatch `smd-image-dropdown-change` ({ name }). Listener wiring: CountMyDays `#dateCategoryFilter` (`smd-image-dropdown-change` → `setDateCategoryFilter`, "" for All) in `dates-editor.js`; PlanMyDay `#jobStreamDropdown` (name mapped back via `streamIndexByName` in `editor-common.js`). Stable shadow ids for test locators: `smdImageDropdownBtn`, `smdImageBtnIcon`, `smdImageBtnText`, `smdImageDropdownMenu`. Its colours come from the `--smd-dropdown-*` palette in the shared MODE layer (`shared/css/themes/light.css` + `dark.css`), which since 2026-10-13 mirrors the form-field palette (`--smd-form-*`) for surface/label/border and does NOT change colour on hover (the closed control is field-like); a theme overrides in `shared/css/themes/<theme>/<theme>.<mode>.css` (superhero, cyborg, darkly do) — see the 2026-09-26 (c) and 2026-10-13 (e) session notes. GOTCHA (2026-10-13): the palette only sets `background-color`, so a theme whose stock `.btn` ALSO sets `background-image: var(--bs-gradient)` shows a white sheen over a dark button; materia is the only such theme and clears it with `#smd-app smd-image-dropdown .btn { background-image: none }` (the `#smd-app` scope is needed to beat the theme's `.btn:focus-visible` re-apply).
- SMD-SELECT (2026-10-13): new shared `shared/js/components/smd-select.js` (`<smd-select>`) — a text-only custom dropdown with a `<select>` SHAPE (its button reuses Bootstrap's `.form-select`, so it inherits the shared `--smd-form-*` repaint) but a THEMED menu, because a native `<select>`'s open list is OS-rendered and cannot be CSS-styled cross-browser. API: `options = [{value,label}]`, `value` (reflected as an attribute for tests), attributes `disabled`/`value`, event `smd-select-change` ({value,label}); stable hooks `.smd-select-btn`, `.smd-select-item[data-value]`, `.smd-select-item.active`. The HOVERED row gets its primary surface from a CSS `:hover`/`:focus-visible` rule on `.smd-select-item` (so it ALWAYS shows), and the SELECTED row gets `.text-bg-primary`; the component ALSO adds `.text-bg-primary` to the hovered row so the theme's primary BUTTON variant supplies the correct contrast text (brite keeps BLACK text; a plain `--bs-primary`+white is unreadable there). Menu `z-index: 1030` (above Bootstrap `sticky-top` 1020, below smd-page 1040 / modal 1050). Rows are `<a>` so they need `text-decoration: none`. `<smd-theme>` now uses it for the Theme / Theme Mode fields (was a native `<select>`). Registered in all 8 shells AFTER `library.js` and BEFORE `smd-theme.js`, plus `sw.js SHARED_ASSETS`; tests drive it with `tests/theme-controls.js` `pickOption(page, control, value)` which clicks `.smd-select-item[data-value="…"]`. MIGRATION ENABLERS (2026-10-13): `<smd-select>` also (a) dispatches a bubbling `change` event so an existing inline `onchange="fn(this.value)"` keeps working after the tag swap, (b) reads declarative `<option>` children into `options` (then removes them), (c) drops a leftover `form-select`/`form-select-sm` class from the HOST (the inner button carries the look), (d) supports `w-auto` (shrink-to-fit) and basic keyboard nav (Arrow/Enter/Escape). So migrating a static `<select>…</select>` is literally two edits: `<select id=` → `<smd-select id=` and `</select>` → `</smd-select>`. PHASE 2 DONE: every appearance-settings select in the 7 shell `index.html`s (font/icon/density/touch size, slide duration, CM format + max countdowns, PMD suffix-start/jan1/monday/start-week, FFox x/o piece style) is now `<smd-select>`. PHASE 3 DONE: SolarControlar `#log-file` (files-tab) + `#graph-date` (graph-tab) and PhoneButtons `#buttonKeyNamed` + `#buttonPressSelect` (edit-layout). GOTCHA: a declarative `<option>` set leaves its inter-tag WHITESPACE text nodes in the host, so `_build()` clears all children (`this.textContent = ""`) and the template string is whitespace-free (otherwise a stray line/space shows in the host). When migrating a select whose OPTIONS ARE REBUILT in place, set `.options` — never `.innerHTML`/`appendChild(<option>)`, which would wipe the component (that is why `graph-tab.js` `loadGraphDates` now assigns `.options`). PHASE 4 DONE: CountMyDays date/category editors (`#dateDaySelect`/`#dateMonthSelect`/`#dateTypeSelect`/`#gcalCategorySelect`) and the export/import wizards (`#imgExistingSelect`/`#catExistingSelect`/`#dateExistingSelect` + the export category filter); `<smd-select>` gained a `disabled` getter/setter (the wizards assign `.disabled`). PHASE 5 DONE: PMD job editor `#jobTimeHour`/`#jobTimeMin` + the dayType/mod selects (tag swap, `<option>` markup kept) and the Schedule MODAL `#schedNInterval`/`#schedNOffset`/`#schedMonthlyDay` (which are JS-POPULATED, so `openScheduleModal`/`onScheduleNDaysChange` now assign `.options`). PHASE 6 DONE: storybook `#ctrl-modal-buttons`/`#ctrl-image-theme`/`#ctrl-image-size` and cardViewer `#cardSelect`/`#themeSelect` (JS-populated → `.options`); `<smd-select>` also maps `form-select-sm` / `size="small"` onto the inner button, and `storybook/cardViewer.html` now loads `smd-select.js`. ROLLOUT COMPLETE — no native `<select>` remains in the app shells or storybook (the dev-only `screenshots/viewer.js` output tool is deliberately untouched).
- SMD-IMAGE-DROPDOWN CLOSED-STATE LAYOUT (2026-10-04): the closed button
  LEFT-ALIGNS its label right next to the image and sizes itself to the WIDEST
  option. Every option label is stacked in ONE hidden `.sizer` grid cell inside
  the `.labels` grid (`text-align:left`, `gap-2` = 8px), so the button does not
  resize as the selection changes and the title ellipsises on a narrow column.
  `.labels` children (incl. `.sizer`) need `min-width:0; overflow:hidden` or the
  grid's min-content is the widest label and it refuses to shrink. On the Edit
  Job page the button is `width:fit-content; max-width:100%` (the old
  `min-width:14em` is gone); CountMyDays' inline `min-width:180/220px` and the
  stream tab picker's `13.5em` still win, so those usages are unchanged.
  `smd-image-select` now top-aligns its thumb (`align-items:flex-start` +
  `.thumb { margin-top: calc(0.375rem + 1px) }`, matching the dropdown button's
  padding+border) so its image lines up with the dropdown image with OR without
  a job image; the Edit Job Image wrapper is deliberately NOT `align-items-center`.
  MENU THUMBNAILS MATCH THE BUTTON (2026-10-23): every `.item .thumb` is the
  SAME square as the closed button's image (`SmdImage.defaultSize`, i.e. the Icon
  size setting), NOT a fixed `1.5rem`. Each option renders an `<smd-image>`
  (`flex:none` in the component sheet) and a no-image option gets an EMPTY
  `<smd-image>` inside `.thumb.thumb-blank` so the column stays aligned and
  follows the setting. Do NOT reintroduce a fixed wrapper width: as a flex item
  the image shrinks in WIDTH only, giving a 24x50 host whose Font Awesome glyph
  is clipped and whose 300x60 upload is squeezed to 24x4.8. Guards:
  pmd-regression "menu thumbnails match the closed button..." and "the widest
  Font Awesome glyph (fa:braille) fits the menu thumbnail".
- PMD TASKS (2026-09-26): the PlanMyDay job-edit Tasks list is the `PlanMyDay/js/components/pmd-tasks.js` component `<pmd-tasks>` (light DOM, host id `#jobTasksList`). DATA-driven: host sets `tasks = [{description, done, note, noteOpen}]` + the `read-only` attribute; it renders `.task-row`/`.task-note-row` keeping every id/class the suite targets (`.task-drag-card`, `.drag-handle`, `.task-done-cb`, `.task-desc-input`, `.task-note-btn`, `#taskNoteRow<i>`), and dispatches `pmd-task-change` ({index, field, value}, field done|description|note), `pmd-task-note-toggle` ({index, open}) and `pmd-task-delete` ({index}). `job-editor.js` `getJobTasksTabHTML` emits `<pmd-tasks id="jobTasksList" [read-only]>`; `renderJobTasks()` just sets `el.tasks = jobsBuffer.tasks`, toggles the top Add button and re-inits Sortable; `buildJobEditPage` calls `renderJobTasks()` for BOTH modes. The 3 events are wired on `#jobEditPage` in `app.js` -> `jobTaskField`/noteOpen/`jobDeleteTask`. `jobTaskToggleNote`/`taskNoteOpen` were deleted; `setTaskNoteBtnClass` stays (jobTaskField). Registered in `PlanMyDay/index.html`, `sw.js` APPS and the storybook (+section, nav count 31->32). Row colours come from the `--pmd-tasks-row-{background,foreground}` palette at the top of `shared/css/styles.css` (superhero overrides background to `--bs-dark`); see the 2026-09-26 (d) note.
- Quartz's "glassmorphism" overrides live in `shared/css/styles.css` (`.modal-content`, `.dropdown-menu`).
- REPO/PWA LAYOUT (2026-09-10): the repo hosts **multiple PWAs off one origin**
  (`ownimage.github.io/MyApps/…`). `shared/` = library; each app lives in its own
  top-level folder (`PlanMyDay/`, future `CountMyDays/`, …) with its own
  `index.html` + `manifest.json` (relative `start_url`/`scope: "."` → that app's
  URL; own `icon-192.png`/`icon-512.png`). There is **ONE service worker, `sw.js` at
  the repo root**, registered by every app as `../sw.js` (scope = repo root, e.g.
  `/MyApps/`). It must be at the root: a SW can only intercept URLs inside its
  scope, and app assets are siblings of `shared/`, so a per-app SW couldn't cache
  shared. `sw.js` has a `SHARED_ASSETS` list plus an `APPS` map (`"PlanMyDay/": [shell files]`);
  adding an app = add an `APPS` entry. Fetch handler caches by PATHNAME with
  `ignoreSearch`; offline navigate fallback is APP-AWARE (`appIndexFor(pathname)`
  → that app's `index.html`). Cache name is `myapps-<BUILD_NUMBER>`.
  Activation is USER-DRIVEN (no `skipWaiting()` on install; page shows an
  "Update available" `smd-modal`; `window.__pmdSwUpdater.showUpdatePrompt` test
  hook; `controllerchange` only reloads after the user chose to update).
  DISMISSAL IS PERSISTED (2026-09-17): each app's inline SW block stores the
  dismissed pending SW's `scriptURL` in `localStorage["swUpdateDismissedUrl"]`
  (one shared key — it's the same root SW) so "Later" isn't re-prompted on the
  next reload; "Update now" clears it. `__updatePrompted` stays as the in-load
  fast path.
  REGISTER AT A STABLE URL (2026-09-18; re-verified 2026-09-25): the apps
  register `../sw.js` (the Launch app `sw.js`) with NO `?v=` cache-buster, via
  `smdRegisterServiceWorker(path)` in `smd-settings.js` (falls back to a plain
  `register(path, { updateViaCache: "none" })` if that module is missing), and
  each shell also sets `reg.updateViaCache = "none"` (a persisted, per-
  registration setting, so sw.js is never reused from the HTTP cache).
  A VERSIONED script url is the DOUBLE-UPDATE bug and must not come back. A
  changed `?v=` does guarantee a new worker, but the common flow installs TWO for
  one bump: the focus/load `reg.update()` reuses the INCUMBENT's url, so it
  installs the new sw.js bytes under the OLD `?v=old`; the user accepts, the page
  reloads onto the new build, and `register("?v=new")` differs from that worker's
  url, so the browser installs a second one and prompts again (traced against the
  W3C spec: `Update` installs whenever the script url differs; `Install`
  terminates the previous waiting worker, so the two updates are sequential, not
  concurrent). The 2026-09-18 verification was right.
  With a stable url the only update signal is a BYTE change in sw.js, so its
  inline `BUILD_NUMBER` must be bumped with `shared/js/build-number.js` every
  time (rule 5) — importScripts files are NOT part of the comparison. The cached
  app shell is served cache-first by pathname, so a returning user keeps running
  the OLD build until the new worker is accepted; that is expected, and
  `reg.update()` on load + `focus` is what surfaces it promptly instead of
  waiting for the browser's throttled (~daily) check.
  DRIFT SELF-HEAL (2026-09-25): the page verifies the invariant instead of
  trusting it. `smdCheckServiceWorkerBuild(reg)` asks the controlling worker
  `{type:"GET_BUILD"}` (answered in sw.js with `{type:"BUILD", build, cache}`) and
  compares it with the page's own `BUILD_NUMBER`. If the PAGE is newer than its
  worker the two files were edited apart; nothing would ever replace that worker
  (its bytes no longer change), so the page unregisters once and reloads, guarded
  by `localStorage["smdSwDriftReloadedFor"]` so it cannot loop. The new worker's
  activate step then deletes the stale `myapps-<old>` cache. A worker NEWER than
  the page is just a pending update, so it only logs a warning.
  "NO CACHE" MODE (2026-09-27; ON EVERY APP SINCE 2026-10-18): the Danger tab's
  "No Cache" switch
  (`#noCacheRow`, key `smdKey("noCache")`) that makes the worker read every file
  from disk instead of the precache, so a fresh deploy is visible on the next
  load. It is a worker MODE, not an unregister: `serveNetworkFirst()` re-fetches
  with `cache: "no-store"` (bypassing the HTTP cache too), still writes the entry
  back, and still falls back to the cache when the network is gone, so offline
  keeps working. `smdSetNoCache` persists the flag, posts `SET_NO_CACHE`, and
  `changeNoCache` reloads afterwards (files already fetched this load predate the
  flip). THE FLAG LIVES IN CACHE STORAGE (`myapps-flags` cache,
  `/__myapps_no_cache__` entry), not in a worker variable: a worker is killed
  between visits, so an in-memory flag would silently revert to cache-first. That
  cache is in the `activate` allow-list — dropping it from `activePrefixes`
  deletes the setting on the next activation. `smdPushNoCacheToWorker` re-asserts
  it on every boot from `smdRegisterServiceWorker`. (`smdWorkerNoCache` and its
  `GET_NO_CACHE` read-back message were removed 2026-09-28 as unused; the
  regression test now reads the worker-written `myapps-flags` entry directly.)
  `/smd-img/` user images stay
  cache-ONLY even in this mode: the network has no file at that path, so falling
  through would blank every stored image. Tests: "No Cache danger switch makes the
  worker read every file from disk" and "No Cache mode serves files from the
  network, not the precache" (the latter proves it by response DATE, because
  `tests/serve-tests.mjs` snapshots files at startup and cannot serve changed
  bytes).
  The "Later" dismissal is build-aware: the pages store
  `swUpdateDismissedBuild` (= the page's BUILD_NUMBER at press time) alongside
  `swUpdateDismissedUrl` and only suppress the prompt when
  `swUpdateDismissedBuild` equals the current page build, so one "Later" no
  longer silences every future update forever (needed precisely because the
  script url is stable and can no longer identify a build).
  `BUILD_NUMBER` is STATIC in `shared/js/build-number.js` — bump it to ship a new
  build (the sw.js mirror changes with it, which is what installs the new worker
  and names the `myapps-<BUILD_NUMBER>` cache). All same-origin ASSET LOADS are
  cache-busted with `?v=BUILD_NUMBER` (head `<script>` stamps `<link href>`;
  vendor/component scripts use `document.write(...?v=…)`; `applyTheme()` stamps
  theme swaps; `sampleImages.json` fetch is versioned). The fetch handler serves a
  `?v=` stamp the worker does not recognise network-first, so a page that ends up
  ahead of its worker still gets fresh bytes instead of `ignoreSearch` matches
  from the old cache.
- LAUNCH APP (2026-09-13): the app launcher's entry is the **repo-root
  `index.html`** (served at `/MyApps/`); its support files live in `Launch/`
  (`manifest.json` with `start_url`/`scope: "../"`, `icon.svg` + generated PNGs,
  `js/app.js`). It shows a grid of app tiles and has a settings page (theme, image
  size, BMC, share QR, FontAwesome credit) using the shared theme engine +
  `smd-tabs`/`smd-page`. `SmdConfig.storagePrefix = "launch_"`. `sw.js` has an
  `APPS["Launch/"]` entry whose list includes the root `"index.html"`;
  `appIndexFor()` maps the repo root (and unknown paths) to `"index.html"`, and
  `/Launch/...` also falls back to the root index.
  APP LIST + MENU CONFIG MOVED 2026-10-15: the grid is no longer driven by a local
  `LAUNCH_APPS` array — it reads `SmdApps.launchApps()` from `shared/js/smd-apps.js`
  (see the LAUNCH APP MENU / APP REGISTRY note below). The hamburger menus no
  longer carry a plain Launch link: each app's Launch item becomes a flyout group
  header built from the shared config.
  TILE ICONS (2026-09-17): each registry entry's `icon` is a **shared sample-image
  NAME** ("Plan My Day"/"Count My Days"/"QR Links"/"Solar Controlar"/"Noughts &
  Crosses"/"List of Lists"/"Phone Buttons"/"Launch"), rendered with
  `<smd-image key-prefix="shared-">` (NOT a raw file path). The Launch page loads
  `shared/js/smd-images.js` and calls
  `seedSampleImages()` at boot; `renderAppGrid()` sets a `setInterval` that
  calls `smd-image.refresh()` once `shared-images` is populated (first-visit
  async seeding). There is NO explicit `size` on the tiles — they follow the
  `launch_iconSize` setting via `SmdImage.setDefaultSize` (applied by
  `applyImageSize()`).
  ADDING A LAUNCH TILE (2026-10-15, supersedes 2026-10-14) = add a row to
  `shared/js/smd-apps.js` `APPS` (name, description, path, icon — `icon` is a
  shared sample-image NAME), then update `tests/launch-regression.spec.js`
  `EXPECTED_TILES` (text + href + `toHaveCount`), the "every app's menu shows the
  Launch submenu" `EXPECTED_MENU`, the `ALL_APPS` list in the Launch Menu tab
  describe, and add the new shell to `SHELL_CASCADE`. The grid AND the Launch
  submenu are now data-driven (order + visibility come from the `launch_appMenu`
  config), so no `app.js` edit is needed for a new app.
- LAUNCH APP MENU / APP REGISTRY (2026-10-15): the app list and the Launch menu
  order/visibility live in ONE shared module, `shared/js/smd-apps.js`
  (`window.SmdApps`), loaded (before the app's own `js/app.js`) by all 8 shells
  and in `sw.js SHARED_ASSETS`. `SmdApps.APPS` is the registry
  (name/description/path/icon; `path` is relative to the repo root, Launch itself
  is `""`). The config is the ORIGIN-WIDE key `launch_appMenu` = ordered
  `[{path,onLaunch,onMenu}]` (unknown paths dropped, new apps appended with both
  ticks ON). API: `entries()`, `launchApps()`, `menuApps()`,
  `setFlag(path,field,value)`, `reorder(paths)`, `href(path)`. `href()` derives the
  relative base ONCE from the module's own `document.currentScript.src` (the same
  trick `smd-app.js` uses for SMD_SHARED_ROOT), so the SAME function serves the
  Launch grid (repo root) and the sub-app menus (one level down) — no
  caller-specific prefix. Launch's settings gained a second tab "Menu"
  (`#appMenuList`) rendering one `<launch-app-menu>` per app
  (`Launch/js/components/launch-app-menu.js`): drag handle + icon + title on the
  LEFT, TWO STACKED labelled `smd-checkbox`es on the right ("Launch" = show on the
  grid, "Menu" = show in the Launch submenu); `renderAppMenuTab()` + Sortable
  persist order/ticks, and the grid (`renderAppGrid`) renders `SmdApps.launchApps()`
  in the Menu order. Every app's static `<li><a class="dropdown-item"
  href="../">Launch</a></li>` is REPLACED at boot by `SmdApps.buildLaunchSubmenu()`
  with a GROUP HEADER (`a.dropdown-item.launch-submenu-toggle`, NO href — it no
  longer navigates) plus a right flyout `.launch-submenu-menu` of `menuApps()`.
  Flyout CSS is injected via `injectSmdComponentStyle("smd-launch-submenu", …)`
  (hover on desktop, click/`.submenu-open` on touch; the toggle's click stops
  propagation so the parent menu stays open). PhoneButtons gained a Launch `<li>`
  so it gets the submenu too. Tests: launch-regression (grid = 8 tiles incl. Launch
  `./`; "every app's menu shows the Launch submenu of ticked apps" across 6
  shells; the "Launch Menu tab" describe), launch-screenshots "settings menu tab",
  and `pmd-screenshots` "main menu dropdown" now hovers
  `#mainNav .launch-submenu-toggle` (the old `hasText: "Launch"` matched 2 nodes
  and would strict-mode-fail). Sample images "Launch" and "Phone Buttons" were
  added (native SVG + SURGICAL JSON append — a full `regen` rewrites 22
  pre-existing entries whose SVG files drifted from the JSON).
- STANDARD HAMBURGER MENU ORDER (2026-10-24, user request): EVERY app's
  `#mainNav .dropdown-menu` is ordered **Settings | divider | Launch (flyout) |
  divider | app items**. Conditional groups (MinIO, GCal, Gantt) come AFTER the
  app items and carry their own divider + visibility class (`minio-menu-item`,
  `google-menu-item`, `gcal-menu-item`, ...), so enabling one never reorders the
  menu. Storyboard was the odd one (MinIO sat before Launch) - keep any new app
  in this order. Test: storyboard-minio "the hamburger menu follows Settings |
  separator | Launch | separator | app items" asserts the top-level `<li>`
  sequence. GOTCHA: scope the selector with
  `:not(.launch-submenu-menu)`, or the flyout's own rows leak into the list.
- STORYBOARD APP (2026-10-21, NEW — the 9th app; older notes saying "all 8
  shells/apps" predate it): `Storyboard/` is a PlanMyDay-style classic-script PWA
  (no modules, globals on purpose). It has the standard hamburger (Settings |
  Launch flyout | MinIO save/load items) and TWO settings tabs, **Display** and
  **Minio**. Display has only live rows:
  Theme, Theme Mode, Font size, Touch size, Slide speed, Auto-hide menu, Screen
  resolution (last). Minio holds the shared server/bucket/directory fields. No
  Title/`<h1>` in the shell (the nav title reads
  "Storyboard" from `SmdApps`).
  FILES: `js/storage.js` (data + colour/frame helpers), `js/board.js` (render +
  pointer gestures), `js/toolbar.js` (rail, fly-out panels, text editor),
  `js/app-settings.js`, `js/app-minio.js` (story save/load), `js/app.js`;
  `css/storyboard.css` (all app layout; the
  shared sheet is untouched); `assets/backgrounds/{space,underwater}.svg`
  (2560x1440) and `assets/stickers/{mermaid,shark,seaweed,spaceman,spaceship}.svg`
  (512 viewBox flat art, transparent). `icon.svg` + generated 192/512 PNGs.
  DATA (2026-10-24, Stories/Scenes): keys via `smdKey()` = `storyboard_stories`,
  `storyboard_activeStory`, `storyboard_activeScene`, `storyboard_toolbarPinned`.
  `sbState.stories` is an array of `{id,name,scenes:[scene],activeSceneId}`; a
  SCENE is the old board shape
  `{id,name,background,items,connectors,groups,view}`. `sbActiveBoard()` returns
  the ACTIVE story's active scene, so every board-scoped render/edit/export
  helper is unchanged. Items are stickers
  `{id,type:"sticker",sticker,x,y,scale,rotation,z,flipX,flipY}` or text
  `{id,type:"text",text,bg,color,border,font,x,y,scale,rotation,z}`. `view` is
  that SCENE's own zoom + pan (`{zoom, fx, fy}`; see APP ZOOM below). NOTE:
  older notes in this section say "board" where the model now says SCENE; the
  canvas is still board-shaped and the internal `sbBoard*`/`sbState.activeId`
  names are kept on purpose. `x`/`y` are
  PERCENTAGES of the board (2..98 for a single-item transform; a group/multi
  transform clamps the SET's box instead and may use 0..100) so a board keeps its
  layout on resize; `z` is
  paint order. New items go to 50/50 then cascade +4% (first item must be
  centred, not offset). Backgrounds are ids (`space`/`underwater`/`""`), never
  paths, so the asset list stays in `SB_BACKGROUNDS`/`SB_STICKERS`.
  INTERNALS (renamed 2026-10-24): the globals are `sb*`, CSS classes `sb-*`, DOM
  ids `#sb*`, constants `SB_*` and custom props `--sb-*` (they were `wb`/`WB_`
  from the original Whiteboard name; a word-boundary rename changed ~1,553
  occurrences with no behaviour change). Storage keys were already
  `storyboard_*`, so no data migration is involved.
  STICKER FLIP (2026-10-23, user request): a selected sticker's action bar has
  **Flip horizontally** (`#sbSelFlipH`, `fa-left-right`) and **Flip vertically**
  (`#sbSelFlipV`, `fa-up-down`) toggles; they are hidden for text boxes and
  connectors. The flags live on the item (`flipX`/`flipY`) so they survive a
  reload and are copied by Duplicate. `sbApplyStickerFlip()` sets
  `--sb-flip-x`/`--sb-flip-y` on the OBJECT and `.sb-sticker`'s
  `transform: scaleX(var(--sb-flip-x,1)) scaleY(var(--sb-flip-y,1))` mirrors only
  the ARTWORK - never put the flip on the object itself, or its scale/rotate
  handles and outline mirror too. The buttons use `aria-pressed` + a highlighted
  background while the mirror is on. `.sb-sel-btn` is `inline-flex` centred with
  `padding:0` and `line-height:1`, so every FA glyph (including the narrow
  up-down arrow) sits exactly in the middle of the 32px pressed background.
  BOARD = THE WHOLE ARTWORK (2026-10-23, user request): the live board is no
  longer the visible window with a `cover` crop. `sbLayoutBoard()` sizes
  `#sbCanvas` to the background's aspect (`SB_BACKGROUNDS[].width/height`, both
  2560x1440) fitted inside the `#sbScroller`/`#sbStage` pair and centred by the
  stage's flexbox, so the WHOLE image is always visible and a window of a
  different shape shows bars around it. No background -> the board fills the
  area (dot grid). Item `x`/`y` are % of the BOARD (= % of the artwork).
  Stickers are sized from `--sb-sticker-base` (15% of the board's smaller side,
  set by `sbLayoutBoard`) instead of `15vmin`, so they belong to the board, not
  the window. `#sbBackground` is `background-size:100% 100%` (the aspect already
  matches, so nothing is cropped or stretched). A click anywhere in
  `#storyboardArea` deselects (the board no longer fills it); the handler ignores
  objects/connectors/toolbar/action bar/board chip.
  BROWSER ZOOM: the resize handler re-fits the artwork on EVERY resize (120ms
  debounce), including a page zoom. The nav/toolbar/board name/action bar are UI
  and scale with the browser's page zoom; the board takes whatever space the
  larger UI leaves, showing the whole image as large as possible (bars when the
  window shape differs). Everything INSIDE the board scales by
  `--sb-design-scale` = (fitted board height x app zoom) / `SB_DESIGN_HEIGHT`
  (655, the board
  of a 1280x720 window): the text font (plus padding/border/radius via `calc`),
  stickers (`--sb-sticker-base` = 15% of the fitted board's smaller side), the
  dot grid, connector stroke widths and the connector end gap. That keeps text
  and stickers in the same place and at the same relative size on the artwork
  when the board re-fits. Do NOT apply the design scale to the UI - the browser
  already magnifies it; the selection handles/action bar stay UI-sized.
  APP ZOOM + SCROLL (2026-10-24, user request): the bottom of the rail has
  magnifier minus/plus side by side (`#sbZoomOut`/`#sbZoomIn`, stepping
  `SB_ZOOM_LEVELS` = 0.5/0.75/1/1.25/1.5/2/3/4) and `#sbZoomFit` (zoom 1 =
  today's fitted view). NO percentage is shown. ZOOM + PAN ARE PER BOARD
  (2026-10-24): each board stores its own `view = {zoom, fx, fy}` inside the
  board JSON (no separate `storyboard_zoom` key any more; there is deliberately
  NO legacy migration). `sbState.zoom` is only the runtime mirror of the ACTIVE
  board's `view.zoom`; `sbLoadState`/`sbSetActiveBoard`/`sbAddBoard`/
  `sbDeleteBoard` set it from the incoming board. `fx`/`fy` are the BOARD
  fraction at the centre of the visible scroller (0.5/0.5 = fitted + centred),
  captured by `sbCaptureView()` on scroll/zoom/board switch/pagehide and restored
  by `sbRestoreBoardView()` in `sbRender()`'s `layoutKey` branch - fractions, not
  raw scrollLeft/Top, so the same artwork position survives a window-size
  change. `sbCentreBoard()` remains only as the fallback for a board with no
  view. DOM: `#storyboardArea > #sbScroller
  (overflow:auto) > #sbStage (flex centred) > #sbCanvas` - only the board
  scrolls; the toolbar, board chip, action bar and connect hint are fixed
  overlays. `sbLayoutBoard(anchor)` sizes the canvas to fit x zoom. At zoom 1 the
  stage is exactly the viewport (no scrollbars, view unchanged). Zoom > 1 adds a
  PASTEBOARD: `sbBoardOverhang()` measures every rendered object and its visible
  grab handles, and `sbSizeStage()` grows the stage by the biggest overhang per
  axis (minimum `SB_BOARD_PAD` 56), so an item at the artwork edge can always be
  scrolled until its rotate/scale handles are on screen. `#sbCanvas` is
  `overflow: visible` for that reason (oversized objects also paint into the
  pasteboard at 100%). Zoom anchors on the selected item, else the viewport
  centre (`sbZoomAnchorPoint()`/`sbApplyZoomAnchor()`).
  `sbRefreshPasteboard()` re-measures when the selection changes or a drag ends
  - WITHOUT it, selecting a sticker AFTER zooming left its handles clipped (the
  pad had been sized with no handles). The action bar is repositioned on the
  scroller's `scroll` (rAF). Drag/scale/rotate and the JPG export keep using live
  rects,
  so they need no zoom maths of their own. Tests:
  `tests/storyboard-zoom.spec.js` (rail layout, steps/limits/Fit, scrollbars
  only when zoomed, zoom-THEN-select edge-handle hit tests, selection anchoring,
  drag accuracy at 1.5x, zoom + pan persisted on the board, per-board restore,
  centred first visit).
  SPACE-DRAG PAN (2026-10-24, user request): holding Space arms a hand mode
  (`sbEnterPanMode`) ONLY when the scroller overflows (`sbCanPan`; at 100% the
  fitted board is inert - user decision). `#sbScroller.sb-pan-ready` /
  `.sb-pan-active` force `grab`/`grabbing` on the whole board area with
  `!important` (objects and handles have their own cursors); the ACTIVE rule must
  stay AFTER the READY rule. A CAPTURING `pointerdown` on `#sbScroller`
  (`sbOnPanPointerDownCapture`) runs before the object/group/selection-box
  handlers and stops them, so a pan starting on a sticker pans instead of
  selecting or moving it, and an empty-area pan does not deselect - the
  selection is untouched (user decision). Moves write
  `scrollLeft/Top = start - pointer delta` (grab the canvas), with pointer
  capture, and are handled at the TOP of `sbOnPointerMove`/`sbOnPointerUp`
  before `sbState.pointers`. Releasing Space mid-drag KEEPS panning until
  mouse-up (`sbLeavePanMode(false)` on keyup clears only `panReady`);
  `window` blur forces an end (`sbLeavePanMode(true)`) so the hand cannot stick.
  Space is ignored for typing targets, for a focused button/link/`[role=button]`
  (rail/board chip keep native Space activation) and while a
  `smd-page[open]`/`smd-modal[open]` or the invisible settings area is up.
  Tests: `tests/storyboard-pan.spec.js` (10: 100% inert, pan + scroll + cursor
  states, pan starting on a sticker leaves selection/positions untouched,
  Space-release-mid-drag, edge clamping, normal object drag, textarea/
  focused-button/settings guards, blur).
  SAVE AS JPG (2026-10-23, user request): the rail's `#sbSaveBtn` (fa-download)
  calls `sbDownloadJpg()` (`js/board.js`) and downloads
  `<slug(board.name)>.jpg`. It is a CANVAS drawing of the STORED board, not a
  DOM screenshot: surface (**the WHOLE background artwork at its natural size**,
  not the visible `cover` crop - or the 24px dot grid at 22% body colour) ->
  connectors (same `sbEdgePoint`/`sbPushOut` endpoints,
  body-bg halo + body-colour line + arrowhead) -> items in z order (sticker
  img with rotation/flip/drop-shadow; text with its computed font/colour/
  padding, wrapped to the live box width, and fancy/hand/stamp SVG frames
  drawn as a 9-slice - source slice 30 of 120 at the live computed border
  width). The toolbar, board chip, empty hint and selection outlines/handles are
  deliberately NOT in the image.
  FULL-ARTWORK MAPPING: the export canvas is the image's natural size (capped
  at 4096px on the long edge). Because the board's aspect now EQUALS the
  image's, `coverScale = max(visW/imgW, visH/imgH)` is uniform (offset 0) and
  item %s map straight to artwork pixels; each item is drawn inside a
  `translate(art) + rotate + scale(1/coverScale)` context. Text/sticker metrics
  come from the live DOM, so the artwork scale is already baked into them;
  connector widths/end gap and the dot grid are multiplied by the live
  `--sb-design-scale` as well as `artScale`. The result is invariant to browser
  zoom and window size: the board scale and the artwork mapping cancel. With no
  background the export is the visible board at 2x its CSS pixels.
  Images are the LIVE `<img>` elements (stickers) plus a fresh `Image` for the
  background file and frame data URIs, and `document.fonts.ready` is awaited so
  a family picked in the text panel renders. GOTCHA: canvas text must wrap
  against the live box width PLUS a ~1.5px tolerance - `offsetWidth/
  offsetHeight` are integers while the browser lays text out on fractional
  pixels, so an exact-width wrap moves a word to a second line that the
  one-line box then hides.
  CONNECTORS (2026-10-21): each board also has `connectors: [{id,from,to}]`,
  where `from`/`to` are TEXT item ids. Normalization drops dangling/self/non-text
  links and keeps ONE link per pair (any direction). A text box's selection bar
  shows a Connect arrow; it enters `sbState.connectFrom` mode (source outlined,
  every other text box dashed via `.sb-connecting`, hint bar with Cancel) and the
  next text click creates the link. Escape/blank/non-text cancels. Clicking the
  arrow line selects the connector (fat 18px transparent hit path with
  `pointer-events: stroke`) and the bar swaps to Reverse + Delete; Delete/
  Backspace removes it. `sbAddConnector` flips an existing reverse link so the
  newly requested direction wins. Deleting a text item removes its links.
  RENDER: one SVG layer `#sbConnectors` between the background and `#sbItems`
  (z-index 1 vs 2) with a halo (body-bg, 7px) under a body-color line (2.5px) and
  an arrow marker at the TARGET. Use body-color/body-bg, NOT `--bs-primary`:
  sketchy's primary is #333 and disappeared on the dark backgrounds. Endpoints
  come from `sbEdgePoint` (ray vs the ROTATED rectangle using `item.rotation` and
  offsetWidth/Height) plus a 5px gap; `sbRenderConnectors` runs on render, every
  transform/text style change, window resize and a ResizeObserver on each object
  (font loads / font-size changes). GOTCHA: `#sbItems` is `pointer-events: none`
  with `.sb-object { pointer-events: auto }`, otherwise its transparent full-size
  box swallows clicks meant for the connector hit strokes. Selection outlines and
  handles use body-color + a body-bg halo for the same visibility reason.
  TOOLBAR: rail is always visible (74px desktop, labels fixed 10px; labels hidden
  at <=520px where the rail is 50px). One tool's panel slides out beside it
  (`#sbToolbar[data-open="boards|background|stickers|text"]`); clicking the same
  rail button toggles it closed; outside clicks close it UNLESS pinned. Pin
  persists (`storyboard_toolbarPinned`) and on reload a pinned toolbar reopens
  Boards. GOTCHA: a panel button that re-renders the panel DETACHES the clicked
  node before the document-level outside-click listener runs, so `target.closest`
  no longer finds `#sbToolbar` and the panel closes itself — `sbOnPanelClick`
  stamps `sbState.panelClickAt` and the outside handler ignores clicks from the
  last 150ms. The page's `#mainNav .dropdown-menu` is raised to `z-index: 1038`
  (nav itself 1039 under auto-hide) so the hamburger menu is never covered by the
  toolbar; the toolbar is 1035, i.e. ABOVE the 1030 selection bar, so an open
  panel (and the font dropdown inside it) cannot be blocked by the floating
  action bar. smd-page (1040) and smd-modal (1050) stay on top.
  GESTURES: objects are absolutely positioned and rotated around their centre.
  A SINGLE selection shows the object's own scale (bottom-right) and rotate (top)
  handles; a GROUP or loose MULTI-selection shows ONE `#sbSelectionBox` around the
  union of the rendered member rects, with the same two handles. Selection state
  is `sbState.selectedIds` (top-level leaf/group nodes) plus `sbState.selectedId`
  = the single selected LEAF (text edit / Connect / Flip). Ctrl/Cmd/Shift+click
  toggles an object's top-level node in/out; a touch press-and-hold (450ms,
  cancelled by >6px movement or a second finger) ADDS it. Clicking a grouped
  object selects its OUTER-MOST group. A plain click on a member of a
  multi-selection COLLAPSES to it on pointerup (`drag.collapseOnTap` +
  `drag.moved`); a real drag moves the whole set.
  Move/scale/rotate/pinch all run through `sbApplyDrag()` against a SNAPSHOT of
  the selected leaves and the selection rect: scale multiplies each leaf's
  `scale` and its offset from the rect centre; rotation is rigid about that centre
  (position orbits + `rotation += delta`); a set translates as a unit, clamped by
  its BOX (never per item, or a group deforms at the edge). Every member's scale
  stays 0.2..5. THE BAR SITS BESIDE
  THE SELECTION (right of its AABB, else left, else above the rotate handle, else
  below) — never centred above it: the first cut put it at `rect.top - 14` with
  `translateY(-100%)`, which covered the top rotate handle exactly (the user
  could not see it; `elementFromPoint` at the handle centre returned the
  duplicate icon). Keep the bar outside the object's AABB so neither handle can
  be covered, and re-check `elementFromPoint` on the rotate handle after any
  selection-bar/layout change. Body drag moves;
  two pointers on the SELECTION pinch-scale, twist-rotate and slide-move
  (`sbState.drag.mode = "pinch"`). Pointer capture is try/catch (synthetic
  pointerIds throw). Delete/Backspace removes the selection, Escape closes the
  panel/clears the selection. Double-click OR double-tap a text box opens the
  text panel in edit mode; field changes apply LIVE (`sbApplyTextStyle`).
  GROUPS (2026-10-24): `board.groups = [{id, children:[leafId|groupId]}]` is a
  FOREST over the flat item list (nesting allowed). `sbNormalizeGroups()` drops
  unknown/duplicate/cyclic links and DISSOLVES a wrapper with fewer than 2
  children, hoisting its children into its parent (or top level). Rendering,
  connectors, z-order and the JPG export are unchanged: transforms are BAKED into
  leaves, so a group is pure metadata. Group/Ungroup live in the floating bar
  (`#sbSelGroup` with 2+ selected nodes, `#sbSelUngroup` with exactly one group;
  hidden otherwise) and Ungroup peels ONE level (the children take the group's
  place inside its parent, or become top-level). Members get `.sb-member`
  (outline only, no per-object handles); `#sbSelectionBox` owns the handles and
  `sbBoardOverhang()` measures it so they get pasteboard at zoom. Delete removes
  every leaf + nested group; Duplicate deep-copies the nesting (+4% offsets, z
  above the originals); Front raises all members preserving their relative order.
  Tests: `tests/storyboard-groups.spec.js` (16: bar visibility, toggle, grouping,
  nesting + ungroup levels, move/scale/rotate maths, loose selection, delete,
  duplicate, persistence, long-press, mixed text+sticker, zoomed handles).
  ALIGN + DISTRIBUTE (2026-10-24, user request): the floating selection bar has
  ONE `#sbSelAlign` button, visible only with 2+ selected nodes. Hovering it
  (mouse) or tapping it (touch) expands `#sbSelAlignRow` - a SECOND `.sb-sel-row`
  inside the bar - holding six align buttons (`sbAlignLeft/CenterH/Right/Top/
  MiddleV/Bottom`) and, with 3+ nodes, two distribute buttons (`sbDistributeH/V`).
  The row collapses on a selection change and 180ms after the pointer leaves the
  bar; expanding RE-ANCHORS the bar on the button (`sbShowAlignMenu` shifts
  `style.top` by the button's rect delta) because growing the bar would otherwise
  move the button out from under the pointer and immediately mouseleave. Align
  and distribute operate on each selected TOP-LEVEL node's rendered AABB
  (`sbNodeRect()`; a group is ONE unit) and move every leaf of that node by the
  same delta (`sbMoveNode`), so groups keep their shape. Distribute equalises the
  GAPS between adjacent edges and keeps the first/last objects fixed (Figma
  "distribute spacing", not centres). Tests: `tests/storyboard-align.spec.js`
  (12: one-button visibility + hover expand/collapse, six aligns on the AABB,
  both distributions, group-as-a-unit, persistence).
  TEXT: bg tokens `transparent|white|black|primary|secondary|success|danger|
  warning|info|light|dark` map to `.sb-bg-*`; colour tokens add `auto` (body
  colour) and map to `.sb-color-*`. FONT defaults to `theme` (the Bootswatch body
  stack) and is one of `SB_TEXT_FONTS` (system serif/mono plus the 12 families
  vendored in `shared/css/fonts/fonts.css`: Roboto, Lato, Open Sans, Montserrat,
  Ubuntu, Nunito, Nunito Sans, Source Sans Pro, Inter, News Cycle, Cabin Sketch,
  Neucha), applied as `.sb-font-<id>`. No extra `<link>` is needed: every theme
  sheet `@import`s `../../fonts/fonts.css`. The text panel's Font row is an
  `<smd-select>`; its `change` updates the item (and the draft for the next text)
  LIVE, and the family loads on first use (`document.fonts.check` verified Cabin
  Sketch + News Cycle). Borders `none|fancy|hand|stamp` are SVG
  frames generated per object as a `border-image` data URI
  (`sbFrameDataUri(kind, sbResolveColor(token))`), so the frame follows the TEXT
  colour and every theme. Because the colour is baked into the URI, a theme or
  mode change must re-render the board (app.js listens to `smd-theme-change`).
  Background "None" must `style.removeProperty("background-image")` — assigning
  `""` leaves an inline empty image that overrides the CSS dot grid.
  REGISTRY: add `SmdApps.APPS` row (name/description/path `Storyboard/`, icon
  "Storyboard"), a native `shared/sampleImages/Storyboard.svg` appended
  surgically to `shared/sampleImages.json`, and a `sw.js APPS["Storyboard/"]`
  entry listing index/manifest/icons/css/both background SVGs/all five sticker
  SVGs/all five JS files. The Launch grid and the Launch flyout pick it up from
  the registry (no root `index.html` edit).
  TESTS: `tests/launch-regression.spec.js` was UPDATED for Storyboard on
  2026-10-23 (`toHaveCount(9)`, `EXPECTED_TILES` with `Storyboard/` before
  `Launch`, the tile-icon loop runs to `EXPECTED_TILES.length`, the nav-title
  list, the Launch-submenu `APPS` + the `/Storyboard/` shell, `ALL_APPS`, and
  `SHELL_CASCADE`). STILL DEFERRED: add Storyboard to
  `tests/settings-alignment.spec.js`
  (Display-only tab/shape/rhythm/tables) and `tests/display-settings.spec.js`,
  and add a Storyboard screenshot spec if screenshots are wanted. Verified
  instead with throwaway Playwright probes (deleted): board/drag/scale/rotate,
  synthetic two-finger pinch (scale + twist), text create/edit/frames, board
  add/rename/delete/switch, pin persistence, Settings shape, 8081 sub-path,
  Launch tile + nav title, zero console/page errors.
- APP NAME IN THE NAV BAR (2026-10-18): every app shell's toolbar shows its FULL
  NAME next to the hamburger. `SmdApps.mountAppTitle()` (shared/js/smd-apps.js)
  inserts `<span id="appNavTitle" class="navbar-text fw-semibold mb-0">` after the
  hamburger's `.dropdown` wrapper, using the name from THIS registry, resolved
  from the page's own path (`SmdApps.currentPath()`, the same module-URL trick as
  `href()`), so the nav and the Launch submenu can never disagree. `navTitle`
  overrides the entry's `name`: Launch's page is titled "My Apps" (its content
  `<h1>My Apps</h1>` was REMOVED as a duplicate), and PhoneButtons sets
  `navTitle: false` to opt OUT because its nav already shows the running server
  app's name (`#serverAppName`). It is mounted from `boot()` (with
  `buildLaunchSubmenu`), idempotent, and a no-op where there is no `#mainNav`
  (Storybook, card-viewer frames). `updateMainMenuVisibility()` in smd-app.js
  now hides the title WITH the hamburger while a `smd-page` is open, and
  `#appNavTitle` is pinned to `var(--bs-body-color)` in shared/css/styles.css
  (matching the hamburger; a theme's `--bs-navbar-color` may target a different
  navbar surface). To add a new app's title nothing is needed — it comes from its
  `APPS` row. Tests: launch-regression "each app's nav shows the app name next to
  the hamburger" (7 shells: text + same-row/right-of-button geometry + body
  colour, then the PhoneButtons opt-out) and the pmd-regression "hides the main
  menu while a secondary page is open" now also asserts the title hides.
- PHONEBUTTONS SERVER TESTS (2026-10-18): `PhoneButtons/server/app.py` (the Flask +
  Socket.IO server) is covered by PYTHON tests in
  `PhoneButtons/server/test_app.py` (pytest, 120 tests, ~90% line coverage) —
  run them with `py -3.13 -m pytest PhoneButtons/server/test_app.py --cov=app
  --cov-report=term-missing`. `tests/phonebuttons-server.spec.js` wraps that suite
  in the Playwright run (fails the suite if pytest fails, asserts the coverage
  floor `MIN_COVERAGE = 80`, and SKIPS when `py -3.13` lacks the deps). The
  wrapper writes its artefacts into the gitignored `PhoneButtons/server/`:
  `coverage.txt` (the full pytest output incl. the `app.py` table, PLAIN TEXT —
  pytest colours its output even when piped, so the wrapper passes `--color=no`
  plus `NO_COLOR=1`/`PY_COLORS=0`/`TERM=dumb` and strips any ANSI escapes before
  writing) and `htmlcov/index.html` (browsable, per-line). NOTE: the list/line
  reporter does
  NOT show a PASSING test's stdout, so the table is NOT in the terminal scrollback
  — read `coverage.txt` or the HTML report (both paths are also added as test
  annotations). The deps
  (Flask/Flask-SocketIO/python-socketio/pywin32/psutil/Pillow) are installed ONLY
  for the `py -3.13` interpreter on this box (+ `pytest`/`pytest-cov`, installed
  2026-10-18); the default `python` (3.14) has none. `PB_PYTHON` overrides the
  interpreter. Flask's `test_client()` drives the routes, `socketio.test_client()`
  the events, and the Windows parts (GDI icon extraction, the foreground hook,
  keystroke injection) are MOCKED — the tests must never press keys or touch the
  real `config.json` (an autouse fixture repoints `CONFIG_PATH`/`ICON_DIR` at a
  tmp dir and disables `DEBUG`). Keystroke tests patch `_send_key_down`/
  `_send_key_up`/`send_key` and assert the ORDER (mods down, key, mods up
  reversed). `test_app.py` imports `app` directly, which is safe: the module only
  defines things at import (the hook and the server start under `__main__`).
- app.py DEAD CODE + A REAL BUG (2026-10-18, found by those tests):
  `_collect_icons`, `_extract_exe_icons_via_resources` and `_extract_uwp_icons`
  had NO callers anywhere in the repo and were DELETED (216 lines).
  `_extract_exe_icons_via_resources` also threw a **Windows access violation**
  (faulthandler dump, process-threatening) when called with a
  `LoadLibraryExW(..., LOAD_LIBRARY_AS_DATAFILE)` handle via
  `win32api.EnumResourceNames` — dead, so it never bit in production, but do NOT
  resurrect it without fixing that. Also FIXED: `_extract_icon_by_source` called
  `win32gui.ExtractIcon(exe_path, 0)` with TWO args, but pywin32's signature is
  `ExtractIcon(hInst, exeName, index)`; the `TypeError` was swallowed by the
  surrounding `try/except`, so the "ExtractIcon(0)" icon source silently never
  produced anything (now `ExtractIcon(0, exe_path, 0)`, with a regression test).
  STILL DORMANT (not deleted): the `set_default_icon` socket event +
  `_set_app_icon_pref`/`_app_icon_prefs` ("preferred icon source") — no current UI
  sends that event, so the `preferred` branch of `_cache_icon` is unreachable from
  the app.
- SETTINGS PAGE SHAPE IS SHARED (2026-10-18, user rule): every app's Settings page
  uses the SAME tabs in the SAME order - **General, Display, then the app's own** -
  and a tab left with nothing in it is REMOVED (QRLinks and ListOfLists lost their
  General tab that way; QRLinks' old `general-tab` is now the Display tab with id
  `appearance-tab`). The **Display** tab holds the shared appearance rows in this
  exact order: `Theme`, `Theme Mode` (both from `<smd-theme>`, one component),
  `Font size`, `Icon size`, `Touch size`, `Tile density`, `Slide speed`,
  `Auto-hide menu`, then any app-specific extras - and **`Screen resolution` is
  always the LAST row** (PlanMyDay's "Show Gantt" sits before it; ListOfLists has
  no extras, so there it simply follows Auto-hide).
  Current shape:
    Launch         Display, Menu, Danger
    PlanMyDay      General, Display, Schedule, Minio, Danger
    CountMyDays    General, Display, G Cal, Minio, Danger  (General = Countdown
                   display + Max countdowns)
    QRLinks        Display, Danger
    SolarControlar General, Display, Danger                (General = Flask fields
                   + Auto-refresh)
    FreeFormOX     Display, Game, Danger                   (Game = X/O names+styles,
                   Show undo/redo, Swap)
    ListOfLists    Display, Minio, Danger
    PhoneButtons   Display, Server, Danger
    Storyboard     Display
  NO DEAD CONTROLS (user): a row is only present where the setting does something.
  `Icon size` is therefore ABSENT in SolarControlar and FreeFormOX (no
  `<smd-image>`), and `Tile density` only exists in PlanMyDay/CountMyDays/QRLinks/
  ListOfLists (the apps that already had it). Everything else - Touch size (drives
  `<smd-checkbox>`/`<smd-draghandle>`), Slide speed (`smd-page`), Auto-hide menu
  (the shared nav) - is meaningful in every app and was ADDED where missing.
  SHARED ENGINE: `smdSetupSettingsPage()` (smd-app.js) now also restores
  `touchSizeSelector` + `slideDurationSelector` (it already did theme/mode, font,
  icon, density, auto-hide, show-danger), and `changeTouchSize()` +
  the DOMContentLoaded boot call `SmdCheckbox.setDefaultSize` /
  `SmdDragHandle.setDefaultSize` DIRECTLY - an app no longer needs an
  `applyTouchSize()` hook for the control to work (PlanMyDay/ListOfLists still
  have one; it is now redundant but harmless, and ListOfLists' `restore` keeps its
  "large" default because it runs after the shared restore).
  LABELS were aligned too: Launch + PhoneButtons said "Image size" for the same
  `#iconSizeSelector` -> now "Icon size" everywhere.
  TEST: `tests/settings-alignment.spec.js` "Settings page shape is consistent
  across apps" iterates ALL 8 shells and asserts the exact tab list + the exact
  Display row labels IN ORDER (read from the DOM). Adding/moving an appearance
  control = update that table. Any spec that touches a moved control must first
  activate the Display tab (the settings page opens on the FIRST tab, which is
  General where it exists).
  UNIFORM VERTICAL RHYTHM (2026-10-18, user-reported on FreeFormOX): every row on
  the page is `mb-4` (1.5rem) - the same gap `<smd-theme>` injects - so the space
  between ANY two rows is identical. FreeFormOX's Display rows were `mb-3` against
  the theme's 1.5rem (the reported inconsistency) and its Game tab was `mb-3` too;
  both are `mb-4` now. The same spec asserts it for all 8 apps by reading the
  computed `margin-bottom` of every `.smd-theme-field` AND every `div.row.col-md-8`
  in the active panel and requiring exactly ONE distinct value
  ("<App>: the Display tab keeps one uniform vertical rhythm").
  MOVING A ROW? GREP THE SUITE FOR ORDER ASSERTIONS FIRST (2026-10-18, my miss):
  `pmd-gantt`'s "Show Gantt is the last control on the Display tab" test encoded the
  pre-2026-10-18 layout (`expect(order[order.length - 1]).toBe("Show Gantt")`) and
  broke the moment Screen resolution became last - it was the only failure in the
  user's full run. It now asserts `expect(order.slice(-2)).toEqual(["Show Gantt",
  "Screen resolution"])`. Before/after any reorder or row move, run
  `rg -n "Screen resolution|Show Gantt|order\[|last control" tests/` and read the
  display-order TABLES in this file and in `tests/settings-alignment.spec.js`.
- DANGER TAB SHAPE IS SHARED (2026-10-18, user rule): one canonical order, using
  only the rows an app actually has; a row that does not apply is DROPPED, and an
  empty group leaves no trace:
    1. `Show danger` (the switch)   2. `No cache` (the switch)
    <gap> 3. `Regenerate Main Tiles`   4. `Sort <existing app name>` (PMD "Sort
    Jobs in Streams", LoL "Sort Lists in Categories" - NEVER renamed)
    <gap> 5. `Refresh App`   6. `Clear local storage <APP>`   7. `Clear Google
    cache` (CountMyDays only)
    <gap> 8. the data loaders: `Load Sample Data` (CMD's Google sample), `Load
    Sample Links` / `Load Sample Images` (QRLinks), `Upload Standard Images`
  A GAP is `mt-4` on a group's first visible row (all rows are `mb-4`), so a group
  that is empty for an app contributes nothing and there are NEVER two gaps in a
  row. COLOURS (user decision, 2026-10-18: nothing is success/green): destructive
  `Clear *` = `btn-danger`; bulk maintenance `Regenerate`/`Sort` = `btn-secondary`
  (NOT warning); `Refresh App` and EVERY loader/upload = `btn-warning`; the two
  switches have no colour. `superhero` (the default theme) additionally renders
  `btn-warning` text in the BODY BACKGROUND colour (`var(--bs-body-bg)`, the dark
  navy surface) instead of Bootswatch's white-on-amber, in BOTH modes - the body
  TEXT colour was tried first but is nearly identical to white (#ebebeb/#ced4da),
  so it looked unchanged. Rule in
  `shared/css/themes/superhero/superhero.{light,dark}.css`, guarded by
  pmd-regression "superhero warning buttons use the body background colour in both
  modes" (asserts BOTH a probe and the real `#btnRefreshApp-button`). EVERY action
  button is the shared `<smd-button block variant="…">`
  ("block" makes the host a block box and the inner button `w-100`, so a column of
  them is all one size - the user asked for the component and one size); the host
  keeps the old id (`#btnClearAllData`), the inner button is `<id>-button`. Per-app
  rows:
    PMD      Show danger, No Cache, Regenerate Main Tiles, Sort Jobs in Streams,
             Refresh App, Clear local storage PMD, Upload Standard Images (+ dev rows)
    CMD      Show danger, No Cache, Refresh App, Clear local storage CMD,
             Clear Google cache, Load Sample Data, Upload Standard Images
    QRLinks  Show danger, No Cache, Refresh App, Clear local storage QR,
             Load Sample Links, Load Sample Images
    Solar    Show danger, No Cache, Refresh App, Clear local storage Solar
    LoL      Show danger, No Cache, Regenerate Main Tiles, Sort Lists in Categories,
             Refresh App, Clear local storage LoL, Upload Standard Images (+ dev rows)
    PB       Show danger, No Cache, Refresh App, Clear local storage PB
    Launch   Show danger, No Cache, Refresh App, Clear local storage Launch,
             Upload Standard Images
    FFOX     Show danger, No Cache, Refresh App, Clear local storage FFOX,
             Upload Standard Images
  Each app clears ONLY ITS OWN DATA: `smdConfirmClearAllData()` removes just the
  keys under `SmdConfig.storagePrefix` (PhoneButtons is uniform now - its old
  theme/font/images keep-list is gone), so other apps' keys and the shared
  `shared-images` library always survive; PMD/LoL no longer wipe all of
  localStorage. Launch/FreeFormOX were ADDED a Danger tab on user request
  (2026-10-18) with the applicable rows only (no tile list); both later gained the
  `Upload Standard Images` loader (user request 2026-10-19) - FreeFormOX therefore
  also loads `shared/js/smd-images.js` and sets `SmdConfig.imagePrefix = "shared-"`
  so the upload lands in the ONE shared library (`shared-images`), not an
  app-private `ffox_images` list. Their `confirmClearAllData` still only clears
  their own prefix, so that library is never wiped.
  EVERY Danger ACTION ROW IS FULL WIDTH (user request 2026-10-19: "the buttons are
  too narrow, they should start after where the label would be and continue the
  full width"): the action rows used to carry `col-md-8` on the ROW as well as the
  inner `col-4`/`col-8`, so a button was only 8/12 of 8/12 ~= 44% of the page. The
  action rows (any row containing an `<smd-button>`) dropped the row-level
  `col-md-8`, so they span the container and `col-4 + col-8` puts the button at the
  label column (1/3) running to the right edge; the two SWITCH rows keep
  `col-md-8`. `settings-alignment` asserts this per app (button right edge within
  24px of the row's, left edge >= row/3 - 24, width > 55% of the row) AND now
  selects Danger rows with `div.row` (not `div.row.col-md-8`, which would miss the
  full-width rows).
  DANGER ACTIONS MUST ACTUALLY RUN (2026-10-19): the shape test only checked
  MARKUP, and FreeFormOX shipped `confirmClearAllData()` + Upload Standard Images
  calling `showSmdModal()` with no `shared/js/components/smd-modal.js` loaded, so
  both died with `modal.show is not a function` and no confirm ever appeared. The
  shell now loads smd-modal.js, and a new settings-alignment test clicks "Clear
  local storage <APP>" (id `#btnClearAllData`, or PhoneButtons' `#btnClearStorage`)
  and the uploader in ALL 8 apps and asserts `#smdConfirmModal` opens with its
  buttons - then Cancels.
  WIRING: `changeNoCache` now lives ONCE in `shared/js/smd-settings.js` (it was
  duplicated in PlanMyDay + ListOfLists); every app's Danger markup just needs the
  `#noCacheRow` block, and the id must be in that app's danger-id list (PMD
  `pmdDangerIds()`, LoL `lolDangerIds()`, CMD `CMD_DANGER_IDS`, QR
  `QRLINK_DANGER_IDS`, PB's two inline arrays, Solar's `toggleDangerRows`, Launch
  `launchDangerIds()`, FFOX `ffoxDangerIds()`). CMD's
  old combined `#gcalDangerRow` (2 buttons in one row) is SPLIT into
  `#clearGcalCacheRow` + `#loadGcalSampleRow`. SolarControlar gained
  `confirmClearAllData()` (a thin `smdConfirmClearAllData` wrapper) + a
  `#noCache` restore in `openSettings()` - Solar implements its settings page
  itself, so it does not get the shared restores. Launch + FFOX gained
  `changeShowDanger`/`confirmClearAllData` wrappers and `dangerIds` in their
  `smdSetupSettingsPage`/`openSettings` call. Button IDS were deliberately kept
  (`#btnClearAllData`, `#btnClearStorage`, `#btnRegenerateTiles`, ...) - only the
  markup (`<smd-button block>`), the LABELS and the modal title changed. The clear
  modal reads `Clear ALL <App> data?` (per-app), so tests asserting the old
  generic "Clear All Data?" copy had to be updated.
  TEST: `tests/settings-alignment.spec.js` "Danger tab shape is consistent across
  apps" - one test per app asserting the exact visible row order, the colour of
  every row, and that no two consecutive rows both carry a gap. Update its table
  with any Danger change.
- FONT SIZE COVERS FORM TEXT + THE TOOLBAR (2026-10-18, user-reported): the setting  moves `<body>`'s font-size and the `--smd-type-*` tokens are `em`, so the ramp
  follows - but three things were pinned to rem/px and ignored it:
  (a) Bootstrap's `.form-control` / `.form-select` (`font-size:1rem`) and
  superhero/yeti's plain `label { font-size:.875rem }` - against the default
  `xlarge` 20.8px body, every field label, input, select, textarea and checkbox
  label sat at 14-16px while tabs/buttons grew. `shared/css/styles.css` now pins
  `label`, `.form-label`, `.form-check-label`, `.col-form-label`, `.form-control`,
  `.form-select`, `.form-check-input`, `.input-group-text`, `textarea`, `select`,
  `input` to `var(--smd-type-p)` (colours untouched - themes keep their own field
  look). Reported on PlanMyDay's View Job page.
  (b) `#mainNav` and its menu: themes pin `.navbar` to a rem size (brite
  `1.09375rem` = 17.5px, journal 18px, litera 15.4px, lux/zephyr 14px) or the
  dropdown itself (sandstone/yeti 13px `.dropdown-item`, brite/others
  `--bs-dropdown-font-size: .875rem`), so the hamburger menu came out SMALLER than
  the page text. `#mainNav`, `#mainNav .dropdown-menu`, `#mainNav .dropdown-item`
  are pinned to `var(--smd-type-p)`; `#mainNav` (1,0,0) beats the theme's
  `.navbar` (0,1,0) and the em token then resolves against the body-derived parent.
  (c) the menu's TEXT colour: the menu surface is forced to `--bs-body-bg`, so its
  text must be `var(--bs-body-color)` (Bootstrap's `--bs-dropdown-link-color` can
  be brighter/greyer than the surface we forced - quartz dark ships #dee2e6). Hover
  and active keep that colour and only TINT the surface with
  `rgba(var(--bs-body-color-rgb), .12/.2)`, so a highlight cannot drop contrast.
  `shared/css/themes/<theme>/<theme>.<mode>.css` extends the AA guarantee to the menu
  via its baked contrast block (minty light's
  body text is #888 on #fff = 3.54:1, morph 2.63:1, spacelab 4.48:1): when the
  body pair itself fails 4.5:1 the menu text is repainted to the best of
  body-color/black/white, while the rest of the app keeps the theme's colour.
  GUARDS: `tests/menu-legibility.spec.js` (menu never smaller than the body on all
  27 themes x both modes; menu grows with the setting across all six sizes; AA +
  "uses --bs-body-color verbatim where that already passes") and
  `tests/display-settings.spec.js` (one test per app: every Display control is
  present and takes effect - theme/mode, font size incl. the real label size,
  touch size incl. the real checkbox size, density, slide duration on `<smd-page>`,
  icon size, auto-hide body class). GOTCHAS the specs encode: PlanMyDay/ListOfLists
  DEFAULT to touch size "large" (they read `dragSize` first), so drive both values;
  `#mainNav` contains TWO `.dropdown-menu` elements (the menu + the nested "My
  Apps" flyout) so locators need `.first()`; SolarControlar 404s its Flask API and
  opens an error modal, so stub `**/solar/api/power_data*` before `goto`.
- MAIN-MENU FLYOUT MUST NOT BE CLIPPED (2026-10-19, user-reported): "on the sketchy
  theme the Main Menu | Launch does not show the submenu". The flyout is positioned
  `left: 100%` (SUBMENU_CSS in `shared/js/smd-apps.js`), so any ancestor with
  `overflow: hidden` clips it away - and **sketchy is the only theme whose
  bootstrap sets `.dropdown-menu{overflow:hidden}`**. The element still reports a
  geometry rect, so a rect/`toBeVisible()` check passes while the user sees
  nothing: the honest test is `document.elementFromPoint` at the item's centre
  (it landed on the page text BEHIND the flyout). Fixed by `overflow: visible` on
  `#mainNav .dropdown-menu` in `shared/css/styles.css` (`border-radius` still
  clips the background, so sketchy's hand-drawn shape is unaffected). Guarded by
  menu-legibility's "the Launch flyout submenu is visible on every theme and mode",
  which hit-tests the first flyout item for all 27 themes x both modes.
- SOLAR TOP TILES RECURSED FOREVER (2026-10-19, found by the probes above):
  `SolarControlar/js/components/solar-top-tiles.js` has `no-data` in
  `observedAttributes`, and `_render()` called `setAttribute("no-data", "")` on the
  no-data path - which re-entered `attributeChangedCallback()` -> `_render()` ->
  setAttribute ... and threw `RangeError: Maximum call stack size exceeded` on
  EVERY load without data (i.e. any boot before the Flask API answers, and every
  test). Now the attribute is only mutated when its state actually changes
  (`hasAttribute` guard), so the loop cannot start.
- THEME WEBFONTS ARE VENDORED (2026-10-19, user: "why does the font on sketchy not
  look like the bootswatch reference"): each Bootswatch theme loads its Google fonts
  through an `@import url("https://fonts.googleapis.com/css?family=...")` at the top
  of its own CSS - e.g. sketchy is `family=Neucha|Cabin+Sketch`, journal
  `News Cycle`, cosmo/lumen/solar `Source Sans Pro`, morph `Nunito`, zephyr `Inter`,
  minty `Montserrat`, lux `Nunito Sans`, cyborg/materia/sandstone `Roboto`,
  darkly/flatly/superhero/vapor `Lato`, simplex/spacelab/yeti `Open Sans`, united
  `Ubuntu`. This repo STRIPS that import and must instead (a) keep the woff2 files in
  `shared/css/fonts/`, (b) declare them with `@font-face` in
  `shared/css/fonts/fonts.css`, and (c) precache them in `sw.js` (the font block is
  regenerated from the directory, so a new file can never be forgotten). A missing
  @font-face is SILENT - the browser falls through to the next entry in the stack
  (system-ui/Segoe UI), which is why sketchy looked like a normal sans. Six families
  were lost this way and are wired now: **Neucha + Cabin Sketch** (sketchy),
  **News Cycle** (journal), **Source Sans Pro** (cosmo/lumen/solar), **Nunito**
  (morph), **Inter** (zephyr) - the Neucha/Source Sans Pro/Cabin Sketch/News Cycle
  files were already vendored but never declared; Nunito + Inter files were missing
  and were downloaded from Google. GOTCHA: three themes use their webfont only on
  HEADINGS/navbar/buttons while the BODY stack stays system-ui (journal, minty,
  sketchy) - so a check of `--bs-font-sans-serif`'s first family alone misses them
  (that is exactly how Cabin Sketch/News Cycle slipped through). GUARD:
  `tests/theme-fonts.spec.js` holds the per-theme EXPECTED map taken from Bootswatch's
  own @imports, asserts every family is declared and every face LOADS, and separately
  checks the heading-only faces are actually applied. To add/refresh a family:
  `GET https://fonts.googleapis.com/css2?family=<Family>&display=swap` (Chrome UA for
  woff2), save each subset into `shared/css/fonts/`, rewrite `src: url(...)` to the
  local filename, append the blocks to `fonts.css`, and re-list the dir in `sw.js`.
- CONTRAST FIXES ARE BAKED INTO THE THEME CSS (2026-10-18/19, user request: "I
  don't want code running that checks contrast ... I want the contrast changes
  written into the css overrides"): NO runtime code measures or repaints colours.
  Each theme's own per-mode sheet
  (`shared/css/themes/<theme>/<theme>.<mode>.css`) carries a generated block
  between the `smd-contrast:start` / `smd-contrast:end` markers with every
  repaint needed to reach WCAG AA: button / tab / hamburger-menu text colours
  (4.5:1), the CountMyDays `<cmd-countdown-card>` secondary text (date/time/count
  against the card surface, 4.5:1), the `.form-control` / `.form-select` /
  `.form-check-input` BORDERS (3:1 non-text, WCAG 1.4.11) and the hamburger menu
  + Launch submenu border (3:1, see the menu-border note below). Only combos that
  FAIL get a rule.
  The rules list only what FAILED - everything else keeps the theme's own colour.
  REGENERATE / CHECK with `tests/contrast-css.spec.js` (the `@contrast` project).
  The generated block in each theme sheet is ONLY
  `/* smd-contrast:start */` + rules + `/* smd-contrast:end */` - no explanatory
  comments. Regeneration recipe:
  `SMD_CONTRAST_FIX=1 npx playwright test --project=contrast --workers=1`.
  Every spec now lives in `tests/`; project order in `playwright.config.js` is the
  schedule (Playwright has no per-test priority): `@contrast` FIRST (it overlaps
  the rest of the run), then chromium, then iphone-12-pro, then the `@cache`
  project (the asset cache-busting tests) LAST. `npm test` is one Playwright run;
  `npm run test:main` skips contrast; `npm run test:contrast` runs contrast alone
  (`--project=contrast`).
  Plain run = "nothing needs to change anywhere" (fails and prints the
  exact rules a theme is missing, or the stale ones it still carries), and
  `SMD_CONTRAST_FIX=1` rewrites every sheet and then verifies the result. It is
  idempotent (a second FIX run rewrites 0 files) because it measures with the
  generated block STRIPPED from the sheet (`page.route` fulfils a stripped body),
  so a theme is never judged against our own output. The algorithm is the one the
  deleted `shared/js/smd-contrast.js` used: keep the theme's colour when it passes,
  else the better of `--bs-body-color`/`--bs-body-bg`, else black/white; every
  button state (base/hover/active/disabled) is decided separately, and translucent
  surfaces (quartz's `rgba(255,255,255,.4)`) are composited over the page first.
  CARD TEXT GOTCHA (2026-10-20): Bootstrap's `.text-secondary` reads
  `--bs-secondary-rgb` (the PALETTE colour), not the semantic
  `--bs-secondary-color`. brite/lux/materia/quartz/simplex/zephyr LIGHT set that
  palette entry to WHITE (their secondary button is white), so the CountMyDays
  date/time/count text was white on the white card (1:1). The generated rule
  `cmd-countdown-card .text-secondary { color: <picked> !important }` fixes it;
  never "simplify" it to `--bs-secondary-color`.
  BORDERS (2026-10-20): form-entry and Bootstrap checkbox/radio boundaries are
  judged against the PAGE background at 3:1. `pickBorder` tries bodyColor then
  emphasis, then black/white; a zero-width or `border-style: none` control counts
  as failing, and the generated rule also writes `border-style: solid;
  border-width: 1px`. The focused field border (`:focus`) keeps the theme primary.
  SKETCHY CHECKBOX RESET (2026-10-21): sketchy's bootstrap ships
  `[type="checkbox"] { width:0; height:0; appearance:none;
  border-style:none; border-color:currentColor }` for its own hand-drawn
  control. That is class-level specificity (0,1,0), so a plain
  `smd-checkbox input` (0,0,2) lost BOTH the size and the border and the theme
  measured "no visible border". The component rules in
  `shared/css/styles.css` and the generated theme rule therefore use
  `smd-checkbox input[type="checkbox"]` (0,1,2); brite's checked-tick override
  uses the same selector + `:checked`. NEVER shorten these to
  `smd-checkbox input`.
  SKETCHY'S OWN CHECKBOX (2026-10-21, user request "remove our one and leave the
  sketchy one"): sketchy also draws the box with `[type=checkbox]::before` and
  the mark with `::after` (the "x"). `sketchy.light.css` / `sketchy.dark.css`
  drop our border/fill/tick for `smd-checkbox input` and stretch `::before` to
  100% of the touch-sized input (and centre `::after`), so there is ONE
  hand-drawn border instead of two. `tests/contrast.spec.js` falls back to the
  `::before` border when the input's own border is none; the generated
  `border-color` rule stays in the block and is harmless with `border-style:
  none`.
  TEST SERVER CACHES CSS (2026-10-21, cost a false failure): `tests/serve-tests.mjs`
  can keep serving a stale/TRUNCATED copy of a theme sheet edited while it was
  running (observed: `sketchy.dark.css` served 2476 of 3405 bytes, dropping the
  generated block, so form-control borders looked unfixed). Restart the test
  server after editing theme CSS before believing a contrast failure.
  TWO GOTCHAS that cost real debugging time: (a) the app's SERVICE WORKER
  precaches the theme CSS, so a `<link>` is served from the SW cache and
  `page.route` never sees it - the spec must use `test.use({ serviceWorkers:
  "block" })` or the strip is bypassed; (b) Bootstrap animates `.btn` colour for
  150ms, so a single read after a theme swap lands mid-fade - waiting on the live
  `link.sheet.href` PLUS a stable sample (two identical reads) is required, in
  `tests/contrast-css.spec.js`, `tests/contrast.spec.js` and
  `tests/menu-legibility.spec.js`. The 27x2 loops also need explicit
  `test.setTimeout` (they exceed the 30s default).
  GRADIENTS COUNT AS SURFACE (2026-10-19, user-reported): reading only
  `background-color` missed slate dark's secondary button - the flat #7a8288 said
  black was fine (5.37:1), but `background-image` runs down to #62686d where black
  is 3.69:1 and white is 5.68:1. Both specs now take the surface to be the
  DARKEST extent of the element's gradient (each stop composited over the colour):
  that is the part dominating the body of the button, and for Bootstrap's usual
  translucent white sheen the darkest extent IS the background colour, so ordinary
  themes are unaffected. Gradient stops belong to the BASE state; hover/active use
  their own flat colour because slate and friends swap the image per state (which
  cannot be read without hovering). The slate fix that came out of this: secondary
  text is now WHITE.
  OUTCOME GUARDS (these measure the rendered result, which is fine in tests):  `tests/contrast.spec.js` asserts every `smd-button` variant x state and both tab
  colours reach 4.5:1 on all 27 themes x both modes, plus a guard that NOTHING
  injects contrast styles or exposes a normaliser at runtime;
  `tests/menu-legibility.spec.js` covers the toolbar/menu (size, AA, colour
  consistency and the flyout hit-test).
- HAMBURGER MENU + LAUNCH SUBMENU NEED A CONTRASTING BORDER (2026-10-19, user
  request): "for every theme ... there should be a contrasting border around the
  menu/submenu with the correct styling for the theme, but it should contrast". The
  popup floats over the page, so its edge must read as a boundary - a non-text UI
  element needs 3:1 (WCAG 1.4.11) - but a theme's own dropdown border is a
  translucent near-background tint: **43 of 54 theme/modes were below 3:1** (1.16:1
  minty light, 1.3:1 on most light themes, 1.89:1 on the dark ones), so the edge was
  invisible. The baked contrast block now also carries
  `#mainNav .dropdown-menu { border-color: <pick>; }` - ONE selector covers BOTH the
  main menu and the Launch flyout (both are `.dropdown-menu` inside `#mainNav`) - and
  only the COLOUR is repainted: the theme's width/style/radius stay (the 1px solid
  geometry in styles.css matches every theme's own `--bs-dropdown-border-width`;
  radius comes from the theme, e.g. sketchy's 555px/25px hand-drawn corners). The
  pick is the better of `--bs-body-color` / `--bs-emphasis-color` that reaches 3:1,
  falling back to black/white. GOTCHA: `--bs-emphasis-color` alone is NOT enough -
  six themes (cyborg, darkly, slate, solar, superhero, vapor) keep it BLACK in LIGHT
  mode while their page is dark, giving 1.04-1.47:1 - hence measuring per theme and
  trying body-color first. GUARD: menu-legibility's "the menu and the Launch submenu
  have a contrasting border on every theme" asserts, per theme/mode, that BOTH edges
  exist (width/style) and meet 3:1 against the panel surface. NB this also gave
  `bootstrap` a generated block for the first time (its menu border was 1.3:1).
- sketchy + slate PRIMARY BORROWS THE DANGER PALETTE (2026-10-19, user request):
  in both themes `--bs-primary` and `--bs-secondary` are so close (sketchy #333 vs
  #555; slate #3a3f44 vs #7a8288, painted with near-identical grey gradients) that
  the primary button and the ACTIVE TAB looked like the secondary ones. Fix: a
  hand-written block at the top of those four sheets (`sketchy`/`slate` x
  light/dark), ABOVE the `smd-contrast` markers so the generator leaves it alone and
  then derives the text colours for the new surface: `#smd-app .btn-primary` gets the
  danger palette (bg/border/hover/active/disabled colours AND, for slate, the danger
  `background-image` gradients) and `smd-tabs .smd-tab-btn.text-bg-primary` gets the
  danger background (`!important`, because Bootswatch's `.text-bg-*` paints with
  `!important`). Only `<smd-button>` and `<smd-tabs>` are affected - links, badges
  and every other primary-coloured surface keep the theme value. TWO GOTCHAS:
  (a) a bare `.btn-primary` LOSES to sketchy's `[data-bs-theme=dark] .btn-primary`
  (0,2,0) - hence the `#smd-app` scope (1,1,0); (b) the danger TEXT colours are
  copied too, otherwise the theme's own dark-mode `--bs-btn-color` (black, written
  for its original light primary) leaves primary and danger looking different on the
  same red surface. GUARD: `tests/theme-primary-danger.spec.js` (per theme/mode:
  primary paints the danger background/gradient, the active tab matches, and primary
  no longer matches secondary). pmd-regression's slate tab test now expects the
  active tab to carry the danger gradient while the inactive keeps slate's swapped
  one.
- CONTRAST DETAILS THAT BIT (2026-10-18, still true of the baked CSS): Bootswatch
  ships literal `--bs-btn-color` values (usually white) that often fail WCAG AA on
  the theme's own accent surfaces - journal warning is white on #f5e625 (1.29:1),
  minty's is 1.47:1 - and the `.text-bg-*` tab colours are just as theme-dependent.
  When writing (or regenerating) the baked block remember: (a) EVERY state is
  decided separately (base/hover/active/disabled) because Bootstrap paints each from
  its own `--bs-btn-*-bg`; (b) the four `--bs-btn-*-color` vars belong on the BASE
  selector (Bootstrap reads them per state, and a `:hover`-scoped var is unreadable
  when not hovered) AND an explicit `color: ... !important` is needed, because
  themes paint buttons with a literal colour (minty `.btn,.btn:hover{color:#fff}`)
  and Bootswatch's `.text-bg-*` ships `color:#fff!important`; (c) tab rules are
  scoped `smd-tabs .smd-tab-btn.text-bg-<variant>` so badges keep their own
  `.text-bg-*` colours; (d) one repaint rule PER DISTINCT COLOUR (a variant group's
  states can differ - darkly's success is #222 hover/disabled but #000 active).
  NOTE: disabled buttons additionally get Bootstrap's `opacity: .65`, which the
  measurement ignores (WCAG exempts disabled controls); and the superhero
  `btn-warning` rule (see the Danger note) stays hand-written - the generator sees
  that warning already passes, so it never emits a duplicate.
- SHARED IMAGE LIBRARY (2026-09-13): all apps share ONE images list,
  `shared-images`. `SmdConfig.imagePrefix = "shared-"` is set in every app's
  `app.js`; `smdImagePrefix()` (shared/js/smd-app.js) returns
  `SmdConfig.imagePrefix || SmdConfig.storagePrefix`, and `smd-images.js`
  `loadImages()`/`saveImages()` use `smdImagesKey()`. Components get
  `key-prefix="${smdImagePrefix()}"` (the pmd-*/cmd-* component defaults were
  updated too). `migrateImagesToShared()` (called at boot in PlanMyDay and
  CountMyDays) merges `planmydays_images` + `countmydays_images` + legacy
  `images` into `shared-images` once, then removes the old keys. Files in
  `tests/*.spec.js` seed/assert
  `shared-images`. `confirmClearAllData` still only clears the app's own
  settings/data, NOT the shared images. EVERY image consumer must go through
  `smdImagePrefix()` — the shared editor's `smd-image-card` list and the legacy
  `renderImagePicker` were still using `SmdConfig.storagePrefix`, which made
  the editor thumbnails blank while the card titles still rendered (tests that
  only assert card text don't catch it; assert `key-prefix="shared-"` + a
  rendered `src`).
- QRLINKS APP (2026-09-14): third shared-pattern app (was an old standalone
  copy). Served at `/QRLinks/`; `SmdConfig.storagePrefix = "qrlinks_"` and
  `SmdConfig.imagePrefix = "shared-"` in `QRLinks/js/app.js`. Data model:
  `loadLinks()`/`saveLinks()` (`qrlinks_links`, legacy `qr_links`) — each link
  is `{ title, url, description, image, sequence }`. Pages: `linksEditor` +
  `linkEditPage` (Sortable drag reorder via `<smd-draghandle class="drag-handle">`),
  `imagesEditor` (shared smd-images.js), `settingsPage` (smd-tabs
  Display/Danger), `imagePickerPage`. App component `qrlink-card`
  (`QRLinks/js/components/qrlink-card.js`) → emits `qrlink-qr`, which
  `app.js` turns into a shared `showSmdModal` + `<smd-qrcode>` dialog with
  Open/Close. Legacy `qr_*` keys (incl. `qr_images`) are migrated by
  `QRLinks/js/storage.js` + the shared `migrateImagesToShared()` (its sources
  now include `qr_images`); a startup reminder modal shows each boot (same
  pattern as CountMyDays). `JOBS_EDITOR_STYLES` is copied into
  `QRLinks/js/editor-styles.js` (now duplicated in 3 apps - candidate for a
  future shared extraction).
- LISTOFLISTS APP (2026-10-14): a COPY of PlanMyDay with a FULL rename, served
  at `/ListOfLists/`. `SmdConfig.storagePrefix = "lol_"` + `imagePrefix =
  "shared-"`, set EXPLICITLY in `ListOfLists/js/app.js` (PlanMyDay relies on the
  smd-app.js `planmydays_` default). RENAME MAP: Stream -> Category, Job -> List,
  Task -> List Item (code token `item`). Files renamed: `job-editor.js` ->
  `list-editor.js`, `job-search.js` -> `list-search.js`, `streams-editor.js` ->
  `categories-editor.js`; components `pmd-stream-header` -> `lol-category-header`,
  `pmd-job-summary-card` -> `lol-list-summary-card`, `pmd-job-today-card` ->
  `lol-list-main-card`, `pmd-tasks` -> `lol-list-items` (all `pmd-*` events ->
  `lol-*`, e.g. `pmd-task-change` -> `lol-list-item-change`). "today PAGE" wording
  became "main" (`#todayCardList` -> `#mainCardList`, `today-drag-card` ->
  `main-drag-card`, `today_order` -> `main_order`, `#todayTabs` -> `#mainTabs`,
  `countdownScrollBody` -> `mainScrollBody`, the "Regenerate Today's Tiles"
  button); DATE logic keeps "today" (`getTodayStr`/`getTodayDate`/
  `shouldShowListToday`/`getTomorrowStr`). The main container id is
  `#mainContainer`, NOT `countdownContainer`. TERMINOLOGY - NOTE vs DESCRIPTION
  (user, 2026-10-15): the user uses "Note" and "Description" INTERCHANGEABLY for a
  List Item's fields. A `<lol-list-items>` row actually has TWO separate fields:
  the `description` (the always-visible text INPUT) and the `note` (the textarea
  behind the pencil `.item-note-btn`, events `lol-list-item-change` field `note` /
  `lol-list-item-note-toggle`). So when the user says "note" or "description"
  about a list item, CONFIRM which of the two is meant (or name the field you are
  changing in your reply) rather than guessing - and the same wording may appear
  on the list-level `description` too (`listField('description', ...)`), which is
  a THIRD thing again. DROPPED from the copy: the whole
  Gantt (`js/gantt.js`, `js/gantt-lib.js`, `css/gantt.css`, the import map, the
  Gantt menu item, the "Show Gantt" setting and the list `duration` field), the
  CountMyDays "today events" cards (`js/cmd-today.js`, `shared/js/smd-gcal.js`,
  the CountMyDays cmd-countdown-card + googleCalendar scripts) and the "Refresh
  Google Calendar" menu item. ALSO REMOVED (2026-10-14, second pass): the
  "Split list", "Hide done" and "Auto Ad Hoc" General toggles and their features
  (the main view no longer renders Progress/Maintenance tabs or filters completed
  lists, and the Ad Hoc removal ALWAYS confirms) and the WHOLE Settings
  "Schedule" tab (`suffixStart`/`jan1`/`monday`/`startWeek`; `getListSuffix` now
  hardcodes the old defaults - Monday=1 numbering, day-of-year -1, no suffix
  offset - and the Sleep-Until picker drops `first-day-of-week`). KEPT: General
  (Auto-hide menu), Display, Minio and Danger settings, MinIO import/export, JSON
  export/import, images editor, image picker, list/category editors, list search,
  Ad Hoc. TESTS (2026-10-18): `tests/lol-regression.spec.js` (63 tests) and
  `tests/lol-screenshots.spec.js` (7 scenes x 27 themes x both modes ->
  `screenshots/lol/`) now exist, and `tests/coverage.js` collects
  `/ListOfLists/js/` (it was filtered OUT, so the app read as 0% covered). Still
  NOT in the Storybook (TODO below). Registered in `Launch`
  (a `LAUNCH_APPS` tile whose icon is the shared sample image "List of Lists",
  added as `shared/sampleImages/List_of_Lists.svg` + `shared/sampleImages.json`)
  and in `sw.js APPS` (no `ListOfLists/css/` entry - the app sheet is gone).
- SHARED HOOKS FOR THE SECOND APP (2026-10-14): the rename meant the shared theme
  CSS had to keep ONE set of declarations while matching BOTH apps, so those
  selectors are now COMMA LISTS, e.g. `#smd-app #streamsEditor pmd-stream-header
  .stream-accordion-header, #smd-app #categoriesEditor lol-category-header
  .category-accordion-header { ... }` in `shared/css/styles.css`, the mode layer
  (`light.css`/`dark.css`) and the `superhero`/`cyborg`/`darkly`/`simplex` theme
  sheets; and `pmd-tasks .task-row, lol-list-items .item-row { ... }`. The
  `--pmd-tasks-*` palette VARS were left as the single set (shared by both).
  Keep the two halves in step when adding a themed surface.
- SHARED JS accepts EITHER main-container id: `shared/js/smd-app.js` (picker
  background) and `shared/js/smd-images.js` (editor open/close) look up
  `mainContainer || countdownContainer`; `openImagesEditor` also hides
  `listSearchEditor` and injects `LISTS_EDITOR_STYLES` when present (else
  `JOBS_EDITOR_STYLES`). TODO (user asked to note it): rename
  `countdownContainer` -> `mainContainer` in the OTHER TWO apps (PlanMyDay,
  CountMyDays) so there is one id, then the shared fallbacks can go.
- SUMMARY CARDS LOST THEIR `.card` WRAPPER (2026-10-15): `pmd-job-summary-card`
  and `lol-list-summary-card` no longer wrap their content in
  `<div class="card smd-card border-0 w-100">`; the component root is now the row
  `<div class="d-flex py-2 border rounded-3">`. In the editors' accordions the
  child rows are therefore FLUSH and full width under the header, and the line
  under the header is the row's `--bs-border-color` border (matching the
  accordion-item border) instead of the shared `.card` black border. The old
  double box (black `.card` border + inset row) is gone. TESTS updated:
  `storybook-regression` cardViewer recipes use `pmd-job-summary-card > .d-flex`;
  `pmd-regression` drag-ghost check uses `.d-flex.py-2`. KNOCK-ON: the
  job-search / Search Lists rows also lose the card surface (they are bordered
  rows on the page background) - revisit if that looks wrong.
- LISTOFLISTS STORYBOOK (TODO, user request 2026-10-14): add demo sections for
  `lol-category-header`, `lol-list-summary-card`, `lol-list-main-card` and
  `lol-list-items` to `storybook/index.html` (script tags + sections + the
  nav-link count) and recipes to `storybook/cardViewer.html`, seeded with a
  neutral image prefix. Not done yet.
- PHONEBUTTONS SERVER ADDRESS (2026-10-16): the app can run served BY the Flask
  server (same origin) or from elsewhere (GitHub Pages, or the SAME server
  published through a CLOUDFLARE TUNNEL, which gives a fully-signed https URL) and
  be pointed at it via Settings | Server: an `https` checkbox, a **Server address**
  (IP OR DNS name) and an optional **Port**, plus a **Scan QR** button. Storage:
  `pb_serverHttps` / `pb_serverAddress` / `pb_serverPort` (address default
  `192.168.1.` = an incomplete prefix meaning "not configured"; port default EMPTY).
  `pbServerBase()` (`PhoneButtons/js/api.js`) resolves them to `""` when the address
  is incomplete or IS the page origin (relative paths then), else
  `<scheme>://<host>[:<port>]` — an EMPTY PORT omits it (scheme default 80/443),
  which is exactly what a tunnel URL needs since its port is 443. `pbApi._fetch`
  prefixes the base; `pbSocket.connect()` calls `io(base || undefined, …)` and the
  socket TRACKS `socketUrl`, REBUILDING when the base changes (otherwise Connect
  keeps hitting the old server); `pbSocket.isActive()` lets the address fields tear
  down a stale socket. `pbParseServerUrl()` accepts `https://host`,
  `http://host:port`, `host:port` or a bare host (port left "" when absent). Scan QR
  reuses the shared `<smd-qr-import>` with its `raw` attribute — the Share QR is a
  plain URL, so the JSON/lz-string envelope must be skipped (and lz-string is not
  even loaded).
  SERVER: `app.py` enables CORS (`SocketIO(app, cors_allowed_origins=_CORS_ORIGINS)`
  + an `@app.after_request` ACAO block; `PB_CORS_ORIGINS` env, default `*`) because
  the app may be a DIFFERENT origin. SECURITY: this server injects keystrokes, so
  restrict `PB_CORS_ORIGINS` on an untrusted network. Tunnel: point it at
  `http://127.0.0.1:5000` and leave the app's Port EMPTY + https ticked.
  GOTCHA: `inputmode="decimal"` on the address field gives iOS a digits-and-dot-only
  keypad, which makes DNS impossible — it is `inputmode="url"` with
  autocapitalize/autocorrect/spellcheck off. `:` is rejected in the address field
  (the port has its own field, else `host:5000` + port 5000 -> `:5000:5000`).
  - SERVER-RELATIVE ASSETS (2026-10-16, BUG): the server answers with ROOT-RELATIVE
    URLs (`/app-icon-cache/<name>.png`) for app icons — from `_cache_icon()`, so BOTH
    `/api/apps` AND the socket's `app_change` — and the Manage Layout picker builds
    one from a NAME. A root-relative URL is only correct when the app is served BY
    that server; from another origin the browser resolves it against the APP's host
    (the reported `ownimage.github.io/app-icon-cache/Windows%20Terminal%20Host.png`
    instead of the tunnel URL). FIX: new `pbServerUrl(path)` in api.js prefixes
    server-relative paths with `pbServerBase()` (absolute and protocol-relative paths,
    and an empty base, pass through), used by `main-view.js` (the `app_change` icon),
    `edit-app.js` (the Manage App dropdown's `imageUrl`) and `edit-layout.js`
    (`iconCacheUrl`). RULE: ANY url the SERVER supplies must go through
    `pbServerUrl()` before it reaches a `src`.
  - CLOUDFLARE TUNNEL + QR (2026-10-16): `app.py` gained `--tunnel` (starts
    `cloudflared tunnel --url http://127.0.0.1:5000`, echoes its output, REGEXes the
    first `https://<name>.trycloudflare.com`, then prints the Settings values to
    enter), `--no-tunnel` (override) and `--qr <url>` (a QR for an address you already
    have, e.g. a NAMED tunnel). `PhoneButtonServer.cmd` passes `--tunnel` by DEFAULT
    (it only adds it when the user gave no `--tunnel`/`--no-tunnel`/`--qr`) and it
    again KILLS anything on port 5000 first. The QR is served by a new route
    `/phonebuttons-qr?value=<url>`, rendered with the SHARED vendored
    `shared/vendor/qrcode.min.js` (global `QRCode`), opened at
    `http://127.0.0.1:5000/phonebuttons-qr?...` via `webbrowser`. `_find_cloudflared()`
    checks `PB_CLOUDFLARED`, then PATH, then the usual install dirs; cloudflared is NOT
    installed on this box, so without it the server still runs and prints an install
    hint (`winget install cloudflare.cloudflared`). SECURITY: a quick tunnel is
    PUBLIC (anyone with the random URL can drive the keyboard), and the QR route must
    escape its value for BOTH html AND JS (`json.dumps` + `\u003c/\u003e/\u0026`) —
    a raw `</script>` in the value would otherwise break out of the script block.
- SAMPLE IMAGES MERGE (2026-09-14): the old `QRLinks/sampleImages.json` (8
  images, legacy `{name,data}` format) was merged into the shared set — all 8
  were already present in `shared/sampleImages.json` (shared is master; e.g.
  "solar controlar" → "Solar Controlar"), so nothing new was added and the
  QRLinks copy was deleted. New images go in as NATIVE files in
  `shared/sampleImages/` then `node shared/regen_sample_images.js regen`
  (SVG → `data`; non-SVG → `data64`/`data80`/`data100` thumbs, full-size file
  stays in the folder).
- FIRST-VISIT SEED RACE (2026-09-14): the async sample seeders must RE-CHECK
  their storage key inside `.then()` before writing (done for
  `seedSampleImages` and QRLinks `seedSampleLinks`). Without it, a test/user
  that clears+seeds storage right after boot gets the fetch overwriting their
  data when it resolves late.
- SETTINGS STYLES (2026-09-13): `SETTINGS_STYLES` + `injectSettingsStyles()`
  moved from the apps' `editor-styles.js` into `shared/js/smd-settings.js`
  (generic shadow styles for every app's settings page). PlanMyDay keeps only
  `JOBS_EDITOR_STYLES`/`STREAMS_EDITOR_STYLES`; CountMyDays keeps
  `JOBS_EDITOR_STYLES` + `CMD_EDITOR_STYLES`; the shared
  `injectSettingsStyles()` appends `CMD_EDITOR_STYLES` when it is defined.
- APP SCRIPT SPLIT (2026-09-11): `PlanMyDay/js/app.js` is now just the entry
  (~238 lines: dev flag, image-size wiring, DOMContentLoaded wiring,
  pull-to-refresh); the app lives in classic scripts `storage.js`, `utils.js`,
  `editor-styles.js`, `editor-common.js`, `job-editor.js`, `streams-editor.js`,
  `job-search.js`, `main-view.js`, `app-settings.js`. Keep every top-level
  function a GLOBAL (no ES modules/IIFE wrapping): generated HTML uses inline
  `onclick` and ~20 tests call globals via `page.evaluate`. Adding/removing an
  app script = a `document.write('js/<file>.js?v=' + BUILD_NUMBER)` tag in
  `PlanMyDay/index.html` (after the `smd-*` services, `app.js` LAST), an entry in
  `sw.js` `APPS["PlanMyDay/"]`, and a `BUILD_NUMBER` bump. Keep `js/app.js`
  specifically — the sub-path precache test asserts that exact path.
- TOUCH SIZE (2026-09-12): the old body-class "Drag size" setting is gone;
  Settings/Display now has **Touch size** (`#touchSizeSelector`, storage key
  `planmydays_touchSize`, legacy `planmydays_dragSize` still read as a fallback).
  It is a VALUE, not a style: `app.js` `applyTouchSize()` calls
  `SmdDragHandle.setDefaultSize(value)` + `SmdCheckbox.setDefaultSize(value)`
  ("normal" | "large") at boot, and `changeTouchSize()` (shared
  `smd-settings.js`) re-applies it. Both components keep their per-size sheet
  LAST and replace it, and each exposes a per-instance `size` attribute
  override. `smd-draghandle` (`shared/js/components/smd-draghandle.js`) renders
  FA solid `fa-bars` (hardcoded glyph U+F0C9 / weight 900, inline
  font-family) and always carries `class="drag-handle"` — Sortable's `handle`
  selector and every test locator target that class. The old `.drag-handle`
  CSS, `body.drag-size-*` classes and `[data-theme] … .drag-handle` overrides
  were removed; `#btnMainMenu` uses `<i class="fa-solid fa-bars">` (light DOM,
  so the document FA css applies).
- COUNTMYDAYS (2026-09-12): second PWA migrated to the shared pattern. Served at
  `/CountMyDays/`; `SmdConfig.storagePrefix = "countmydays_"` set in
  `CountMyDays/js/app.js`. The old UNPREFIXED-key migration
  (`migrateLegacyStorage`) and its boot reminder were REMOVED (2026-10-18; the
  only temporary migration now is the category-id one, see the CATEGORY IDS note).
  Pages: `datesEditor` + `dateEditPage`,
  `categoriesEditor` + `categoryEditPage`, `imagesEditor` (shared smd-images.js),
  `settingsPage` (smd-tabs), `exportWizardPage`, `qrExportPage`, `qrImportPage`,
  `importWizardPage`, `imagePickerPage`. App components:
  `cmd-countdown-card` / `cmd-date-card` / `cmd-category-card`
  (`CountMyDays/js/components/`). Countdown tile typography uses body-scoped
  `--cmd-countdown-*` vars (WebKit-safe) and `applyImageSize()` caps smd-image at
  64px on <=480px screens (the original app's media query). Images-editor
  integration with CountMyDays' data model is via `SmdConfig` hooks read by
  shared `smd-images.js`: `imageInUse(name)`, `onImageDelete(name)`,
  `onImageRename(old,new)` (unset for PlanMyDay -> old behaviour).
- SHARED QR (2026-09-12): `<smd-qr-export>` + `<smd-qr-import>` are GENERIC —
  `value` is any string (app passes `JSON.stringify(json)`); the wire format is
  lz-string-compressed chunks in an envelope `{index,total,chunk}`. Import emits
  `smd-qr-import-complete` `{ data }` (parsed JSON). Import always uses jsQR +
  getUserMedia: html5-qrcode is NOT vendored because it resolves its reader with
  `document.getElementById`, which cannot see shadow roots. Vendored:
  `shared/vendor/lz-string.min.js`, `shared/vendor/jsQR.js` (precached).
- Brite theme: `shared/css/themes/brite/bootstrap.min.css` from Bootswatch
  **5.3.8** (all other themes, including the standard-Bootstrap `bootstrap`
  theme, are 5.3.3) + `themeConfig` entry + precache — theme count is now 27.
  The `bootstrap` theme (2026-09-26) is the UNTHEMED stock
  `bootstrap@5.3.3/dist/css/bootstrap.min.css` (folder
  `shared/css/themes/bootstrap/`, empty override `bootstrap.css`). All screenshot
  suites iterate `themeConfig` through `tests/screenshot-helpers.js` (which
  asserts the theme count — bump it in lockstep), so a new theme is picked up
  automatically; the Storybook card viewer and the screenshots viewer also
  enumerate the live `themeConfig`/screenshot tree with no hardcoded list.
- DEFAULT THEME (2026-09-17; mode removed 2026-09-26): **superhero** everywhere —
  every app's `app.js`/`app-settings.js` theme fallback, `SmdApp.themeDefault`,
  the shared `applyTheme()` invalid-name fallback, the storybook's static
  `<html data-theme>`/`data-bs-theme` hints and every static head `<link>`
  (`bootstrap-theme-css` + `theme-override-specific`) all use `superhero`.
  THEMES HAVE NO DEFAULT COLOUR MODE: the global Theme Mode (Light/Dark) is the
  only mode source and normalizes to `light` when unset/invalid. darkly stays a
  valid selectable theme, just no longer the default.
- THEME OVERRIDE CSS (2026-09-17; mode sheet removed 2026-09-26; PER-MODE FILES
  2026-09-27): each theme's `shared/css/themes/<theme>/bootstrap.min.css` is NEVER
  edited. ONE override stylesheet remains, managed by `applyTheme()` in
  `shared/js/smd-settings.js`: `#theme-override-specific` =
  `css/themes/<theme>/<theme>.<mode>.css`. **The mode is part of the file name**
  (user request, 2026-09-27): each theme ships `<theme>.light.css` AND
  `<theme>.dark.css` and there is no mode-less `<theme>.css` any more (all 27
  were split; the per-mode pairs are the only per-theme override files). Because
  the sheet is per-mode, `applyThemeMode()` — not just `applyTheme()` — re-points
  the link, so a mode switch fetches the other mode's small CSS file. The base
  theme sheet is still NOT reloaded by a mode switch, and `renderMain()` is still
  not called. Inside a per-mode file a `[data-bs-theme="..."]` qualifier is
  redundant and was dropped at the split (the file only loads in that mode); keep
  it out. It is declared statically in every app/storybook `<head>` as
  `superhero.light.css` (the default mode is light) and `applyTheme()`
  re-points it (creating on demand) on every theme/mode switch — layering is
  theme base < shared/app css < per-theme+mode override. All 54 files are in
  `sw.js` SHARED_ASSETS. Most pairs are comment-only stubs; `superhero.*.css` and
  `cyborg.*.css` carry real overrides. The override sheet is the LAST
  stylesheet in `<head>` (see the "Authoritative CSS cascade" note), so it may
  use a bare `:root { ... }` - it wins over `shared/css/styles.css` by document
  order, no attribute-qualified selector is needed.
  A mode switch re-points the link, so any test that waits on the theme override
  after changing the mode must poll the link/sheet, not just `data-bs-theme`.
- IMAGE SIZES (2026-09-17): ONE six-size scheme in every app's Settings
  (Icon/Image size select): xsmall=32, small=40, medium=50, large=64, xlarge=80,
  jumbo=100 (labels match the six font sizes). Stored key is still
  `smdKey("iconSize")`; the default is now `medium` (50px) in ALL apps — the
  `|| "medium"` fallback lives in `pmdImageSize()` (PlanMyDay/js/app.js),
  `applyImageSize()` (CountMyDays/QRLinks `app-settings.js`, Launch/js/app.js)
  and the shared `smd-settings.js` DOMContentLoaded restore. `changeIconSize`
  clears all six `icon-size-*` body classes. `smd-image` `_renderStored` sources
  `[px, px*2, 100, 80, 64]`, so it already picks data64/80/100 for every size.
  TEST NOTE: the pixel literals in pmd-regression ("icon size setting controls
  the rendered image size..." small→40px/data80, medium→50px/data100,
  large→64px/data64; "stream selector images follow..." 40/64px) and
  cmd-regression ("icon size drives the smd-image render size" →40px) encode the
  mapping — grep spec files for px literals when the mapping changes. Launch's
  tiles stay fixed 80px (`.app-tile img`); its Image size setting only drives
  `<smd-image>` defaults, which Launch does not render.
- IMAGE RENDER-URL / CACHE (2026-09-20): `<img>`/`<smd-image>` no longer embed the
  painted data URL in `src`. `shared/js/smd-images.js` `smdImageRenderUrl(painted)`
  resolves to a short render URL, memoised per session and deduped across cards:
  `SMD_IMAGE_CACHE_BASE + smdImageHash(painted)` (`…/smd-img/<16-hex>` — FNV-1a ×2,
   deterministic) when the service worker controls the page, else a per-session
  blob URL. `smdImageHash`/`smdImageBlobUrl`/`smdImageCacheUrl`/`smdSwControls`/
  `smdSetImageSrc` are globals EXPORTED on `SmdApp.prototype` too. `sw.js` serves
  `/smd-img/` from its `myapps-images` Cache Storage (NOT build-tagged, survives
  rebuilds) or a 1×1 transparent GIF on a miss; the activate keep-list must hold
  `IMAGE_CACHE`. GC: `smdImagePaintVariants(img)` (data/data64/80/100 × light/dark)
  computes the live hashes; `purgeStaleImageCache()` deletes any other entry.
  CRITICAL: `applySvgAttr`/`updateSvgColor` in smd-images.js and smd-image.js are
  BYTE-IDENTICAL (guards GC live-set correctness) — keep them in sync. **Cache
  Storage contention gotcha (Chromium serialises per-origin cache ops)**: when the
  SW does NOT control the page (first visit, most tests), `smdImageRenderUrl` and
  the GC SKIP Cache Storage entirely (pure blob URL) — running `caches.match/open`
  on cold parallel test pages stalled navigations/buttons intermittently.
  `smd-image` `_renderStored` is ASYNC (`_renderSeq` stale-guard, empty box while
  resolving); preview `<img>` writers use `src="" data-smdsrc="…"` filled via
  `smdSetImageSrc` after render. Tests must assert async fills (fetch the resolved
  `src`) rather than `src*=data:`.
- IMAGE SWAP ON iOS (2026-10-20): `smd-image` no longer re-sources its single
  `<img>` in place. `_paintImage` builds a NEW `<img>`, waits for
  `decode()`/load, then `replaceWith`s it. `_renderSeq` is bumped ONCE in
  `_render()` (not in `_renderStored`) so it also cancels a pending stored-image
  paint when the element switches to an icon. Why: an in-place
  `removeAttribute("src")` + `img.src = url` left the previous bitmap
  composited with the new one on WebKit (every iOS browser) - the Job editor's
  stream/category thumbnail showed half of the old image and half of the new
  one. It was intermittent because memoised `smdImageRenderUrl` results resolve
  in a microtask, so the clear + re-source coalesced into ONE paint; the first
  (uncached) view of an image awaited a fetch and swapped cleanly. Do NOT
  "simplify" this back to `img.src = url`; the regression tests ("changing the
  image swaps in a fresh decoded img element" / "job editor stream thumbnail
  switches to the new category image") assert the element is replaced and the
  bytes match the NEW image.
- MENU ORDER (2026-09-17; Launch item added to the Launch app 2026-10-18): every
  app's hamburger menu lists **Settings**, a divider, **Launch**, then (where there
  is anything else) another divider and the rest of the options. ALL EIGHT shells
  including Launch itself now carry the static `<a class="dropdown-item"
  href="./">Launch</a>` that `SmdApps.buildLaunchSubmenu()` replaces with the
  flyout, so the launcher can jump straight to any app too; a shell with nothing
  after Launch simply omits the trailing divider (a dangling `<hr>` is a bug, not
  a style). All apps
  also expose the six font sizes (xsmall/small/normal/large/xlarge/jumbo) in
  Settings; FreeFormOX + Launch gained the Font size selector this session
  (Launch's `.app-name` rules already covered the sizes; FreeFormOX got new
  `body.font-size-*` rules for its game text).
- GOOGLE CALENDAR (2026-09-13): `CountMyDays/js/googleCalendar.js` (GSI OAuth +
  Calendar REST + `{count_my_days{...}}` description payload helpers) and
  `CountMyDays/js/googleCalendarEditor.js` (unified dates editor Google rows +
  `googleEventsPage`/`googleEventEditPage` smd-pages). Settings has a **G Cal**
  tab (`General | G Cal | Minio | Danger`); when enabled, `.google-menu-item`
  entries appear in the hamburger menu. Feed cache + settings are namespaced
  (`countmydays_google_cal`, `countmydays_gcal_*`) by `gcalKey()`/
  `googleCalCacheKey()` (call-time helpers — do NOT turn them into parse-time
  consts: google scripts load BEFORE `app.js`, which sets the storage prefix).
  Legacy `cmd_gcal_*`/`cmd_google_cal` keys are in
  `storage.js CMD_LEGACY_STORAGE_MAP` and migrated on boot. `cmd-date-card` grew
  `source`/`recurring`/`hidden` attributes (Local/Google/Repeat/Hidden badges,
  no Delete for Google rows) and its events now carry `source`. Sample feed:
  `CountMyDays/js/googleCalendarSample.json` ("Load sample data"). The app-info
  dialogs use `showSmdModal`, not a custom overlay.
- CATEGORY IDS (2026-10-20, user request; temporary migration removed same day):
  CountMyDays categories are `{ id, name, image }` and the **id is immutable**.
  Dates and the Google `{count_my_days{...}}` payload keep their existing
  `category` field, but it now stores the category ID. New categories get
  `nextCategoryId()` = highest numeric id + 1, skipping any number already used
  as an id OR a category name. All lookups go through `findCategoryByRef()` /
  `categoryNameForRef()` (`categoryRef()` falls back to the name at READ time
  for legacy/imported data), and every view resolves the id to the name. A
  rename therefore changes ONLY the name; dates are never rewritten.
  `PlanMyDay/js/cmd-today.js` resolves the same ids for its today cards.
  Import/export keep working: exported categories carry ids; the wizard
  normalises old files (ids default to names), keeps existing ids on overwrite,
  allocates fresh ids for new/kept-both categories, and writes ids back onto
  imported dates. The bundled `sampleData.json` categories carry `id` = name,
  so first-visit seeds are already id'd.
  The temporary `migrateCategoryIds()` boot step and the
  `showCategoryIdMigrationReminder()` popup were REMOVED (all stored data has
  ids): boot is just `renderMain()` -> `seedSampleData()`, and no startup modal
  exists, so tests no longer dismiss one. Keep the id mapping/lookup helpers.
  `cmd-countdown-card` shows the Local/Google source as an `<smd-badge>` under the
  date (`source` attribute set by `main-view.js`), using the standard
  primary/secondary button variants for now (pending styling refinement).
- COUNTDOWN CARD START TIME (2026-10-20, user request): `shared/js/smd-gcal.js`
  `gcalEventToDate()` keeps `startTime` (`HH:MM`, device-local, 24-hour) when the
  Google event has `start.dateTime`; all-day events (`start.date`) and local
  dates have no time. `<cmd-countdown-card>` gained a `time-text` attribute,
  rendered by `.time-text` IMMEDIATELY BEFORE `.source-badge` inside
  `.source-row`, and hidden when empty. BOTH apps feed the SAME component:
  `CountMyDays/js/main-view.js` and `PlanMyDay/js/cmd-today.js` each pass
  `time-text` from `d.startTime` (PlanMyDay loads
  `../CountMyDays/js/components/cmd-countdown-card.js` in its shell). The
  `.date-text` row dropped its `mb-1` - the 4px gap under the date looked too
  loose (user request). Tests: cmd-regression "timed Google events show the start
  time just before the source badge" (also asserts all-day/local show none) and
  pmd-regression "shows a timed Google event's start time just before the badge".
- LISTOFLISTS MINIO BACKUP (2026-10-20, user request): the shared
  `shared/js/smd-minio.js` export used a hard-coded `planmydays-<ts>.json`
  filename and PlanMyDay's `streams` payload, so ListOfLists backups were both
  misnamed and missing its categories. New shared hooks:
  `SmdConfig.minioExportPrefix` (default `"planmydays"`),
  `SmdConfig.minioExportData()` (default `{version, exportedAt, streams, images}`)
  and `SmdConfig.onMinioImport(data, key)` (the key is the second arg now).
  ListOfLists sets `minioExportPrefix = "listoflists"`,
  `minioExportData = lolExportPayload` (`{version, exportedAt, categories,
  images}`) and `onMinioImport` to restore `lol_categories` + images, close the
  import page, alert with the filename and `regenerateTiles()`. Its JSON download
  uses the SAME `lolExportPayload()`. PlanMyDay sets no hooks, so it still writes
  `planmydays-<ts>.json` with `streams` (guarded by pmd-regression "export to
  minio keeps the planmydays filename and streams payload"). LoL tests: "Export
  to Minio names the file listoflists-<datetime>.json and uploads the categories
  payload" and "Importing from Minio restores the categories through the app
  hook".
- LISTOFLISTS MAIN-VIEW ORDER = EDIT-CATEGORIES ORDER (2026-10-20, user request):
  `ListOfLists/js/main-view.js` `renderMain()` no longer sorts cards by the daily
  `lol_main_order` snapshot. It now walks categories sorted by `sequence` (the
  same comparator as `categories-editor.js`) and each category's `lists` array in
  stored order, keeping only `active !== false` + `shouldShowListToday()`. So
  dragging categories/lists or using "Sort Lists in Categories" changes the front
  screen immediately, and the old global time-sort from
  `addScheduleListsToOrder()` no longer decides display order. `main_order` is
  still maintained (Active toggles, list add/delete, `ensureMainList` daily reset)
  but is no longer read for display. Tests: "the main view follows the Edit
  Categories order, not the daily main_order snapshot", "reordering lists within
  a category reorders the main view", and the Sort test now also asserts the main
  card order.
- EDIT GOOGLE EVENT MIRRORS EDIT DATE (2026-10-18, user request): the
  `#googleEventEditPage` content in `CountMyDays/js/googleCalendarEditor.js`
  (`renderGcalEditContent`) now follows the Edit Date page row-for-row: (1) a
  `Title` label + `#gcalTitleInput` (readonly, full width), (2) `Category` +
  `Image` on one row (`#gcalCategorySelect` = the SHARED `<smd-image-dropdown>`
  with `key-prefix` + `style="min-width:220px"`, and `#gcalImageSelect`), (3)
  `#gcalDateInput` + `#gcalTypeInput` on one row (both readonly, both
  `class="form-control w-auto"`, `aria-label` Date/Type, reading the existing
  "Once"/"Recurring" wording), (4) the `#gcalShowCheck` tick on its own row. The
  old left column (`#gcalCategoryPreview` tile + a native `<smd-select>`) and
  `updateGcalCategoryPreview()` are DELETED: the dropdown itself carries the
  category image, exactly like Edit Date. The dropdown is wired the Edit Date
  way - `openGcalEditPage` binds ONE `smd-image-dropdown-change` listener on the
  page (guard `page.__cmdGcalCategoryBound`) and identifies the source via
  `composedPath()` (events retarget to the page host), mapping "No Category" ->
  `""`. The footer is now `Cancel | OK` (was `OK | Cancel`) to match every other
  page. TESTS: `cmd-regression` "Edit Google Event uses the Edit Date layout
  (Title / Category+Image / Date+Type / Show)" asserts the ids/readonly state,
  the missing preview tile, the row ORDER and the pair geometry (same start +
  shared vertical band - NOT centre equality: the Image control is taller, it
  carries the name + Edit button), and the older "google events editor search,
  edit, cancel and close" test now drives the category via
  `#gcalCategorySelect #smdImageDropdownBtn` + `#smdImageDropdownMenu .dropdown-item`
  instead of `pickOption` (it is no longer an `<smd-select>`).
- MINIO IN COUNTMYDAYS + THE SHARED HOOKS (2026-10-18): `shared/js/smd-minio.js`
  now has TWO optional `SmdConfig` hooks so an app can own the DATA ends while the
  module keeps the settings fields, the signed S3 requests and the import page:
  - `SmdConfig.onMinioExport(config)` - called AFTER the config is validated; the
    app decides what to save. CountMyDays sets it to open its EXPORT WIZARD
    (`startExportWizard("minio")`, first step titled "Export to Minio") and then
    uploads when the wizard finishes (`doMinioExport` in
    `CountMyDays/js/export.js`), so the wizard's scope choices decide the payload.
    The file is `countmydays-<YYYYMMDDHHMM>.json` and has EXACTLY the JSON-export
    shape `{ dates, categories, images }`, so a MinIO backup can also be loaded
    with "Import JSON" (and vice versa). The validated config is handed over via
    `window.__minioExportConfig` because the wizard is async.
  - `SmdConfig.onMinioImport(data)` - receives the parsed JSON; return true when
    accepted (the app owns the UI, INCLUDING closing `#minioImportPage`) or false
    for "invalid file" (the module then shows its error alert and reloads the file
    list). CountMyDays validates dates+categories+images, calls
    `closeMinioImport()` and hands the data to `startImportWizard(data)`, so its
    per-section keep/replace prompts apply. PlanMyDay sets neither hook, so it
    keeps writing straight over its streams+images.
  THE UI (CountMyDays): a PlanMyDay-style Minio SETTINGS TAB (`General | Display |
  G Cal | Minio | Danger`; `#minioEnabled` + `#minioServer`/`#minioUsername`/
  `#minioPassword` (+ eye)/`#minioBucket`, with `loadMinioSettings()` +
  `bindMinioSettingsTabBehavior()` called from `openSettings()`'s `restore`), the
  two `.minio-menu-item` entries (after "Import QR", toggled by
  `updateMinioMenu()` at boot and on enable), the `#minioImportPage` host, the
  `shared/js/smd-minio.js` script tag (after smd-images.js) and
  `minioImportPage` added to `hideMainPages()` - ADD IT THERE for any future app,
  or the page opens over the main view instead of replacing it. Keys use the
  app's own `smdKey()` namespace (`countmydays_minio_*`).
  TESTS: cmd-regression "Minio" (8: tab + disabled fields + persistence, menu
  gating, refuse-without-config, export runs the wizard and uploads the full
  payload, partial selection honoured, import hands the file to the wizard,
  invalid file rejected + list reloaded, disabled import is a no-op) - they stub
  `minioPutObject` for the upload and `page.route` the `minio:9000` host for the
  list/GET. PlanMyDay's 50 Minio tests still pass.
- SHARED IMAGE EDITOR (2026-09-13): `<smd-image-editor>`  (`shared/js/components/smd-image-editor.js`) is the ONE image edit form both
  apps host in their Bootstrap `#imageEditModal`. It renders in the LIGHT DOM on
  purpose: Bootstrap/app CSS must style it and the many existing selectors
  (`#imageEditModalBody .card input.form-control`, `.fw-bold`, …) keep working.
  `shared/js/smd-images.js` sets `image`/`index`/`isNew`/`isDuplicate` + calls
  `render()`, and handles `smd-image-editor-action` (`ok`/`cancel`/`upload`).
  The image-edit preview sizing (the `.data-img` hook class, see the 2026-09-27
  (e) note) is applied INLINE from `SmdImage.defaultSize`, not from a rule here,
  so this sheet deliberately has no `.data-img` rule. The
  storybook has a section (its demo needs the `smd-images.js` script, which the
  storybook now loads).
- SMD-IMAGE-CARD TILE SWATCHES (2026-10-04): the Edit Images tile
  (`<smd-image-card>`) renders THREE `<smd-image>` on one row — the main thumb
  (`.thumb`, theme auto) plus a light and a dark theme swatch
  (`.theme-swatch`, each `data-bs-theme="light|dark"` + `p-1 border rounded`
  plus an inline fixed background/border). The three buttons sit in a `d-flex flex-grow-1
  justify-content-between` container so they spread across the remaining space;
  the name stays once below the row (swatches carry no name). The swatches each
  set their own `theme` attribute so they paint that theme's colour overrides.
  UPDATED 2026-10-13: the swatch SURFACES are the fixed white/black preview
  constants (`--smd-preview-{light,dark}-{background,border}` in
  light.css/dark.css), NOT `bg-body` - a theme's own "light" surface is not
  lighter (superhero's LIGHT surface is the dark navy #0f2537, so the light
  swatch rendered dark). The edit dialog's swatches use the same constants. Because a card now holds 3 `smd-image`,
  selectors that meant the main thumb must use `.thumb smd-image`
  (cmd/pmd/qrlinks specs updated). Test: cmd-regression "image tile shows the
  main image plus light and dark theme swatches on one row".
- `hideNav()` (shared smd-settings.js) now hides when NO
  `smd-page:not(.d-none)` is open — generic for any app's page set (was a
  hardcoded PlanMyDay id list).
- PMD TODAY TABS OWN THEIR CONTENT (2026-10-13; `.tab-content` removed 2026-10-15):
  the PlanMyDay main-view split-list
  tabs (`#todayTabs`) used to set `hide-panels` and render the job list as a SIBLING
  below the tab bar. They now render `#countdownScrollBody` > `#todayCardList`
  INSIDE the ACTIVE `.smd-tab-panel` (no `hide-panels`).
  `PlanMyDay/js/main-view.js` injects `injectTodayTabsLayout()` making
  `#todayTabsWrap` / `#todayTabs` / `#todayTabs > .smd-tab-panel.active` a flex
  column with `min-height:0`, so the tab bar stays put and the active panel's body
  scrolls (the component's own sheet only sets `display:block`). The `hide-panels`
  attribute stays supported in smd-tabs but is no longer used by any app.
- `smd-page` GOTCHA: a footer button auto-hides its page BEFORE dispatching
  `smd-page-action` unless the button config sets `close: false`. Any button
  whose handler validates or decides (Add/OK/etc.) MUST use `close: false` and
  hide the page itself, otherwise the page closes under the user on validation
  failure.

- PMD MAIN-VIEW SCROLL WHEN THE JOB EDITOR CLOSES (2026-10-15): opening the job
  editor hid `#countdownContainer` with `d-none` (`hideJobEditBackground()`);
  `display:none` collapses the document, which CLAMPS the window scroll to the
  top, so closing the editor after an edit that removes a job from today's list
  (or swipe-right then OK) redrew the list at the top. Deleting (swipe left)
  never hid the container, so it was always fine. FIX: hide with Bootstrap
  `.invisible` (`visibility:hidden` keeps the layout AND the scroll position),
  and remove both `d-none` and `invisible` on restore. Because `.invisible` keeps
  the document TALL, the root scroll is ALSO locked while the editor is open
  (`document.documentElement.style.overflow = "hidden"`), otherwise the background
  page's scrollbar stays visible (reported as "I still see the scroll bar");
  `overflow:hidden` PRESERVES the scroll offset (verified) and is cleared on
  restore, so the list returns exactly where it was. Do NOT instead restore an
  ABSOLUTE scroll on re-render: the auto-hide nav collapses while a page is open
  and re-expands ~50ms after close (`smd-page.hide()` drops the `open` attribute
  at `duration + 50ms`, and a MutationObserver toggles `#btnMainMenu.hidden`), so
  the document grows by the nav height and the browser's scroll anchoring shifts
  the offset to keep the same content in view - forcing an absolute value makes
  the list jump again. Tests: `tests/pmd-regression.spec.js` "Main View Scroll"
  (view + edit the date into the future; swipe-right then OK; the root is
  scroll-locked while the editor is open) assert the list did not jump to the
  top. NOTE: `ListOfLists/js/list-editor.js` still hides `#mainContainer` with
  `d-none` and has the same pattern (no tests yet); the OTHER PlanMyDay pages
  (Settings / Streams / Search / Images / Gantt / image picker) also still hide
  `#countdownContainer` with `d-none`, so they can reset the main view's scroll to
  the top on close too - not addressed here.

- PMD SWIPE-RIGHT SLEEP PICKER TIMING (2026-10-15): swipe right
  (`openJobEditSchedule`) opens the job editor on the Schedule tab and pops the
  "Sleep Until" flatpickr. Opening the calendar while the page is still SLIDING in
  positions it against the input's transient (translated) location, so it can
  appear half off the screen - and when the old "rect is stable across two frames"
  poll's 120-frame (~2s) cap expired mid-slide it never opened at all. The
  stability check was not enough: the first frames can be identical BEFORE the
  transition starts. FIX: `shared/js/components/smd-page.js` gained
  `whenSlideDone(callback)` - runs the callback on the `.smd-page` transform
  `transitionend`, falls back to the next frame when there is no slide, and to a
  timeout (`transitionDuration + transitionDelay + 250ms`) if the event never
  arrives, so it always runs exactly once. `openJobSleepPickerWhenReady()` waits
  for the page to be `open`, then `page.whenSlideDone(...)` before `fp.open()`.
  PROBE (the only way to reproduce it): with a controlled slow slide the calendar
  opened at `translateX(-1280)` at t=40ms on the old code and `translateX(0)` at
  t=1286ms after the fix. TEST: pmd-regression "smd-page: slide duration >
  whenSlideDone runs the callback only after the slide transition finishes"
  (RED before the helper existed). It drives a page it creates itself (and commits
  the off-screen start style before `show()`, or the browser skips the
  transition); a test through the real swipe gesture could NOT be made red because
  this harness's page build often does not run the slide at all
  (`transitionstart` never fires for `.smd-page`), so the picker open is correct
  there either way.

Techniques / gotchas:
- **`:host-context()` is NOT supported by WebKit/Safari** (so it silently does
  nothing in every iOS browser): shadow-DOM styling that keys off `body.*`
  classes (font size, density) must use CSS custom properties set on `body`
  instead — they inherit into shadow roots and work everywhere. `pmd-job-today-card`
  reads `--pmd-today-*` (defined in `PlanMyDay/css/styles.css`). A WebKit test in
  `pmd-touch.spec.js` guards this ("display font size and density settings scale
  the today card title").
- Card thumbnails (`pmd-job-today-card`, `pmd-stream-header`, `pmd-stream-job-card`,
  `pmd-job-search-card`): the `.thumb` wrappers are ALWAYS rendered (no `hidden`);
  only the inner `smd-image`'s `image` attribute is toggled. Hiding a wrapper lets
  later images slide left, so titles/headings stop lining up across cards.
- `smd-image` size is a VALUE: `SmdImage.setDefaultSize(px)` (set from the app's
  image-size setting) is used by every image without an explicit `size` attr, and
  the component's own `:host` sheet sizes it — never set width/height on the host
  from outside (outer author styles win over `:host`). Keep the per-size sheet
  LAST and REPLACE it on re-render: `adoptStyles` dedups by text, so appending a
  previously-used sheet would leave an older, smaller size winning.
- To inspect computed styles/DOM, drop a temp `tests/_probe.spec.js` that writes JSON via `require("fs").writeFileSync(path.join(__dirname, "_probe.out.json"), ...)`, run it with `--reporter=line`, `Get-Content` the JSON, then delete both files. (test `console.log` is hidden by the list reporter).
- **Playwright TRUNCATES large received/expected values in failure output** (`pretty-format` prints `…` and folds long arrays, e.g. a `expect(cachedUrls).toEqual(expect.arrayContaining([...]))` diff shows only the first ~10 cache URLs). There is NO config to raise the limit. When a failure depends on a full array/object (URL lists, cache keys, response lists), DON'T read it from the error message — extend/replace the probe (`_probe.spec.js`) to `writeFileSync` the ENTIRE array and `Get-Content` that file. "The received list is truncated" is always a probe job, never a reason to rerun the test for inspection.
- `page.evaluate` can't see inside shadow roots: query `document.getElementById("<pageId>").shadowRoot` first (e.g. `#streamsEditor`, `#jobEditPage`, `#smdConfirmModal`). Playwright locators pierce automatically.
- SWIPE-GESTURE TESTS (2026-09-18): components that listen for pointer events on
  their HOST can be driven two ways — (a) real `page.mouse.down()/move()/up()`
  when the pointer handler runs in a real browser (active pointer exists, so
  `setPointerCapture` works); (b) `locator.dispatchEvent("pointerdown|pointermove|pointerup", { pointerId, clientX, clientY, button, buttons })` for touch-style tests (synthetic pointer — `setPointerCapture` THROWS `NotFoundError` for a fake pointerId, so the component must try/catch it). A touch drag helper already exists in `pmd-touch.spec.js` (`touchDrag`, pointerType:"touch" via the document's element-from-point) if a real hit-test is preferred. Remember `touch-action` must be pan-y (or similar) on the swipable element so vertical scroll still works and horizontal gestures reach the JS.
- SW PRECACHE TEST FLAKE (2026-09-13): the sub-path tests (`cmd-regression.spec.js` and `pmd-regression.spec.js`) wait for a fresh SW install that precaches ~250 URLs from the single python server. Under the 10-shard waves a single transient request failure rejects `cache.addAll`, install stays failed with NO worker, and the old 60s poll never saw `active`. Both tests now: `test.setTimeout(300000)`, poll for 240s, and when a registration exists with no `installing`/`waiting`/`active` worker they `unregister()` + `register()` again to retry the install. If a precache URL genuinely 404s the test still fails (as intended).
- smd-button disabled/`.disabled` assertions must target the inner native button: `#id button`, not the host element.
- A DISABLED `smd-button` IS CLICKABLE WITHOUT THIS FIX (2026-10-14): Bootstrap's
  `.btn:disabled` applies `pointer-events: none`, so a click "on" a disabled
  button TARGETS THE HOST `<smd-button>` (the inner `<button>` never fires). Any
  click handler on the host - `smd-page`'s footer action, an inline `onclick` -
  therefore still ran while the button LOOKED disabled (reported as "the OK
  button looks disabled but is actually clickable" when a mandatory Title/name
  was empty). FIXED in `shared/js/components/smd-page.js` (the footer click
  listener returns early when `btn.disabled`) AND `smd-button.js` (a
  capture-phase click guard on the host stops the event while disabled).
- Playwright `toHaveText` on an `smd-button` HOST reports the slot fallback text too (e.g. `"Edit\n Button"`), so exact-text assertions fail. Use `toContainText("Edit")` or a `getByRole("button", { name: "Edit" })` locator instead.
- Grep on minified vendor files breaks the tool (giant matched lines) — scope searches to `PlanMyDay/js/**`, `shared/js/**`, or `tests/**`.
- WATCH THE BROWSER CONSOLE AFTER ANY CHANGE, ESPECIALLY A NEW/CHANGED LIBRARY (2026-09-30): a
  green Playwright run is NOT proof the page works — open the app and read the console before
  concluding anything. A page can render "successfully" (every `page.evaluate` returns, no test
  fails) while the feature is silently dead, because the failure happened in a worker, a
  dynamic import, or a rejected promise that nothing awaits. Real example from the RevoGrid
  swap: `revo-grid.entry.js` was missing from the vendored set, so the Stencil runtime's
  `import()` 404'd, and the page reported
  `TypeError: Failed to fetch dynamically imported module` +
  `Error: Constructor for "revo-grid#undefined" was not found` — the `<revo-grid>` element
  existed in the DOM and every property read back fine, but it had rendered ZERO rows, so any
  assertion that only checked "the grid element is there" or "no test threw" would have passed.
  What caught it was the USER looking at the running page and reading the console. RULES:
  (a) after wiring a library, check the console for `error`/`pageerror` and for failed
  requests — do not stop at "the test suite passed";
  (b) assert on RENDERED OUTPUT (row/bar/cell counts, visible text), never just on the
  container element existing or on a property echoing back what you set;
  (c) capture it in automation too — attach `page.on("console")` + `page.on("pageerror")` +
  `page.on("requestfailed")` and FAIL the run if any fired, rather than printing them for a
  human to notice;
  (d) a dynamic/lazy module graph cannot be verified by reading import statements. RevoGrid
  resolves component code at RUNTIME via a template-literal `import()` built from the tag name,
  so a static scan of specifiers misses those files entirely. To get the real file list,
  record every network request a real render makes and diff it against what you vendored.
- NEVER RUN AN UNBOUNDED / NEVER-ENDING COMMAND IN A TOOL CALL (2026-09-30): any command
  that does not terminate on its own will hang until the tool timeout and then look like a
  crash or a broken shell — it blocks the whole session and the user sees a frozen terminal.
  Classic offenders in THIS repo: `node tests/serve-tests.mjs` and `npm run dev:test`
  (long-running Vite servers that NEVER exit), `npx playwright test` without a shard filter
  (a full multi-shard run is many minutes), any watcher/dev-server/`--watch` run, and any
  `while (...)` / `Wait-Process` / `Start-Sleep` loop with no bound. RULES:
  (a) every network call gets an explicit short `-TimeoutSec` (5-10s) — never leave
  `Invoke-WebRequest`/`curl` at the default 100s+; a hung origin should fail fast, not stall;
  (b) long-running processes go DETACHED with output redirected, never in the foreground:
  `Start-Process node -ArgumentList "tests/serve-tests.mjs" -WindowStyle Hidden -RedirectStandardOutput <log> -RedirectStandardError <err>`,
  then poll for readiness (raw `TcpClient`, see the notes below) instead of blocking on it;
  (c) long scripts (Playwright specs, probes) run inside `Start-Job` + `Wait-Job -Timeout <n>`
  so there is a hard ceiling, then `Stop-Job` on timeout — the job pattern is what keeps a
  runaway browser from wedging the session;
  (d) before a long command, state that it is long-running and roughly how long it takes, and
  keep a hard `timeout` on the tool call so it cannot hang indefinitely;
  (e) if a call does freeze, do not stack another command on top of it — check the state first.
  SPECIFIC TO THE TEST SERVER: it also snapshots the file tree at startup, so RESTART it after
  adding or editing any file it is already serving; otherwise a newly added file 404s (an
  app-level `fetch`/dynamic `import` of it just fails) or an edited file is served at its old
  size, which looks exactly like an application bug.
- SERVER-START FREEZES THE TOOL CALL (2026-09-30, bit every session): the sequence
  `Start-Process node tests/serve-tests.mjs ...` (even with `-RedirectStandardOutput` to a temp
  log) followed by a `Start-Sleep` + port check prints `started pid=...` and `port 8080 OPEN /
  port 8081 OPEN`, and THEN the tool call hangs until its timeout. The spawned node server
  keeps a handle on the output pipe, so the call never "finishes" even though everything it
  printed is true and the servers ARE up. WORKAROUND (the reliable pattern, proven this
  session):
  (a) SERVER START IS A SINGLE, SEPARATE TOOL CALL WITH NOTHING ELSE IN IT: just the
  `Start-Process ... -WindowStyle Hidden -RedirectStandardOutput <log> -RedirectStandardError <err>`
  plus a `Start-Sleep` and the raw-TcpClient port check, and give the CALL a short hard timeout
  (60s). Expect it to "time out" — that is NORMAL and does not mean the servers failed. Do NOT
  chain `node --check`, git commands, or probes after it in the same call.
  (b) ALL subsequent work (port re-check, `node --check`, Playwright runs, probes) goes in
  SEPARATE tool calls that do NOT touch the server process. Verify ports with
  `(New-Object Net.Sockets.TcpClient).Connect('127.0.0.1',8080)` — if the server is up the call
  returns instantly.
  (c) Playwright and the probe scripts run under `Start-Job` + `Wait-Job -Timeout <n>` +
  `Stop-Job` on timeout (see rule above) — this is what survives a runaway browser; a bare
  foreground `& playwright` run works too but has no ceiling, so prefer the job pattern.
  (d) If a call still hangs, NEVER stack another command on it — stop, open a NEW tool call,
  and check state first.
  (e) When the user says "I'll run the tests manually," STOP starting/restarting servers
  entirely — leave the servers the user owns alone, just prepare the test files and tell them
  what to run.
- THE DETACHED-SPAWN PATTERN THAT DOES NOT FREEZE (2026-09-30, verified): instead of
  `Start-Process`, spawn the server via `WScript.Shell` COM — it returns immediately and the
  spawned process does NOT keep the tool call's output pipe open, so the call completes (the
  freeze does not happen at all):
  `$wshell = New-Object -ComObject WScript.Shell; $wshell.Run('cmd /c node "p:\git\MyApps\tests\serve-tests.mjs" > "C:\Users\Keith\AppData\Local\Temp\opencode\serve.log" 2>&1', 0, $false)`
  — then `Start-Sleep -Seconds 8` and the raw-TcpClient port check in the SAME call. It prints
  `port 8080 OPEN / port 8081 OPEN` and RETURNS. This is the preferred way to (re)start the
  test servers. Keep the call bounded (30s timeout). When `EXTERNAL_SERVERS=1` is set, Playwright
  reuses whatever is listening, so a server started this way is picked up automatically.
- Line endings: this repo stores text files with LF (`core.autocrlf=input`, `core.eol=lf`; no `.gitattributes`). NEVER write CRLF into a file — git will flag every line as changed (whole-file diff) and warn "CRLF will be replaced by LF the next time Git touches it". Do not round-trip files through PowerShell pipe/Get-Content/Set-Content joins; the Edit/Write/Read tools and Node preserve line endings — if you must convert use node with explicit `\n`, NEVER shell-piped measurements of `git show` (PowerShell pipeline re-encodes — it once reported 914 CRLF for a file whose raw blob via `git cat-file` was entirely LF). Verify with `git cat-file blob HEAD:<file>` + `git diff --stat` so only real edits show.
- TEST SERVERS ARE VITE (2026-09-26): `playwright.config.js` runs `node tests/serve-tests.mjs`, which starts BOTH test origins from ONE Node/Vite process: 8080 = repo root (e.g. `/PlanMyDay/` is the app), 8081 = repo mounted under `/PlanMyDay/` (every origin-root path 404s) mimicking a GitHub Pages sub-path deploy. `npm run dev:test` starts them for a full/sharded run; `reuseExistingServer` means Playwright reuses an already-listening server and never kills it, so no manual per-shard server dance. Vite runs with `appType:"custom"` plus a `sirv` static middleware, so there is NO HTML/JS transform and NO HMR client injected (the tests stay byte-faithful); sirv is in production mode (one startup tree scan, then an in-memory file map) and sets `immutable` Cache-Control for build-stamped assets but `no-cache` for `sw.js` and HTML. GOTCHA (unchanged): with `EXTERNAL_SERVERS=1` Playwright does NOT start or verify the servers, so a failed start makes every shard fail with `ERR_CONNECTION_REFUSED` (or hang on web-server waits) with no diagnostic. ALWAYS verify BOTH ports accept a TCP connection BEFORE any test run: use a raw TcpClient (`(New-Object Net.Sockets.TcpClient).Connect('127.0.0.1',8080)`) — `Test-NetConnection -ComputerName localhost -Port 8080` probes IPv6 `::1` first and prints a scary `failed` warning, then `True` for IPv4, which is easy to misread as a down server. (The old Python `tests/http-server.py` +   `tests/subpath-server.py` were replaced by `tests/serve-tests.mjs`.)
- STALE TEST SERVER SERVES TRUNCATED FILES (2026-09-26, cost a full test
  round): `reuseExistingServer: !CI` means Playwright silently REUSES an
  already-listening `tests/serve-tests.mjs`, and a leaked server (e.g. one left
  over from a `git stash`/`pop` cycle) can serve a PARTIAL file whose cached
  size is shorter than the on-disk file. Symptom: a deterministic
  `SyntaxError: Unexpected end of input` + `ReferenceError: <global> is not
  defined` for a file that `node --check` says is fine, and
  `ServiceWorker script evaluation failed` — while surrounding scripts load.
  CAUSE was a stale process started at an earlier point serving the first
  16702 bytes of the 16763-byte `smd-settings.js`. ALWAYS check BOTH ports are
  closed (raw `TcpClient`, not `Test-NetConnection`) before a run and, if a test
  fails with a syntax/reference error on a file that passes `node --check`,
  find the listener (`Get-NetTCPConnection -LocalPort 8080 -State Listen`) and
  `Stop-Process` it so Playwright starts a fresh server. Do not debug the app
  code first.
  LENGTH-CHANGE VARIANT (2026-10-18, hit with an HTML shell): the same stale
  server also breaks a file whose SIZE changed after the server started. The
  browser then reports `net::ERR_CONTENT_LENGTH_MISMATCH` for the PAGE ITSELF and
  **`page.goto()` NEVER reaches `load`** (a 30s timeout where no assertion ever
  runs) - while a PowerShell `Invoke-WebRequest` of the same URL can still return
  the full, correct bytes, so checking the served size does NOT rule it out. Two
  of my own edits reproduced it: `PhoneButtons/index.html` shortened by one line
  (the other file edited in the same pass, `FreeFormOX/index.html`, survived
  because `mb-3` -> `mb-4` keeps the byte count identical). RULE: after editing
  ANY served file (`.html`, `.js`, `.css` are all in the snapshot) RESTART the
  servers, and read the first symptom: a `page.goto` timeout on a page that works
  in isolation = stale server, not an app bug. Remedy: kill 8080/8081 + clear
  `node_modules\.vite`, then start `tests/serve-tests.mjs`.
- SW PRECACHE REJECTS ON A DUPLICATE URL (2026-10-12, cost a debugging round): `cache.addAll(PRECACHE_URLS)`
  in `sw.js` REJECTS if the list contains the SAME URL twice, so the worker never installs.
  Symptom is NOT a 404: the page logs `Failed to update a ServiceWorker for scope ('…') with script
  ('Unknown'): Not found`, `navigator.serviceWorker.ready` never resolves and every SW/offline/No-Cache
  test fails together — while a per-URL `cache.add(u)` probe of the SAME list reports zero failures
  (addAll rejects, individual adds do not). The SW cache is ORIGIN-WIDE, so a file shared by two apps
  must be precached in exactly ONE `APPS` entry (it is served to every app from the one cache) — do NOT
  re-list it under a second app. After ANY `sw.js` precache edit, check for duplicates before running the
  suite (compare `PRECACHE_URLS.length` with `new Set(PRECACHE_URLS).size`).
- CROSS-ORIGIN SAVE 302 GOTCHA (2026-09-17): SolarControlar's Flask POST endpoints (`POST /solar/`, `POST /solar/api/config`) are PRG — they answer `302 Location: /solar/`. A PWA `fetch()` that lets the browser follow that cross-origin redirect can lose its `Authorization` header on the follow-up GET (browser-dependent), so Traefik returns a 401 WITHOUT `Access-Control-Allow-Origin` → the fetch blocks as a CORS error / "Failed to fetch". Fix in the APP: `redirect: "manual"` on the POST and treat `resp.type === "opaqueredirect"` as success (server saved; the caller then re-fetches the GET page which carries auth again). `redirect: "manual"` returns an opaque-redirect response (status 0) for a 302 — you cannot read it, only detect it by `type`. Rule for SolarControlar saves: never follow the Flask redirect; `_post` returns the response TEXT (or `""`), so consumers must not chain `.text()`.
- SHARED CSS IS COLOUR + SIZE ONLY (2026-09-30): `shared/css/styles.css` no longer holds any
  layout MECHANIC. When you move a rule out, copy the SELECTOR TEXT VERBATIM — including
  multi-selector lists and the `#smd-app` / `#streamsEditor` prefixes. Specificity is the whole
  game: a rule's effective specificity is that of its HIGHEST-matching selector, so adding a
  plausible middle selector to a list (e.g. `#smd-app smd-tabs .nav-tabs .nav-link` at
  1,2,2) silently outranks `#smd-app smd-tabs .smd-tab-btn.active` at 1,2,1 and flipped the
  active tab's `margin-bottom` from 0 to 2px, which grew every `ul.smd-tab-list` by 2px. The
  injected sheet is appended to `<head>` so it beats the theme links in document order, but it
  does NOT beat a higher-specificity theme rule — keeping the original selector is the only
  way to move a rule without changing the cascade. `border-radius`/`box-shadow` stay with
  colour; `border: 0`/`border: none` are mechanics and move. Ownerless `.editor-btn`/
  `.btn-wide { touch-action }` and `[hidden] { display: none !important }` stay shared.
  Flatpickr popup colours stay shared (that node is appended to `<body>`). To verify a move
  like this, diff computed styles + `getBoundingClientRect` of the affected elements between a
  stashed baseline run and a patched run — PNG hashes are useless here: two untouched
  `pmd-screenshots` runs differ in 654 of 1,944 images.

- A THEME-LOOP TEST MUST POLL THE SETTLED COMPUTED STYLE (2026-10-18): a test that
  loops `applyTheme()` -> `openChart()` -> ONE `getComputedStyle()` read can catch a
  colour MID-TRANSITION. `pmd-gantt` "Gantt uses theme primary/secondary for the
  zoom buttons..." failed only in a full run with
  `active zoom is primary: expected rgb(13,110,253), received rgb(86,115,155)`.
  Root cause (probe, sampled every 20ms from the moment the chart opened): the
  page header is REBUILT by `openChart()` and `ganttPaintZoomButtons()` flips
  `.active` on right after, so Bootstrap's 150ms
  `background-color`/`color` transition runs then and the read lands ~45-65ms in:
  bootstrap/light went rgb(108,117,125) at open -> **rgb(86,115,155) at t=65ms** ->
  rgb(13,110,253) at t=240ms. The `waitForTimeout(700)` before `openChart()` does
  NOT help - the flip happens during the open, i.e. AFTER the sleep. FIX: wrap
  each read-then-`toBe()` block in `expect.poll(...).toMatchObject({...})` (the
  diff names the mismatching key) and keep the LAST snapshot in a variable for any
  derived assertions (contrast maths). This is the same rule as the 2026-10-13 (d)
  slate-gradient fix: assert the APPLIED computed style, never a single read.
  MUTATION-CHECKED: painting `.gantt-zoom > .btn.active` with `--bs-secondary`
  still fails the polled test (`activeBg` rgb(223,105,25) vs rgb(78,93,108)).
- COVERAGE ONLY COUNTS SPECS WITH HOOKS (2026-10-04): `tests/coverage.js` records
  coverage only for pages where a spec calls `startCoverage`/`stopCoverage`, and
  `globalSetup` cleans the cache every run — so any spec WITHOUT the hooks is
  invisible and its code reads as 0% even when tested. Every regression spec now
  has top-level hooks (`pmd-regression`, `cmd-regression`, `ffox-regression`,
  `pmd-gantt`, `qrlinks-regression`, `launch-regression`,
  `solarcontrolar-regression`, `storybook-regression`, `pmd-touch`,
  `settings-alignment`, `image-edit-preview-size`; the `*-screenshots` specs
  deliberately do not). Before this, QRLinks/Launch/SolarControlar and
  `gantt.js` were entirely absent from the report. `stopCoverage` now also
  strips the `?v=` query before adding, so the storybook's UN-versioned copies of
  shared scripts merge with the apps' versioned copies (36 files were double
  counted, +717 phantom functions). To find holes, decode
  `coverage-report/coverage-data.js` (`window.reportData='<base64>'` →
  `zlib.inflateRawSync(Buffer.from(b64,"base64"))`) and list functions with
  `count === 0`; many are tiny `forEach`/`filter`/`.then` callbacks that only run
  when an array is non-empty or a branch is taken.

## Session log

### 2026-10-19 (g) - hamburger menu + Launch submenu: contrasting border on every theme

- WHAT (user): "for every theme for the main hamburger menu and the Launch sub
  menu there should be a contrasting border around the menu/submenu with the correct
  styling for the theme, but it should contrast."
- MEASURED FIRST: the menu border came from `var(--bs-border-color)` (a translucent
  theme tint) - **43 of 54 theme/modes were below 3:1** (1.16:1 minty light, 1.3:1 on
  most light themes, 1.89:1 on the dark ones), i.e. an invisible edge. The 1px solid
  geometry matches every theme's own `--bs-dropdown-border-width`, and radius comes
  from the theme (sketchy keeps its 555px/25px hand-drawn corners), so only the
  COLOUR was wrong.
- FIX: the baked contrast generator (`test-contrast/contrast-css.spec.js`) now also measures
  the menu border against the menu surface and emits
  `#mainNav .dropdown-menu { border-color: <pick>; }` - ONE selector covers both the
  hamburger menu and the Launch flyout (both are `.dropdown-menu` inside `#mainNav`).
  The pick is the better of `--bs-body-color` / `--bs-emphasis-color` that reaches
  3:1 (WCAG 1.4.11 non-text contrast), falling back to black/white, and is emitted
  only where the theme's own border fails. Regenerated: 50 sheets, and `bootstrap`
  got a block for the first time (its border was 1.3:1).
- GOTCHA: `--bs-emphasis-color` alone is not enough - cyborg, darkly, slate, solar,
  superhero and vapor keep it BLACK in LIGHT mode while the page is dark
  (1.04-1.47:1), which is why the pick tries the body colour first and falls back.
- TEST: menu-legibility "the menu and the Launch submenu have a contrasting border on
  every theme" (TDD: red on 43+ edges with e.g. bootstrap/light 1.30:1, then the
  generator was extended and the sheets regenerated). It asserts, per theme/mode,
  that BOTH edges exist (width + style) and meet 3:1 against the panel surface.
- NOTE: the user started a full regression before I could watch the re-run go green;
  the generation step verified every write itself, and the boundary test is the guard
  that will confirm it.

### 2026-10-19 (f) - theme webfonts: six families were never wired (sketchy had no hand-drawn font)

- WHAT (user): "why does the font on MyApps for sketchy not look like the bootswatch
  reference ... Please check all of the other fonts for the themes."
- CAUSE: Bootswatch's CSS loads its Google fonts with
  `@import url("https://fonts.googleapis.com/css?family=Neucha|Cabin+Sketch...")`.
  This repo strips that import and vendors the files - but `fonts.css` only declared
  six families, so six theme families silently fell back to system-ui/Segoe UI.
  sketchy is Neucha (body) + Cabin Sketch (headings/`<b>`/navbar-brand); it was
  rendering BOTH in Segoe UI.
- AUDIT (authoritative): read the `@import` from `https://bootswatch.com/5/<theme>/bootstrap.css`
  for all 27 themes and compared with `fonts.css`. Missing at the start: Neucha,
  Cabin Sketch (sketchy), News Cycle (journal), Source Sans Pro (cosmo/lumen/solar),
  Nunito (morph), Inter (zephyr). Neucha/Source Sans Pro/Cabin Sketch/News Cycle
  files were ALREADY in `shared/css/fonts/` (just never declared); Nunito + Inter
  were downloaded from Google (12 subsets).
- FIX: @font-face blocks appended to `shared/css/fonts/fonts.css` (Google's own CSS,
  URLs rewritten to the local filenames, `font-display` stripped to match the file's
  style) and `sw.js` now precaches EVERY woff2 in the directory (135 files, sorted) so
  a future font file cannot be forgotten. Webfont families declared now: Roboto,
  Lato, Nunito Sans, Montserrat, Open Sans, Ubuntu, Neucha, Source Sans Pro, Nunito,
  Inter, Cabin Sketch, News Cycle.
- TEST: new `tests/theme-fonts.spec.js` - TDD (red: Neucha/News Cycle/Cabin Sketch
  missing; then red again on the heading-usage assertion because the computed value
  is quoted), now green. It holds the per-theme EXPECTED map taken from Bootswatch's
  own @imports, asserts every family is declared and every face loads, and checks the
  heading-only faces (sketchy Cabin Sketch, journal News Cycle, minty Montserrat) are
  actually applied. GOTCHA recorded in the notes: checking only
  `--bs-font-sans-serif`'s first family misses heading-only webfonts.
- VERIFIED: theme-fonts 1/1 (27 themes); visually confirmed sketchy renders Neucha
  body + Cabin Sketch headings, journal renders News Cycle headings/buttons.

### 2026-10-19 (e) - CMD tiles: ONE category caption underneath the two images

- WHAT (user): "on the cmd-countdown-card and cmd-date-card the Category Name needs to
  go under both the category and the date image, rather than just one", clarified as
  "2 images side by side with category name running underneath both of them".
- LAYOUT: both components' thumbs are now a COLUMN - a `thumb-row` holding the two
  images side by side, then ONE `.category-label` running underneath the pair,
  LEFT-aligned with the category image's left edge (`align-items-stretch` on the
  column + `text-start` on the caption, so the caption's box starts at the pair's
  left edge instead of shrinking and centring). Before: `cmd-countdown-card`
  captioned only the category image and `cmd-date-card` rendered no category name at
  all (its doc claimed otherwise) even though `dates-editor.js` always set the
  `category` attribute.
- NOTE: two earlier cuts were rejected - repeating the label under EACH image (two
  captions reading "Birthday Birthday") and centring one caption under the pair. The
  final shape is one caption, left-aligned with the category image, running under
  both.
- TEST: cmd-regression "ONE category caption runs underneath both images" in both the
  Main view and Dates editor describes (TDD: red with 2 labels / 0 labels, then red
  again on the left-alignment assertion, then green). It asserts exactly one caption,
  its text, that it sits BELOW both images, is centred within the pair, starts at the
  category image's left edge (2px tolerance) and is `text-align: start`. Uncaptioned
  dates get one empty caption. Full cmd-regression + shared-helpers 75/75.

### 2026-10-19 (d) - CMD dates editor: weekday at the front of each tile's date

- WHAT (user): "In Count My Days on the Edit Dates screen that lists all of the
  dates, on the tiles add the short day of week (Mon, Tue, etc) to the front of the
  date." Tiles now read `Mon 15 Jan` / `Mon 15 Jan 2030`.
- WHERE: `CountMyDays/js/dates-editor.js` `renderDateList()` (both the local and the
  google branches - the editor lists both sources) via a new `dateWeekday(d)`;
  `CMD_DAYS` added to `utils.js` next to `CMD_MONTHS` and reused by `formatDate()`.
- RULE (durable): the weekday is that of the date the app COUNTS DOWN TO - same as
  `targetDate()`: an annual/recurring date uses this year's occurrence, or next
  year's once it has passed, and a "once" date keeps its own year. So the tile, the
  sort order and the countdown always agree (an annual date's weekday changes from
  year to year - showing today's-year weekday for a date that already passed would
  be wrong). Build it from LOCAL parts (`new Date(y, m - 1, d)`), never
  `new Date("YYYY-MM-DD")`, which parses as UTC and can shift the day/weekday in
  western time zones.
- SCOPE: only the Edit Dates list. The Google Calendar editor's own
  `cmd-date-card` list (`googleCalendarEditor.js`) still shows the bare date - say
  the word if that should change too.
- TEST: cmd-regression "each tile leads its date with the short weekday" (TDD: it
  failed with `19 Oct` where it expected `Mon 19 Oct`, then passed). Full
  cmd-regression + shared-helpers 73/73.

### 2026-10-19 (c) - gradient-aware contrast checker + sketchy/slate primary = danger

- WHAT (user): "On the sketch and slate themes both modes there is almost no
  difference between the primary and secondary tab colours. For these only for these
  for the smd-button, smd-tabs make the primary colour the same as the danger colour.
  Also on slate dark secondary there text colour on the secondary buttons needs to be
  white to stand out against the background gradient (its not a color). Can you check
  why the contrast checker did not pick this up. Fix the checker and fix the colour.
  Do this in a TDD fashion."
- DIAGNOSIS (why the checker missed it): it read only `background-color`. slate dark
  secondary is `background-color:#7a8288` (black = 5.37:1, "fine") painted with
  `background-image: linear-gradient(#81888e, #7a8288 20%, #62686d)` - and black on
  the ramp's dark end is 3.69:1 while white is 5.68:1.
- TDD: (RED 1) made `test-contrast/contrast.spec.js` gradient-aware first - it immediately
  failed on slate secondary base/disabled (3.72) as well as genuine pre-existing
  misses in materia (danger 4.01), simplex (info 4.29) and the rest of slate's ramp
  (success 4.24, danger 4.32, warning 4.07, info 4.44); (RED 2) added
  `tests/theme-primary-danger.spec.js`, which failed for all four sketchy/slate
  combos. (GREEN) taught the generator the same rule, added the primary-borrows-
  danger blocks, regenerated the baked CSS and updated pmd-regression's slate tab
  test.
- CHECKER MODEL: the surface is the DARKEST extent of the element's gradient (each
  stop composited over the background colour) - that dominates the body of the
  button, and for Bootstrap's usual translucent white sheen the darkest extent is the
  background colour itself, so ordinary themes do not move. Stops belong to the BASE
  state (slate overrides the image per state and that is not readable without
  hovering), so base/disabled use them and hover/active keep their flat colour. A
  first attempt that took the worst of EVERY stop was wrong the other way: it mixed
  the base ramp into the hover/active surfaces and produced false failures.
- RESULT: slate dark (and light) secondary text is now WHITE; slate/sketchy primary
  buttons + active tabs paint the danger surface; materia/simplex/slate gained the
  extra contrast rules the old checker missed.
- VERIFIED: theme-primary-danger 4/4, contrast 3/3, contrast-css drift (regenerated,
  idempotent), pmd-regression slate tab, settings-alignment + display-settings + the
  7 app suites + the 3 colour specs 250/250, and pmd-gantt + storybook +
  shared-helpers + image-edit-preview-size + pmd-touch + pmd-regression greps
  114/114.

### 2026-10-19 (b) - contrast fixes moved OUT of runtime JS and BAKED INTO the theme CSS

- WHAT (user): "I dont want code running that checks contrast ... I want the contrast
  changes written into the css overrides", and the generator should live in the test
  directory as a test that proves nothing needs to change but can also rewrite the
  CSS with a flag.
- DELETED: `shared/js/smd-contrast.js` (the runtime normaliser), its `<script>` in
  the 8 shells, its `sw.js` SHARED_ASSETS entry, and the `scheduleSmdContrast()`
  hook in `applyThemeOverrides()` - nothing measures or repaints contrast at runtime.
- BAKED: the generated rules now live in each theme's own per-mode sheet
  (`shared/css/themes/<theme>/<theme>.<mode>.css`) between `smd-contrast:start` /
  `smd-contrast:end` markers - 50 of 54 sheet/mode combos, ~10-20 lines each
  (`bootstrap` and `brite` need none). Rules are grouped by identical
  state->colour signature and emitted per distinct colour.
- NEW SPEC: `test-contrast/contrast-css.spec.js` (in the test dir, so no runtime code):
  a plain run FAILS if any theme needs a rule it lacks or carries a stale one, and
  `SMD_CONTRAST_FIX=1 npx playwright test --config test-contrast/playwright.config.js` rewrites the
  blocks and verifies the writes. It strips the marked block (route-fulfilled from
  disk) before measuring, so it judges the theme's own colours -> a second FIX run
  rewrites 0 files (verified).
- SPEC UPDATES: `test-contrast/contrast.spec.js` keeps its AA assertions (all 27 themes x
  both modes x 8 variants x 4 states + tabs) but drops the module-era polling and
  the injected-sheet check; its third test now asserts NOTHING injects contrast
  styles or exposes a normaliser at runtime. `test-contrast/menu-legibility.spec.js` and one
  pmd-regression comment updated to point at the baked block.
- TWO GOTCHAS worth remembering (both cost real time here): the app's SERVICE WORKER
  precaches the theme CSS, so `page.route` never sees the `<link>` request unless
  the spec sets `test.use({ serviceWorkers: "block" })`; and Bootstrap animates
  `.btn` colour for 150ms, so a single read after a theme swap lands mid-fade -
  waiting on the live `link.sheet.href` PLUS a stable sample is required. The 27x2
  loops also need explicit `test.setTimeout` (they exceed the 30s default).
- EQUIVALENCE CHECK: re-measured 3780 rendered values (54 combos x buttons/tabs/menu)
  against a pre-change snapshot - 0 differences in every `--bs-btn-*-color` var the
  CSS sets; the 96 remaining deltas are all computed `color`/`background-color`
  values in the OLD snapshot taken mid-transition.
- VERIFIED: contrast-css (drift + idempotent FIX), contrast, menu-legibility,
  settings-alignment, display-settings, the 7 app suites (242), pmd-gantt +
  storybook + shared-helpers + image-edit-preview-size + pmd-touch (88), and
  pmd-regression "Theme colours" (20).

### 2026-10-19 (a) - Danger buttons full width, FFOX's missing modal, the sketchy submenu clip, and a Solar recursion

- DANGER BUTTONS TOO NARROW (user): "on the Danger tab the buttons are too narrow.
  They should start after where the label would be and continue the full width."
  The action rows had `col-md-8` on the ROW as well as the inner `col-4`/`col-8`,
  so a button was 8/12 x 8/12 = 44% of the page. Dropped the row-level `col-md-8`
  from every row containing an `<smd-button>` in all 8 shells (switch rows keep
  it); measured: the button now starts at 377px of a 1100px container (1/3) and
  ends 12px from the row's right edge. `settings-alignment`'s Danger test now
  selects `div.row` (it used `div.row.col-md-8` and would have silently found only
  the switch rows) and asserts the geometry per app.
- FFOX UPLOAD + CLEAR WERE DEAD (found while verifying the new loader): both call
  `showSmdModal()`, but FreeFormOX never loaded
  `shared/js/components/smd-modal.js`, so it threw `modal.show is not a function`
  and no confirm appeared - a pre-existing bug in the clear action too. Added the
  script, plus a settings-alignment test that CLICKS both Danger actions in all 8
  apps and asserts the modal opens (PhoneButtons uses `#btnClearStorage`).
  Also added `SmdConfig.imagePrefix = "shared-"` to FFOX: without it the upload
  would have written `ffox_images` instead of the shared library. Verified: Launch
  and FFOX both open the 4-way modal and write 168 images into `shared-images`.
- SKETCHY SUBMENU INVISIBLE (user): the "Launch" flyout is `left: 100%`, and
  sketchy is the only theme with `.dropdown-menu{overflow:hidden}` - the flyout was
  clipped while still reporting a rect, so `toBeVisible()` passed but
  `elementFromPoint` hit the page behind it. Fixed with `overflow: visible` on
  `#mainNav .dropdown-menu`; added a hit-test guard over all 27 themes x 2 modes.
- SOLAR RECURSION: `solar-top-tiles.js` observed `no-data` and set it inside
  `_render()`, recursing until `RangeError: Maximum call stack size exceeded` on
  every load without data. Guarded with `hasAttribute`.
- ALSO: `settings-alignment`'s Solar startup-modal handling raced the async 404
  modal, so the Danger tab click is now dismiss-and-retry (`openDangerTab`).
- VERIFIED: settings-alignment + menu-legibility + contrast + display-settings +
  the 7 app suites 245/245; pmd-regression "menu" 12/12. Build `202610190720`.

### 2026-10-18 (d) - Font size reaches form text + the toolbar; main-menu legibility specs; Display-settings audit

- WHAT (user-reported): "on the Settings | Display tab the font size does not seem
  to be changing the size of the text or form text ... it is changing the
  smd-tabs, smd-buttons not checkboxes. I am specifically looking at PlanMyDay View
  Job." So: the Font size setting resized body text, tabs and buttons but NOT form
  labels, inputs, selects, textareas or checkbox labels.
- MEASURED: at `normal/large/jumbo` the body went 16/18/25.6px and tabs/buttons
  followed, while `label.form-label` stayed 14px and `.form-control`/`textarea`/
  the smd-checkbox label stayed 16/16/14px. Cause: Bootstrap pins
  `.form-control`/`.form-select` to `font-size:1rem` and superhero/yeti pin plain
  `label` to `.875rem` - both rem, so `body`'s font-size (the setting's mechanism)
  cannot reach them.
- FIX: pinned `label`, `.form-label`, `.form-check-label`, `.col-form-label`,
  `.form-control`, `.form-select`, `.form-check-input`, `.input-group-text`,
  `textarea`, `select`, `input` to `var(--smd-type-p)` in `shared/css/styles.css`
  (before the FORM CONTROLS section). Colours untouched.
- ALSO (same session, user follow-up): "run a legibility test on the main menu,
  sometimes the text seems small ... and sometimes it seems grey (low contrast) -
  write tests for both. Please check that all the Display settings are wired up
  properly in all apps."
- MEASURED the menu across all 27 themes x 2 modes: 17 problems.
  TOO SMALL (14): brite/journal/litera/lux/zephyr pin `.navbar` (17.5/18/15.4/14px)
  and sandstone/yeti pin the items (13/14px) - all against the default 20.8px body.
  LOW CONTRAST (3): minty light 3.54:1, morph light 2.63:1, spacelab light 4.48:1 -
  in every case the theme's OWN body text is the failing colour.
- FIX: `#mainNav` + its menu/menu-items pinned to `var(--smd-type-p)`; menu text
  pinned to `var(--bs-body-color)` with hover/active keeping that colour and only
  tinting the surface (`rgba(var(--bs-body-color-rgb), .12/.2)`); and
  `shared/js/smd-contrast.js` extended to the menu so a body pair that is itself
  sub-AA gets repainted to the best of body-color/black/white. Menu problems after
  the fix: 0/54.
- NEW SPECS: `test-contrast/menu-legibility.spec.js` (3 tests - size never smaller than the
  body on every theme/mode, size follows the setting across all six sizes, AA +
  body-colour consistency) and `tests/display-settings.spec.js` (8 tests, one per
  app, driving every Display control and asserting its real effect). Writing the
  second one surfaced three environment facts now recorded in the notes: PMD/LoL
  default to touch size "large", `#mainNav` has two `.dropdown-menu` elements, and
  SolarControlar needs its Flask API stubbed or its error modal blocks the toolbar.
- VERIFIED: menu-legibility + display-settings 11/11; the 7 app suites +
  settings-alignment + contrast 243/243; pmd-regression (full) + pmd-gantt +
  pmd-touch + image-edit-preview-size + storybook + shared-helpers 572/572.

### 2026-10-18 (c) - WCAG AA contrast normalisation for buttons/tabs + sample-image themes patch

- WHAT (user request): "write a test to check the text colour on all the smd-button
  variants and also smd-tab colours on all themes and theme modes ... where there
  is not [good contrast] use the --bs-body-bg or --bs-body-colour". Threshold
  agreed with the user: WCAG AA 4.5:1 (normal-size text).
- MEASURED FIRST: 540 button/tab surfaces across 27 themes x 2 modes had 273 below
  4.5:1 (`--body-*` and tabs included) - nearly all white on the theme's own accent
  (journal warning 1.29:1, minty 1.47:1, quartz's translucent secondary 1:1 when
  read as opaque). So this needed one general fix, not 273 per-theme patches.
- FIX: new `shared/js/smd-contrast.js` (see the AGENTS note for the full contract).
  It repaints a label only where the theme's own colour fails AA, preferring the
  better of `--bs-body-color`/`--bs-body-bg`, falling back to black/white. Wired
  into all 8 shells + the storybook after `smd-settings.js`, added to `sw.js`
  SHARED_ASSETS, and re-run from `applyThemeOverrides()` + a capture-phase `load`
  listener on the theme links.
- TEST: new `test-contrast/contrast.spec.js` - 3 tests walking all 27 themes x both modes
  for every `smd-button` variant x 4 states and both tab colours (AA), plus a
  "no overrides where the theme already passes" guard. The specs recompute the
  ratios themselves from the resolved colours, so they assert the outcome rather
  than re-running the module's arithmetic.
- THREE BUGS THE FIRST CUT HAD (all found by the new spec, worth remembering):
  (1) vars alone lose - minty/journal paint `.btn{color:#fff}` directly and
  Bootswatch's `.text-bg-*` uses `color:#fff!important`, so an explicit
  `color: ... !important` is required; (2) hover/active surfaces come from
  `--bs-btn-*-bg` vars that must be resolved as raw tokens (hex too) and composited
  for translucent ones; (3) the four `--bs-btn-*-color` vars must be set on the
  BASE selector - `:hover`-scoped vars are unreadable when the button is not
  hovered, which also made them untestable.
- TESTS UPDATED: pmd-regression's "inactive tabs use the Bootstrap text-bg-secondary
  contrast" became "tab text stays readable on the Bootstrap text-bg-* surfaces"
  (bg equality kept, colour equality only asserted for brite which needs no repair,
  AA asserted for both); the new spec supersedes it for coverage.
- ALSO: `shared/sampleImages.json` - Plane 1/2/3 gained the `themes.light` blocks
  the user supplied (line/fill/width), patched in place with the file's own
  formatting (4-space entries / 8-space keys), everything else byte-identical; the
  file still parses with 168 images. No test reads those fields (they only use
  `.images.length` or filter by name).
- VERIFIED: contrast 3/3, pmd-regression "Theme colours" + pmd-gantt +
  settings-alignment + storybook-regression 167/167. Build `202610182317`.

### 2026-10-18 (b) - Danger tabs: shared `<smd-button block>`, one size, corrected colours, own-data clears, + Launch/FFOX tabs

- WHAT (user request): make every app's Settings consistent - shared tab order,
  shared Display contents and ONE canonical Danger tab - and give every app a
  Danger tab that clears ONLY its own data. Later in the session the user also
  asked for the shared component (`<smd-button>` for all Danger buttons, one
  size = QR's `Refresh App`), a Danger tab on Launch AND FreeFormOX, and (final
  request) superhero `btn-warning` text in the BODY colour, both modes.
- SHAPE: tab order is General, Display, then the app's own, with an empty tab
  removed; Display rows are Theme, Theme Mode, Font size, Icon size, Touch size,
  Tile density, Slide speed, Auto-hide menu (only the rows the app really uses),
  app extras, and `Screen resolution` LAST. Launch is now `Display, Menu, Danger`
  and FreeFormOX `Display, Game, Danger`. `tests/settings-alignment.spec.js`
  iterates all 8 shells and asserts the exact tab list + Display labels.
- DANGER: canonical order = Show danger, No Cache | Regenerate, Sort | Refresh
  App, Clear local storage <APP>, Clear Google cache (CMD) | the loaders (Load
  Sample Data, Load Sample Links/Images, Upload Standard Images). Colours (user
  rule): `Clear *` danger, `Regenerate`/`Sort` SECONDARY, `Refresh App` + every
  loader/upload WARNING - nothing is success/green. Gaps are `mt-4` on a group's
  first visible row (all rows `mb-4`), never two in a row; an empty group leaves
  no trace. The same spec asserts order, colour, gap and that every action button
  is `<smd-button block>` and all the same measured size.
- COMPONENT: `smd-button` gained `block` mode - the host becomes a block box
  (`d-block`) and the inner button gets `w-100`, so a column of Danger buttons is
  uniformly full width. Host keeps the old id (`#btnClearAllData`); the inner
  button is `<id>-button` (tests click the host/role). This also FIXED a latent
  bug: an earlier colour-only edit had left some rows as `class="btn-secondary …"`
  (base `btn` dropped), which the conversion to the component removed.
- CLEAR SEMANTICS: `smdConfirmClearAllData()` removes only keys under
  `SmdConfig.storagePrefix`, so other apps' keys and `shared-images` survive.
  PMD/LoL dropped their all-keys wipe, PhoneButtons dropped its
  theme/font/images keep-list (now uniform - clears all `pb_*`), and the modal
  copy is per-app (`Clear ALL <App> data?`). Solar kept its own wrapper.
- SUPERHERO WARNING BUTTONS: `shared/css/themes/superhero/superhero.{light,dark}.css`
  set `.btn-warning` `--bs-btn-{,hover-,active-,disabled-}color` to
  `var(--bs-body-bg)` (Bootswatch had white on amber). The user first asked for
  the BODY TEXT colour, but that made almost no visible difference - superhero's
  body text is `#ebebeb`/`#ced4da`, near-identical to the white it replaced - so
  it was switched to the body BACKGROUND colour (the dark navy). Guarded by
  pmd-regression "superhero warning buttons use the body background colour in both
  modes" (probe + the real button); no other layer writes `--bs-btn-color`, so no
  cascade fight.
- TESTS TOUCHED: `settings-alignment` (tabs/Danger table/size), `launch-regression`
  (tab list), `pmd-regression` (clear is prefix-scoped; new superhero test),
  `phonebuttons-regression` (clear now uniform; the assert moved BEFORE the
  self-reload), `lol-regression` (per-app modal copy). Verified: settings-alignment
  36/36, launch/ffox/qrlinks/solar 45/45, phonebuttons 18/18, cmd 67/67,
  pmd+lol greps, and the whole "Theme colours" block - 24/24.
- GOTCHA (recorded so it is not repeated): two test assumptions were wrong, not
  the app - (1) the legacy unprefixed `images` key is dropped by
  `migrateImagesToShared()` at boot, so it cannot evidence "other keys survive";
  (2) PhoneButtons re-persists its DEFAULT theme on boot, so after a clear+reload
  `pb_theme` is never null - assert a neutral probe key instead. Set the build to
  `202610182244` (`npm run bump:build`) and restarted the snapshotted test servers
  after the HTML/JS/CSS edits.

### 2026-09-30 (b) - mode-based light.css / dark.css re-added (empty, for now)
- WHAT (user request): put the shared MODE-based colour sheets back so the file
  loaded follows the settings "Theme Mode" (Light/Dark), not the theme select.
  `shared/css/themes/light.css` + `shared/css/themes/dark.css` exist again, both
  EMPTY apart from a header comment - they are placeholders for mode-wide colour
  work, not for layout mechanics. This reverses the 2026-09-26 removal; the
  per-theme `themes/<theme>/<theme>.<mode>.css` sheets are untouched.
- CASCADE now has FIVE layers, and both override sheets are re-pointed by
  `applyThemeOverrides()`: vendor -> `<theme>/bootstrap.min.css` ->
  `shared/css/styles.css` -> `themes/<mode>.css` (`#theme-override-mode`) ->
  `themes/<t>/<t>.<mode>.css` (`#theme-override-specific`). A THEME swap re-points
  only the specific link; a MODE swap re-points both. `orderThemeOverrideLinks()`
  was rewritten to place a LIST (`theme-override-mode`, then
  `theme-override-specific`) immediately after the `#smd-shared-css` anchor
  instead of moving a single link, so the mode sheet can never land after the
  per-theme sheet.
- The mode files need no `[data-bs-theme="dark"]` qualifier - the link only loads
  the sheet for the mode it names, which is why they are separate files.
- ALSO TOUCHED (all mechanical, all needed for the above): static
  `<link id="theme-override-mode" href=".../light.css">` in all 7 shells
  (root, CountMyDays, FreeFormOX, PlanMyDay, QRLinks, SolarControlar, storybook) +
  `storybook/cardViewer.html` and its `frameDocument()` iframe generator (which
  now emits the mode link per `data-mode`); both files added to `sw.js`
  SHARED_ASSETS; `tests/screenshot-helpers.js` `STYLESHEET_IDS` now waits for
  `theme-override-mode` so screenshots never race the swap.
- TESTS THAT ENCODED THE REMOVAL (updated, not run - the user is testing):
  `tests/pmd-regression.spec.js` "theme and mode selectors share one global mode"
  expected the head order `["bootstrap-theme-css", "theme-override-specific"]` and
  now expects the `theme-override-mode` link between them; and
  `tests/launch-regression.spec.js` `cascadeRank()` FAILED any stylesheet it did
  not recognise (rank 5), so `themes/<mode>.css` would have failed the shell
  cascade test - it now ranks 3 and the per-theme sheet 4.
- GOTCHA (2026-09-30, the cascade-rank check is DUPLICATED): the same ranking
  logic exists as a second, independent copy INLINE in
  `tests/storybook-regression.spec.js` (the "card viewer renders one card across
  every theme and both modes" test, inside its `frameRanks` evaluate). Both
  copies return rank 5 for any href they do not recognise, and BOTH needed a
  `themes/(light|dark).css` branch - fixing only `launch-regression.spec.js` made
  the card-viewer test fail. When the cascade changes, grep for `rank < 5` and
  update every copy, not just the obvious one.
- GOTCHA worth keeping: when adding a `<link>` to an `index.html` here, match the
  file's existing line endings. The shells are LF; a PowerShell `-replace` +
  `Set-Content` round-trip inserted a lone CRLF line into an otherwise-LF file.
- NOT VERIFIED: per the user's instruction no Playwright run was made for this
  change (`node --check` on `smd-settings.js` only). `BUILD_NUMBER` was already
  bumped to `202609300620` earlier in the session, and `sw.js` keeps the same
  number, so the new precache entries ship under it.

### 2026-09-30 (a) - shared/css/styles.css reduced to colour + size; mechanics moved to components
- WHAT: finished the 2026-09-26 (i) split. `shared/css/styles.css` now carries only theme
  colour and spatial-size declarations; every layout mechanic moved into the owning
  component's `injectSmdComponentStyle()` block. 10 files: `shared/css/styles.css`,
  `shared/js/smd-settings.js`, `smd-h1.js`, `smd-h2.js`, `smd-tabs.js`, `smd-modal.js`,
  `smd-date-picker.js`, `smd-image-select.js`, `smd-image-picker.js`,
  `PlanMyDay/js/components/pmd-stream-header.js`. User decisions: split mixed rules
  declaration-by-declaration; keep the ownerless `.editor-btn`/`.btn-wide` `touch-action` and
  `[hidden] { display: none !important }` shared; move the `#mainNav` / `body.auto-hide-menu`
  rules into `injectSettingsLayout()` in `smd-settings.js`. `border-radius`/`box-shadow` stay
  with colour; `border: 0`/`border: none` are mechanics and moved. The date-picker's own layout
  moved (only the flatpickr POPUP palette stays shared — flatpickr appends that node to
  `<body>`). The stream-header chevron `::after` moved WHOLE (its `currentColor` border cannot
  be split from the rotate/transition). Dead `button#smd-tabs-4-tab-1 {}` deleted.
- WHAT WORKED: a computed-style + `getBoundingClientRect` probe diffed between a stashed
  baseline run and a patched run. It caught a real 2px regression that every suite missed
  (settings-alignment 13, pmd-regression 439, pmd-screenshots 33 all passed with it).
- WHAT DID NOT WORK: PNG-hash screenshot comparison. Two UNTOUCHED `pmd-screenshots` runs
  differ in 654 of 1,944 images, and a later control-vs-control run still differed, so any
  single differing PNG proves nothing. Do not use screenshot hashes to validate a CSS move.
- LEARNED (the bug, worth remembering): I "tidied" the tab rule into
  `#smd-app smd-tabs .nav-tabs .nav-item.show .nav-link, #smd-app smd-tabs .nav-tabs
  .nav-link, .nav-tabs .nav-link`, adding a middle selector. `.nav-item.show` never matches,
  so in the ORIGINAL rule the only matching selector was `.nav-tabs .nav-link` (0,2,0) and
  `#smd-app smd-tabs .smd-tab-btn.active { margin-bottom: 0 }` (1,2,1) won. My added selector
  matches at 1,2,2 and outranks it, so the active tab got `margin-bottom: 2px` and every
  `ul.smd-tab-list` grew 2px, shifting the image picker +2px. A rule's specificity is that of
  its HIGHEST-MATCHING selector, not the one you were thinking about. Fix: verbatim selector
  text. Same for `pmd-stream-header .chevron::after` — I first widened it to component scope,
  which styled headers outside `#streamsEditor`; reverted to the verbatim
  `#smd-app #streamsEditor pmd-stream-header ...` to keep scope AND specificity identical.
  (Diagnosing it needed CDP `CSS.getMatchedStylesForNode` plus a CSSOM A/B: setting
  `cssRules[2].style.marginBottom` had no effect while `cssRules[3]` did, proving which rule
  won despite the apparent specificity inversion.)
- VERIFIED: `node --check` on all touched JS; probe diff vs baseline is now identical except
  two `#mainNav` transform values 6e-9 px apart (sampling the 0.3s transition) and the 5 new
  style ids. Suites: settings-alignment + pmd-regression 452 passed; pmd-screenshots 33
  passed; cmd/ffox/launch/qrlinks screenshots 20 passed; the other 11 regression specs 122
  passed. `pmd-gantt.spec.js:823` still fails ("switching Day -> Week re-binds the drag
  layer...") — confirmed pre-existing by running it on the stashed baseline, unrelated to
  this change. `BUILD_NUMBER` bumped `202609282142` -> `202609300620` via `npm run bump:build`.

### 2026-09-28 (g) - Gantt layout, stream-drag job ownership, and theme colours
- ROW LAYOUT: the row drag handle moved into the vendor's narrow FIRST cell (`td.gtasklist`), which is widened to a 6px gutter; the title is shifted clear of the handle with `text-indent` on `.gtaskname div` - NOT padding on the cell. `padding` would widen the fixed-layout `auto` Name column and squash the bar area, and the title text is the ellipsis target so a text-indent lets it shrink correctly. The row's textContent is unchanged (the Gantt tests and the Streams filter read it). The stream row's `-`/`+` collapse toggle then has room to show again - it was never missing, just squeezed by the handle.
- STREAM DRAG JOB OWNERSHIP (the important fix): Sortable REMOVES the dragged row from the table's flow and re-inserts it, which shifts the OTHER streams' group and job rows apart too. Deriving job ownership from DOM adjacency at drop time therefore ROTATED every stream's jobs onto its neighbour (with Alpha/Beta/Gamma and Beta dragged, Beta's jobs landed in Alpha and Gamma's in Beta). Ownership is now SNAPSHOTTED in `onStart` (`ganttDragBeginRowDrag` -> `_ganttRowDrag.jobsByStream`) and only the STREAM ORDER is read from the DOM on drop. A JOB drag still reads its new parent from adjacency (the DOM move IS the move) but keeps the snapshot for every other stream, so nothing else can drift. Guarded by "dragging a stream between two OTHERS keeps every stream's own jobs" - a two-stream test does NOT catch this.
- VISUAL: while a stream row is dragged its job rows are `display:none` (`tr.gantt-jobs-dragging`) so the list reads as a list of streams; the Sortable fallback ghost was cloned before `onStart` so it still shows the jobs travelling with the stream.
- THEME COLOURS: the format selector's LABELS are plain text and only the SELECTED option is `--bs-danger` (plus a `--bs-danger-bg-subtle` fill); the vendor's `span.gformlabel:hover` light-blue fill is overridden. The stream summary bar (`.ggroupblack` + its `.ggroupblackendpoint*` border end-caps) is `--bs-danger` and the job bar (`.gtaskblue`) is `--bs-success`. The old dark-mode-only `--gantt-summary-bar` override was DELETED - re-pointing at `--bs-*` makes light/dark work with no extra rules. Guarded by "bars and the format selector use the theme palette (danger/success), and only the selected format is highlighted" (runs superhero in BOTH modes and normalises `#rrggbb` to `rgb()` to compare against computed styles).
- Verified: `tests/pmd-gantt.spec.js` 27/27, `tests/pmd-regression.spec.js` 439/439, `tests/pmd-screenshots.spec.js` 33/33, `tests/storybook-regression.spec.js` 8/8, `tests/pmd-touch.spec.js` 5/5.

### 2026-09-28 (f) - PlanMyDay Gantt drag & drop (bar resize/move + row reorder/move)
- NEW `PlanMyDay/js/gantt-drag.js`. The chart is drawn by the VENDORED `shared/vendor/jsgantt.js` (jsgantt-improved 3.0.0) which has ZERO drag support and must stay a verbatim copy, so the drag layer lives OUTSIDE it. It is installed from the chart's own `afterDraw` event: `g.setEvents({ afterDraw: ... })` before `g.Draw()` in `renderGantt()`. `setEvents` REPLACES `vEvents` (not merge), but the app sets none, so `{afterDraw}` is safe. `afterDraw` is the ONLY hook that also fires for the vendor's Day/Week/Month selector, which calls `Draw()` directly via `setFormat` and would otherwise leave the page with no freshly-bound drag handles.
- BAR DRAG: three pointer zones on each JOB bar (left 25% = start, middle 50% = move whole bar, right 25% = duration; a bar under 48px keeps just the two halves). Only job bars are draggable (stream summary bars are derived spans). Nothing is written until pointerup; the drag only previews by mutating the bar's inline `style.left/style.width`, because `renderGantt()` does `el.innerHTML = ""` and a mid-drag re-render would destroy the node under the pointer.
  - SNAP GEOMETRY: do NOT re-derive the vendor's `getOffset`. Walk the format's own column grid and ask the library for x via `chartRowDateToX()` (assigned at vendor:831, inside `drawComplete`), which handles weekend-skipping and the non-linear month formula for us. The anchor (the grid's first boundary) is the one date whose `chartRowDateToX()` is `<= -1`, because `getOffset` returns `ceil(... - 1)` and is 0 at 0 distance: so `?? = -1` exactly at the first column. One column = 1 day / 7 days / 1 calendar month for day/week/month.
  - `chartRowDateToX` closes over `this`, so it MUST be called bound: `g.chartRowDateToX.bind(g)` (calling it detached throws "Cannot read properties of undefined (reading 'vFormat')").
  - The library appends the tooltip OUTSIDE the chart and it can sit on top of a bar, so a `pointerdown` listener on the bar itself is swallowed. The bar is resolved by `document.elementsFromPoint` from a SINGLE capture-phase `document` `pointerdown` listener instead, and the per-bar config is stashed on the element (`bar.__ganttDrag`).
- ROW DRAG: one Sortable over the LEFT task-list tbody. `draggable: "tr[data-gantt-kind]"`, handle = a `<smd-draghandle class="gantt-drag-handle">` injected into the narrow FIRST (`td.gtasklist`) cell - NOT `td.gtaskname`, whose textContent the Gantt tests and the filter count assert. `onMove` forbids dropping a stream row onto a job row (streams are flat). Jobs may reorder within a stream or move to another stream.
  - The row tbody is NOT inside `getListBody()` (`#ganttChartglisthead` is the HEADER div created by `drawListHead`); the scrolling table is its SIBLING under `.gmainleft`. Query it from `.gmainleft`.
  - The library HASHES each `pID` into the DOM ids (`hashKey`, vendor:3738), so the app's own pID is NOT a DOM handle. Bind through `g.getList()[k]` (same order as the items were added) using `getListChildRow()` / `getBarDiv()`. Stable identity comes from `job.id` and the STORED stream index stamped as `data-gantt-*` because the Streams filter renumbers pID.
  - FILTER SAFETY (the important one): `ganttDragPersistRows` resequences/rebuilds ONLY the streams present in the DOM. Streams hidden by the Streams dropdown keep their stored `sequence` and act as anchors when the whole array is re-sorted, so a hidden stream is never deleted or relocated. Job ids resolve against a map of ALL jobs across streams (NOT the target stream's current array) or a job moved in from another stream is dropped; a "keep anything not in the DOM" safety net must consult a GLOBAL seen-set, not one stream's list, or it silently undoes the move.
  - Sortable's `forceFallback` needs a mousedown then a SMALL first mousemove before the real move; a single jump straight to the target does not reliably engage the fallback ghost (tests must do a 4px warm-up move).
  - A drag persists a start of TODAY as `sleepUntil: ""` (empty means "no not-before"), and clamps an earlier start up to today - `regenerateTiles()` and `job-editor.js` clear past dates anyway.
- Files touched: `PlanMyDay/js/gantt-drag.js` (new), `PlanMyDay/js/gantt.js` (identity fields, `afterDraw` hook, comments), `PlanMyDay/index.html` (script tag), `sw.js` (precache), `tests/pmd-gantt.spec.js` (10 new tests, same file as the filter tests).
- Verified: `tests/pmd-gantt.spec.js` 22/22 (12 existing + 10 new), `tests/pmd-regression.spec.js` 439/439, `tests/pmd-screenshots.spec.js` 33/33, `tests/storybook-regression.spec.js` 8/8, `tests/pmd-touch.spec.js` (iphone-12-pro) 5/5. The pre-existing "opening the Gantt does not mutate the stored streams" test still passes - only a completed drag writes.
- Learned: reading the vendored `getOffset`/`drawListHead`/`drawListBody` source was essential; several plausible-sounding assumptions (pID as a DOM id, the list body containing the rows, `.gchartgrid` having no horizontal overflow) were WRONG and only a live DOM probe settled it.

### 2026-09-28 (e) - PMD CPD: shared settings-page framework + QR helpers + JSON export/import (CPD now ZERO)
- Extracted the per-app SETTINGS-PAGE FRAMEWORK into `shared/js/smd-app.js`: `smdGetSettingsSections()`, `smdBuildSettingsPage(extraStyles)`, `smdSetupSettingsPage(opts)`, `smdHideSettingsPage()`, `smdToggleDangerRows(enabled, ids)`, `smdChangeShowDanger(enabled, ids)`, `smdApplyImageSize(capSmall)`, `smdConfirmClearAllData(opts)`, plus `smdDownloadJson(data, baseName)` and `smdReadJsonFile(onJson)`.
  - `smdSetupSettingsPage(opts)`: `onBeforeOpen` (app hides the background), `extraStyles`, `dangerIds`, `restore()` (app-specific select restores), `bindDone` (false for PlanMyDay, which binds the done listener in app.js), `onDone`. It rebuilds `#settingsPage`, shows it, restores the SHARED selects (theme/mode, font/icon/density, auto-hide, show-danger + danger rows), then runs `restore()`.
  - Migrated CountMyDays, QRLinks, PlanMyDay, FreeFormOX and Launch. Each keeps its global `openSettings` / `closeSettings` / `buildSettingsContent` / `getSettingsSections` / `toggleDangerRows` / `applyImageSize` / `changeShowDanger` / `exportData` / `importData` names (inline HTML + tests call them) as thin wrappers.
  - `smdBindImagePicker(opts)` gained `opts.manageBackground` (hide/restore open smd-pages + the main container behind the picker) and a re-open timer clear, so `PlanMyDay/js/image-picker.js` is now just two calls.
- NEW `shared/js/smd-qr.js` (`window.SmdQr`): vendor-root resolution + lazy `<script>` loader + `loadLzString()`, shared by `smd-qr-export.js` / `smd-qr-import.js` (each had a 34-line copy). Loaded BEFORE the QR components in `CountMyDays/index.html` + `storybook/index.html`, and added to `sw.js` SHARED_ASSETS.
- CPD (`--minimum-tokens 100`) is now **0 groups** (was 22 -> 17 -> 3 -> 0). Every app-file duplicate from the original scan is gone.
- Verified: full launch 7/7, ffox 11/11, cmd 55/55, qrlinks 9/9, solar 12/12, storybook 8/8; pmd subsets settings 40 + Danger 17 + picker 25 + `--grep stream` 53 + importData 3 + boot 7.
- `BUILD_NUMBER` -> `202609281039`.

### 2026-09-28 (d) - PMD CPD cleanup: merged the two job cards + shared app-shell wiring
- Merged `pmd-job-stream-card` + `pmd-job-search-card` into ONE `PlanMyDay/js/components/pmd-job-summary-card.js` (`<pmd-job-summary-card>`), selected by `variant="stream"` (default) | `"search"`. The template holds BOTH layouts; `_applyVariant()` drops the nodes the variant does not use (stream drops `.check-col`/`.tab-badge`/`.stream-thumb`/`.stream-title`; search drops `.handle-col`/`.active-toggle-inline`). BOTH keep exactly one `.active-toggle` so tests still target it. Deleted the two old files.
  - GOTCHA: the search variant MUST keep `.stream-thumb` - dropping it changed the flex column width and broke the "job tiles keep the image slots so titles line up" test. Only the STREAM variant drops the stream thumb/title.
  - Consumers updated: `streams-editor.js` (emits `variant="stream"` + slotted `<smd-draghandle>`), `job-search.js` (`variant="search"`), `PlanMyDay/index.html`, `sw.js` precache, `storybook/index.html` (script tag + merged section + CSS selector + seeds), `storybook/cardViewer.html` (two recipes: "Job Summary Card (stream)"/"(search)"), and the specs (`pmd-regression`, `pmd-screenshots`, `storybook-regression` incl. nav count 32->31, host list, card labels).
- Deduped the app-shell wiring out of `CountMyDays/js/app.js` + `QRLinks/js/app.js` into NEW `shared/js/smd-app.js` helpers (all idempotent via `window.__smd*Bound`):
  - `smdBindThemeChange()` - the `smd-theme-change` -> `changeTheme`/`changeThemeMode` listener.
  - `smdBindImagePicker()` - installs `window.__openImagePicker`/`__finishImagePick` + the `smd-image-picker-select` listener (drives `#imagePickerPage`).
  - `smdBindImageSelectActions(routes)` - routes an element id (e.g. `dateImageSelect`) to `function(name)`.
  - `smdBindImagesEditor()` - the shared images-editor page + `smd-image-card-action` wiring.
  - `smdEnablePullToRefresh()` - canonical Bootstrap-spinner pull-to-refresh (the two apps had diverging spinner markup; now unified).
  - PlanMyDay keeps its OWN richer picker (`PlanMyDay/js/image-picker.js` adds background-page stacking) - deliberately not migrated.
- CPD: 22 -> 17 groups (`--minimum-tokens 100`). The `app.js` duplicates are gone. REMAINING bulk = the per-app SETTINGS-PAGE FRAMEWORK (`getSettingsSections` / `buildSettingsContent` / `openSettings` / `closeSettings` / `toggleDangerRows` / `applyImageSize`) copied across `CountMyDays|QRLinks|PlanMyDay/js/app-settings.js`, `FreeFormOX/js/settings.js`, `Launch/js/app.js` - the next extraction into `smd-app.js` - plus `smd-qr-export.js` vs `smd-qr-import.js`. See the PMD CPD section in commands.md.
- Verified: storybook-regression 8/8; pmd `--grep "Search Jobs"` 15/15; pmd `--grep stream` 53/53; the streams job-title alignment test; pmd-screenshots one theme 33/33; qrlinks-regression 9/9; cmd `--grep image` 9/9.
- `BUILD_NUMBER` -> `202609281023`.

### 2026-09-28 (c) - coverage push: import/export/google tests, removed the dead legacy image picker
- Goal: lift FUNCTION coverage to 85%. The monocart report is `coverage-report/coverage-data.js`, a single `window.reportData = '<base64>';` blob; decode it with `node`'s `zlib.inflateRawSync(Buffer.from(b64,"base64"))` (NOT inflateSync/gunzip) to get the v8 JSON `{summary, files:[{url, source, data:{functions:[{name,start,count}]}}]}`. A function is uncovered when `count` is 0; map `start` to a line via `source.slice(0,start).split("\n").length`. (Handy throwaway scripts: decode+list uncovered; per-file uncovered list.)
- CRITICAL to know before extending coverage: FUNCTION coverage only needs each function INVOKED once, not every branch. Many "uncovered" entries are tiny anonymous callbacks inside `forEach`/`.filter`/`.map`/promise `.then` - they stay uncovered only because the array was EMPTY or the branch never ran. Populating the arrays (e.g. sending categories+dates through the import wizard) lights up dozens at once.
- Added tests to `tests/cmd-regression.spec.js` (Export / Import + Google Calendar describes): a full import-wizard walk (image keepBoth, category keepBoth, a date keepBoth + a date useExisting, plus an auto-import date) and a skip-every-section walk; three export-wizard tests (specific+cascades+filters+Back, all-choices, exportToQR); Google OAuth helpers (stub `window.google.accounts.oauth2.initTokenClient`, store/cache/clear token, `loadGoogleIdentityScript`, `requestGoogleAccessToken`, `googleApiFetch`/`updateGoogleEventDescription` with a stubbed `fetch`) and a 401-retry test; Google editor search/edit/cancel/close + a real `recurringEventId` series save + failure modals. Result: import-wizard 52->94/109, export 24->72/72, googleCalendar 27->43/46, googleCalendarEditor 25->40/40 (~+121 functions).
- Removed the DEAD legacy image picker from `shared/js/smd-images.js` (262 lines): `parsePickerCssGlyphs`, `loadPickerIconSet`, `openImagePicker`, `closeImagePicker`, `injectPickerStyles`, `renderImagePicker`, `renderPickerList`, `selectImagePickerItem`, `filterImagePicker`, `clearImagePickerFilter` + their vars/consts (`PICKER_ICON_SETS`, `IO_CODEPOINT_RE`, `IMAGE_PICKER_STYLES`, `_pickerIconData`, `_pickerIconPromises`, `imagePickerCallback/Search/Set`, `_imagePickerCloseTimer`) and their `SmdApp.prototype` export entries. Only referenced from within the file; the LIVE path is `__openImagePicker` + the `smd-image-picker` component. Verified: no leftover refs, `node --check` clean, 23 pmd Image Picker tests + the 2 that first looked broken pass.
- STALE-SERVER GOTCHA bit again (see the 2026-09-26 note): after editing `smd-images.js` (shrinking it), the long-running `tests/serve-tests.mjs` (started BEFORE the edit; sirv snapshots sizes at startup) served it with the old Content-Length -> `ERR_CONTENT_LENGTH_MISMATCH` -> the script failed to parse -> `openImagesEditor is not defined` -> two unrelated picker tests "failed". Symptom-to-remember: a `* is not defined` + `ERR_CONTENT_LENGTH_MISMATCH` on a file that `node --check` passes = STALE SERVER, not app code. Fix: kill the 8080/8081 listener and let Playwright start a fresh one; both tests then passed. ALWAYS restart the test server after editing a file the server already snapshotted (or start it after all edits).
- Removed the DEAD `SmdApp` class from `shared/js/smd-app.js` (343 lines) plus the three `Object.assign(SmdApp.prototype, {...})` export blocks (`smd-images.js`, `smd-minio.js`, `smd-settings.js`) and the then-unused `SMD_SHARED_ROOT`/`classAndMore`. `new SmdApp`/`extends SmdApp` never appeared anywhere - every app uses a static index.html shell (`document.write` cache-busting) and drives `smd-page` directly, so the class was an earlier framework the apps never adopted. NOTE it is NOT "the same code duplicated in the apps" (only the RESPONSIBILITY is, declaratively), so deduplicating would have meant migrating every app onto the class - a large risky refactor against the tested static-shell architecture (the `/PlanMyDay/` sub-path precache test asserts the literal `js/app.js` tag). The globals the apps + services use all stay in `smd-app.js`: `SmdConfig`, `smdKey`, `smdImagePrefix`, `$id`, `escapeHtml`, `escAttr`, `showSmdModal`, `showInfoConfirm`, `updateNavState`/`updateMainMenuVisibility`/`observeMainMenuVisibility`, `injectSmdComponentStyle`, `injectStyleInto`. `node --check` clean on all four files; regression suite intentionally NOT run (user request).
- The live image-cache functions in `smd-images.js` (`smdImageHash`/`smdImageCacheUrl`/`smdImagePaintVariants`/`purgeStaleImageCache`) stay uncovered because tests run without the SW controlling the page (blob-only path).
- `BUILD_NUMBER` -> `202609280857`.

### 2026-09-28 (b) - dead-code sweep: 7 unused functions, 2 consts, 1 orphan file, and the smdWorkerNoCache/GET_NO_CACHE pair
- Method: scanned 122 non-vendor JS/HTML files (811 function definitions + all top-level declarations), counted every word-boundary occurrence across the whole corpus (inline `onclick`, string refs and test `page.evaluate` included), then hand-verified each hit.
- NOT dead (contrary to the suspicion that prompted the sweep): the `injectStyle*` family is all live - `injectSmdComponentStyle` (19 refs), `injectStyleInto` (16), `injectEditorStyles` (14), `injectSettingsStyles` (10), plus `injectPickerStyles` / `injectJobEditStyles` / `injectStreamsEditorStyles` / `injectGameStyles`. The retired constructable-stylesheet layer (`shared/js/components/styles.js`, `SmdStyles`, `adoptStyles`, `sheetFor`) was already fully gone.
- Removed (0 refs each): `closeAppInfoModal`, `isGcalSequenceEvent`, `CMD_PAYLOAD_MARKER` (CountMyDays/js/googleCalendar.js - the marker const was unused AND the code hardcodes `"{count_my_days{"` inline at :229/:327); `iwQueryAll`, `importSampleData` (CountMyDays/js/import-wizard.js - the singular `iwQuery` is the one used); `confirmDeleteJobInAccordion` (PlanMyDay/js/streams-editor.js - `editJobInAccordion` is used); `formatLongDate` (PlanMyDay/js/utils.js - `formatDate` is used); `DATA_URL_PREFIX` (shared/regen_sample_images.js build script, which hardcodes `"data:image/png;base64,"` inline).
- `smdWorkerNoCache` (shared/js/smd-settings.js) was a `GET_NO_CACHE` read-back helper with no caller; its `GET_NO_CACHE` message was removed from sw.js too. The Danger -> No Cache switch flows `changeNoCache` -> `smdSetNoCache` -> `smdTellWorkerNoCache` (`SET_NO_CACHE`), the boot re-assert is `smdPushNoCacheToWorker`, and `smdSetNoCache` reads state from its own ack, so the separate GET was never needed in production.
- The "No Cache danger switch" test read the worker via `GET_NO_CACHE`; it now reads the flag the WORKER writes into Cache Storage (`caches.open("myapps-flags").match("/__myapps_no_cache__")`) - the page never writes it, so presence still proves the worker applied the mode, and no bespoke worker message is kept alive for tests. LESSON: a worker message used ONLY by a spec is not automatically dead, but REWRITE THE SPEC to observe the real artifact rather than keeping a production handler alive just for the test.
- Deleted the orphan `PlanMyDay/js/pwa.js` (pull-to-refresh): its `<script>` tag was removed in `1dbdfe1` and no file referenced it; CountMyDays/QRLinks/SolarControlar carry the feature inline. Removed the stale `js/pwa.js` line from `PlanMyDay/js/app.js`'s header comment.
- Verified: `node --check` clean on all 8 edited JS files; leftover-reference grep clean; 16 focused tests green (pmd No Cache x2, controlling-worker build, service-worker update modal, both sub-path precache tests, cmd Google Calendar x5, import wizard, sample-data seed, streams editor x2) via `--workers=2 --retries=0`.
- `BUILD_NUMBER` -> `202609280455`.

### 2026-09-28 - flatpickr popup day grid painted BLACK in every theme (stray #000000 in styles.css)
- Bug (user): PlanMyDay Edit Job -> Schedule tab (`#jobSchedule-tab`) `<smd-date-picker>` popup was BLACK with theme `bootstrap` + mode `light`. It was actually black in EVERY theme/mode; bootstrap/light just made it glaring.
- Root cause: `shared/css/styles.css` had `.flatpickr-calendar { background: #000000; }`. `git blame` + `git show e8e91ee3` ("simplex dark theme changes", 2026-09-27) prove it was a stray edit that replaced the correct `background: var(--smd-date-picker-background);`. The vendor skin sets `background: transparent` and `flatpickr.min.css` is linked BEFORE `#smd-shared-css` in every shell, so the shared rule won and painted the container black.
- Why only the DAY GRID looked black: `styles.css` already repaints `.flatpickr-months .flatpickr-month`, `.flatpickr-weekday` and `.flatpickr-time` from the `--smd-date-picker-*` palette, but nothing painted `.flatpickr-days` (the vendor leaves it with no background), so the container's black showed through. The arrow `:after` borders already used `--smd-date-picker-background`, so they were light while the body was black - the "other colours messed up too" part.
- Fix: 4 rules, all in `shared/css/styles.css`, variables only (NO theme override file touched, per the 2026-09-26 (g) rule): (1) revert the container to `var(--smd-date-picker-background)`; (2) add `.flatpickr-calendar .flatpickr-days { background: var(--smd-date-picker-background); }` so the grid no longer depends on the container showing through; (3) palette-drive the year spinner arrows at 0,5,0 - the vendor hardcodes `border-*-color: rgba(0,0,0,0.9)` at 0,4,1, so they were invisible on a dark calendar; (4) pin `.flatpickr-day.today:hover/:focus` at 0,4,0 - the vendor hardcodes `background:#959ea9; color:#fff` at 0,3,0, which the existing shared `.flatpickr-calendar .flatpickr-day:hover` only tied (0,3,0) and beat by document order alone.
- VERIFIED with a deleted `tests/_probe.spec.js` (bootstrap light/dark + superhero light): bootstrap+light calendar and days = `rgb(255,255,255)` with `rgb(33,37,41)` text and arrows; superhero+light = `rgb(15,37,55)` with `rgb(235,235,235)`; arrow colour now follows the palette. Probe + JSON deleted afterwards.
- NO regression test added (user request), so this remains an unguarded area: the existing suites only assert the calendar is VISIBLE/clickable, never its colour. If it regresses again, add a `getComputedStyle(".flatpickr-calendar")` assertion.
- LESSON: a hardcoded hex inside a palette block is a regression smell - `git blame` + `git show` pinned it to one stray commit. And same-specificity ties (0,3,0 vs 0,3,0) are decided by document order, so verify `styles.css` is linked AFTER the vendor sheet before assuming a shared rule is dead (or alive).
- Known pre-existing behaviour (NOT changed here): with the stock `bootstrap` theme, `--smd-date-picker-background` / `--smd-form-background` resolve from `--bs-white` in BOTH modes (Bootstrap dark does not redefine `--bs-white`), so bootstrap dark gets a light popup and light form fields.
- `BUILD_NUMBER` -> `202609280427`.

### 2026-09-27 (f) - #imageEditModal: Bootstrap modal -> <smd-page>
- Converted the last Bootstrap modal in the app shells to the shared page
  component. `PlanMyDay`, `CountMyDays` and `QRLinks` now declare
  `<smd-page id="imageEditModal" class="d-none"></smd-page>` instead of the
  `.modal > .modal-dialog > .modal-content > .modal-header/.modal-body` markup.
  NO `class="modal"` markup remains in any `*.html`.
- The element ID was deliberately KEPT as `imageEditModal` (it is a page now, not
  a modal) so the ~90 existing `#imageEditModal ...` test selectors survive;
  only `#imageEditModalTitle` had to move, because `smd-page` renders its own
  `<h1>` in `.smd-page-header`. Four assertions were retargeted to
  `#imageEditModal .smd-page-header h1` (3 in pmd-regression, 1 in
  cmd-regression) — the same pattern the other pages already use.
- `#imageEditModalBody` is preserved as an inner div that becomes the page's
  `content`, so every `#imageEditModalBody ...` selector (and `smd-images.js`'s
  own name-field lookup) still resolves unchanged.
- `renderImagesEditor()` no longer builds a `bootstrap.Modal`; it sets the page's
  properties and shows it. **ORDERING TRAP (cost a debugging round):** EVERY
  `smd-page` property setter (`title` / `content` / `buttons`) re-renders the
  whole page via `innerHTML`, which DETACHES anything already mounted in it. So
  set all the page properties FIRST and mount the `<smd-image-editor>` LAST.
  Setting `page.buttons` after mounting silently threw the form away and the page
  rendered empty (no visible images). The page's `smd-page-action` listener is
  bound once via `page.__smdPageActionsBound`.
  `safeHideModal("imageEditModal")` (x2) became `hideImageEditPage()` =
  `page.hide()` + `d-none` re-applied after the slide-out, mirroring
  `closeSettings()` (a footer button already auto-hides, so it is idempotent).
- OK / Cancel now live in the page FOOTER, in that order (Cancel left, OK right —
  the order every other app dialog uses), passed as
  `page.buttons = [{Cancel, id:"btnImageEditCancel"}, {OK, id:"btnImageEditOk"}]`.
  The ids were KEPT so the existing `#btnImageEditOk` / `#btnImageEditCancel`
  selectors still resolve (they now land on the `<smd-button>` host). The card
  no longer renders its own OK / Cancel, so there is exactly one of each — which
  also keeps `getByRole("button", { name: "Cancel" })` single-match. `Upload`
  stays in the form next to the preview; only the "upload" branch of
  `smd-image-editor-action` remains.
  `detail.index` in `smd-page-action` is the BUTTON index (0 = Cancel, 1 = OK),
  so the handler uses the module's `editingImageIndex`, not the event.
- The duplicate-name guard moved with OK: `checkDuplicateName()` now calls
  `setImageEditOkDisabled()`, which toggles the `disabled` ATTRIBUTE on the
  `#btnImageEditOk` host (`smd-button` mirrors it to the inner `<button>`).
  It must NOT re-assign `page.buttons` to change the state - that would re-render
  the page and wipe the form mid-typing.
- Removed the form's wrapper `<div class="card p-3">`: the `<smd-page>` already
  provides the surface and padding, so the card was a second frame around the
  content. Two selectors had to follow: `checkDuplicateName()`'s name-field
  lookup is now `#imageEditModalBody input.form-control:not(.form-control-sm)`
  (the Name field is the only non-`form-control-sm` text input; the stroke-width
  input has both classes), and one cmd-regression assertion dropped `.card`.
- DEAD CODE REMOVED while converting (all verified with a repo-wide reference
  scan, not by eye): `safeHideModal()` + the two `shown.bs.modal` /
  `hidden.bs.modal` dataset listeners in `smd-app.js` (their last caller was
  this dialog); and 7 no-op blocks in `pmd-regression.spec.js` that hid
  Bootstrap modals — 5 `if (modal) modal.hide()` on `#imagePickerModal` (gone
  since the picker became `<smd-page id="imagePickerPage">`, and each site
  already waits for the page to be hidden on the next line) plus 2
  `querySelectorAll(".modal.show")` scrub blocks in `beforeEach` hooks.
  `shared/vendor/bootstrap.bundle.min.js` is STILL REQUIRED — it is not
  modal-only: all 6 shells use `data-bs-toggle="dropdown"` for the main menu and
  `smd-tabs` uses Bootstrap's tab data-api.
- BEHAVIOUR CHANGE to know about: the edit page now takes part in `smd-page`'s
  page STACK, so opening it SUSPENDS the page underneath (`#imagesEditor` gets
  `smd-page-suspended`, i.e. hidden) and restores it on close. As a Bootstrap
  modal it merely overlaid. This is the same relationship `imagePickerPage` has
  with its editor. `updateNavState()` also now sees an open `smd-page` rather
  than a modal, so the nav hides while editing.
- `safeHideModal()` in `shared/js/smd-app.js` is now unused but was LEFT in place
  (it is a documented shared global, and the adjacent `shown.bs.modal` /
  `hidden.bs.modal` dataset listeners are harmless with no Bootstrap modals).
- Verified: 439 PlanMyDay + 62 CountMyDays/QRLinks/storybook tests, plus the 10
  preview-size tests from (e), all pass.

### 2026-09-27 (e) - image edit dialog preview follows the Settings icon size; `.date-img` -> `.data-img`
- BUG (user): the main image in the IMAGE EDIT MODAL was "huge". ROOT CAUSE: the
  `.date-img` sizing rule was DELETED from `shared/css/styles.css` in `1dbdfe1
  minimal css ... not working`, so the dialog's preview
  (`smd-image-editor.js` -> `<img class="date-img">`) had no width/height and
  rendered at the data-URL's intrinsic size (100px for the samples, arbitrary
  for a big upload). The two per-theme previews (`smd-images.js`
  `buildThemeSection`) were capped at a hard-coded `max-width/height:110px` and
  did not follow Settings either.
- The ORIGINAL rule (initial commit) sized `.countdown-img, .date-img` at
  100px/64px and had `body.icon-size-{small,medium,large} .date-img` overrides
  with `!important` - i.e. it DID follow the icon-size setting. That CSS
  mechanism is gone: icon size is now a VALUE on `<smd-image>`
  (`SmdImage.defaultSize`, pushed by each app's `applyImageSize()`), and the
  dialog preview is a plain `<img>`, so it inherited nothing. Restoring the CSS
  rule alone would NOT have made it follow Settings again.
- FIX: `smdImagePreviewSizePx()` in `shared/js/smd-images.js` reads
  `SmdImage.defaultSize` and CLAMPS it to 40-100px (xsmall's 32px is too small
  to judge an image in the dialog; the clamp also stops a future larger setting
  overflowing the panel). Applied INLINE (`width`/`height`/`object-fit:contain`)
  at both call sites - the main preview + "No image" placeholder in
  `smd-image-editor.js`, and the Light/Dark theme previews + their wrapper box
  in `smd-images.js` - because size is a VALUE in this codebase, not a style
  (`<smd-image>` sizes itself the same way, from the same value). There is
  deliberately NO `.data-img` rule in `shared/css/styles.css`.
  The live colour-edit path (`updateEditPreview` -> `smdSetImageSrc`) only swaps
  `src`, so the inline size persists across colour changes.
- RENAME `.date-img` -> `.data-img` (user request) in `smd-images.js` and
  `smd-image-editor.js` (both the `<img>` and the "No image" placeholder
  `<div>`), plus the three AGENTS.md references. NOTE the name was NOT a typo:
  `data-img` has never existed in this repo (0 commits), and `date-img` dates
  back to the initial commit where it was paired with `.countdown-img` under an
  `/* IMAGES */` heading - it meant the image on the date/today card. The rename
  was a user preference, not a bug fix. No CSS or test referenced the class.
- New `tests/image-edit-preview-size.spec.js`: the whole icon-size ladder on
  PlanMyDay (32->40, 40->40, 50->50, 64->64, 80->80, 100->100) asserting all
  three previews, a "never the unsized natural size" guard, and the renamed
  class in PlanMyDay/CountMyDays/QRLinks. MUTATION-CHECKED: dropping the inline
  size reproduces the reported bug exactly (main preview 100px regardless of the
  setting), so the assertion is not vacuous.
- GOTCHA when writing this kind of measurement: the previews unhide only once
  their src resolves through `smdImageRenderUrl` (Cache Storage) AND the
  Bootstrap modal fades in asynchronously - an `<img>` can be "loaded" while its
  modal is still `display:none`, which measures 0x0. Wait for
  `#imageEditModal.show` AND `getBoundingClientRect().width > 0` before
  asserting geometry.

### 2026-09-27 (d) - <smd-theme> rows align with the app settings rows; storybook header on one line
- BUG (user, 832x688 in PlanMyDay): the Theme / Theme Mode rows did not line up
  with the rows around them (Font size, Screen resolution). ROOT CAUSE: the app
  settings rows are `row.col-md-8` on ONE element, while the theme control is a
  `col-md-8` HOST with `.row` fields inside it. Those are not the same geometry:
  an auto-width `.row` inside a fixed-width column has its used width INFLATED by
  the row's negative margins (auto width = containing width - margins, so
  +24px), so the `col-4`/`col-8` split was computed on a 24px-wider box and the
  label/select edges sat **8px** right of the other rows - and only at >=768px,
  where `.col-md-8` has a width (below md both are full-width auto rows and
  already matched). So "it looks fine at some widths" is the expected signature.
- FIX (component-owned, no app/store book markup changes): `smd-theme.js` now
  injects its own layout - `smd-theme { display: block }`, the field bottom gap
  (`mb-4` equivalent), and the gutter's negative margin moved ONTO the host
  (`smd-theme.col-md-8 { margin-left/right: calc(var(--bs-gutter-x) * -.5) }`)
  with the fields' own horizontal margins zeroed. The host then behaves exactly
  like `row.col-md-8` at every width, so the fields are geometrically identical
  to the rows around them.
- Removed the `d-block` class from the host and the `mb-3` from the fields. Both
  were Bootstrap UTILITIES, i.e. `!important`, so no page could restyle the
  control without its own `!important` (the storybook header needed two). The
  component now sets plain CSS, and the storybook overrides are plain too.
  Side effect fixed: `<smd-theme>` in a page that flexes it no longer needs
  `!important`.
- Storybook header: it is now a SINGLE row down to 768px (was three rows - the
  `d-block` had killed the page's `display: flex`, so the two Theme fields
  stacked and the header was 141px tall; now 74px). Title truncates
  (`text-truncate`) below ~1024px and the selects get width floors per
  breakpoint; below md the control may shrink so nothing overflows.
  The sticky nav's `top` was a hard-coded `57px` and was wrong both before
  (141px header) and after; it is now `var(--sb-header-h)`, measured in
  `syncStickyOffset()` with a **ResizeObserver** (a single measurement at script
  time was ~20px stale because it ran before `<smd-theme>` rendered its fields).
- New `tests/settings-alignment.spec.js`: all 6 apps x {832, 700} assert the
  Theme field's `col-4`/`col-8` cells match a sibling settings row exactly
  (0px), plus the bottom-gap check. It activates the tab that CONTAINS
  `#themeSelector` first - the control is not on the default tab in every app
  (PlanMyDay has it on Display, the rest on General) and a hidden panel measures
  as all-zero rects, which would make the comparison pass for the wrong reason.
  Measured on the grid CELLS, never the `<label>`: a label is an inline box, so
  its rect is the text box and moves with the wording ("Theme" vs "Swatch").
- VERIFIED: the alignment spec FAILS with the exact reported symptom when the
  two gutter rules are removed (8px at 832/1280, 0px at 700, row 24px wider) -
  it is not a vacuous assertion. 13 alignment + 40 theme/settings/boot tests
  across all 6 apps + all 8 storybook tests + 61 PlanMyDay theme/settings tests
  pass. Header probed at 1600/1280/1024/900/768/390: one row and no horizontal
  overflow at every width.

### 2026-09-27 (c) - flake fix: the two No Cache tests needed the worker to actually CONTROL the page
- Both No Cache tests were flaky under a parallel run. Causes, both real:
  (1) "No Cache mode serves files from the network" compared a SW-served
  response date against `page.request.get()`, but on a first visit the worker
  may not have CLAIMED the page yet — then the page's `fetch()` never reaches
  the worker at all and the BROWSER HTTP CACHE answers it, because
  `tests/serve-tests.mjs` serves every non-sw.js/non-HTML asset as
  `public, max-age=31536000, immutable`. The test then measured the HTTP cache
  and failed with a response dated at the warm fetch. Fix: poll
  `navigator.serviceWorker.controller` until set before measuring anything.
  GOTCHA worth remembering: an ack from `smdSetNoCache` does NOT imply control —
  it also talks to an unclaimed worker via `reg.active`, so the ack and "this
  page's fetches go through the worker" are independent facts.
  (2) The other test drove `#noCache.check()`, whose handler RELOADS the page, so
  the navigation raced Playwright's own post-click verification. Fix: assert the
  switch's `onchange="changeNoCache(...)"` wiring and the persisted-key read-back
  across one controlled `page.reload()` instead of clicking through a reload.
- Also hardened the app, not just the test: `smdSetNoCache` now resolves the
  worker via `smdActiveWorker()` = `controller` OR `reg.active|waiting|installing`.
  Before, toggling No Cache on a first visit (no controller) persisted the
  localStorage flag but never reached the worker, so the reload that follows was
  still served cache-first.
- Verified: the network-vs-cache test still FAILS when the worker's
  `serveNetworkFirst` is mutated back to `serveCacheFirst` (so it is not
  vacuous), passes with it, and passes 10/10 with `--workers=12 --repeat-each=5`.
  User then ran the full regression clean.
- LESSON (any future test that measures what the SW serves, e.g. offline
  work): wait for `navigator.serviceWorker.controller` first, and never let an
  app handler's own `location.reload()` happen mid-assertion — assert the wiring
  and use an explicit `page.reload()`.

### 2026-09-27 (b) - per-mode theme override sheets (`<theme>.<mode>.css`)
- User request: the theme override is applied as `<theme>.css`; make it
  `<theme>.<mode>.css` and split the existing files. All 27 per-theme override
  files were split into `<theme>.light.css` + `<theme>.dark.css` (54 files); the
  mode-less `<theme>.css` files are DELETED.
- Split rule (keep doing this when re-splitting): rules that were keyed
  `[data-bs-theme="light"]` / `[data-bs-theme="dark"]` went to the matching file
  and LOST the now-redundant qualifier; unqualified rules went to BOTH files, so
  the rendered result is unchanged. Only `superhero`, `cyborg` and `simplex` had
  real rules (the other 24 were comment-only stubs, regenerated with a
  "(LIGHT|DARK) mode)" header). Comments inside the split files were updated
  where they referred to the old cross-file arrangement.
- `smd-settings.js`: `applyThemeOverrides(theme, mode)` now builds
  `<theme>/<theme>.<mode>.css?v=<BUILD>`. The prefix/stamp logic moved into
  `smdThemeCssPrefix()` / `smdBuildStamp()` so the MODE-ONLY path can use them.
  **`applyThemeMode()` now re-points the override link** (it previously only set
  the two attributes, which was correct while one file covered both modes). A
  mode switch still does not touch the base theme sheet and still does not call
  `renderMain()`.
- Static `<link id="theme-override-specific">` hrefs in all 7 shells + the
  storybook are now `superhero.light.css` (light is the default mode), and
  `storybook/cardViewer.html` builds `${theme}.${mode}.css` for its frames.
  `sw.js` SHARED_ASSETS: 27 override entries -> 54 (both modes per theme; a
  missing one would make `cache.addAll` reject and break the whole precache).
- Verified: new test "theme override sheet is per-mode and re-points on a mode
  switch" (href per mode, `link.sheet.cssRules.length > 0` so the new names
  really resolve, base theme sheet unchanged by a mode switch, sw.js lists both
  per-mode files and no mode-less one), plus 76 theme/settings/boot tests across
  all 6 apps, 12 asset-cache-busting + sub-path tests, and all 8 storybook tests
  (the card viewer renders every theme x both modes). `node --check` clean;
  `git diff --check` clean; the 54 new files are LF with a trailing newline.

### 2026-09-27 (a) - Danger tab "No Cache" switch reads the app from disk
- PlanMyDay's Danger tab gained a "No Cache" switch (`#noCacheRow` ->
  `<smd-checkbox id="noCache">`, key `planmydays_noCache`). It flips the shared
  worker into network-first mode so every file is re-read from disk instead of
  the precache, and the app reloads so the next load is served that way. Hidden
  until "Show danger", like the other danger rows.
- `sw.js` gained `serveNetworkFirst()` (`cache: "no-store"`, still refreshes the
  entry, still falls back to the cache offline), the `SET_NO_CACHE` /
  `GET_NO_CACHE` messages, and a `myapps-flags` Cache Storage flag (an in-memory
  flag would be lost when the worker is killed between visits; the flag cache is
  now in the `activate` allow-list). `/smd-img/` user images stay cache-only in
  this mode — the network has no file there.
- `shared/js/smd-settings.js` gained `smdNoCacheEnabled` /
  `smdPushNoCacheToWorker` / `smdSetNoCache` (the `smdWorkerNoCache` read-back
  helper added here was removed 2026-09-28 as unused - see that entry);
  `smdRegisterServiceWorker`
  re-asserts the flag on every boot so a restarted worker picks the mode back up.
  Another app can reuse the helpers by adding its own switch — the worker side is
  already global.
- Verified: 2 new tests in `tests/pmd-regression.spec.js` (switch visibility,
  persistence, worker ack both ways; and a response-DATE proof that No Cache
  actually serves from the network while cache-first serves the older precached
  copy), plus 27 focused PMD tests (all Danger tab, page-stack, and asset
  cache-busting groups including the `/PlanMyDay/` sub-path precache test) and
  the CountMyDays sub-path SW test. `node --check` clean on sw.js,
  smd-settings.js, app-settings.js and the spec.

### 2026-09-26 (i) - component-owned layout mechanics and sectioned shared CSS
- User requested a cleanup rule: non-colour/non-size layout mechanics (display,
  flex alignment, positioning, gaps, padding and touch/layout behavior) belong
  to the component that creates the DOM; leave the date-picker styles shared.
  (SUPERSEDED 2026-09-30: the date-picker's own layout moved to the component
  too; only the flatpickr POPUP palette stays shared, because flatpickr appends
  that node to `<body>`, where no component owns it.)
  `shared/css/styles.css` is now sectioned with component comments and keeps
  palettes, typography/size, colours, shell behavior and the date-picker.
- Added `injectSmdComponentStyle(id, css)` to `shared/js/smd-app.js` for
  one-time component-owned light-DOM mechanics. Moved the relevant layout from
  shared CSS into `smd-checkbox`, `smd-draghandle`, `smd-image`,
  `smd-image-select`, `smd-image-dropdown`, `smd-image-picker`, `smd-tabs`,
  `smd-page`, and `smd-modal`; `smd-theme`, `smd-search`, `smd-qr-export`,
  `smd-qr-import`, and `pmd-tasks` now apply Bootstrap display classes from the
  component. Date-picker rules were intentionally not moved.
- The remaining shared component sections are deliberately visual/theme rules
  or size values, with comments identifying the owning component. This keeps
  theme overrides and Bootstrap cascade rules in one place without making
  `styles.css` the source of component layout.
- Verified: `node --check` for all touched JS, `git diff --check`, and focused
  Storybook/CountMyDays/PlanMyDay runs: 39 tests passed, including Storybook
  boot/component demos and the complete Job Edit Tabs group. No screenshot
  regeneration was needed.

### 2026-09-26 (h) - swipe right now opens the job editor on Schedule/tomorrow
- FUNCTIONAL CHANGE (user): on the PlanMyDay main screen, a swipe RIGHT on a
  today card no longer silently snoozes the job (`sleepUntil = tomorrow`). It
  now opens the EDITABLE job editor on the **Schedule** tab with the "Sleep
  Until" date picker popped open showing tomorrow.
- `PlanMyDay/js/main-view.js`: the `pmd-job-today-tomorrow` handler now just
  calls the new `openJobEditSchedule(streamIdx, jobIdx)` instead of mutating +
  `saveStreams` + `renderMain`.
- `PlanMyDay/js/job-editor.js`: new `openJobEditSchedule()` -> sets
  `jobsBuffer.sleepUntil = getTomorrowStr()`, `buildJobEditPage(false, 1)`
  (index 1 = Schedule) and `openJobSleepPickerWhenReady()`, which rAF-polls
  until the page has `open` AND the picker's `getBoundingClientRect()` is
  STABLE across two frames (i.e. the page slide has finished), then calls
  `fp.open()`. Waiting for the slide to settle is required: opening mid-slide
  makes flatpickr position the calendar against the input's transient
  (translated) location, so with a non-zero slide-duration the popup appeared
  in the wrong place. With slide-duration 0 the rect is stable immediately and
  it opens on the second frame. The stored job is untouched until OK
  (jobsBuffer is a copy), so Cancel leaves it on today's list. The Schedule
  date picker gained `id="jobSleepPicker"`.
  GOTCHA: the raw `#smdDatePickerInput` is hidden by flatpickr's altInput, so
  its `getBoundingClientRect().width` is 0 — measure the `smd-date-picker`
  HOST (`#jobSleepPicker`) for the "laid out"/"stable" check, not the raw input.
  `smd-page.show()` defers the `open` attribute to the next frame, hence the
  poll rather than opening immediately (opening while hidden puts the calendar
  at 0,0). Verified via probe with slide-duration 0 AND 300: the calendar opens
  only once the input is at its final position (x/y match the settled layout).
- `pmd-job-today-card.js` doc comment for `pmd-job-today-tomorrow` updated.
- TESTS: rewrote `pmd-regression` "swipe right opens Edit Job on the Schedule
  tab with tomorrow selected" and `pmd-touch` "swipe right on a today card
  opens Edit Job on the Schedule tab for tomorrow". Both assert: Edit Job
  header, `#jobSchedule-tab`/`#jobSchedule-tab-panel` `active`, the
  `.flatpickr-calendar.open` popup visible, `jobsBuffer.sleepUntil` = tomorrow,
  and the STORED job unchanged until OK. Regression test also cancels and
  asserts the job stays on today's list + the sub-threshold wiggle opens
  nothing. Verified: 44-test pmd batch (swipe + Job Edit Tabs + sleepUntil)
  green; `node --check` + `git diff --check` clean.
- `BUILD_NUMBER` bumped after the change.

### 2026-09-26 (g) - hero light: flatpickr popup + smd-image-select gap
- Reported (superhero light): the Edit Job / Schedule date-picker popup and the
  General-tab `smd-image-select` gap.
- DATE PICKER: the FIELD was already dark (`--smd-form-*`), but the flatpickr
  POPUP (appended to `<body>`) stayed white because the shared dark skin was
  gated `[data-bs-theme="dark"]` and superhero's light mode sets
  `data-bs-theme="light"` (probe: `.flatpickr-calendar` bg `rgb(255,255,255)`,
  month/day text dark). Fix: the ENTIRE flatpickr calendar skin now lives in
  `shared/css/styles.css` as UNGATED selectors consuming a `--smd-date-picker-*`
  palette (background/foreground/muted-foreground/hover-background/accent/
  accent-foreground/border-color) declared at the top of `:root` with light
  defaults; the `html[data-bs-theme="dark"]` block sets the dark values. Theme
  override files now ONLY set that palette: `superhero.css` sets the dark values
  in `:root` (all named Bootstrap colours) so its light mode gets the dark
  calendar too.
  RULE (user, 2026-09-26): `shared/css/themes/<theme>/<theme>.<mode>.css` must
  ONLY set variables that `styles.css` consumes — NEVER put component selectors
  there (the first cut added an `html[data-theme="superhero"] .flatpickr-calendar
  ...` block, which was reverted). If you need to override an element, add/route
  it through a variable in `styles.css` first. (Note: `simplex.*.css` and
  `cyborg.*.css` do carry selectors — later hand edits, kept as-is.)
  Other light themes barely change (calendar stays light; the selected day now
  uses the theme primary, matching the dark skins). Verified via probe:
  superhero light bg `rgb(15,37,55)` / month text `rgb(235,235,235)`, superhero
  dark `rgb(33,37,41)`, flatly light still `rgb(255,255,255)`.
- `smd-image-select`: added `gap: 0.5rem` (Bootstrap `m-2`) between the thumb
  and the `.meta` name/Edit column in `shared/css/styles.css`.
- `BUILD_NUMBER` bumped after the change.

### 2026-09-26 (f) - superhero light: pmd-tasks row surface + checkbox accent
- Reported: in superhero **light** the `<pmd-tasks>` rows and the General-tab
  Suffix `<smd-checkbox>` looked wrong colourwise (the (c)/(d)/(e) fixes were
  tuned for dark).
- Two causes: (1) `--pmd-tasks-row-background` was a single `:root` value
  (`var(--bs-dark)` #20374c) for BOTH modes; in light it sat too close to the
  #0f2537 page and did not match the app's card surface. (2) `<smd-checkbox>`
  is a bare native `<input type=checkbox>` with no accent, so the tick used the
  browser/OS blue, clashing with superhero's orange primary.
- Fix (same style as (c)-(e); variables at the top of `shared/css/styles.css`,
  overridden in `superhero.css`):
  - `shared/css/styles.css` `:root` gained `--smd-checkbox-accent: auto`
    (default = unchanged for every other theme), consumed by
    `smd-checkbox input { accent-color: var(--smd-checkbox-accent); }`.
    `superhero.css` sets `--smd-checkbox-accent: var(--bs-primary)` (orange).
  - `superhero.css` `:root[data-bs-theme="light"]` now overrides
    `--pmd-tasks-row-background: var(--bs-card-bg)` (#4e5d6c, the theme's card
    surface) so light rows read like the rest of the app; dark keeps `--bs-dark`.
- KNOWN LIMIT: `accent-color` tints the CHECKED tick only; a native UNCHECKED
  checkbox in superhero light is still a light square (its `color-scheme` is
  light while superhero's light mode is visually dark). If that is reported,
  add `smd-checkbox input { color-scheme: dark; }` in superhero.css (do NOT add
  that to the shared base — `color-scheme` is inherited and an explicit
  `normal` there would break every dark theme).
- Per user request the Playwright suites were NOT run; `git diff --check` clean.
  `BUILD_NUMBER` bumped after the change (`npm run bump:build`).

### 2026-09-26 (e) - superhero disabled-control palette (View Job selects)
- Reported: on **View Job** (read-only) the two General-tab selects beside the
  Suffix checkbox ("Day of Year" / "None") and the Schedule tab "Schedule Time"
  selects (hour/minute) were still LIGHT in superhero. Cause: read-only renders
  those native selects with the `disabled` attribute, and the shared
  `.form-control:disabled, .form-select:disabled` rule paints from
  `--smd-form-disabled-background` (default `var(--bs-gray-100)`) +
  `--smd-form-disabled-foreground` (`var(--bs-gray-600)`). In superhero those
  resolve to #ebebeb / #4e5d6c (light) and do NOT flip with `data-bs-theme`
  (the gray scale is mode-independent), so disabled fields glared on the dark
  page while enabled fields were fine.
- Fix (same style as (c)/(d): variables at the top of `shared/css/styles.css`,
  override per theme): the `--smd-form-disabled-*` palette already exists at the
  top of `shared/css/styles.css`, so `superhero.css` now overrides only
  `--smd-form-disabled-background: var(--smd-form-background)` and
  `--smd-form-disabled-foreground: var(--bs-secondary-color)`. Every disabled
  form control in superhero (all apps) now keeps the field surface with muted
  text. Do NOT reach for the mode-specific `[data-bs-theme]` block here — the
  plain `:root` override covers both modes because it is built from
  mode-aware vars.
- Verified with a real View-Job probe (superhero dark): the General selects
  ("Day of Year", "None"), the Schedule time selects ("09", "00") and the
  already-fixed disabled stream dropdown all compute
  bg `rgb(33,37,41)` / text `rgba(206,212,218,.75)` / border `rgb(73,80,87)`.
  A shared class probe confirmed enabled vs disabled `.form-control`/`.form-select`
  and the superhero light mode resolve (#0f2537). CSS-only change; no JS/DOM.
  `git diff --check` clean. `BUILD_NUMBER` workspace-managed.

### 2026-09-26 (d) - <pmd-tasks> component + variable row palette
- Same class of superhero bug as (c), for the job-edit Tasks list: each row used
  `bg-body-tertiary`, which is LIGHT (#ebebeb) in superhero while the page is
  dark -> glaring light strips. Extracted the list into a component and moved
  the row colour onto a themeable palette.
- NEW `PlanMyDay/js/components/pmd-tasks.js` (`<pmd-tasks>`, class `PmdTasks`):
  light DOM, self-contained. Host sets `tasks` (array) + `read-only` attr; it
  renders one `.task-row` per task plus its `.task-note-row`, preserving
  `.task-drag-card`/`.drag-handle`/`.task-done-cb`/`.task-desc-input`/
  `.task-note-btn`/`#taskNoteRow<i>` (all test hooks). Delegated `change`/`input`/
  `click` handlers on the host (no inline onclick), emitting `pmd-task-change`
  ({index, field, value}), `pmd-task-note-toggle` ({index, open}) and
  `pmd-task-delete` ({index}) (bubbles + composed). It owns the note-button
  `btn-info`/`btn-outline-info` class toggling and the note row `d-none` toggle.
- `job-editor.js`: `getJobTasksTabHTML` now emits
  `<pmd-tasks id="jobTasksList" [read-only]>` (empty; the component renders the
  rows); `renderJobTasks()` sets `el.tasks = jobsBuffer.tasks`, toggles
  `#jobAddTaskBtn`, and re-inits Sortable; `buildJobEditPage` calls
  `renderJobTasks()` for BOTH read-only and editable; `initJobTasksSortable` is
  only reached via `renderJobTasks` now. Deleted the now-unused
  `jobTaskToggleNote` and `taskNoteOpen` globals. `app.js` adds the three
  `pmd-task-*` listeners on `#jobEditPage` next to the dropdown/date-picker
  ones (-> `jobTaskField`, `jobsBuffer.tasks[i].noteOpen`, `jobDeleteTask`).
- Styling: added `--pmd-tasks-row-background` (default `--bs-tertiary-bg`) and
  `--pmd-tasks-row-foreground` (default `--bs-body-color`) to the `:root` block
  at the top of `shared/css/styles.css`, plus `pmd-tasks { display:block }` and
  `pmd-tasks .task-row { background-color/color : var(--pmd-tasks-*) }`; removed
  `bg-body-tertiary` from the rows. `superhero.css` overrides
  `--pmd-tasks-row-background: var(--bs-dark)` — a subtle navy (#20374c) that
  works in BOTH modes — keeping `--bs-body-color` text.
- Registration: `PlanMyDay/index.html` (after pmd-job-today-card),
  `sw.js` `APPS["PlanMyDay/"]`, `storybook/index.html` (script + section);
  bumped the storybook nav-link assertion 31 -> 32 and added a render assertion
  (`#sb-pmd-tasks .task-row`/`.task-note-row` = 2).
- Verified: 35/35 "Job Edit Tabs" (incl. note toggles, reorder, view-only);
  iphone pmd-touch "task rows can be reordered with a touch drag";
  pmd-screenshots "job edit modal - tasks tab" (superhero) green; storybook
  "component demos render their host elements" green; pmd sub-path SW-precache
  green. Headless probe: task row = rgb(32,55,76) / text rgb(235,235,235) light
  and rgb(206,212,218) dark. `node --check` + `git diff --check` clean.
  `BUILD_NUMBER` workspace-managed (not touched).

### 2026-09-26 (c) - smd-image-dropdown variable palette + superhero override
- Fix: on PlanMyDay's Edit Job page the shared `<smd-image-dropdown>` (the
  "Stream" picker, `#jobStreamDropdown`) had wrong colours in superhero in BOTH
  modes. Cause: the trigger used `btn-outline-secondary bg-body-tertiary` and
  the menu `bg-body border`; superhero's `--bs-tertiary-bg` is LIGHT (#ebebeb)
  while its body/page is dark (#0f2537 light, #212529 dark), so the control was
  a light box on the dark page, and the `--bs-secondary` (#4e5d6c) text was
  low-contrast on dark.
- Change (per user request: variables at the top of `shared/css/styles.css`,
  overridable in `superhero.css`): added a `--smd-dropdown-*` palette to the
  `:root` block of `shared/css/styles.css` (mirroring the existing
  `--smd-form-*` pattern) and moved the component's colours onto it; removed
  the colour utility classes from `shared/js/components/smd-image-dropdown.js`
  (kept `btn`, `gap-2`, `list-unstyled`, `rounded`, `shadow-sm`, `mb-0` and the
  `.menu`/`.item dropdown-item` hooks + ids). `superhero.css` overrides the
  palette to the themed form field colours (`--smd-form-*`) with a
  `--bs-primary` hover/active.
- Verified with a headless storybook probe (superhero light+dark): trigger,
  menu and form field all resolve identically — light rgb(15,37,55)/rgb(235,
  235,235)/rgb(206,212,218), dark rgb(33,37,41)/rgb(206,212,218)/rgb(73,80,87);
  active item = `--bs-primary` #df6919 with white text. GOTCHA: `.btn` has a
  150ms colour transition, so a probe that switches `data-bs-theme` and reads
  immediately catches the OLD mode's colour — wait ~400ms (or a real
  transitionend) before asserting; the menu (no transition) updates instantly,
  which is what made the button look wrong in the first probe pass.
- `node --check` + `git diff --check` clean. `BUILD_NUMBER` managed by the
  workspace watcher (not touched here).

### 2026-09-26 (b) - new shared `bootstrap` theme (stock Bootstrap 5.3.3)
- Added the 27th theme `bootstrap`: `shared/css/themes/bootstrap/` holding the
  UNMODIFIED stock `bootstrap@5.3.3/dist/css/bootstrap.min.css` (fetched from
  `https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/css/bootstrap.min.css`)
  plus an empty per-theme override `bootstrap.css` (same header shape as the
  others). Registered in `themeConfig` (`shared/js/smd-settings.js`) and BOTH
  files in `sw.js` `SHARED_ASSETS`. `data-theme="bootstrap"`, override path
  `css/themes/bootstrap/bootstrap.css`. No per-theme CSS needed: stock Bootstrap
  is light in `data-bs-theme="light"` and ships its own dark vars for `dark`.
- Theme count 26 -> 27 everywhere it is asserted: `tests/screenshot-helpers.js`
  (throws unless 27), the theme-select option counts in `cmd-regression`,
  `ffox-regression`, `qrlinks-regression`, `launch-regression`, the Storybook
  header selector (27) and card viewer (`#themeSelect option` 26+1=28,
  `.theme-row` 27, `iframe.preview-frame` 54), and `commands.md` ("all 27").
  No hardcoded theme list remains in the screenshot specs (they use
  `screenshot-helpers.js`); `screenshots/viewer.js` and
  `storybook/cardViewer.html` enumerate the live tree/`themeConfig`.
- Screenshots NOT regenerated (user chose "wire it in only"); the suites pick
  the theme up from `themeConfig` on the next run.
- Verified: `node --check` on every edited JS + `git diff --check` clean; the 4
  targeted chromium tests green (cmd "opens with the theme list...", launch
  "settings has theme...", storybook "component demos..." and "card viewer
  renders one card across every theme and both modes" — the last loads all 27
  themes and asserts ZERO failed requests, so both new CSS files are confirmed
  reachable). `BUILD_NUMBER` unchanged (user ships).
- Gotcha (new technique note above): a leftover `tests/serve-tests.mjs` server
  from a `git stash`/`pop` cycle served a TRUNCATED `smd-settings.js`, giving
  `SyntaxError: Unexpected end of input` + `injectSettingsStyles is not
  defined` on the first run. A clean-HEAD stash baseline passed, which isolated
  it to the stale server; killing the 8080/8081 listener and letting Playwright
  start a fresh one made all 4 pass.

### 2026-09-26 - theme override cascade verified + cyborg.css fixed
- User reported `superhero.css` color overrides not applying. Root cause (2026-09-25/26): the two theme override links loaded BEFORE `shared/css/styles.css` (`orderThemeOverrideLinks()` pinned them right after the bootstrap theme link), so the equal-specificity bare `:root` in the per-theme file lost to `styles.css` by document order. The fix that landed 2026-09-26 moved the vendor sheets FIRST, gave `styles.css` `id="smd-shared-css"`, and anchors `#theme-override-specific` AFTER it via `themeOverrideAnchor()`/`orderThemeOverrideLinks()` in `shared/js/smd-settings.js`.
- Verified live (read-only probe on PlanMyDay): superhero header = `--bs-black` (light) / `--bs-dark` (dark), tabs = `--bs-secondary`, `--smd-image-theme` = dark in light mode; head order is vendor -> `bootstrap-theme-css` -> `smd-shared-css` -> `theme-override-specific`. The reported bug is fixed.
- Fixed `shared/css/themes/cyborg/cyborg.css`: `tml[` typo (invalid selector) and both rules targeting `data-theme="superhero"` inside the cyborg file. Now `html[data-theme="cyborg"]... .smd-card { color: white }` in both modes; note the forced-Light white-on-light contrast risk is documented at the end of the notes section.
- What worked: reading computed CSS vars in a headless browser probe beats DOM-text inspection for cascade bugs; the specificity-vs-order asymmetry (bare `:root` dead, `:root[data-bs-theme]` alive) was the tell. What did not work: reasoning about the order from source alone - the file had already been fixed by the time the session got to it, so the live probe was required to separate "already fixed" from "still broken".
- AGENTS.md updates this session: rule 14 + the authoritative-cascade note now state the per-theme file wins by document order (bare `:root` is safe), and a cyborg note was appended.

### 2026-09-23 (18) — global Default/Light/Dark theme mode
- Added per-app `smdKey("themeMode")` overrides, `themeConfig[].defaultMode`, resolved `data-bs-theme`, canonical override-link ordering, and a two-select `<smd-theme>` with source-aware events. All six app boots/settings restores use the normalized shared theme and mode values.
- Storybook persists `storybook_theme` / `storybook_themeMode` and preserves the app theme keys. Mode-only changes update CSS vars without calling `renderMain`; invalid themes normalize to superhero.
- Verified with `node --check` on 20 edited JS files and 15 targeted Playwright theme/settings tests; all passed. Full regression was intentionally not run per request.

### 2026-09-21 (15) — rename `pmd-today-card` → `pmd-job-today-card` (component + events)
- Full rename of the PlanMyDay today-card component: element tag
  `pmd-today-card` → `pmd-job-today-card`, class `PmdTodayCard` → `PmdJobTodayCard`,
  template var `pmdTodayCardTemplate` → `pmdJobTodayCardTemplate`, global
  `window.PmdJobTodayCard`, file `pmd-today-card.js` → `pmd-job-today-card.js`, and
  the four custom events → `pmd-job-today-toggle` / `-view` / `-delete` /
  `-tomorrow` (user confirmed the event rename). Updated every consumer:
  `PlanMyDay/index.html` script tag, `sw.js` precache entry, `main-view.js`
  (`createElement` + 4 listeners + comment), `storybook/index.html` (script,
  seed comment, section id/name/tag/desc, log id, demo tags, listeners),
  `tests/pmd-touch.spec.js` + `pmd-regression.spec.js` locators, and the live
  AGENTS.md technique references (lines 322/326/437). `today-drag-card` CSS class
  and `--pmd-today-*` CSS custom props were deliberately left as-is (DOM/style
  hooks, not the component name — same scope as the reverted 2026-09-19 rename
  `cfeddc2`/`51b4c63`). The reverted rename used exactly these target names, so
  this is consistent with the earlier attempt.
- What worked: `node --check` clean everywhere; storybook probe showed the 2 demo
  cards render as `pmd-job-today-card`, a checkbox click fires the renamed
  `pmd-job-today-toggle` (`event: toggle job=sb1 checked=true`), zero console
  errors, zero failed requests, old tag unregistered; the 45 `textContent`
  pageerrors are the known pre-existing `PmdStreamHeader._render` footgun
  (unchanged component, same 45-count as the 2026-09-20 note). Regression
  fail-fast: swipe/toggle event suite 4/4 green (strikethrough, swipe-left
  delete, swipe-left cancel restore, swipe-right snooze) + the layout-independent
  icon-size test green.
- What did NOT work / pre-existing: 3 today-card tests fail in the CURRENT
  working tree — "stream name and buttons share the line under the title",
  "job thumbnail keeps its slot when the stream has no image", and the touch
  title-font-size test (26px vs expected h1 41.6px). **Proven NOT caused by the
  rename**: all 3 pass at clean HEAD (`git stash` round-trip + backup in
  `%LOCALAPPDATA%\Temp\opencode\pmd-rename-backup`, restored byte-identical). They
  fail because of the user's uncommitted WIP: `PlanMyDay/css/styles.css` is
  STAGED-DELETED and the component's template was reworked in place (e.g. the
  `.title` element changed h4→h2, so it now renders the h2 token 26px instead of
  the old CSS-driven h1 41.6px; layout rows moved). The rename is orthogonal.
- Gotcha for future: stash round-trips lose `git mv` rename staging
  (`R` → `A`+`D`) but git re-detects renames at commit-time by similarity, and
  `Compare-Object` verified the working files stayed byte-identical.
- Resolved (same session, user-approved): the deleted-but-still-referenced
  `PlanMyDay/css/styles.css` was the PANDEMIC root cause of this session's wide
  failure flood — `PlanMyDay/index.html` still `<link>`ed it and `sw.js` still
  precached it, so every planmydays page 404'd the stylesheet: all "no failed
  requests / no console errors" tests, the two `/PlanMyDay/` sub-path SW-precache
  tests (cache.addAll rejects a 404 → worker never activates, e.g. the
  CountMyDays test too, via the shared sw.js), plus every rule that lived there
  (`.active-toggle` label 700, `.task-note-btn` outline, stream accordions).
  FIX: `git restore PlanMyDay/css/styles.css`, then PRUNE to the current layout —
  re-scoped `pmd-today-card` → `pmd-job-today-card`, dropped host card-chrome
  (the inner `.card.bg-dark` div carries it now), dropped dead old-template
  selectors (`.row/.row>*/.check-col/.check-row/.content-col/.title-row/.meta-row`)
  and the now-unused `--pmd-today-{padding,title-margin,cell-padding}`,
  `.title` font-size now defaults to the **h2 token** (`var(--pmd-today-title-size,
  var(--smd-type-h2, 1.25em))`; compact still collapses to `--smd-type-p`),
  thumb gap kept as `.thumb + .thumb { margin-left: 4px }`. TESTS: the 10 h4
  card-title locators → h2 (adhoc/sleepUntil/tab-badge/import/regen/sort), 229
  rewritten for the new layout (name under thumbnails; badge+View aligned right,
  View right of badge), touch font-size literals 41.6/51.2 → 26/32px (h2 token)
  with compact 25.6 unchanged. ALL previously failing tests now green: 18-test
  pmd batch, both touch tests, both sub-path precache tests, 229, cmd-suite spot.
`pmd-today-card.js`-name comment in the restored CSS updated to
   `pmd-job-today-card`/h2 token.
- Further prune (same session, requested): the app sheet was cut to only
   functional + element-scoped rules (no new styling added). DROPPED as dead or
   duplicated: `.countdown-card` + compact countdown rules (probe: `#countdownContainer`
   is empty; no `.countdown-card` markup anywhere in PlanMyDay JS), `.type-select`/
   `.date-day-select`/`.date-month-select`/`.flatpickr-date` (0 matches), `body.compact
   .card/.editor-btn/.btn-wide`, `#streamsEditor`/`#jobSearchEditor`/`#imagesEditor`
   padding-top, the whole unscoped `.stream-accordion-*`/`.stream-header-*` block
   incl. `[data-theme]` theme accents + the expanded `:has(...)` highlight
   (STREAMS_EDITOR_STYLES in editor-styles.js covers the accordion, and the
   element-scoped `pmd-stream-header[expanded]` subtle highlight remains),
   `#streamsEditor .editor-title`, `.stream-accordion-body(+.card)`, `.stream-drag-card`,
   `pmd-stream-job-card[drag-handle]` (attr never set). KEPT: `body.compact`
   `--pmd-today-*` vars, `#countdownContainer` structural rules, `.today/shop/job/
   task-drag-card` user-select, `.task-note-btn` outline override, and the three
   element-scoped component sheets (`pmd-job-today-card`, `pmd-stream-header`,
   `pmd-stream-job-card`, `pmd-job-search-card`) — these carry the components with
   no other source (note: `.truncate`/`.truncate-2-lines` used by the new template
   are defined NOWHERE, so the app `.stream-title` ellipsis rule is the only
   truncation for the name). VERIFIED after prune: pmd-touch full 5/5, pmd batch
   19/19 (strikethrough/view/229/thumb-slot/sleepUntil×4/1483/swipes×3/2685/
   uncheck/3950/regen/4677/4722/6653), both sub-path SW-precache tests. Probe
   files deleted.
- `BUILD_NUMBER` unchanged (user ships — but it SHOULD be bumped before shipping
   so the renamed precache entry + script tag get a fresh cache name).

### 2026-09-21 (16) — Font Size setting = body font-size only (em-based tokens)
- User directive: changing Font Size in Settings/Display must do ONLY
   `body { font-size: <value> }` — nothing else; all other visual tuning is the
   user's to do from there. Replaced the `--smd-type-base` indirection in
   `shared/css/styles.css` (the ramp no longer uses `--smd-type-base`; nobody
   else consumed it — grep-verified). Now: `body { font-size: 1rem }` +
   `body.font-size-xsmall/small/large/xlarge/jumbo { font-size: 0.8/0.925/1.125/
   1.3/1.6rem }`, and the four tokens are **em** multipliers of that body font-size
   (`--smd-type-badge/p/h2/h1` = `0.75em/1em/1.25em/2em`) so the type ramp follows
   the body font-size exactly. seg rem-sized UI (Bootstrap form controls, etc.)
   stays root-based on purpose. Pixel values are unchanged from before the rework
   (e.g. today-card title xlarge=26, jumbo=32, compact-jumbo=25.6).
- NOT taken: a first pass scaled `html` via `:root:has(body.font-size-*)` —
   user rejected it; it also squeezed the streams-editor title button to zero
   width on 390px at xlarge (fixed mid-air with a 2.5rem `min-width` floor on
   `pmd-stream-header .stream-header-main`, kept as insurance for large body
   sizes). Probe verified: root stays 16px, body 20.8→25.6→14.8→16 across
   xlarge/jumbo/small/normal, token h2 (settings tab btn) 26/32/18.5/20px.
   VERIFIED green: pmd-touch 5/5, pmd 32-batch (appearance/type + prune set),
   both sub-path SW-precache tests. Probe files deleted. NOTE: the app css
   comments in CountMyDays/FreeFormOX/Launch/QRLinks/SolarControlar that say
   "only override --smd-type-base" are now stale wording (behaviour is the
   same); left as-is deliberately — user requested minimal changes.

### 2026-09-22 (17) — pmd-job-today-card: self-contained styling + <smd-button> View
- User directive: fix pmd-job-today-card with Bootstrap markup/utilities ONLY
  ("do not introduce more css, remove as much css as you can"); move the
  component's styling (esp. `[done]`) INTO the component; View → <smd-button>;
  right side of button+badge needs spacing; title + suffix badge on one full-width
  row; checkbox/repeat column vertically centered.
- Component now injects its own <style> (`#pmd-job-today-card-style`, appended to
  document.head once): host `display:block; margin-bottom: var(--pmd-today-margin,0.5rem);`
  + `touch-action:pan-y` (swipe needs it), `[done]` opacity + `.job-title`
  line-through, `.job-title { font-size: var(--pmd-today-title-size, var(--smd-type-h2,1.25em)) }`.
  The stale `pmd-job-today-card[done] .title` rules were REMOVED from
  PlanMyDay/css/styles.css (`.title` no longer matches — template uses `.job-title`);
  unused `--pmd-today-description-margin` compact var dropped too. `body.compact`
  still sets `--pmd-today-margin` + `--pmd-today-title-size` (the display-density hook).
- Template: title row `d-flex align-items-center` (`h2.job-title flex-grow-1 mb-0`
  + `smd-badge.suffix variant="secondary"`); badge/View row `d-flex align-items-center
  gap-1 me-2` with `<smd-button class="job-view-btn" variant="primary">View</smd-button>`
  (smd-button does NOT forward host classes — class stays on the host, clicks bubble);
  checkbox/repeat column got `justify-content-center`; thumbs wrapper `d-flex gap-1`
  (replaces the removed 4px `.thumb + .thumb` margin, demanded by test 260).
- Tests updated to the renamed class: `.title` → `.job-title` (pmd-touch 113,
  pmd-regression 229). Test 113 no longer pins exact px (user: "exact sizes are
  not important, scaling is") — asserts the title scales with body (≈1.25em),
  grows xlarge→jumbo, and compact hooks the p token (≈1em). Root cause of the old
  24-vs-26 failure: `body.font-size-xlarge` is currently `1.2rem` (19.2px) in
  shared/css/styles.css — the live file is NOT in sync with the (16) log's 1.3rem;
  the em-based mechanism follows body either way, so visuals scale regardless.
- VERIFIED green: pmd-touch 5/5 (incl. 113), pmd-regression 432/432 (incl. 229
  geometry + 260 no-image slot + view/modal clicks on the smd-button host +
  swipe/drag/tab-badge). Probe files deleted. `BUILD_NUMBER` not bumped (user ships).
- FOLLOW-UP: suffix badge now sits straight after the title text with a fixed
  `ms-2` gap (title row is `h2.job-title mb-0` + `smd-badge.suffix ms-2`, the h2
  is no longer `flex-grow-1`). And `smd-button` gained a `size` attribute
  (`normal` default | `small` → Bootstrap `btn-sm` on the inner button), doc'd +
  demoed in the storybook; the today-card View button uses `size="small"`.
  Verified: pmd touch+view/modal/geometry/suffix/tab-badge + storybook probe green.

### 2026-09-20 (14) — shared image cache URLs / blob render (async fills)
- `shared/js/smd-images.js`, `shared/js/components/smd-image.js`,
  `smd-image-editor.js`, `sw.js`, plus assertions in `launch-regression.spec.js`
  + `pmd-regression.spec.js` (see the IMAGE RENDER-URL / CACHE note above).
- What worked: `smdImageRenderUrl` memo + pending-dedupe; the CONTROL-GATED Cache
  Storage usage (blob-only when `navigator.serviceWorker.controller` is null) —
  this fixed intermittent 30s "not stable" button/load stalls in cmd import-wizard
  tests + a Launch `page.goto` load-stall that appeared when Cache Storage ops ran
  on cold parallel test pages. `node --check` all 4 files clean.
- Tests: cmd+launch full (51), qrlinks+sample-images+launch (15), pmd affected
  subset (5), pmd sub-path SW precache (1) all green; pmd-screenshots "main view"
  4/4 passed and the pmd storybook probe showed the data-smdsrc preview filling to
  a blob URL (naturalWidth 45) with no console errors. The tier test's earlier
  `expected: undefined` anomaly is dead in the new blob-only path (was the now
  removed cache path on Cold pages).
- What did NOT work / pre-existing: the storybook has 45 pre-existing
  `Cannot set properties of null (setting 'textContent')` pageerrors from
  `PmdStreamHeader._render` (upgrade-order footgun: `innerHTML` fires
  `attributeChangedCallback` before the template clone in `connectedCallback`) —
  reproduced with my changes stashed, so unrelated; left untouched.
- `BUILD_NUMBER` → `202609200847`.

### 2026-09-18 (13) — smd-tabs `compact` → `padding="small"` attribute
- The boolean `compact` attribute on `<smd-tabs>` is GONE. Replaced by a
  `padding` attribute: `normal` (default = no-op) | `small` (the old compact
  sizes: `.smd-tab-list` padding 0, `.smd-tab-btn` 0.5rem 0.25rem,
  `.smd-tab-panel` padding 0). Add more named sizes later by extending the
  `:host([padding="…"])` block in `smdTabsSheet` (only `small` exists so far —
  no x-small yet, per user). Wired like `wrap`: in `observedAttributes` + a
  `get/set padding` JS property (setter stores `small` or removes the attr).
- Migrated the only consumer: `smd-image-picker.js` renders
  `<smd-tabs padding="small">` (was `compact`; image picker look unchanged).
- Applied `padding="small"` to SolarControlar's `#mainTabs`
  (`SolarControlar/index.html` — `<smd-tabs id="mainTabs" wrap padding="small">`),
  so the main dashboard tabs are compact like the Choose Image picker.
- Storybook smd-tabs desc now documents `padding="small"`.
- Verified: `node --check` smd-tabs.js + smd-image-picker.js; fail-fast solar
  main-tabs 1/1 + pmd/cmd image picker & Clear batch 37/37. `BUILD_NUMBER`
  unchanged (user ships).

### 2026-09-18 (12) — Choose Image page: Clear = danger, No Image = primary
- "No Image" footer button on `#imagePickerPage` is now `variant: "primary"` in
  all 3 apps' `app.js` `window.__openImagePicker` config (was secondary). The
  legacy `openImagePicker()` in `shared/js/smd-images.js` is DEAD (nothing calls
  it; apps use the `smd-image-picker` component via `__openImagePicker`) — left
  in place, not updated.
- The picker's Clear/`Search`-row button (`smd-image-picker.js` shadow) is now
  `class="clear btn-danger"` with a `.search button.btn-danger` rule in
  `smdImagePickerSheet` (bg `--bs-danger`, text `--smd-danger-text`). The
  picker shadow only adopts `smdImagePickerSheet` (no btnBadgeSheet), so the
  danger rule lives in that sheet; the `.clear` test hook is preserved.
- Verified: `node --check` all 4 edited files; fail-fast pmd+cmd image-picker
  batch 25/25. Image picker is NOT a screenshot target, so no screenshot
  regeneration. `BUILD_NUMBER` unchanged (user ships).

### 2026-09-18 (11) — jobTasks tab panel flush + Add Task buttons h2
- `id="jobTasks-tab-panel"` (smd-tabs panel for the Tasks tab in PlanMyDay's job
  editor) now renders padding-free: `getJobEditSections` in `job-editor.js` sets
  `panelClass: "no-padding"` on the Tasks tab def, and `smd-tabs.js` maps that to
  `<div class="smd-tab-panel no-padding">` + a `.smd-tab-panel.no-padding { padding: 0 }`
  rule in `smdTabsSheet`. (The default panel padding is 1rem; page-injected
  JOBS_EDITOR_STYLES can't style panels through the tabs shadow root.) Now a
  reusable per-tab option, not app-specific CSS.
- Both Add Task buttons (`#jobAddTaskBtn` / `#jobAddTaskBottomBtn` in
  `job-editor.js` `getJobTasksTabHTML`) dropped `btn-sm` → now plain
  `btn btn-primary`, so they render h2 like every other button (they had been p
  via the `.btn-sm` exception). The per-task note/delete icon buttons keep
  `btn-sm` (intentional small icon buttons).
- Verified: `node --check` both files; jobs editor/tasks fail-fast batch 53/56.
  3 "failures" were environment-only (a `net::ERR_NETWORK_CHANGED` on
  `page.reload` + 2× 30s `.stream-header-main` not-visible timeouts in the
  streams editor, which this change never touches) — all tasks-tab tests passed.
  `BUILD_NUMBER` unchanged (user ships).

### 2026-09-18 (10) — all buttons are h2 (the `<button>` element type = h2 token)
- Per user ("All buttons should be h2 size", "keep .btn-sm at p"), the `<button>`
  element became its own h2 type: `<button>`/`.btn`/`.smd-tab-btn` → `--smd-type-h2`,
  `.btn-sm` → `--smd-type-p`. Deliberately NO `size` attribute on smd-button (user:
  "proceed without the size attribute, we can add it later if needed").
- Map lives in ONE light-DOM + ONE shadow place: `shared/css/styles.css`
  (`button, .btn` / `.btn-sm`) and `btnBadgeSheet` (`.btn` got the h2 line; `.btn-sm`
  already p). Per-component `.btn` font-size rules REMOVED (pmd-stream-header,
  pmd-stream-job-card, pmd-job-search-card, pmd-job-today-card `.job-view-btn` was
  badge → now inherits h2) and the injected sheets that can't see btnBadgeSheet
  switched p→h2 inline: 4× `editor-styles.js`, `smd-settings.js`, `smd-minio.js`,
  `smd-modal.js` footer, `smd-image-picker.js` search, `smd-image-dropdown.js`.
- Tabs bumped too: `smd-tabs.js` `.smd-tab-btn` p→h2.
- Bound the light-DOM `button` selector: dropdown-items keep Bootstrap's `.btn-sm`/
  `.dropdown-item` at p (their selectors don't set font-size). FFOX grid cells are
  bare `<button>`s but image-only → h2 has no visual effect there.
- Verified: probe measured all four contexts (`.job-view-btn`, `#btnAddCard`, page
  footer smd-button part, settings tab) at 26px on xlarge; pmd-regression
  button/view/add flows 17/17, pmd-touch 1/1, cmd-regression settings/sweep/gcal
  7/7; pmd-screenshots smoke (main view, menu, add-job, jobs editor, settings,
  minio) 12/12 regenerate under the new sizes. `BUILD_NUMBER` unchanged (user
  ships).

### 2026-09-18 (9) — font-size harmonisation via shared typescale tokens
- **One ramp, four tokens** (see the "TYPESCALE TOKENS" note above): the shared
  base ramp drives `--smd-type-badge/p/h2/h1` on `body`; every component/shared
  style + every app's editor/card styles consume them via
  `var(--smd-type-*, original-fallback)`. Tag map: h1→h1, h2-h4→h2, h5/h6/p→p,
  badges→badge; both tab systems (smd-tabs + settings chips)→p. All six Font
  Size settings now scale every app equally.
- Converted: 13 shared components (`styles.js`, smd-button/badge/tabs/
  date-picker/theme/fontawesome-credit/qr-export/image-dropdown/image-select/
  image-picker/page/modal), `smd-minio.js`/`smd-images.js`/`smd-settings.js`,
  all 4 apps' `editor-styles.js`, the app components (pmd-*, cmd-*, qrlink-card,
  solar-top-tiles), and 6 rewritten css files (ramps deleted; compact/media-fit
  sizes became token CALCs). `storybook/index.html` gained the
  `shared/css/styles.css` link (was missing).
- **Main-view date headings h2→h1** (`PlanMyDay` "Sun 18 …" and `CountMyDays`
  "Today!"/"From …") — deliberate; tests + css selectors updated to `h1`.
- **Tests updated for new sizes**: `pmd-touch.spec.js:119` now asserts the token
  values (xlarge 41.6px, jumbo 51.2px, compact-jumbo 25.6px — old 28/32/16 no
  longer apply) — user confirmed "keep ramp, update test"; heading-tag selectors
  in pmd-regression (3×), cmd-regression (1×), pmd-example moved `h2`→`h1`.
- Verification: `node --check` on all 30 edited JS files; storybook probe =
  zero console/page errors + no failed requests; focused fail-fast batches +
  **full cmd 45/45, solar 12/12, qrlinks 9/9, ffox 10/10, launch 6/6 all green**;
  pmd targeted subset 13/13 (date heading, font-size settings, touch size,
  today/streams, icon glyphs). Full pmd suite = user-runs at the end, per
  usual. Two solar auth/network tests "failed" only under 8-concurrent-workers
  port exhaustion — 12/12 green when run alone.
- `BUILD_NUMBER` → `202609181911`.

### 2026-09-18 (8) — every smd-page "Done" button relabelled "OK"
- Changed every `smd-page` footer button `text: "Done"` → `text: "OK"` (the
  `action: "done"` AND button ids `btnStreamsDone`/`btnJobSearchDone` were kept).
  All 15 source spots: Launch/FreeFormOX/CountMyDays/PlanMyDay/QRLinks/
  SolarControlar settings pages, CM dates/categories/google events editors,
  PMD streams editor + job search, QRLinks links editor, `shared/js/smd-images.js`,
  `shared/js/smd-app.js`, and the storybook smd-page demo host. The `smd-page`
  component itself has no default buttons.
- Tests: replaced `{ name: "Done" }` with `{ name: "OK" }` in cmd, pmd,
  solarcontrolar, qrlinks, ffox specs; solarcontrolar test title renamed. PMD's
  unscoped `page.getByRole("button",{name:"OK"})` clicks were left unscoped —
  the pre-existing "Top-Level: Streams via Streams" test already clicked an
  unscoped "OK" while both a hidden jobEditPage OK and the streams-editor OK sat
  in shadow roots, so hidden footer "OK"s demonstrably don't cause strict-mode
  collisions on role clicks.
- Verified: pmd streams/settings flows 3/3, qrlinks+ffox+solarcontrolar 31/31,
  cmd settings/sweep/google 25/25. `BUILD_NUMBER` → `202609181717`.

### 2026-09-18 (7) — shared `<smd-date-picker>`: PMD sleep-until + CM once-date
- **New shared component** `shared/js/components/smd-date-picker.js`: a read-only
  flatpickr-backed date field. Attributes: `value` (a date string in `format`),
  `format` (default `Y-m-d`), `alt-format` (default `D j M Y`),
  `first-day-of-week`, `placeholder`, `readonly`, `disabled`, `no-clear`. Property
  `.value` get/set (setter SYNCs + EMITS the change); the `value` ATTRIBUTE only
  seeds silently. Event `smd-date-picker-change` (bubbles + composed,
  `detail = { value }` = the date string in `format`). Stable shadow ids:
  `smdDatePickerInput` (raw, holds `_flatpickr`), `smdDatePickerAlt` (visible
  display), `smdDatePickerClearBtn`. The flatpickr calendar is
  `appendTo: document.body` — REQUIRED, otherwise `flatpickr.min.css` (a page
  stylesheet) cannot style a calendar living inside the shadow root. Registered
  in CM + PMD `index.html`, `sw.js` SHARED_ASSETS, storybook (flatpickr vendor
  script + css were added to the storybook, plus a demo section).
- **PlanMyDay migrated**: `job-editor.js` sleep-until picker deleted
  (`initJobSleepUntilPicker`, `clearSleepUntil`, `updateSleepUntilClearBtn`,
  destroy-block). Schedule tab now renders `<smd-date-picker … value="(ISO)" …>`;
  the page-level Change listener lives in `app.js` `jobEditPage`
  (`smd-date-picker-change` → `jobField("sleepUntil", value)`), next to the
  stream-dropdown listener.
- **CountMyDays migrated**: the once-date field on `#dateEditPage` is now
  `<smd-date-picker no-clear format="d/m/Y" alt-format="d/m/Y" value="dd/mm/yyyy">`.
  `initDateFlatpickr` deleted. `onceDateValue()` builds the d/m/Y seed;
  `applyOnceDateValue()` parses the d/m/Y change back into
  buffer.day/month/year; a `smd-date-picker-change` listener is bound ONCE in
  `openDateEditPage` (guard `page.__cmdDatePickerBound`), the `doneDateEdit`
  safety-net re-reads `$id("smdDatePickerInput").value`.
- **KEY GOTCHAS for tests in `page.evaluate` (both specs)**: `$id()` in
  `shared/js/smd-app.js` PIERCES shadow roots via a TreeWalker; plain
  `document.querySelector` / `document.getElementById` do NOT — a component
  inside `#jobEditPage`/`#dateEditPage` is unreachable without `$id`. The raw
  input keeps flatpickr's `_flatpickr` reference, so simulate a pick exactly as
  the old code did: `$id("smdDatePickerInput")._flatpickr.setDate(ds, true)` (it
  fires onChange → Change event → buffer). flatpickr sets the
  `readonly="readonly"` ATTRIBUTE on the alt input when `allowInput:false`.
  Playwright LOCATORS pierce shadow roots fine, so `#smdDatePickerAlt` /
  `#smdDatePickerClearBtn` work directly.
- **Results**: targeted pmd sleep-until batch 13/13 and cm dates-editor 13/13
  green. Full pmd chromium suite NOT run (user runs it at the end).

### 2026-09-18 (3) — CountMyDays dates editor filters + shared smd-image-dropdown
- **New shared component** `shared/js/components/smd-image-dropdown.js`
  (`<smd-image-dropdown>`): DATA-driven image+name dropdown. Host sets
  `options = [{ name, image }]` (image OPTIONAL → text-only row, so a no-image
  "All" option works) and `selected` = the option's NAME; picks dispatch
  `smd-image-dropdown-change` (`detail = { name }`). Attributes `key-prefix` /
  `disabled`. Stable shadow ids for tests: `smdImageDropdownBtn`,
  `smdImageBtnIcon`, `smdImageBtnText`, `smdImageDropdownMenu`. Registered in
  both CM + PMD `index.html`, `sw.js` SHARED_ASSETS, and the storybook.
- **PlanMyDay**: `pmd-stream-select` was REPLACED by the shared component (and
  `PlanMyDay/js/components/pmd-stream-select.js` DELETED). `job-editor.js`
  renders `<smd-image-dropdown id="jobStreamDropdown">`;
  `editor-common.js` `initJobStreamSelect`/`updateJobStreamPreview` now feed
  `options`/`selected` by stream TITLE (name), added `streamNameAt` /
  `streamIndexByName`; `app.js` listens to `smd-image-dropdown-change` and maps
  `streamIndexByName(e.detail.name)` → `jobChangeStream(idx)`.
- **CountMyDays `#datesEditor` filters**: line 1 = search box (flex:1) + Clear
  button (`btn btn-danger btn-sm`, capital C); line 2 = category
  `<smd-image-dropdown id="dateCategoryFilter">` (defaults to no-image "All",
  images set from `loadCategories`) SAME line as the Local / Google / Google
  hidden checkboxes (already capital G). Dropdown listener bound ONCE via
  `page.__cmdFiltersBound`; `e.detail.name === "All"` maps to `""` in
  `setDateCategoryFilter`. `renderDateFilters()` sets `dd.options` + `dd.selected`.
- **`cmd-date-card` badges**: moved OFF the title line onto the date line
  (`.meta`, after the once/annual type-text) so Local/Google sit after "Once".
  Themed colours for contrast on the tile: Local = secondary, Google = primary,
  Repeat = info, Hidden = secondary (new `.event-badge-hidden` class; old
  hardcoded `#4285f4` google / dim `--bs-secondary` local gone). Title row no
  longer carries badges.
- Tests updated: cmd "filters by category and title" now drives the dropdown
  (`#dateCategoryFilter #smdImageDropdownBtn` → menu item click) + asserts All
  default; Google-unify test asserts badge placement (`.meta .event-badge-*`)
  and empty `.title .event-badge`; pmd stream-selector tests use the new shadow
  ids (`#smdImageBtnText`/`#smdImageDropdownBtn`/`#smdImageDropdownMenu`).
- **Results**: cmd-regression 42/42; pmd-regression 430/430 across 30 shards
  (all green, `--shard=$i/30 --workers=1 --retries=0` waves of 10);
  storybook loads `smd-image-dropdown` section with zero console errors.
- `BUILD_NUMBER` → `202609181433`.

### 2026-09-18 (4) — CountMyDays Edit Date page layout
- **`#dateEditPage` is now a vertical stack** (`renderDateEditContent` in
  `dates-editor.js`):
  - Line 1: `Category` label + category `<select id="dateCategorySelect">` and
    the `Image` selector (`<smd-image-select id="dateImageSelect">`) on the same
    row (`d-flex gap-3 align-items-center flex-wrap mb-3`).
  - Line 2: `Title` label (renamed from "Name"; `#dateNameInput` id + data field
    unchanged).
  - Line 3: the Title text box.
  - Line 4: the date controls (day/month selects OR `#dateOnceInput`) + the
    type `<select id="dateTypeSelect">`, now ordered **Once first, Annual
    second** (values unchanged, default remains `annual`).
- **Removed** the old floating category-preview column (`<smd-image
  id="dateCategoryPreview">` no longer exists) and the now-dead
  `updateDateCategoryPreview()`; the category select no longer calls it.
  `updateDateImagePreview()` still runs.
- Test: "adds a date and saves its fields" asserts a `Title` label is visible
  and no `Name` label exists.
- **Results**: targeted date-editor/date-image tests 4/4; full cmd-regression
  **42/42 passed** (~2m).
- `BUILD_NUMBER` → `202609181510`.

### 2026-09-18 (5) — CountMyDays category None filter + Edit Date page labels
- **`#datesEditor` category filter now has a "None" option** (no-image, like
  "All") that matches ONLY dates/events with NO category. Implemented with a
  sentinel `const DATE_CATEGORY_NONE = "__none__"` in `dates-editor.js`:
  `renderDateFilters()` options = All, None, then categories;
  `dd.selected` maps `DATE_CATEGORY_NONE → "None"`; the
  `smd-image-dropdown-change` handler maps `"None" → DATE_CATEGORY_NONE`;
  `renderDateList()` treats it as "match `!d.category`" (else branch unchanged).
  (A category literally named "All"/"None" would also collide with the
  sentinels — names are matched by string, same pre-existing quirk as "All".)
- **Edit Date page**: the Category + Image labels now sit ABOVE their controls
  (each label inside its own stacked div, `d-flex gap-3 align-items-start`);
  previously they were inline to the left on line 1.
- **Clear button** on the Edit Dates page confirmed `btn btn-danger btn-sm`
  (capital C) — already danger, no change.
- **Once date picker verified working** for an existing LOCAL once date:
  `initDateFlatpickr` uses `$id()` (which pierces smd-page shadow roots), the
  `<smd-image-select>`/shield inputs render, the `.flatpickr-calendar.open`
  appears above the page (z-index 99999 vs page 1040) and picking a day updates
  `dateEditBuffer` and saves on OK.
- Tests added (cmd-regression):
  - "none category filter matches only dates with no category" — drops to the
    single seeded uncategorised date ("Today Event").
  - "date picker works on a local once date" — edits seeded "Project Deadline"
    (type once, 25/12/FUTURE_YEAR), asserts the input shows the stored date,
    opens the flatpickr calendar, clicks day 15, saves, verifies 15/12/year.
- **Results**: targeted 4/4; full cmd-regression **44/44 passed** (~2m).
- `BUILD_NUMBER` → `202609181526`.

### 2026-09-18 (6) — Edit Date page: OK/Cancel swap + once-type save fix
- **Edit Date page footer buttons reordered**: Cancel now appears first (left),
  OK second (right). Previously OK was first. A test assertion checks the
  `smd-page-footer smd-button` innerTexts are `["Cancel", "OK"]`.
- **Once-type date save fix** (the actual "date picker not working" bug):
  flatpickr's `onChange` only fires on Enter/Tab, so a user who types a new date
  into the `#dateOnceInput` and then **clicks OK directly** (without pressing
  Tab/Enter) silently loses the change — the buffer keeps the old day/month/year.
  Fixed in `doneDateEdit`: when the type is `"once"` and `#dateOnceInput`
  exists with an initialized `_flatpickr`, the raw input value is re-read via
  `fp.parseDate(input.value, "d/m/Y")` and written into `buffer.day/month/year`
  before saving. This guarantees typed dates are committed regardless of whether
  the user pressed Tab/Enter first. The calendar-pick path (which already fires
  `onChange`) is unaffected.
- **Test tightened**: "once type uses a date input and saves the year" no longer
  presses Tab before OK — exercises the type-then-click-OK path directly.
- **Results**: targeted 4/4; full cmd-regression **44/44 passed** (~1.9m).
- `BUILD_NUMBER` → `202609181539`.

### 2026-09-18 (2)
- **SolarControlar main tabs now use the shared `smd-tabs` component**, and the
  component **OWNS the panels** (renders them in its shadow root). The light-DOM
  `.main-tabs` button bar + six `#tab-*`/`class="tab-content"` divs were removed
  from `SolarControlar/index.html`; the markup is now just
  `<smd-tabs id="mainTabs" wrap>`. Each tab's panel (id `power-panel` etc.)
  wraps a `#tab-*` content div so the render functions and regression-test
  locators keep targeting the same ids.
- `SolarControlar/js/main-view.js`: `MAIN_TAB_DEFS` (title/id/content) +
  `configureMainTabs()` sets `tabsEl.tabs` ONCE (re-setting wipes panel innerHTML),
  injects `JOBS_EDITOR_STYLES + MAIN_TAB_STYLES` into the `#mainTabs`
  shadowRoot, and listens for `smd-tabs-change` → `switchMainTab(tab.id)`.
  `switchMainTab()` now finds the matching index in `MAIN_TAB_DEFS` and sets
  `tabsEl.activeIndex` (visibility is driven by the component's `active`
  attribute) + lazy `initGraphTab()` for the graph.
- **Shadow-content consequences handled**: `SolarControlar/js/editor-styles.js`
  gained `MAIN_TAB_STYLES` (the content rules moved out of the light-DOM
  `css/styles.css` — `.main-tabs`/`.tab-content`/`.power-table`/`.log-*`/
  `.graph-*`/`.forecast-output`/`.access-badge`/`.loading` are gone from it,
  plus `.btn-sm`/`.align-items-center`/`.text-end`/`.flex-grow-1` utility gaps).
  All six tab JS files (`power-tab.js`, `solar-settings-view.js`, `files-tab.js`,
  `config-tab.js`, `forecast-tab.js`, `graph-tab.js`) switched from
  `document.getElementById()` to the shadow-piercing `$id()` for EVERY element
  inside the panels (incl. `document.querySelector("#configForm tr…")` →
  `$id("configForm").querySelector(...)`, `.graph-series` scan scoped to
  `$id("tab-graph")`). `MAIN_TAB_STYLES`'s `.flash*` rules cover the in-panel
  settings error; light-DOM `.flash*` stays for `#flashContainer`.
- Tests: `tests/solarcontrolar-regression.spec.js` now clicks
  `#mainTabs .smd-tab-btn` filtered by `hasText` ("Files"/"Config"/…) and asserts
  panel activity via `#mainTabs #<id>-panel` `toHaveAttribute("active", "")`
  instead of the old `.main-tabs .tab-btn[data-tab=…]` + `#tab-*` `toHaveClass(/active/)`.
  Playwright pierces shadow roots, so all the deep controls (`#log-file`,
  `#configSlider`, `#slider-tolerance_percent`, `#tab-power .power-table`, …)
  keep working unchanged. Full suite: 12/12 pass.
- Full regression across apps: pmd 431/431 green (1 flake — "task note button
  paints outline state on touch devices" timed out mid-suite waiting for
  `#jobEditPage`, re-ran in isolation: PASS), launch/ffox/cmd/qrlinks 66/67
  green (the 1 launch fail is the documented known flake: "every app's menu
  links to the Launch app" under 5-page load; re-ran in isolation: PASS).
- `BUILD_NUMBER` → `202609181310`.

### 2026-09-18
- **Today-card swipe gestures** (PlanMyDay): `pmd-today-card` now tracks pointer
  events on its host (`touch-action: pan-y`), so a horizontal swipe on a today
  card works with finger or mouse:
  - **Swipe LEFT** past the threshold → the card fades + slides off, then emits
    `pmd-today-delete`; the app shows the standard "Delete Job?" confirm
    (`showSmdModal`). Cancel calls the new `card.snapBackSwipe()` to slide it
    back; Delete uses the new `deleteJobFromStream(streamIdx, idx)` helper
    (extracted from `confirmDeleteJob`'s onAction in job-editor.js) and
    `renderMain()`.
  - **Swipe RIGHT** → emits `pmd-today-tomorrow`; the app sets
    `job.sleepUntil = getTomorrowStr()` (new in utils.js) and `renderMain()`;
    the job drops out of today's list and re-enters automatically on the next
    day's generation (existing `shouldShowJobToday`/`ensureTodayList` logic).
- Swipe feel: threshold = `min(120, max(60, cardWidth*0.25))`; the card follows
  the pointer (no resistance) fading to 0.25 opacity at the threshold, then a
  0.2s ease-out slide-off; sub-threshold releases spring back. Vertical pans
  are untouched (`pan-y`). The swipe skips `pointerdown`s whose composedPath
  contains a `.drag-handle` so Sortable reorder drags still win. A capture
  `click` handler suppresses the late click after a real swipe (would otherwise
  toggle the checkbox / open View).
- Tests: +3 in `pmd-regression.spec.js` ("Today Card Swipe": delete-confirm →
  deleted, cancel → restored in place, right-swipe → sleepUntil=tomorrow) using
  real `page.mouse`; +1 in `pmd-touch.spec.js` (iPhone, right-swipe via
  `locator.dispatchEvent("pointerdown|pointermove|pointerup", {...})`)
  assert the snooze. All 3 new + 11 affected (handle drags, view/checkbox
  clicks, edit-flow delete, touch reorders) pass. `BUILD_NUMBER` →
  `202609180840`.
- What worked: pointer events = one code path for mouse + touch, and Playwright
  drives them both ways. What did not work: asserting a clean transform after a
  snap-back via `getComputedStyle(el).transform)` — `translateX(0)` computes to
  an identity `matrix(...)`, not `"none"`; assert the card's `boundingBox().x`
  instead.

### 2026-09-17 (3e)
- **SolarControlar icons updated**: regenerated
  `SolarControlar/icon-{192,512}.png` from `shared/sampleImages/Solar_Controlar.png`
  (the unpacked real app icon, 256px) via sharp `fit: contain`, at the correct
  192/512 scale; rewrote `icon.svg` as a 512×512 `<svg>` wrapper that embeds the
  PNG (base64), so `node regen_pwa_icons.js` keeps working from the same source.
  NOTE: `regen_pwa_icons.js` (sharp `density` render) reads icon.svg directly —
  the wrapper keeps that path valid and produces the same pixels.
- **Screenshot viewer theme filter (front-end only)**: `screenshots/viewer.js`
  gained a "Theme" `<select>` in the toolbar — **Both** (default) / **Light** /
  **Dark**. Pure client-side: `DARK_THEMES = {cyborg,darkly,slate,solar,superhero,
  vapor}` (mirrors `themeConfig[].bsTheme`), `window.changeThemeMode()` toggles a
  `theme-mode-hidden` class on `.theme-section`, and it is re-applied after every
  `loadThemes()` render. The `/api/themes` + `/api/galleries` handlers were NOT
  touched. Verified in a browser probe: Both=26, Dark=6, Light=20.
- `BUILD_NUMBER` → `202609172246`.

### 2026-09-17 (3c)
- Fixed the **"Update available" dialog popping up twice**. The `__updatePrompted`
  guard was per-page-load, so every reload re-prompted while a SW sat in
  `waiting` (until the user picked Update now). Added a PERSISTED dismissal:
  each app's inline SW block now stores the dismissed **pending SW's scriptURL**
  in `localStorage["swUpdateDismissedUrl"]` (same key in all 6 apps — it is the
  same root SW), checks it in `showUpdatePrompt`, sets it on **Later**, removes
  it on **Update now**, and keeps the in-load `__updatePrompted` fast path.
- **Launch icons from the shared library**: replaced the local `icon-192.png`
  tile refs with shared **sample-image names** and render via `<smd-image>`:
  Launched apps now point at `Plan My Day` / `Count My Days` / `QR Links` /
  `Solar Controlar` / `Noughts & Crosses` sample images. `index.html` (Launch)
  now loads `shared/js/smd-images.js` (for `seedSampleImages`/`smdImagesKey`),
  the boot seeds samples + `renderAppGrid()` re-renders once they land (a
  `setInterval` on `#appGrid` calling `smd-image.refresh()`).
- **SolarControlar sample image**: replaced the old `Solar_Controlar.gif` with
  the real app icon — unpacked
  `https://raw.githubusercontent.com/ownimage/solarcontrolar/.../solar%20controlar.ico`
  (256x256 32bpp DIB frame → PNG `shared/sampleImages/Solar_Controlar.png`) and
  regenerated only that entry's `data64/80/100` thumbs. NOTE: a full
  `node shared/regen_sample_images.js regen` rewrote OTHER SVG entries too (the
  working-copy SVG files carry different EOLs than the committed JSON), so I
  `git checkout`ed the JSON and patched ONLY the Solar Controlar entry via a
  node script — all other entries stayed byte-identical.
- **Launch tiles now respect the Icon size setting**: removed the hardcoded
  `size="80"` on the tile `<smd-image>`; the tiles use `SmdImage.defaultSize`
  set from `launch_iconSize` (verified medium→50, large→64, small→40 host px).
  Removed the dead `.app-tile img` CSS.
- Tests: launch-regression updated for `<smd-image>` tiles (polls for a rendered
  `img src` + assert Solar Controlar tile is a PNG data URL; the legacy-
  migration test now seeds via `/PlanMyDay/` + reload to avoid the Launch sample
  seeding race). 6/6 launch-regression + 3/3 launch-screenshots pass. The
  "every app's menu links to find the Launch app" test is a KNOWN flake when all
  5 pages run in one 30s test (SolarControlar's Chart.js load can exceed the
  goto timeout); passes in isolation.
- `BUILD_NUMBER` → `202609172226`.

### 2026-09-17 (3b)
- Streams-editor visual tweaks on the Edit Streams page (all in
  `PlanMyDay/js/`):
  1. **Drag-handle alignment**: `.stream-accordion-header` in
     `pmd-stream-header.js` now has `padding: 0.25rem 0 0.25rem 0.5rem` +
     `box-sizing: border-box` (left side matches the `pmd-stream-job-card`
     host's `0.5rem`, so the header's drag-handle sits the same distance from
     the left edge as the child job card's handle — was 0px, ~8px too close);
     the `.chevron` button (the "header dropdown") got `margin-right: 0.5rem`
     so its right side matches the job card's 8px right padding.
  2. **Drag collapse + restore**: `initStreamsEditorSortable` in
     `streams-editor.js` captures the open-collapse indices on `onStart` then
     collapses EVERY open stream (not just the dragged one) via
     `setStreamExpanded(idx, false)` — dragging any header closes whatever is
     open — and restores the pre-drag expanded set via the existing
     `streamsEditorExpandedIdxs` capture/translate on `onEnd`.
  3. **Ghost collapsed during drag**: the `.sortable-fallback` ghost is a deep
     clone made BEFORE `onStart`, so it kept the open collapse + fixed height.
     onStart now removes `show` from the ghost's `.accordion-collapse`, clears
     `expanded` on its `pmd-stream-header`, and clears the inline `height`
     Sortable pinned — the ghost follows at collapsed height (~70px vs ~172px).
     NOTE: ghost sits in `document.body`, so the shadow-injected
     `.accordion-collapse:not(.show)` rule can't reach it — Bootstrap's own
     `.collapse:not(.show)` handles hiding (verified via probe).
  4. **Rounded badges**: added `pill` to the streams-editor page-header badge
     (`#editJobsTotalBadge`), the stream-header `.tab-badge`/`.count-badge`,
     and the job-card `.suffix`/`.schedule`/`.time`/`.extra`.
- Verified: drag/reorder regression tests (incl. "dragging an expanded stream
  keeps the same stream expanded") pass; probes confirmed `before:1 →
  duringDrag:0 → after:1` even when dragging a DIFFERENT header, ghost height
  172→70px, handle offsets 8px equal, chevron right gap 8px. Sortable save time
  after mouse-up is ~17ms (the earlier "3661" probe reading was a
  `performance.now()` absolute-value misread). `BUILD_NUMBER` →
  `202609172137`.

### 2026-09-17 (3)
- Removed the legacy storage-key migration + startup reminder from CountMyDays
  and QRLinks (user confirmed: remove BOTH the per-app `migrateLegacyStorage`/
  legacy maps/`showLegacyMigrationReminder` AND the shared
  `migrateImagesToShared()` boot call from these two apps). Old keys are now
  simply ignored; `shared-images` is the only image key. Shared code still used
  by PlanMyDay (`smd-images.js migrateImagesToShared` stays). Also removed the
  legacy-key clearing in each app's `confirmClearAllData`, the stale
  `cmd_gcal_*/cmd_google_cal` comment in `googleCalendar.js`, and the
  `dismissLegacyReminder` helper + reminder-dismissals in cmd/qrlinks/launch
  regression + screenshot specs. Rewrote the two "legacy keys" tests to assert
  the keys are LEFT UNTOUCHED (app reads only its namespaced keys); first-visit
  seeding race avoided by seeding first via the `seed()` helper. Googlegacal:
  the "legacy cmd_gcal keys migrate" test is gone, replaced by an
  "untouched" equivalent.
- Renamed `PMD_EXTERNAL_SERVERS` → `EXTERNAL_SERVERS` (the PMD_ prefix was a
  leftover from the old pre-multi-app project). Updated `playwright.config.js`
  + AGENTS.md recipe.
- Default theme is now **superhero** everywhere (was darkly/solar): app
  `app.js` + `app-settings.js`/`settings.js` fallbacks, `SmdApp.themeDefault`
  + `smd-app.js` boot fallback, `applyTheme()` invalid-name fallback, `smd-theme`
  component default, storybook `data-theme`/`themeConfig` fallback/`storybook_theme`
  default, and every static `<head>` `bootstrap-theme-css` +
  `theme-override-(mode|specific)` link (mode stays `dark.css` — superhero is a
  dark theme). Updated the regression/screenshot specs' config fallbacks +
  the pmd precache test + qrlinks default-theme assertion.
- Menu order everywhere is now **Settings, divider, Launch, divider, rest**
  (PlanMyDay, CountMyDays, QRLinks, SolarControlar, FreeFormOX). The Launch
  app's own menu keeps only its Settings item (it is the launcher). (SUPERSEDED
  2026-10-18: Launch now carries the same Launch flyout as every other shell.)
- `BUILD_NUMBER` → `202609172101`.
- Verified: 4 affected tests pass (menu links, theme selector, unknown-theme
  fallback → superhero, legacy-untouched). User asked not to run the full
  regression suite this round — they will test at the end.

### 2026-09-17 (2)
- Small cross-app tidy-ups (no regression run this session — user will test at
  the end).
- **Theme override CSS**: added `shared/css/themes/light.css` + `dark.css`
  (one file for every light / every dark theme) and 26 `css/themes/<theme>/<theme>.css`
  per-theme files — all initially empty with a header comment; the Bootstrap
  theme files were NOT touched. `applyTheme()` in `shared/js/smd-settings.js`
  now also manages two override `<link>`s: `theme-override-mode` (light/dark)
  and `theme-override-specific` (per theme), both cache-busted with BUILD_NUMBER
  and created on demand right after `#bootstrap-theme-css` (so the storybook,
  which has no static links, gets them at first theme select). Added the static
  links to all 7 index.html heads matching each app's default theme
  (FreeFormOX = solar). All 28 new files precached in `sw.js` SHARED_ASSETS.
  All 5 screenshot specs' `setTheme()` swap the override links too.
- **Image sizes unified** to xsmall=32, small=40, medium=50, large=64, xlarge=80,
  jumbo=100 with default `medium`=50 in ALL apps (previously PMD 32/40/50,
  CMD/QRLinks 64/80/100, Launch 48/64/80, "large" defaults). Updated the 4
  `iconSizeSelector` selects to the six options, the per-app mappings
  (`pmdImageSize()`, `applyImageSize()` in CMD/QRLinks/Launch), the shared
  `changeIconSize()` class-removal list (now all six) and the shared
  DOMContentLoaded default. Updated the 3 pixel-sensitive tests (pmd-regression
  icon-size test + stream-selector test, cmd-regression icon-size test).
- **Font sizes**: FreeFormOX + Launch gained the 6-option Font size selector
  (they were the only apps missing it). FFOX got `body.font-size-*` rules for
  the turn indicator/buttons/chrome; Launch's existing `.app-name` rules already
  covered the sizes. All apps now expose all six.
- **Menu order**: PlanMyDay, CountMyDays, QRLinks, SolarControlar, FreeFormOX
  menus reordered to Settings, Launch, divider, rest. The Launch app's own menu
  stays just "Settings". (SUPERSEDED 2026-10-18: Launch carries the flyout too.)
- `BUILD_NUMBER` → `202609172020`.
- What worked: Node one-liner for the 28 CSS files (LF-safe); extending
  `applyTheme`/`setTheme` kept override handling in one shared place so the
  storybook and every screenshot helper pick it up for free.
- What did not work: a heredoc-style Node `-e` with embedded `'` inside a
  PowerShell double-quoted string mangles — write a temp script file instead.

### 2026-09-17
- Fixed a **cross-origin Save CORS failure** in SolarControlar (frontend-only; the
  Flask side was already correct). Root cause: the Flask POST endpoints
  (`POST /solar/`, `POST /solar/api/config`) are PRG (Post/Redirect/Get) — they
  answer `302 Location: /solar/`. From a cross-origin PWA the browser then
  follows that redirect with a **new GET**, and some browsers drop the
  `Authorization` header on the cross-origin follow-up, so Traefik's basic-auth
  returns a `401` that (from Traefik, not Flask) carries **no
  `Access-Control-Allow-Origin`** → the fetch is blocked as a CORS error →
  "Failed to fetch". (Did not reproduce in local Chromium because it keeps the
  header, but it's device/browser-dependent and the fix is correct regardless.)
- FIX (all in `SolarControlar/js/`): never follow the save redirect — set
  `redirect: "manual"` on the POSTs and treat the resulting
  `resp.type === "opaqueredirect"` as success. Concretely:
  - `api.js` `solarApi._post()` gained `{ method: "POST", redirect: "manual" }`,
    returns `""` for `opaqueredirect`, else `resp.text()`, and its return type
    changed from `Response` to a resolved string. Updated its three consumers
    (`saveSettings`, `saveConfig`, `runForecast` in api.js) to stop calling
    `.text()` — `forecast-tab.js` `runForecast()` already used the value as text
    so it kept working unchanged.
  - `solar-settings-view.js` `saveSolarSettings()` (a raw `fetch`) got the same
    `redirect: "manual"` + `opaqueredirect` handling.
  - `config-tab.js` `saveConfig()` goes through `solarApi.saveConfig` so it was
    fixed by the api.js change.
  - Various deeper investigated-and-ruled-out paths, for future reference:
    Flask `add_cors_headers` already echoes `Origin` + `Access-Control-Allow-
    Credentials` on ALL responses incl. 302 (verified: 302 has the CORS
    headers); preflight OPTIONS returns 204 with `Allow-Headers: Content-Type,
    Authorization, X-CSRFToken` for every Origin tested (localhost:9000,
    127.0.0.1:9000, https://ownimage.duckdns.org). Traefik's `solar-options`
    router (PathPrefix+METHOD(OPTIONS), no basicauth) is required for the
    preflight to reach Flask — verified it's in place and working.
  - Verified live end-to-end (real Chromium → real server, origin
    localhost:9000 via `python -m http.server -d P:\git 9000`): Settings Save
    and Config Save both flash success, no `requestfailed`, no CORS console
    error. The leftover `ERR_ABORTED` lines in the response log are the browser
    aborting the redirect-follow that `redirect: "manual"` stops us consuming —
    harmless.
  - `BUILD_NUMBER` → `202609170601` (was `202609161009`).
  - Regression: full `solarcontrolar-regression.spec.js` (12) still green (the
    tests mock POSTs with direct 200 bodies so `redirect:"manual"` is a no-op
    there).

### 2026-09-16
- Completed the SolarControlar **Flask basic-auth** feature (carried over as
  uncommitted WIP): `storage.js` gained `get/setFlaskUser` + `get/setFlaskPass`
  (`solarcontrolar_flaskUser`/`flaskPass`) and `getFlaskAuthHeader()` (returns
  `Basic <base64>` — UTF-8-safe via `btoa(unescape(encodeURIComponent(cred)))` —
  or `null` when no username is set). `api.js` gained `solarApi._withAuth(opts)`
  which injects the header, used by `_fetch`/`_post`, plus `networkDiagnostics(url)`
  appended to status-0 `serverError` messages for the common causes (HTTPS page →
  HTTP Flask target = mixed content; `localhost` on a phone won't reach the PC).
  The Settings** template gained Flask username/password inputs
  (`#flaskUserInput`, `#flaskPassInput`, `autocomplete="username|current-password"`).
- Wired auth into the 3 direct `fetch()` call-sites that bypassed `solarApi`:
  `solar-settings-view.js` `loadSolarSettings` (GET) + `saveSolarSettings` (POST)
  and `config-tab.js` `loadConfigData` (GET) — all now use
  `solarApi._withAuth({...})`. Rule for this app: ANY Flask request must go
  through `solarApi` or `solarApi._withAuth`, or it silently bypasses auth.
- Tests (+3, 12 passed): auth header absent on boot requests / present after
  setting credentials + re-refresh; settings+config tab fetches carry the header
  (creds seeded via `addInitScript` before app boot); `networkDiagnostics`/
  `serverError`(0) message includes the localhost tip. Extended the settings-page
  test (fields visible, empty by default, persist, `getFlaskAuthHeader()` value).
  `BUILD_NUMBER` -> `202609160654`.
- Fixed 2 of 3 regression failures after the FreeFormOX merge (commit `d36ff0e`
  "Added FFOX") and the `=`/`<=` date-boundary change in `entry1.filter`.
  (1) `cmd-regression.spec.js` "weeks and days format is honoured" was
  date-dependent: with today on a 301-day (exactly 43 weeks) anniversary, `line2`
  is intentionally blank, so `count2` is never set. Rewrote the test to seed a
  `once` event at today+10 days (1 week + 3 days) and assert exact `count1=`
  "1 week" / `count2=` "3 days" — deterministic on any date. (2)
  `launch-regression.spec.js` "root shows the grid of available apps": the FFOX
  assertions were pinned to `nth(3)` (Solar Controlar's index); LAUNCH_APPS order
  is PlanMyDay(0), CountMyDays(1), QRLinks(2), SolarControlar(3), FreeFormOX(4).
  Moved them to `nth(4)`. Both pass.
- Applied the app robustness fix for the minio import page (independent of the
  test): `openMinioImportPage()` in `shared/js/smd-minio.js` now calls
  `clearTimeout(_minioImportCloseTimer)` (same fix pattern as `linkEditPage` /
  `_settingsCloseTimer`) so a fast close→open cycle can't be re-hidden by the
  pending `d-none` timer. The 5s-behind `pmd-regression.spec.js:6093` test still
  fails in this environment through no app bug: its minio `server` is
  `http://localhost:9000` (the dev static server), which answers instantly and
  non-Minio → the fetch errors fast → `closeMinioImport()` legitimately hides
  the page before the 150ms `toBeVisible()` assertion. Test premise (slow or
  hanging minio endpoint holding "Loading buckets") doesn't hold here; left
  test untouched per scope.

### 2026-09-15
- Built the **SolarControlar** app: a PWA front-end for the Flask solar control
  server at `P:\git\solarcontrolar\src\flask_app.py`. Nothing in that repo was
  touched. New files: `SolarControlar/` with `index.html`, `manifest.json`,
  `icon.svg` (solar sun + battery), `css/styles.css`, and 13 JS files following
  the QRLinks pattern (global top-level functions, no ES modules): `app.js`
  (entry, `SmdConfig.storagePrefix = "solarcontrolar_"`, `smdImagePrefix =
  "shared-"`), `storage.js`, `api.js` (`solarApi` object — all Flask endpoints),
  `editor-styles.js` (`POWER_STYLES` + `SOLAR_SETTINGS_STYLES`), `main-view.js`
  (renderMain, switchMainTab, refreshData), `power-tab.js`, `settings-tab.js`
  (the app Settings PAGE: theme, flask URL, auto-refresh, BuyMeACoffee, QR,
  FA credit), `solar-settings-view.js` (the main Settings TAB: parses the
  Flask-rendered index HTML to get the settings table + csrf_token, renders
  editable controls and POSTs back), `files-tab.js`, `config-tab.js` (parses
  charge_to_percentage from the server index HTML — no GET /api/config exists),
  `forecast-tab.js`, `graph-tab.js` (Chart.js), and
  `components/solar-top-tiles.js` (`<solar-top-tiles>`).
- Vendored Chart.js: copied `vendor/chart.umd.min.js` +
  `vendor/chartjs-adapter-date-fns.bundle.min.js` into `shared/vendor/`;
  `graph-tab.js` builds cache-busted URLs from `BUILD_NUMBER`.
- Updated repo plumbing: `sw.js` gained `SolarControlar/` APPS entry + both
  chart vendor assets in `SHARED_ASSETS`; `Launch/js/app.js` gained a 4th tile
  (4 tiles total: PlanMyDay/CountMyDays/QRLinks/SolarControlar);
  `tests/coverage.js` filters `/SolarControlar/js/`;
  `README.md` has the SolarControlar line; `sw.js` APPS list includes all 13 JS
  files + `solar-settings-view.js`.
- Known limitation: the Flask app has no GET /api/config, so the Config tab
  reads charge_to_percentage by parsing the server-rendered index HTML alongside
  the Settings tab. The Flask CSRF token is extracted from the same page for
  settings POST.
- Tests: new `tests/solarcontrolar-regression.spec.js` (9 tests, all passing):
  boot/namespace, main tabs switch, main settings tab (fetches + parses the
  server index, slider interaction), files tab fetch log, config slider shows
  server value, forecast run, graph loads dates + renders chart, settings page
  (theme/flaskUrl/BMC/QR/FA), settings Done. `mockFlaskApi` mocks the full
  Flask surface: `**/solar/api/power_data*`, `**/solar/api/files*`,
  `**/solar/api/run_forecast`, `**/solar/` (GET=settings+CSRF, POST=save).
  `tests/launch-regression.spec.js` updated for 4 tiles (6 passed).
- Regenerated PWA icons (`node regen_pwa_icons.js`).
- `BUILD_NUMBER` → `202609151331`.
- Tests: 15 passed (9 solar + 6 launch); all JS syntax-check clean.

### 2026-09-14
- Migrated the old standalone **QRLinks** app into the shared pattern (third
  app). New files: `QRLinks/js/{app,storage,editor-styles,main-view,links-editor,app-settings,export}.js`
  + `js/components/qrlink-card.js`; `index.html` rewritten (single hamburger
  menu with Launch/Settings/Edit Links/Images/Export/Import, `smd-page` hosts,
  settings template General/Danger, `#imageEditModal`); deleted its own
  `sw.js`, `js/settings.js`, `js/images.js`, `sampleImages.json`, `README.md`,
  `todo.md`. `manifest.json` now uses generated PNG icons.
- Shared image library: `migrateImagesToShared()` sources gained `qr_images`;
  `seedSampleImages()` now re-checks its key before writing (first-visit seed
  race fix). QRLinks `seedSampleLinks()` does the same.
- Sample images merge: all 8 QRLinks sample images already existed in
  `shared/sampleImages.json` (shared master, new format with `data64/80/100`
  and native files) — nothing added; the QRLinks copy was deleted.
- Launch app grid now has 3 tiles (PlanMyDay/CountMyDays/QRLinks); QRLinks
  menu has a Launch item. `sw.js` gained `APPS["QRLinks/"]`;
  `tests/coverage.js` collects `/QRLinks/js/`.
- Tests: new `tests/qrlinks-regression.spec.js` (8 passed: boot/order, empty
  state, QR modal, link CRUD, settings + sample links, shared images editor,
  legacy migration + reminder, image rename/delete hooks). `launch-regression`
  updated for 3 apps (6 passed). Targeted PMD images+sub-path 47 passed; cmd
  boot/image/sub-path 6 passed; storybook 28 sections clean.
- Gotchas found: same-page close/open timers can hide a quickly reopened
  `smd-page` — `linkEditPage` now clears its pending `d-none` timer on open
  (same fix pattern as `_settingsCloseTimer`); the async sample seeders'
  re-check above; test helpers must wait for the first-visit seeding to settle
  before clearing storage.
- `BUILD_NUMBER` -> `202609141045` (timestamp).
- Follow-up fix: images were not showing in the image editors — the shared
  `smd-images.js` rendered `smd-image-card`s (and the legacy `renderImagePicker`
  items) with `key-prefix="SmdConfig.storagePrefix"` instead of
  `smdImagePrefix()`, so they read the old per-app list after the shared-image
  move. Fixed both; added thumbnail assertions (`key-prefix="shared-"` +
  non-empty `img src`) to `pmd-regression` ("image editor thumbnails render from
  the shared library"), `cmd-regression` (Images Editor list) and
  `qrlinks-regression`. `BUILD_NUMBER` -> `202609141245`.
- Screenshot galleries: added `tests/qrlinks-screenshots.spec.js`
  (`screenshots/qrlinks/<theme>/`: main view, main menu, links editor, settings,
  QR dialog) and `tests/launch-screenshots.spec.js`
  (`screenshots/launch/<theme>/`: app grid, main menu), and a
  "main menu dropdown" screen to `cmd-screenshots.spec.js` (pmd already had
  one). All iterate the 26 themes; the screenshot viewer auto-discovers the new
  galleries. Gotcha: the QR-dialog screenshot must wait for
  `#smdConfirmModal smd-qrcode canvas/img` to be visible (45s) — qrcode.js is
  lazily loaded and can lag behind the first-install SW precache, which
  otherwise captures a QR-less dialog.
- Screenshot screens for settings tabs (26 themes each, verified visually):
  `cmd-screenshots.spec.js` gained "settings - g cal" (`settings-gcal.png`,
  clicks `#settingsPage`'s G Cal tab then `.check()`s `#gcalEnabled`) and
  "settings - danger" (`settings-danger.png`, `#danger-tab` + `#showDanger`
  checked so the danger rows are visible); `launch-screenshots.spec.js` gained
  "settings" (`settings.png` via `openSettings()`). README/commands already
  describe the galleries generically — no doc change needed for new screens.
  No `BUILD_NUMBER` bump (test-only change).

### 2026-09-13 (4)
- New **Launch app**: repo-root `index.html` (entry) + `Launch/` (manifest with
  `start_url`/`scope: "../"`, icon.svg + generated PNGs, css, js). It renders a
  grid of app tiles (`LAUNCH_APPS`) and a settings page (theme, image size, BMC,
  share QR, FontAwesome credit). Both other apps gained a **Launch** menu item
  (`href="../"`). Root `sw.js` gained `APPS["Launch/"]` (including the root
  `index.html`) and `appIndexFor()` now falls back to `"index.html"` for the
  repo root/unknown paths.
- **Shared image library**: all apps now read/write ONE list, `shared-images`.
  New `SmdConfig.imagePrefix` + `smdImagePrefix()` (default "" = app prefix);
  `smd-images.js` `loadImages`/`saveImages`/`seedSampleImages` use
  `smdImagesKey()`; `migrateImagesToShared()` merges the old
  `planmydays_images`/`countmydays_images`/`images` keys into `shared-images`
  and deletes them. All `key-prefix` values (app templates + pmd-*/cmd-*
  component defaults) now come from `smdImagePrefix()`. All test seeds/asserts
  switched to `shared-images` (74 references).
- **Settings styles consolidated**: `SETTINGS_STYLES` + `injectSettingsStyles()`
  moved from `PlanMyDay/js/editor-styles.js` (and the CountMyDays copy) into
  `shared/js/smd-settings.js`, so the Launch app and future apps get them free;
  the shared helper composes `CMD_EDITOR_STYLES` when present.
- `tests/launch-regression.spec.js` added (6 tests: grid, config, settings,
  menu links, cross-app shared images, legacy image migration). `coverage.js`
  now also collects `/Launch/js/`.
- Verified (targeted): launch 6 passed; PMD images 46 passed; PMD Settings 40
  passed; cmd image/gcal/settings 12 passed; both sub-path SW tests passed.
  `BUILD_NUMBER` -> `202609131225` (timestamp).
- Follow-up (3 regressions found by the full run): the shared-image move missed
  the JSON/MinIO import-export writers in `PlanMyDay/js/app-settings.js` and
  `shared/js/smd-minio.js` (still `smdKey("images")` -> now `loadImages()` /
  `saveImages()`), and two tests create `<smd-image key-prefix="planmydays_">`
  directly. Lesson: when changing the image storage key, also grep for
  `smdKey("images")` writes and any explicit `key-prefix=` value in tests.
  Re-verified: smd-image rendering 6, Import/Export Upload 6, MinIO 50 passed.
  `BUILD_NUMBER` -> `202609140829` (timestamp).

### 2026-09-13 (3)
- Removed the "Edit Google Events" menu item (only "Refresh Google Calendar"
  remains under Google; `openGoogleEventsEditor`/`googleEventsPage` still exist
  but are no longer linked from the UI).
- Danger tab buttons are now evenly spaced: all action rows use `mb-3` and the
  two Google buttons stack with `gap-3` (new `.smd-tab-panel .gap-3` rule).
- Shared `<smd-image-editor>` extracted from `smd-images.js` (light-DOM
  component; buttons emit `smd-image-editor-action`), so CountMyDays and
 PlanMyDay use the exact same dialog. The preview class was `.date-img` at the
 time (since renamed `.data-img` — see the 2026-09-27 (e) note) and its sizing
 moved to `shared/css/styles.css` (this was why the CountMyDays dialog looked
 wrong).
  Verified side-by-side: both dialogs are pixel-identical. Storybook section
  added (needs `smd-images.js`, now loaded by the storybook).
- Tests updated: cmd asserts "Edit Google Events" is gone and that the dialog
  body hosts `smd-image-editor`; focused runs only (PMD image describes 46
  passed, cmd image/gcal/danger tests passed, storybook 27 sections clean).
  `BUILD_NUMBER` -> `202609131400`.

### 2026-09-13 (2)
- Legacy-migration reminder: `CountMyDays/js/storage.js` no longer
  `console.warn`s; it exposes `showLegacyMigrationReminder()` and `app.js` calls
  it on every `DOMContentLoaded`, showing a shared-modal reminder ("Legacy
  migration still active") so it can't be missed. Removed the TODO comments —
  the modal is the reminder. Tests dismiss it (`dismissLegacyReminder(page)` in
  `cmd-regression.spec.js`; the screenshots spec dismisses in its beforeEach).
- `cmd-countdown-card` gained a `source` attribute: the main view passes
  `local`/`google` (`d.gcal`) and the tile shows an `<smd-badge>` under the date
  (colours swapped on request: "Local" = primary, "Google" = secondary) —
  standard button variants for now. Storybook demo updated. New assertions:
  startup reminder modal, local tile badge, Google tile badge.
- Removed the `card-edited` highlight (inset `--bs-primary` box-shadow + tinted
  background) from the Edit Date / Edit Category / Edit Google Event pages and
  deleted its now-unused rule from `CMD_EDITOR_STYLES` — it showed as a strange
  coloured line/background on themes whose primary is orange (e.g. brite).
- Settings/app tweaks (follow-up): the `.card p-3` wrapper is gone from the edit
  pages (content sits directly on the page); "Import Sample Data" removed from
  the main menu (`importSampleData()` was removed 2026-09-28 as dead code - see
  that entry); G Cal Refresh is a
  full-width `smd-button` (`.smd-tab-panel smd-button` + `::part(button)` width
  rules in `CMD_EDITOR_STYLES`), and Load sample data / Clear cache moved to the
  Danger tab inside `#gcalDangerRow` (toggled with the other danger rows by
  `toggleDangerRows`). New regression test "Clear cache only clears the
  CountMyDays Google cache entry" seeds unrelated prefixed/other-app/legacy keys
  and asserts only `countmydays_google_cal` is removed.
- Result: cmd regression 43 passed, cmd screenshot gallery 4 passed (26 themes).
  `BUILD_NUMBER` -> `202609131300`.

### 2026-09-13
- Ported the newer `/temp/CountMyDays` (standalone, always-newer upstream) into
  the repo app, keeping the shared architecture. New features:
  - Google Calendar: `js/googleCalendar.js` (GSI OAuth token cache, `fetchEvents`,
    `updateGoogleEventDescription`, `{count_my_days{...}}` payload
    parse/serialize, refresh/sample/clear, `showAppInfoModal` via `showSmdModal`)
    and `js/googleCalendarEditor.js` (`googleEventsPage` list +
    `googleEventEditPage` single editor, opened from the dates list Edit on a
    Google row or from the menu). API calls are stub-able globals for tests.
  - Settings tabs renamed/re-grouped to `/temp`: **General | G Cal | Danger**;
    G Cal has enable (smd-checkbox), name, OAuth client id, calendar id,
    Refresh / Load sample data / Clear cache (smd-buttons) + a **Share app**
    `<smd-qrcode>` in the footer.
  - Dates editor is now a UNIFIED list (local + Google) with Local/Google/Repeat/
    Hidden badges and filter checkboxes (show local / show google / show google
    hidden). Google rows open the Google editor (returning to the dates page);
    local rows keep Add/Edit/Delete.
  - Main view merges visible Google events (`loadGoogleCalendarEntries`);
    `countdownLines()` "weeksAndDays" now leaves the weeks line blank when 0.
- Storage: gcal keys namespaced via `gcalKey()` / GoogleCalCacheKey; legacy
  `cmd_gcal_*` + `cmd_google_cal` added to `CMD_LEGACY_STORAGE_MAP` (migrated on
  boot). `confirmClearAllData` clears both namespaced and legacy keys.
- New `js/googleCalendarSample.json` (the temp `test/google_calendar.json` was
  missing); precached in `sw.js` APPS.
- Tests: +7 "Google Calendar" tests in `tests/cmd-regression.spec.js` (settings
  tab/QR, sample load + unified list/filters/badges, edit patches description
  and `_cmd`, stubbed refresh success/failure, Google list page, legacy key
  migration). Network calls are stubbed by reassigning `fetchEvents` /
  `requestGoogleAccessToken` / `updateGoogleEventDescription` via page.evaluate.
- Gotchas found: test locators must use `getByRole("button", …)` (smd-button
  hosts have no box) and open the hamburger before asserting `.google-menu-item`
  visibility; `#shareQrCode` has zero height until qrcode.js renders (qrcodejs
  shows the `<img>` fallback — assert that, not the canvas); in-flight
  `refreshGoogleCalendar` with a real client id hits Google GSI and hangs in
  tests — always stub the network first.
- Result: cmd regression **42 passed** (35 + 7 gcal), cmd screenshot gallery
  4 passed (26 themes, now includes badges/G Cal), PMD asset cache-busting
  4 passed, storybook probe clean (26 sections). `BUILD_NUMBER` ->
  `202609131000`.
- Lesson: PowerShell `Get-Content | Set-Content -NoNewline` joins lines AND
  re-encodes non-ASCII — never round-trip files through the shell; use the
  Write/Edit tools (restored `build-number.js` afterwards; `git diff` verified
  only the number changed).
- Follow-up: the cmd sub-path SW-precache test failed once in a sharded run
  ("Timeout 60000ms exceeded while waiting on the predicate"). It passes in
  isolation (~30s), so it was transient install starvation under the wave load;
  both sub-path tests now retry the install and allow 240s (see the Techniques
  note above).

### 2026-09-12 (4)
- Migrated `CountMyDays/` into the multi-app architecture. New CountMyDays
  files: `js/{app,storage,utils,editor-styles,main-view,dates-editor,categories-editor,app-settings,export,import-wizard}.js`
  and `js/components/{cmd-countdown-card,cmd-date-card,cmd-category-card}.js`;
  deleted its own `sw.js`, `js/settings.js`, `js/images.js` and the 3 synchronous
  XHR `sample*.js` seeders (replaced by an async `seedSampleData()` fetch of
  `js/sampleData.json`). `index.html` rewritten to the PlanMyDay pattern
  (shared theme/vendor/components, single hamburger menu, `smd-page` hosts,
  `settingsTemplate`, `#imageEditModal`, root SW registration + update prompt).
  `manifest.json` now uses generated PNG icons. Icons regenerated with
  `npm run regen:pwa-icons`.
- Shared changes (additive/guards): `smd-images.js` null-guards its PlanMyDay
  page lookups and calls `SmdConfig.{imageInUse,onImageDelete,onImageRename}`
  when set; `smd-settings.js` `hideNav()` is now page-generic + null-safe;
  brite theme added; new `smd-qr-export`/`smd-qr-import` + 2 vendored libs;
  `sw.js` `APPS["CountMyDays/"]` + new shared assets. `storybook/index.html`
  gained sections for the QR + 3 cmd components. `tests/coverage.js` now
  collects `/CountMyDays/js/` and is named "MyApps Coverage".
- Tests added: `tests/cmd-regression.spec.js` (35 tests, incl. a repo sub-path +
  SW-precache test through `tests/subpath-server.py`) and
  `tests/cmd-screenshots.spec.js` (4 screens x 26 themes -> `screenshots/cmd/`).
- Bugs found by the new tests (all fixed): the dates/categories "Add" footer
  buttons lacked `close:false` so they hid the list page before the handler ran;
  image/date edit "OK" buttons auto-closed before duplicate validation; the app
  was missing the `smd-page-action` + `smd-image-card-action` wiring for the
  shared images editor; `import-wizard.js` was missing `preprocessImages()`.
- What worked: mirroring PlanMyDay file-for-file, then writing the cmd
  regression spec early and letting it drive fixes; using `$id()` (shadow-root
  aware) inside app code and `getByRole("button", …)` in tests.
- What did not work: vendoring html5-qrcode — its constructor requires a
  light-DOM `document.getElementById` target, so it cannot drive a reader inside
  a shadow root. `smd-qr-import` now uses the jsQR + getUserMedia loop for ALL
  browsers (works anywhere); the html5-qrcode vendor file was removed.
- Result: PMD regression 428 passed, cmd regression 35 passed, touch 4 passed,
  sample-images + example passed, cmd screenshot gallery 4 passed, storybook
  probe 0 console/page errors with all 26 sections. `BUILD_NUMBER` ->
  `202609121345`.
- Lesson: when reusing shared editors, ALWAYS run the new app's regression spec
  against them immediately — the missing `smd-image-card-action` wiring and the
  `close:false` foot-gun were invisible to boot/flow probes until clicks were
  asserted.

### 2026-09-12 (3)
- Badge theming: new shared `<smd-badge>` (`shared/js/components/smd-badge.js`)
  replaces every `<span class="badge bg-*">` — pmd-today-card / pmd-stream-header /
  pmd-stream-job-card / pmd-job-search-card (tab + count + suffix + schedule +
  time + extra), the `#editJobsTotalBadge`/`#jobSearchTotalBadge` page-header
  badges, and the Minio bucket badge. `variant` (8 colours) + `pill` attributes.
- Colours are exact Bootswatch: `applySmdVars()` now probes a hidden light-DOM
  `.badge.text-bg-<variant>` (`smdBootstrapStyle()` returns computed bg + text)
  and publishes `--smd-badge-<variant>-{bg,text}`; the component's own sheet
  consumes them. This fixes the reported `maintenance`/count badges (previously
  `--bs-emphasis-color` black text on cerulean's navy info; now white like
  Bootswatch). Removed the `.badge`/`.bg-*` rules from `btnBadgeSheet` and
  `smd-page` (the sheet keeps its historical name but only has `.btn*` now).
- Tests: badge locators moved from `.badge.bg-*` to `smd-badge[variant=*]` /
  `smd-badge[pill]`; new "badges match the Bootswatch badge colours" test in the
  Theme contrast describe. `setTheme()` helper now no-ops when already on the
  requested theme (no `<link>` load event would fire).
- Wiring: `smd-badge.js` added to `index.html`, `sw.js` SHARED_ASSETS and the
  storybook (new section); `BUILD_NUMBER` → `202609120907`.
- Result: full 30-shard regression + touch suite **432 passed / 0 failed**; full
  screenshot suite (33 tests × 25 themes) 33 passed; storybook probe 0
  console/page errors with badge colours matching a live `.badge.text-bg-*` probe.

### 2026-09-12 (2)
- Theme contrast fixes. Root cause: components live in shadow roots, so
  Bootswatch's `.btn-*` rules can't reach them; the emulation hardcoded white
  text, which is invisible on the light-secondary themes (cerulean, lumen, lux,
  materia, morph, quartz, simplex, yeti, zephyr — Bootswatch renders dark text
  there).
- `smd-settings.js`: new `smdBootstrapColor()` probe reads the computed colour
  of a hidden light-DOM `<button class="btn btn-<variant>">`;
  `applySmdVars()` now publishes `--smd-primary/secondary/success/danger/info/
  warning-text` and `--smd-tab-text` from those probes (replacing the old
  luminance `updateTabTextColor` heuristic, which could disagree with
  Bootswatch, e.g. minty). `applyTheme()` re-runs `applySmdVars` on the theme
  link's `load`. Probe note: the computed colour can differ from the theme's
  `--bs-btn-color` var — e.g. cerulean has a later `.btn-secondary { color: … }`
  rule, so the probe (final computed value) is the source of truth.
- `smd-button`, `smd-modal`, shared `btnBadgeSheet` and the
  `JOBS_EDITOR_STYLES`/`SETTINGS_STYLES` `.btn-*` rules now use those text vars
  (no hardcoded `#fff`). Badges keep their emphasis-colour text.
- `pmd-screenshots.spec.js`: `setTheme()` swaps the theme `<link>` directly and
  never recomputed the text vars, so the gallery froze on the first swapped
  theme's colour (cerulean → black tabs on every later theme). It now calls
  `applySmdVars()` after the link loads. The app itself was already correct.
- Tests: new "Theme contrast" describe (secondary page/modal/pmd buttons match a
  live light-DOM `.btn-secondary` probe; inactive tabs match it across
  cerulean/cosmo/darkly/sketchy). `BUILD_NUMBER` → `202609120837`.
- Result: full 30-shard regression + touch suite **431 passed / 0 failed**; full
  screenshot suite (33 tests × 25 themes) 33 passed; storybook probe 0
  console/page errors and correct tab colours on theme switch.

### 2026-09-12
- New shared `<smd-draghandle>` (`shared/js/components/smd-draghandle.js`):
  renders FA solid `fa-bars` (hardcoded glyph U+F0C9, inline font-family/weight
  so it works in shadow DOM) and owns its cursor/touch-action/opacity. Size is a
  VALUE: `SmdDragHandle.setDefaultSize("normal" | "large")` refreshes every live
  instance (per-instance `size` attribute overrides). `smd-checkbox` gained the
  same `SmdCheckbox.setDefaultSize(...)`; its size sheet scales the INPUT's
  font-size only (control grows, slotted label text unchanged).
- Replaced every drag handle: today cards (`main-view.js`), stream job cards
  (`streams-editor.js`), task rows + tasks tab (`job-editor.js`), the built-in
  handles in `pmd-stream-header`/`pmd-stream-job-card`/`pmd-today-card`, and the
  storybook demo. All carry `class="drag-handle"` so Sortable + test locators
  keep working.
- Settings/Display: "Drag size" → **Touch size** (`#touchSizeSelector`), stored
  as `planmydays_touchSize` (legacy `planmydays_dragSize` fell back to). New
  `applyTouchSize()` in `app.js` boot + `changeTouchSize()` in shared
  `smd-settings.js` push the value into both components (no style injection).
  Removed the `.drag-handle` CSS (shared/app/editor-styles), the
  `[data-theme] … .drag-handle` colour overrides and the `body.drag-size-*`
  rules; updated the touch-size regression/screenshot tests and added tests for
  the fa-bars glyph + main-menu icon. `#btnMainMenu` now uses
  `<i class="fa-solid fa-bars">` (index.html + `smd-app.js` renderShell).
- Wiring: `smd-draghandle.js` added to `index.html` (after smd-checkbox, before
  the pmd components), `sw.js` SHARED_ASSETS and the storybook (new section);
  `BUILD_NUMBER` → `202609120721`.
- Result: full 30-shard regression + touch suite **427 passed / 0 failed**;
  screenshot smoke (main view + job-edit-tasks incl. the large variant) 2
  passed; storybook probe 0 console/page errors and 0 bad responses.
- Lesson: Sortable v1.15's `handle` matching crosses shadow roots — its internal
  `closest` follows `.host`, so `<smd-draghandle class="drag-handle">` matches
  even when the pointer target is the glyph `<span>` inside the component's
  shadow root. Keep the class on the HOST, never on inner nodes.

### 2026-09-11 (2)
- Split `PlanMyDay/js/app.js` (2,947 lines / 128 top-level functions) into 10
  classic scripts: `storage.js`, `utils.js`, `editor-styles.js`,
  `editor-common.js`, `job-editor.js`, `streams-editor.js`, `job-search.js`,
  `main-view.js`, `app-settings.js` and the `app.js` entry (wiring + PWA). No
  modules/IIFEs: all top-level functions stay global for inline `onclick` and the
  ~20 `page.evaluate` test calls. Inventory check: all 128 original functions
  present exactly once; only new edges are `activeEditorView`/`refreshActiveView`.
- Cleanups included: removed the dead `PlanMyDayApp` class (never instantiated;
  `SmdConfig.storagePrefix` default is already `planmydays_`); new
  `refreshActiveView()` dedupes the "which screen re-renders" logic in
  `cancelJobEdit`/`doneJobEdit`/`confirmDeleteJob` (delete-from-search now returns
  to search instead of the main view); `renderMain` reuses the outer `streams`
  array instead of `loadStreams()` per card.
- Wiring: 9 extra `document.write('js/<file>.js?v=' + BUILD_NUMBER)` tags in
  `PlanMyDay/index.html` (after the `smd-*` services, `app.js` last), 9 new
  `sw.js` `APPS["PlanMyDay/"]` precache entries; `BUILD_NUMBER` → `202609111945`.
  The sub-path precache test still asserts `js/app.js`.
- Test-run infra: `playwright.config.js` now supports `EXTERNAL_SERVERS=1`
  (webServer undefined) so pre-started 8080/8081 servers are shared untouched.
  Without it, every Playwright process spawned its own `http-server.py` (Windows
  SO_REUSEADDR lets them all bind 8080) and early finishers killed the server the
  others were using → mid-run `ERR_CONNECTION_REFUSED`. 30 concurrent browsers
  also exhaust client sockets, so the definitive run used 3 waves of 10 shards.
- Result: full 30-shard regression + touch suite **425 passed / 0 failed**;
  sub-path SW precache test green; screenshot smoke (main view / streams editor /
  jobs editor, all 25 themes) 3 passed. No expected visual/behaviour change.
- Lesson: move large blocks with a one-shot Node extraction script that slices
  exact line ranges (LF-safe, zero transcription errors) and prints a coverage
  report of unextracted non-blank lines; verify with `node --check` + a
  function-name inventory against `git show HEAD:<file>`.

### 2026-09-11
- Fixed `pmd-today-card` not respecting Settings/Display/Font Size on iPhone:
  the card styled the title/paddings with `:host-context(body.font-size-*)` /
  `:host-context(body.compact)`, which WebKit (every iOS browser) ignores. All
  those rules were replaced with body-scoped CSS custom properties
  (`--pmd-today-title-size/-padding/-margin/-title-margin/-description-margin/
  -cell-padding`, defined in `PlanMyDay/css/styles.css`) that inherit into the
  shadow root. Removed the now-dead `.countdown-card h4` font-size rules.
- Layout (final): thumbnails sit on the title row (`.images-col
  { align-self: flex-start }`); the stream name, View button and tab badge share
  the line directly under the title (`.meta-row`, inline order, smaller
  View/badge at 0.7em). Long badges (e.g. "maintenance") wrap to a second line
  rather than truncating the stream name (`flex-wrap: wrap`). Removed
  `.title-row { min-height: 32px }` so compact mode is shorter. Thumb wrappers
  are ALWAYS rendered (toggling only the inner `smd-image` `image`) so the job
  thumbnail keeps its slot when a stream has no image and job images line up
  across cards.
- Settings/Display/Image size now drives `<smd-image>`: the app sets
  `SmdImage.setDefaultSize(px)` (a VALUE, not a style) from a small/medium/large
  mapping of **32/40/50**; every image without an explicit `size` attr renders at
  it (card thumbs, previews, picker, editor). `_sizePx()` = `size` attr >
  `defaultSize`; a global registry refreshes every mounted image on change, and
  the size sheet is REPLACED-last (not appended) so a later size always wins
  (`adoptStyles` dedups and would otherwise leave an old smaller sheet last).
  Non-SVG images source the higher-res thumbnail for the size (32→data64,
  40→data80, 50→data100; `px` then `px*2` then 100/80/64).
- Extracted the job-edit stream dropdown into `PlanMyDay/js/components/pmd-stream-select.js` (SUPERSEDED 2026-09-18 by the shared `smd-image-dropdown`, see the IMAGE DROPDOWN note + session log (3) — `pmd-stream-select.js` was deleted):
  (`<pmd-stream-select>`): button + menu, each entry an `<smd-image>` + title, so
  the images scale with the setting. App feeds it `streams`/`selected` and
  listens for `pmd-stream-select-change` (detail `{ streamIdx }`) — the old
  `initJobStreamDropdown`/`toggleJobStreamMenu`/`closeJobStreamMenu` and the
  fixed 45px icon spans are gone. Registered in `index.html` + `sw.js` precache.
- Tests: new WebKit touch test (title font size xlarge=28px → jumbo=32px →
  compact=16px) failed 24px before the fix; new Chromium regression tests
  "stream name and buttons share the line under the title", "job thumbnail keeps
  its slot when the stream has no image", "icon size setting controls the
  rendered image size and source thumbnail" and "stream selector images follow
  the icon size setting". Same reserved-image-slot fix applied to
  `pmd-stream-header`, `pmd-stream-job-card` and `pmd-job-search-card`, each with
  a "keeps the image slot" regression test. Full 30-shard suite 425 passed
  (14-15/shard); screenshots `main view` + `edit-streams`/`job-edit-general`
  regenerated and checked (darkly). `BUILD_NUMBER` → `202609111934`.
- Gotcha captured: `:host-context()` is unsupported in WebKit — always use
  inherited CSS custom properties for body-class-driven shadow styling.

### 2026-09-10 (7)
- `smd-image-picker` now renders its tabs with the shared `<smd-tabs>` component:
  each tab's panel holds its own `.grid`, and the grid styles are adopted into
  the nested smd-tabs shadow root (`smdImagePickerGridSheet`). Added a `compact`
  attribute to `smd-tabs` (narrow tab buttons + zero panel padding) which the
  picker uses. Only the active tab's grid is populated so hidden sibling panels
  don't leave stale `.item`s in the DOM (otherwise `locator('.item').first()`
  resolves a hidden one). Picker tests now target `.smd-tab-btn`. `BUILD_NUMBER`
  → `202609101500`.

### 2026-09-10 (6)
- Image picker tab labels shortened to single words (`FontAwesome`, `FABrands`)
  and the picker `.tab-btn` horizontal padding narrowed to `0.25rem` (matching the
  injected `SETTINGS_STYLES .smd-tab-btn` padding) so all four tabs fit on ONE line
  at 360px; added `white-space: nowrap`. Renamed the "picker tabs wrap" test to
  "picker tabs fit on one line at a small width" (asserts 1 row) and updated the
  label strings.
- `pmd-stream-header` backgrounds: collapsed `--bs-light-border-subtle`,
  expanded `--bs-info-border-subtle`, text `--bs-emphasis-color` (contrast
  verified >= 4.5).
- `smd-tabs` inactive-tab contrast fix: `applySmdVars()`/theme change now sets
  `--smd-tab-text` to black or white based on the resolved `--bs-secondary`
  luminance (`updateTabTextColor()`; recomputed when the theme `<link>` loads and
  on window load). `smd-tabs` (and the picker tabs) use it for inactive text;
  hover is now `filter: brightness(1.12)` instead of a secondary+white mix.
  Verified all 25 themes have a WCAG contrast ratio >= 4.5 (cosmo/sketchy/slate/
  solar/vapor were the low ones).

### 2026-09-10 (5)
- New shared `<smd-checkbox>` (`shared/js/components/smd-checkbox.js`), used across
  the app so every checkbox shares one look. The host is ARIA-checkable
  (`role=checkbox|switch` + `aria-checked`), so Playwright `.check()`/`.uncheck()`/
  `.toBeChecked()` work on it; `change`/`input` are composed with `{ checked }`.
  `switch` attribute = pill toggle. GOTCHA: a `.checked`/`.disabled` property set
  BEFORE the element upgrades (e.g. from a parent's `_render()` right after it is
  inserted into a fresh shadow root) becomes an own property that SHADOWS the
  accessor — `connectedCallback` now folds any own `checked`/`disabled` into
  attributes. Migrated settings switches, job-edit Active/Suffix, task-done,
  schedule day checkboxes, the image-editor "none" checkboxes, and the
  `pmd-today-card`/`pmd-stream-job-card`/`pmd-job-search-card` toggles; removed the
  per-component checkbox CSS. Added an `smd-checkbox` section to the storybook.
- Checkbox visibility fix: the unchecked fill is `--bs-secondary-bg` with a
  `--bs-secondary-color` border (was body-bg/border-color, which vanished on
  light + dark surfaces). `BUILD_NUMBER` → `202609101400`.
- Card surfaces now use `background-color: var(--bs-dark-border-subtle)`:
  `smd-image-card` (inner `.card`), `pmd-job-search-card`, `pmd-stream-job-card`,
  `pmd-today-card` (hosts). `smd-image-select` is transparent so it shows the
  surface it sits on (body colour on an smd-page, card colour on a card).
  `pmd-stream-header` keeps its collapsed `--smd-secondary` / expanded `--bs-info`
  colours.

### 2026-09-10 (4)
- Today-list cards are now a PlanMyDay component: `PlanMyDay/js/components/pmd-today-card.js`
  (`<pmd-today-card>`). Owns the checkbox (with the daily `bi-repeat-1` icon),
  stream/job thumbnails, title+suffix, stream title, View button, tab badge and
  description; self-styles `:host` (body-bg/border, `:host([done])` dim +
  strike-through, `:host-context(body.compact/font-size-*)`). Only `today-drag-card`
  is set as a light-DOM class; the app slots `<div class="drag-handle" slot="drag-handle">`
  so Sortable still works. Emits `pmd-today-toggle` ({jobId,checked}) and
  `pmd-today-view` ({streamIdx,jobIdx}); `app.js` renderMain listens on
  `#todayCardList` (no more per-checkbox handlers). Registered in `index.html`
  + `sw.js` precache. Test updates: shadow-internal `document.querySelector`
  calls → Playwright locators; `.daily-repeat-icon` count → visibility; drag-handle
  locator `.first()` (slot + fallback); scoped thumb locator. Verified 155 (Main
  View/Suffix/Reorder/Ad Hoc) + 13 + 4 screenshot sweeps pass. `BUILD_NUMBER` →
  `202609101200`.
- Storybook now reflects EVERY shared + PlanMyDay component: added the missing
  `smd-theme`, `smd-image-picker` and `pmd-today-card` sections (and their script
  tags; removed a duplicate `smd-image` script). Also added a top **Theme Colours**
  section: grouped Bootstrap colour CSS variables (`THEME_COLOR_GROUPS`) as live
  swatches (12 per row), so switching the storybook theme recolours them.
- New AGENTS rule 8: a change that only touches `storybook/index.html` and/or
  `AGENTS.md` does not need the regression suite — just check the storybook loads
  clean.
- Page background is explicitly `var(--bs-body-bg)` on `html, body`
  (`shared/css/styles.css` for the app; the storybook's own `body`/`html` rules).
  Previously only `body` was themed via bootstrap (html stayed transparent); the
  canvas now tracks the theme too.

### 2026-09-10 (3)
- Screenshot output is now per-app: `tests/pmd-screenshots.spec.js` writes to
  `screenshots/pmd/<theme>/` (was `screenshots/<theme>/`). Hardcoded `pmd`; a new
  app gets its own folder (e.g. `screenshots/cmd/`). Deleted the 25 stale root
  theme folders (gitignored output; kept `viewer.js` + `sample-images.png`).
- Extracted the shared sample-images gallery spec: `pmd-sampleImages.spec.js` →
  `sample-images.spec.js` (shared, so intentionally NOT `pmd-` prefixed). It still
  writes `screenshots/sample-images.png` at the root.
- `screenshots/viewer.js` gained a **Folder** selector in the header. A "gallery"
  = a directory that directly contains theme dirs; the server exposes
  `/api/galleries` + `/api/themes?group=<id>` and only serves the static shell,
  the client renders (removed the duplicated server-side `buildBody`). Defaults
  to the `pmd` gallery, remembers the choice in `localStorage`
  (`screenshotViewerGallery`), and shows a legacy `(root)` gallery if root-level
  themes exist. `pmd` sorts first, root last.
- THEME MODE FILTER (2026-09-17): `screenshots/viewer.js` toolbar also has a
  **Theme** select — Both (default) / Light / Dark — driven by a client-side
  `DARK_THEMES` map (`cyborg,darkly,slate,solar,superhero,vapor`, mirroring
  `themeConfig[].bsTheme`). `window.changeThemeMode()` toggles a
  `theme-mode-hidden` class on `.theme-section`; it is re-applied after every
  `loadThemes()` render. Pure front-end (the `/api/*` handlers are untouched), so
  the viewer auto-supports any app gallery with the same hardcoded dark set.
- Lesson: new app screenshots go in their own `screenshots/<app>/` gallery; the
  viewer auto-discovers them (Refresh re-reads `/api/galleries`).

### 2026-09-10 (2)
- Moved `shared/storybook/index.html` → top-level `storybook/index.html` (sibling
  of `shared/` and the app folders). Rewrote its asset paths: theme/vendor/js now
  `../shared/...`; app components now `../PlanMyDay/js/components/...`. The theme
  engine stays path-agnostic (`smdAppRoot()` returns `../shared/`, `applyTheme`
  derives `../shared/css/themes/` from the link), so no JS changes were needed.
  Updated `commands.md` (storybook path + URL). Verified via probe: 14 sections,
  ZERO console/page errors, ZERO `>=400` responses, theme swap resolves
  `../shared/css/themes/quartz/bootstrap.min.css`.
- Prefixed the test specs that contain tests with `pmd-`: `example.spec.js` →
  `pmd-example.spec.js`, `regression.spec.js` → `pmd-regression.spec.js`,
  `sampleImages.spec.js` → `pmd-sampleImages.spec.js` (later extracted to the
  shared `sample-images.spec.js`), `screenshots.spec.js` →
  `pmd-screenshots.spec.js`, `touch.spec.js` → `pmd-touch.spec.js`. Non-test
  helpers (`coverage.js`, `global-setup.js`, `global-teardown.js`, the `.py`
  servers) keep their names. Updated `playwright.config.js` `testMatch`/`testIgnore`
  regexes plus README/commands/AGENTS references. Verified discovery: chromium
  runs the four desktop specs (not touch); `iphone-12-pro` runs only
  `pmd-touch.spec.js`; `pmd-example.spec.js` 3 pass.
- Today cards (`#todayCardList`) show the bootstrap `bi-repeat-1` icon
  (`.daily-repeat-icon`, title "Every day") directly beneath the job checkbox
  when the job's schedule is daily (`job.schedule.type` falsy/`"daily"`, matching
  `getScheduleText`/`shouldShowJobToday`). Added regression test "daily schedule
  shows repeat badge, non-daily does not" (seeds a daily + a matching-`days` job).
  Verified Main View + Suffix Display (151 tests) pass. Bumped `BUILD_NUMBER` →
  `202609101100`.

### 2026-09-10
- Repo restructuring for multiple PWAs off one origin:
  - `ShareMyDays/` → `shared/`; app files (`index.html`, `manifest.json`,
    `icon.svg`, `css/`, `js/`) moved into a new top-level `PlanMyDay/` folder, so
    the app is served at `/PlanMyDay/` under the repo root.
  - All app→shared refs rewritten `ShareMyDays/…` → `../shared/…`.
  - `shared/js/smd-app.js` is now path-agnostic: `SMD_SHARED_ROOT` is derived from
    its own `document.currentScript.src` (`…/shared/js/smd-app.js` → `…/shared/`)
    and used by `boot()/loadComponents()/loadServices()/ensureComponent()`.
    `shared/js/smd-settings.js` `bw` is relative (`css/themes`).
  - **Single site-wide SW**: kept `sw.js` at the repo root (one worker per origin
    scope). It now has `SHARED_ASSETS` + an `APPS` map (`"PlanMyDay/" → shell`),
    cache name `myapps-<build>`, and an APP-AWARE offline navigate fallback
    (`appIndexFor`). Every app registers `../sw.js`.
  - PWA icons: replaced the SVG `<text>✓</text>` with a vector path (librsvg
    rendered no glyph for the text) and added `regen_pwa_icons.js` (npm
    `regen:pwa-icons`) generating `icon-192.png`/`icon-512.png` per app;
    `manifest.json` now lists the PNGs (192 any, 512 any + maskable).
  - Tests/config: all `page.goto("/")` → `/PlanMyDay/`; subpath mock is now
    `/PlanMyDay/PlanMyDay` (repo prefix `/PlanMyDay`, app folder `/PlanMyDay`);
    cache-name assertion `planmydays-` → `myapps-`; asset refs → `../shared/…`;
    coverage filter → `/PlanMyDay/js/` + `/shared/js/`. `package.json` regen
    scripts → `shared/…`; `regen_icon_data.js` uses `__dirname`.
  - Storybook (in `shared/`) references the app components at
    `../../PlanMyDay/js/components/…`.

### 2026-09-09
- Syxced TestShareMyDays/ShareMyDays → PlanMyDay/ShareMyDays (delete-first so the
  removed files · remixicon.*, material-symbols.*, material-symbols-names.json ·
  really disappeared). Adopted the new shared components:
  - **smd-theme**: settings Display tab `<select id="themeSelector">` → `<smd-theme
    id="themeSelector">`. `openSettings` restores via `setAttribute("theme", ...)`,
    and a `smd-theme-change` listener calls `changeTheme`. Regression test uses
    `#themeSelector select`.
  - **smd-fontawesome-credit**: settings footer inline FA credit span → component.
    New regression test asserts the credit text lives in the page's shadow root.
  - **smd-image-picker**: replaced the tab-based `openImagePicker()` flow. The
    `smd-image-select-action` handler now hosts `<smd-image-picker key-prefix=
    "planmydays_">` on `#imagePickerPage` (`__openImagePicker`/`__finishImagePick`).
    Selection closes the page via `smd-image-picker-select`; `__finishImagePick`
    adds `d-none` (Playwright counts an off-canvas page as VISIBLE — hide() alone
    is not enough). Icon tabs are now Local/Bootstrap/Font Awesome/FA Brands
    (Remix+Material gone); regression picker tests rewritten to the component's
    `.tab-btn`/`.item`/`.glyph`/`.label`/`input[type=search]`/`.clear` internals.
  - `smd-image`/`smd-images`/picker drop `ri:`/`ms:`; `regen_icon_data.js` no
    longer emits material-symbols-names.json; storybook drops the two css links.
  - Shared build-number: PlanMyDay keeps its OWN single `BUILD_NUMBER` (does NOT
    load `ShareMyDays/js/build-number.js`), so all cache-busting stays on the app
    number and the `?v=BUILD_NUMBER` regression tests still pass.
- Verified: 409 regression + 3 touch pass (30 `--shard`s), settings screenshots
  5 pass, sampleImages + example 4 pass. **gotcha**: 30 shards × default 16
  workers on ONE python server overflows it (`ERR_CONNECTION_REFUSED` lines in
  later shards) — parallel-launch shards with `--workers=1` in small waves to get
  a clean picture. `tests/http-server.py` backlog raised to 512 to help.

### 2026-09-08 (2)
- While debugging the sub-path SW-precache test ("no console errors when deployed under /PlanMyDay/"), a failure diff showed only the first ~10 cached URLs with `…` (Playwright pretty-format truncation). Spent a round-trip trying to read the full list from the error-context.md before realising the array is truncated by the reporter and it is a PROBE JOB to dump it fully. Lesson captured under "Techniques / gotchas": a truncated received/expected list is never readable from failure output — always `writeFileSync` the full array from a `_probe.spec.js` and `Get-Content` it. No config exists to raise Playwright's limit.
- Also confirmed: `manifest.json` 404s under the JetBrains PyCharm built-in preview server (port 63342, serves the repo as `/PlanMyDay/`) are a PyCharm preview-server quirk, NOT an app bug — the app's own `tests/subpath-server.py` (8081) and a plain static server both serve `/PlanMyDay/manifest.json` (incl. `?v=` stamped) with 200. User agreed to leave it.

### 2026-09-08
- Started the ShareMyDays library extraction (Phase A + B done during this session):
  - **Phase A (filesystem)**: `git mv`'d all shared assets into a new top-level `ShareMyDays/` folder (future library repo): `js/components/{styles,smd-*}.js`, `js/settings.js`→`js/smd-settings.js`, `js/images.js`→`js/smd-images.js`, `js/minio.js`→`js/smd-minio.js`, `vendor/`, `css/themes/`, `css/fonts/`, `css/styles.css` (shared half), `sampleImages{,.json}`, `regen_*.js`, `storybook/`. App keeps `js/app.js`, `js/build-number.js`, `js/components/pmd-*.js`, `css/styles.css` (app-specific half), `sw.js`, `index.html`, `manifest.json`, tests.
  - `css/styles.css` was SPLIT: shared rules (flatpickr, quartz `.modal-content`/`.dropdown-menu` overrides, `.btn-outline-secondary`, drag-handle base, editor-btn, `#mainNav` auto-hide) → `ShareMyDays/css/styles.css`; app-specific (countdown cards, font-size/icon-size/compact/drag-size, stream accordions, task-note) → `css/styles.css`.
  - **Phase B (class)**: added `ShareMyDays/js/smd-app.js` defining `SmdConfig` (`storagePrefix`/`themeDefault`/`appName`), `smdKey(name)` (prefix-parameterised storage keys), generic globals (`$id`, `escapeHtml`, `escAttr`, `showSmdModal`, `showInfoConfirm`, `safeHideModal`, `updateNavState`, `injectStyleInto`) and `class SmdApp` (constructor mutates `SmdConfig`, `key()`, `renderMenu()`, `buildSettingsContent()`). The three service files append `Object.assign(SmdApp.prototype, {...})` so any app subclass inherits them; the global function names remain as a thin facade so inline `onclick`/`onchange` handlers and the storybook keep working.
  - `js/app.js` now declares `class PlanMyDayApp extends SmdApp { constructor() { super({storagePrefix:"planmydays_", themeDefault:"darkly", appName:"Plan My Day"}); ... } }`. All `planmydays_*` localStorage keys in app.js were rewritten to `smdKey(...)` via a node script (no behavior change; default prefix keeps existing data). PMD-specific settings handlers (`changeSplitList/HideDone/SkipAdhoc/SuffixStart/Jan1/Monday/StartWeek/ShowDanger`, dev today/lastGen) MOVE from smd-settings.js → app.js per the decision to keep the library generic.
  - STORAGE PREFIX GOTCHA: `devToday`/`devLastGen` are intentionally UNPREFIXED in the original app — kept them hard-coded `"devToday"`/`"devLastGen"` in `changeDevToday`/`changeDevLastGen` to avoid changing dev-mode keys that openSettings writes/reads with the raw key. Everything else went through `smdKey()`.
  - `index.html` loads `ShareMyDays/js/smd-app.js` FIRST (before smd-minio/smd-settings/smd-images) because the service files reference `SmdApp`/`SmdConfig` at parse time; sw.js precache got `ShareMyDays/js/smd-app.js` added.
  - Storybook now loads `../js/smd-app.js` before `../js/smd-settings.js` (needs `SmdApp` global). Fixed its `smd-qrcode.js`/`smd-buymeacoffee.js` absolute `/vendor/...` paths → resolve from `document.currentScript` (`../../vendor/...` under ShareMyDays).
  - Verified: 411 regression pass, touch 3 pass, screenshots subset pass, storybook loads with zero console errors.
- **Bug found while verifying**: `material-symbols.css` and `remixicon.css` bundled `@font-face` src as ABSOLUTE `url("/vendor/fonts/...")`, which breaks after moving `vendor/` under `ShareMyDays/` (404s at the app root and under `/PlanMyDay/`). Fixed both to RELATIVE `url("./fonts/...")` so they resolve wherever the css file lives. `bootstrap-icons.css` (`./fonts/...`) and fontawesome (`../webfonts/...`) were already relative. NOTE the font is only fetched when a glyph is actually rendered, which is why plain page-load tests missed it.
- **Added regression test**: "no console errors and no failed loads when icon-font glyphs render (bib/ri/fa/fab/ms)" in the `asset cache-busting` describe — renders one `smd-image` per icon family (forcing the vendored @font-face fetches) and asserts ZERO console errors / page errors / `>=400` responses. Verified it FAILS with the old absolute font path and passes now.
- **Found + fixed pre-existing sw.js bug**: `js/app.js` was MISSING from `sw.js` PRECACHE_URLS (present at `fa50dc5`/`849ddbd`, lost later) — the sub-path test "no console errors when deployed under /PlanMyDay/" asserts `/PlanMyDay/js/app.js` is precached and was only passing via a race (the runtime fetch-handler lazily `cache.put`s app.js). Added it back so first-install offline always has the app entrypoint. Confirmed the test now passes deterministically.
- Lessons:
  - When a regression test asserts cached/precached asset lists, don't rely on runtime `cache.put` to backfill — the precache list must be complete and is the source of truth.
  - Counters: `rg` is unavailable (use Grep tool); searching minified vendor files breaks the Grep tool — scope to `js/**`/`tests/**`.

### 2026-09-07 (2)
- Added regression test "no console errors when deployed under /PlanMyDay/ (sub-path) during SW precache" to `asset cache-busting` describe. It navigates to a NEW `tests/subpath-server.py` (port 8081) that serves the app ONLY under `/PlanMyDay/` (every origin-root path 404s), faithfully mimicking `ownimage.github.io/PlanMyDay/` where root `/css/...` does not exist. Test asserts: theme `<link>` href is relative (`^css\/themes\/`, not `^\/css\/`), the SW activates at scope `/PlanMyDay/` and precaches >0 URLs including theme css + app.js + index.html, all under `/PlanMyDay/`, with ZERO console errors / page errors / >=400 responses. Verified it FAILS when `applyTheme` reverts to the absolute `/css/themes/...` path, and passes with the relative-prefix fix. Added the server to `playwright.config.js` `webServer` array (now two entries: 8080 app + 8081 sub-path-only).
- GOTCHAS learned:
  - `navigator.serviceWorker.ready` TIMED OUT in the regression suite even though the SW activated fine — the shared `beforeEach` (`goto /` + reload) consumes most of the 30s test budget and the ~10s SW first-install precache pushes it over. Fix: bump `test.setTimeout(120000)` and poll with `expect.poll` for `reg.active.state === "activated"` + `!!controller` instead of awaiting `ready`.
  - `requestfailed` does NOT fire for HTTP 404s (only network-level failures) — capture `response` events with `status() >= 400` instead.
  - `http-server.py` (port 8080) ALSO serving `/PlanMyDay/` would have masked the bug (absolute `/css/themes/...` would still resolve to the root mount) — the test server must 404 origin-root asset paths to reproduce the real GitHub Pages failure.

### 2026-09-07
- Fixed sub-path (e.g. GitHub Pages `ownimage.github.io/PlanMyDay/`) deployment breakage introduced by PWA changes: `js/settings.js` `applyTheme` hardcoded the theme path as ABSOLUTE `/css/themes/<name>/bootstrap.min.css`, which under a sub-path resolves to the domain root → 404. Fix: `applyTheme` now derives the theme URL's prefix from the `#bootstrap-theme-css` `<link>`'s existing relative `href` (`rel.replace(/[^/]*\/bootstrap\.min\.css(\?.*)?$/, "")`), yielding `css/themes/<name>/...` at the app root and `../css/themes/<name>/...` in `/storybook/`. Both resolve correctly under any sub-path. Verified: "theme swap is cache-busted" regression test passes.
- Same fix applied to the runtime `fetch()` icon-set loads in `js/images.js` (`loadPickerIconSet`) and `js/components/smd-image.js` (`loadIconSet`): those used absolute `/vendor/...css|json` paths → same sub-path 404. Added a shared `smdAppRoot()` helper in `settings.js` that returns the relative app-root prefix derived from the theme `<link>` (`` at app root, `../` in storybook), and both files now `smdAppRoot() + "vendor/..."` at fetch time (path strings in `PICKER_ICON_SETS`/`ICON_SETS` are now relative, no leading `/`). NOTE `smdAppRoot()` is called lazily inside the fetch (not at module parse), so it's safe even though `smd-image.js` loads BEFORE `settings.js` in `index.html`.
- The SW precache (`sw.js`) and its registration (`sw.js?v=` relative in index.html) were already relative, so ALL precached content + the offline fetch-by-pathname handler already resolve within the sub-path scope — no SW changes needed.
- Remaining absolute `/vendor/` paths are only in `js/components/smd-qrcode.js` and `js/components/smd-buymeacoffee.js`, which are STORYBOOK-ONLY (not loaded by the app `index.html`) — left untouched.
- General rule: never hardcode an absolute `/...` asset URL in app JS; it breaks under sub-path deploys. Derive a root via `smdAppRoot()` (theme-link-based) or keep the URL relative.
- Bumped `BUILD_NUMBER` → `202609070000` (must be bumped to ship, else stale SW/cache).

### 2026-09-06
- NOTE (2026-09-09): the Remix/Material icon sets described below were REMOVED
  from the shared library — the picker is Local/Bootstrap/Font Awesome/FA Brands,
  `material-symbols-names.json` is no longer generated, and the "six tabs"
  text is historical.
- smd-tabs gained a `wrap` attribute: `:host([wrap]) .smd-tab-list { flex-wrap: wrap; }` (base rule is now explicit `flex-wrap: nowrap`). The image picker sets `tabsEl.wrap = true` so its 6 tabs flow onto multiple lines; the old picker-local `.smd-tab-list { flex-wrap: wrap }` style hack was removed. Storybook smd-tabs section gained a "Wrap tabs" checkbox. Regression test asserts the picker tabs wrap (narrow 360px viewport → buttons span >1 row).
- Image picker now has SIX tabs: `Local | Bootstrap | Remix | Font Awesome | FA Brands | Material`. Reserved name prefixes stored on job/stream.image: `bi:`/`ri:`/`fa:` (solid+regular combined)/`fab:` (brands)/`ms:` (Material Symbols). Vendored locally with `?v=` cache-busting + `sw.js` precache: Remix Icon **4.2.0** (Apache-2.0 — NOT 4.9.x, which switched to a custom "Remix Icon License v1.0"), Font Awesome Free **6.5.2** (`vendor/fontawesome/{css,webfonts}`), Material Symbols Outlined variable font (Fontsource `wght` slice, 648KB — heavy, accepted) + a tiny `vendor/material-symbols.css`. FA icons are CC BY 4.0 → added a "Font Awesome icons by Fonticons, Inc. (CC BY 4.0)" credit in the Settings footer. `BUILD_NUMBER` → `202609062100`.
- Generated metadata via `regen_icon_data.js` (npm `regen:icons`): `vendor/fontawesome-icons.json` (`{fa:{name:{h,w}},fab:{...}}`) from FA's `fontawesome.min.css` content rules + `metadata/icon-families.json` (name→style), and `vendor/material-symbols-names.json` (from the `material-symbols` npm `index.d.ts` name array). FA parsing GOTCHA: all solid/regular content rules live in `fontawesome.min.css` (single-colon `:before`, comma-grouped aliases — expand selectors); the per-style `solid/regular.min.css` only carry @font-face + weight classes; brands glyphs live in `brands.min.css`. Solid/regular SHARE codepoints — font-weight (900 vs 400) selects the font file, so FA rendering must set per-name weight or glyphs tofu.
- UNIFIED ICON RENDERING: instead of `.bi`/`.fa` classes + shadow-injected glyph CSS, both the picker grids and `smd-image` render a `<span>` whose `textContent` is the decoded codepoint char (or, for Material, the icon NAME as a ligature) with inline `font-family`/`font-weight`. Fonts are document-global once the vendor css `<link>`s register them, so NO glyph CSS is injected into shadow roots any more (the old bootstrap css injection into picker shadow roots is GONE). `smd-image` parses the same per-set maps (`bi`/`ri` from css, `fa`/`fab` from the json slot, `ms` from names json) and dispatches on `<set>:<name>`.
- GOTCHA (cost a probe round): CSSOM SILENTLY DROPS an unquoted multi-word font-family — `span.style.setProperty("font-family", "Font Awesome 6 Free")` yields `style=""` (weight still sets!), breaking FA/Brands/Material while single-word families (bootstrap-icons/remixicon) were fine. Always set `'"' + family + '"'`.
- GOTCHA (test authoring): `.icon-picker-item` also matches items inside HIDDEN sibling tab panels, so Playwright `.first()` can resolve a DOM-earlier hidden item and `waitFor(visible)` times out — scope grid locators to `#iconPickerList-<key> .icon-picker-item`.
- Material Symbols: ligatures work in shadow DOM (`ms:home` → a single ~64px glyph vs ~125px for plain "home" text); its @font-face uses `font-weight: 100 700` (variable). Names use underscores (e.g. `outdoor_garden`, `garden_cart`; there is NO bare `garden`).
- PWA growth ≈ +1.4MB cached (dominated by the 648KB Material font). Verified: full regression 409 pass, touch 3 pass, screenshots 33 pass. Fail-fast batches used during development.
- `imagePickerPage` now has smd-tabs BELOW the search input: "Local" (all `planmydays_images`, default active tab) and "Bootstrap" (all ~2050 bootstrap-icons). Downloaded `vendor/bootstrap-icons.css` + `vendor/fonts/bootstrap-icons.{woff,woff2}` (v1.11.3) locally. Cache-busting: a `<link rel="stylesheet" href="vendor/bootstrap-icons.css">` in the head (auto-stamped `?v=` by the head script) guarantees the @font-face registers document-wide; the icon glyph rules are injected into the picker shadow roots (page + the smd-tabs shadow where panels live) by fetching the css text once (cached in a module var) and `injectStyleInto`-ing it (the SAME cached sheet via `SmdStyles.sheetFor`). Precaching: added css + both fonts to `sw.js` PRECACHE_URLS. Bumped `BUILD_NUMBER` to `202609061400`.
- Selecting a Bootstrap icon calls the SAME callback with a reserved `bi:<name>` name (never stored in localStorage), so it persists on job/stream.image; smd-image renders it as an icon-font glyph (see next bullet). Search input now filters the ACTIVE tab; `filterImagePicker`/`clearImagePickerFilter`/tab-change re-render only the visible tab list. Empty states: "No images available." (Local), "No icons match your search." / "Loading icons..." / "Bootstrap icons unavailable." (Bootstrap). Verified via probe + regression: 9 picker tests, 23 picker-flow tests, 63 tab/settings tests, 2 cache-busting tests all pass.
- `<smd-image>` now renders `image="bi:<name>"` as a bootstrap-icon glyph: it fetches `/vendor/bootstrap-icons.css` once (absolute path so both `/` and `/storybook/` work), parses a name→hex map from the `.bi-<name>::before { content:"\fXXX" }` rules, and renders a `.smd-bi` span whose `textContent` is the actual glyph char with `font-family: "bootstrap-icons"` from a tiny adopted sheet (the font loads via the document-level css `<link>`; no `.bi`/`::before` rules needed in the shadow). Font-size scales with `size` (0.8×px; no size ⇒ 1.5rem/24px). Unknown `bi:` names stay hidden. All the app's thumbs route through smd-image (today cards, `pmd-*` cards, `smd-image-select`/previews), so a picked icon shows everywhere it's rendered. Storybook got the icon css `<link>` too (enter `bi:house` in the smd-image Name field to demo).
- GOTCHA: in `_renderBi`, only re-render via `ensureBiGlyphs().then(() => this._render())` when `biGlyphs` is still null — re-rendering whenever the glyph is missing loops forever (map loaded + unknown name ⇒ render ⇒ still missing ⇒ schedule again) and hangs the main thread.
- PREEXISTING BUG FIX: smd-image's internal `applySvgAttr` only replaced the FIRST `stroke`/`fill`/`stroke-width` occurrence (non-global regex), leaving nested `<path>`/`<g>` colours untouched. Most icons carry the colour on BOTH the root `<svg>` and a nested `<path>`, so smd-image rendered washed-out/wrong-colour icons on light/dark themes while the image editor preview (images.js `updateSvgColor`, GLOBAL regex) looked correct. Fix: smd-image now replaces ALL occurrences (`new RegExp(rx.source, "g")`), making its output byte-identical to `getThemedImageDataUrl`. Regression test seeds an SVG with fill/stroke on root + nested path and asserts both are themed and match the editor URL.
- GOTCHAS learned:
  - Constructed (adopted) stylesheets resolve relative `url()` against the DOCUMENT base URL, not the css file's folder — the injected bootstrap-icons.css would fetch `/fonts/…` → 404. Fix: rewrite `url(./fonts/` → `url("/vendor/fonts/`) in the fetched text before injecting.
  - Glyph styles live on the `::before` pseudo: `getComputedStyle(el, "::before")` is required for font-family/content; the element's own computed font-family stays the body font. And `::before` `content` returns the UNESCAPED glyph char (e.g. `""`), NOT the literal `\f67f` written in the css — don't assert on the backslash-f escape.
  - A document-level `<link>` for the icon css is the reliable way to register the @font-face (fonts are document-global once registered); shadow-injected css still needs to be there for the `.bi`/content rules to reach shadow-root panels.
- `smd-tabs` `.smd-tab-line` background changed `--bs-border-color` → `--smd-primary` (both the tab underline and optional `bottomline` share the class); removed the `margin-bottom: -1px` on `.smd-tab-btn` so inactive tabs no longer overlap/cover the line. No tests assert on these values.
- `pmd-stream-job-card` now has a BUILT-IN drag handle: the drag-handle `<slot>` gained fallback content `<div class="drag-handle">&#9776;</div>` (the ☰ hamburger glyph, same as the header/main-view handles), and `.drag-handle` was added alongside each `::slotted(.drag-handle)` rule in its sheet — slot-fallback content lives in the shadow tree so `::slotted()` never styles it. Consumers that don't slot a handle (e.g. storybook sections + their `#ctrl-stream-thumb` view) get a styled ☰ grab handle; the app still slots its own identical handle. A `drag-handle` attribute on the card hides the built-in handle (`:host([drag-handle]) .drag-handle { display: none; }`) — the storybook's `#ctrl-stream-thumb` checkbox toggles that attribute (renamed "Show drag handle", replaced the old image-thumb-tick toggling). Verified via probe (computed style: 1.2rem, `--bs-secondary-color`, cursor grab, flex-shrink 0) + 5 affected drag-handle tests.
- PWA hardening: `sw.js` now pre-caches everything (added the previously-missing `smd-modal.js`), caches by PATHNAME with `ignoreSearch` (so `?v=` versioned requests hit the same entries as the precache → works offline & on poor networks, cache-first + background revalidate + cached-`index.html` navigation fallback). Activation is now USER-DRIVEN: the SW no longer `skipWaiting()`s on install; it only activates on a `SKIP_WAITING` message. `index.html` registers the SW and on `updatefound`/`waiting` shows an "Update available" `smd-modal` via `showSmdModal` — "Update now" posts `SKIP_WAITING` and reloads on `controllerchange` (gated by an `__applyingUpdate` flag so the very first activation never reloads the page), "Later" dismisses once per session. `window.__pmdSwUpdater.showUpdatePrompt` is a test hook. Verified via Playwright: offline reload from cache renders the app (controlled=true, no page errors), and both prompt paths (proceed/cancel) dispatch correctly. Removed a duplicate `smd-image.js` `<script>` include in `index.html`.
- Lesson: a blanket `controllerchange` → `reload()` will fire on the FIRST service-worker activation in every fresh browser context (Playwright included) — gate reloads behind an explicit user-chooses-to-update flag so tests/single-visit users aren't reloaded.
- The storybook now uses the APP's theme engine: `storybook/index.html` loads `../js/build-number.js` + `../js/settings.js` and drives its theme selector from the shared `themeConfig`/`applyTheme` (removed the duplicated local `THEME_CONFIG`/`applyTheme`). `settings.js` theme CSS paths are now ABSOLUTE (`/css/themes/<slug>/bootstrap.min.css`) so both `index.html` and `/storybook/` resolve them; `applyTheme` still stamps `?v=`. The storybook keeps its own `storybook_theme` storage and neutralizes the `planmydays_theme` side effect `applyTheme` persists. NOTE: this fixed a real divergence — the storybook's old copy had `quartz: dark` while the app had `quartz: light`. Keep storybook using `settings.js`; never duplicate `themeConfig`.
- Whole-component styling moved to CONSTRUCTABLE STYLESHEETS (`adoptedStyleSheets`) for consistency:
  - Added `js/components/styles.js` (`window.SmdStyles`): `sheetFor(css)` caches a `CSSStyleSheet` by text; `adoptStyles(root, sheetsOrCss)` dedups into `root.adoptedStyleSheets`; shared `hiddenSheet` (`[hidden]`) + `btnBadgeSheet` (`.btn`/`.btn-primary|secondary|danger|info`/`.btn-sm`/`.badge`/`.bg-primary|success|info|secondary`).
  - `smd-button`, `smd-tabs`, `smd-modal`, `smd-page` now build a per-component sheet and adopt it in the constructor; their `_render()` no longer writes a `<style>` child.
  - `pmd-stream-header`, `pmd-stream-job-card`, `pmd-job-search-card`, `pmd-image-card` adopt `[hiddenSheet, btnBadgeSheet, ownSheet]` — the duplicated btn/badge/bg-* rules were deleted from each template. Per-component `.btn` sizing kept in own sheets (placed LAST so they win).
  - `injectStyleInto(root, css)` (app.js) reimplemented as `SmdStyles.adoptStyles` — the old `<style class="smd-shared-style">`-in-shadow-DOM plus re-injection-after-render logic is GONE (adopted sheets survive `_render()`).
  - Load order: `styles.js` is now the FIRST component script in `index.html`, `storybook/index.html`, and `sw.js` precache.
- What worked: `sheetFor` string-cache means `injectStyleInto`/repeat adoption is a no-op (same sheet reference), so the schedule+minio style accumulation became unnecessary. Verified via probe (computed colors unchanged) + 157 regression tests, 3 touch, 5 screenshot.
- Lesson: constructable sheets are the fix for "styles wiped on shadowRoot.innerHTML re-render" — prefer them when adding any new web-component styling.
- Added a shared `js/components/smd-image.js` (`<smd-image>`) to display any image from the localStorage images list. It is prefix-agnostic (`key-prefix` attr, e.g. `"planmydays_"`; list key = `keyPrefix + "images"`) with zero planmydays/pmd references. Attributes: `image` (name), `theme` (`auto` default / `light` / `dark`), `alt`; re-renders on attribute change and exposes `refresh()` for after the store changes. It replicates the SVG stroke/fill/stroke-width theme-override logic internally (keep it that way to stay app-agnostic). Verified via probe: dark auto → dark overrides, light forced, missing name → img hidden.
- `<smd-image>` observers `data-bs-theme`/`data-theme` on `<html>` (MutationObserver in connectedCallback) so mounted images re-theme during screenshot theme sweeps.
- `<smd-image>` accepts a `size` attribute (px): it adopts a shared per-size `:host { width/height }` stylesheet via `SmdStyles.sheetFor` (one cached sheet per px) and, when an entry has no `data`, falls back to `data<size>` → `data100` → `data80` → `data64`. The image picker uses `size="64"` and the main-view job/stream thumbs `size="32"` (inline sizing dropped); storybook `smd-image` section gained a Size control.
- The app now uses `<smd-image key-prefix="planmydays_">` everywhere it shows a job or stream image: main view today cards (stream+job thumbs), `pmd-stream-header`/`pmd-stream-job-card`/`pmd-job-search-card` thumbs (their `image`/`stream-image` attributes now carry NAMES, not data URLs, and they render `<smd-image>` internally), the job-edit stream dropdown + image previews, the stream-edit preview, and `updateJobImagePreview`/`updateJobStreamPreview`/`updateStreamImagePreview` (set the `smd-image` `image` attribute instead of innerHTML). The `#todayCardList img.date-img` regression test now targets `#todayCardList smd-image` (that `.date-img` hook was renamed `.data-img` in 2026-09-27 (e); the today-card images themselves render via `<smd-image>` and are unaffected). Added a storybook `smd-image` section (seeds a neutral `sb_images` store, name + theme controls).
- Converted `pmd-image-card` → shared `smd-image-card` (`js/components/smd-image-card.js`): shows a card for a localStorage images entry via `<smd-image>` (name-based; attributes `key-prefix`/`image`/`title`/`index`/`in-use`), dispatches a single `smd-image-card-action` event (`{ action: delete|duplicate|edit, index }`). App: `images.js` builds them with `key-prefix="planmydays_"`, and `app.js` listens for `smd-image-card-action` on the images editor. Old `pmd-image-card.js` deleted; script refs + storybook section updated. GOTCHA: `parseInt(attr) || -1` turns index `0` into `-1` (0 is falsy) and `startEditImage(-1)` then throws `JSON.parse(JSON.stringify(undefined))` ("undefined" is not valid JSON) — guard falsy index with `isNaN()`.
- Added shared `smd-image-select` (`js/components/smd-image-select.js`): image thumbnail (via `smd-image`, name + `key-prefix`), name label, and an Edit `smd-button`. Attributes `key-prefix`/`image`/`label`/`label-id`/`button-id`/`disabled`; emits `smd-image-select-action` `{ action: "edit" }`. Keeps a bordered placeholder box ("none") when no image is selected. App uses it on `jobEditPage` (`#jobImageSelect`, label `#jobImageName`, button `#btnJobImageChange`) and `streamEditPage` (`#streamImageSelect`, label `#streamImageName`, button `#btnStreamImageChoose`); `updateJobImagePreview`/`updateStreamImagePreview` set the component's `image` attribute. GOTCHA: composed events crossing shadow boundaries retarget `e.target` to the OUTERMOST host — a `document`-level listener must use `e.composedPath()` (CALL IT: `e.composedPath()`, not `e.composedPath || []`) to find the originating component.
- `imagePickerModal` (bootstrap) → `<smd-page id="imagePickerPage">`: `openImagePicker`/`closeImagePicker`/`renderImagePicker` rewritten to drive a page (title "Choose Image", search + Clear, `#imagePickerList`, footer "No Image" + Cancel smd-buttons); picker items render `<smd-image key-prefix="planmydays_">`; `IMAGE_PICKER_STYLES` (+ `JOBS_EDITOR_STYLES`) injected. Modal markup removed from `index.html`; old `#imagePickerModal`/`toHaveClass(/show/)`/`bootstrap.Modal.getInstance(...).hide()` test helpers replaced with `#imagePickerPage` + `open` attribute. Only bootstrap modal left is `imageEditModal`.
- Test discipline added to AGENTS.md rule 7: after a change run only the first 2-3 affected tests with `--retries=0`, expand once green.
- `smd-image-select` shows a centred muted "none" placeholder in the thumb box when no image is chosen (hide the empty `smd-image` host entirely so the placeholder is the only flex child). Image picker (`imagePickerPage`) now wraps its grid (needed `.smd-page-body .flex-wrap` — JOBS_EDITOR_STYLES doesn't include it, so items overflowed one row) and its footer order is Cancel (left) then No Image.
- Sample images now live as NATIVE FILES in `sampleImages/` (name with spaces → `_`, e.g. `DIY_b_w.svg`; `.svg`/`.ico`/`.gif` by mime). `sampleImages.json` (still data-URL based, ~2.5MB — app unchanged) is regenerated from those files with `node regen_sample_images.js` (`extract` = json → files, default/`regen` = files → json). npm scripts: `regen:images`, `extract:images`.
- `regen` is NON-DESTRUCTIVE: it clones each existing json entry and only replaces `data` when a file matches (so `lineColor`/`fillColor`/`themes`/`strokeWidth`/`_prevFill`/`_prevStroke` and ANY other per-image metadata survive); entries with no matching file are left untouched; new files are appended. File↔name matching is FUZZY (canonicalise = lowercase + collapse runs of non-alphanumerics to `_`), so `DIY b/w` ↔ `DIY_b_w.svg`, `Noughts & Crosses` ↔ `Noughts_&_Crosses.svg`. Output preserves the original key order + no trailing newline, so it is byte-idempotent with the committed file (verified: regenerating the committed `sampleImages.json` yields no diff; 164 images round-trip decode-identical).
- NON-SVG sample images (`.gif`/`.ico`/`.png`/`.jpg`/`.webp`) are emitted WITHOUT `data`; instead they get `data64`/`data80`/`data100` PNG thumbs (64/80/100px, crop-to-fill) generated with `sharp` (devDependency). ICOs are decoded in script (32bpp DIB extraction → raw RGBA, rows bottom-up per BMP convention; set `ICO_TOP_DOWN` if a source stores rows top-down) because sharp's libvips on this box lacks ICO/BMP loaders. `sampleImages.json` shrank 2.55MB → ~0.9MB. App side: `getThemedImageDataUrl` and `smd-image` now fall back to `img.data100 || img.data80 || img.data64` when `data` is missing (that fallback kept `tests/sample-images.spec.js`'s gallery from hanging on empty `src`). NOTE: `extract` only writes entries that have a full-size `data` (the thumbnail-only data64/80/100 entries are skipped — their binaries already live in `sampleImages/`).

### 2026-09-05
- Added "Self-improving playbook" section (read at start, dated session log at end).
- Replaced the Ad Hoc removal confirm (was `deleteConfirmModal` bootstrap modal) with the `smd-modal` custom element.
  - Added `js/components/smd-modal.js` script include to `index.html`.
  - Added reusable `showSmdModal(options)` helper in `js/app.js` that creates/reuses a single `#smdConfirmModal` host and resolves via the `smd-modal-action` event.
  - Updated `tests/pmd-regression.spec.js` Ad Hoc tests to target `#smdConfirmModal` instead of `#deleteConfirmModal`.
- Converted ALL remaining `deleteConfirmModal` flows to `smd-modal`: delete stream, delete job task, delete job (view→edit + accordion), delete image, clear all data.
  - Each confirm now uses Cancel + a danger button ("Delete" or "Clear"). Content strings are escaped (smd-modal renders raw HTML).
  - Removed the now-dead `#deleteConfirmModal` markup from `index.html` and its 5 font-size rule groups from `css/styles.css`.
  - Updated all affected `tests/pmd-regression.spec.js` tests to `#smdConfirmModal` + `locator("button").filter({ hasText: "..." })`.
- Converted the remaining two bootstrap modals to `smd-modal`: `infoConfirmModal` (now `showInfoConfirm`) and `scheduleModal` (the job schedule editor).
  - `showInfoConfirm` now escapes its message, converts `\n`→`<br>`, and shows via `showSmdModal` with a single OK button.
  - The schedule form moved out of `index.html` into `getScheduleFormHTML()` (app.js). Since smd-modal content lives in a shadow root:
    - Added `scheduleEl(id)` / `scheduleRadios()` helpers that reach into `#smdConfirmModal`'s shadow root (bootstrap `document.getElementById`/`querySelectorAll` can't see shadow content).
    - `onScheduleTypeChange`, `onScheduleNDaysChange`, `saveScheduleModal` updated to use those helpers (`jobField` is shadow-agnostic since it only touches jobsBuffer).
    - Injected `SCHEDULE_MODAL_STYLES` into the modal shadow root via `injectStyleInto` (form-check/select/utility classes incl. `.d-none`).
    - Removed `closeScheduleModal`, `scheduleModalCallback`, the `scheduleModal` markup, and all `#scheduleModal .btn-primary`/`#infoConfirmModal` test locators (now `#smdConfirmModal` + `smd-footer button[data-index='1']`).
- What worked: Playwright CSS/role locators pierce the open shadow DOM, so schedule form ids (`#schedDaily`, `#schedDay0`, …) keep working unchanged. Use single quotes in CSS attribute selectors inside double-quoted JS test strings (`[data-index='1']`), since double quotes break the string. `smd-page` is z-index 1040 and the `smd-modal` host 1050, so the modal lays above every editor — no z-index boost hacks needed.
- Refinements: info modal title is now "Sample images loaded" (first line removed from body); the schedule day checkboxes hide until "Specific days" is picked (`.d-none` needed `!important` to beat the `d-flex` class on `#schedDaysOptions`); `smd-modal` `h3` and `smd-page` `h2` both use `color: color-mix(in srgb, var(--bs-body-color) 60%, white)` and the `.smd-header` now gets the same lightened background band as `.smd-page-header` (`color-mix(in srgb, var(--bs-body-bg) 85%, white)`) with `overflow: hidden` on the dialog so the band clips to the rounded corners — the modal header band/title now visibly matches the page header.
- Converted the last three dialogs:
  - `streamEditModal` (bootstrap) → `<smd-page id="streamEditPage">`: new page with `openStreamEditPage`/`hideStreamEditPage` (mirrors jobEditPage), footer Cancel/OK smd-buttons, `streamEditSubmit()` for Enter-to-save, `updateStreamEditOkBtn`/`updateStreamImagePreview` switched to `$id` (form lives in the page shadow root). `openImagePicker` no longer needs to hide the underlying editor (picker z-index 1060 sits above pages at 1040).
  - `minioAlertModal` → `showSmdModal` ("Minio"/"Minio Error" title, OK button, danger variant for errors).
  - `minioImportModal` → `showSmdModal` with a `#minioImportBody` inside the modal shadow root; `loadMinioBuckets`/`loadMinioBucketFiles`/`importMinioFile` now use `$id`, `closeMinioImport` just removes `open` from the shared host, and `MINIO_IMPORT_STYLES` styles list-group/buttons/spinner inside `.smd-body`.
  - `injectStyleInto` now ACCUMULATES unique CSS blocks into a single `.smd-shared-style` element instead of injecting once — required because the shared `#smdConfirmModal` host receives both schedule and minio styles (previously the second injection was skipped).
- Lessons: smd-button disabled state must be asserted via `#id button` (the native button inside its shadow), not the host. Reused ids (`#smdConfirmModal`) mean multiple injections into the same shadow root must concatenate. Tests with unique assertive renaming (`#streamEditModalBody` → `#streamEditPage .smd-page-body`) need ordered replaceAll (body first, then the modal id).
- `minioImportModal` → `<smd-page id="minioImportPage">` (full-screen import-from-minio flow): `openMinioImportPage`/`closeMinioImport` (mirror jobEditPage hide-with-timer), `smd-page-action` Close button, `MINIO_IMPORT_STYLES` re-scoped from `.smd-body` to `.smd-page-body`, `#minioImportBody` lives in the page shadow root. Error paths (bucket/file list failure) close the page and show a `showMinioAlert` error modal — the old test expectation "page should still exist" became "error alert shows + page hidden".
- Added regression test "minio menu options hidden when disabled via the settings minio tab": settings → Minio tab → toggling `#minioEnabled` updates the main-menu Import/Export items via `updateMinioMenu` (called from `changeMinioEnabled`).
- Minio import page: bucket name moved into the header as a `badge bg-info`; the "Back" button was removed (footer Close does the same); file list is flush-left with no bullets.
- Lesson: setting ANY smd-page property (`title`/`content`/`headerHtml`/`buttons`) re-renders the shadow root via `_render()`, which DESTROYS previously injected `<style class="smd-shared-style">` elements. Re-inject styles AFTER the last property set, and re-inject again after any later property change (e.g. `loadMinioBucketFiles` sets `page.headerHtml` → must call `injectStyleInto` again).
- smd-tabs had a white-on-white bug on the Quartz theme: inactive tabs used `--bs-tertiary-bg` (#f8f9fa = white) with `--bs-secondary-color` text (rgba white) — invisible. Restyled to follow bootswatch nav-tabs: inactive = transparent bg + `--bs-body-color` text; active = `--bs-tertiary-bg` + `--bs-emphasis-color` (white tab / dark text on Quartz). Verified by computed-style probe on quartz + yeti.
- smd-tabs tab colours: selected tab uses `--smd-primary` + `--smd-primary-text` (matches primary smd-button), non-selected uses `--smd-secondary` + `--smd-primary-text` (matches secondary smd-button); the line under the tabs and the optional `bottomline` under the content both use `--smd-primary`.
- Quartz `.dropdown-menu` had a glassmorphism treatment (translucent white gradient + `backdrop-filter: blur(5px)`, transparent bg) that washed out white menu text — added a `.dropdown-menu` override (opaque `--bs-dropdown-bg`, `background-image: none`, no blur) mirroring the existing `.modal-content` rule. Added screenshot test `main menu dropdown` → `main-menu-dropdown.png` (all themes).
- Quartz white-on-white fixes: card surfaces that used `--bs-secondary-bg`/`--bs-card-bg` (near-white `#e9e9e8` on Quartz) with `--bs-body-color` (white) text were invisible — `pmd-stream-job-card`, `pmd-job-search-card`, `smd-image-card` now use opaque `--bs-body-bg` for their surfaces. Everything built on `--smd-secondary`/`--bs-secondary` (collapsed stream headers, inactive smd-tabs, `.bg-secondary` badges/panels, bootstrap `.btn-secondary` on Quartz) uses `var(--bs-emphasis-color)`/`--sb-` for text, so translucent-white Quartz surfaces get dark readable text. (Add `[data-theme]`-scoped overrides in `css/styles.css` for light-DOM bootstrap bits.). The storybook's own `section.sb-section` cards used `--bs-tertiary-bg` (white on Quartz) with `--sb-fg` (white) headings — now they use `--sb-bg` (page surface). Verified by computed-style probe + 34 regression tests.
- `pmd-stream-header`/`pmd-stream-job-card`/`pmd-job-search-card` got a `key-prefix` attribute (default `planmydays_`) fed to their internal `<smd-image>` — so the app keeps name-based thumbs from `planmydays_images`, while the storybook points them at neutral stores. Storybook pmd sections seed `sbh_`/`sbc_`/`sbj_`/`sbp_` images at TOP-LEVEL (before `renderAll()` builds sections) and pass image NAMES (not data URLs); every storybook `<pmd-*>` element must also carry its `key-prefix` or the `<smd-image>` looks in the (empty) `planmydays_` store. Lesson: seeded stores must exist BEFORE elements with `image=` resolve, and re-setting the SAME attribute doesn't re-render a custom element — so seed early (top-level) rather than relying on attribute re-set to re-resolve.
- Stream accordion headers (`pmd-stream-header` in the streams editor): collapsed headers use secondary (`--smd-secondary` + `--smd-primary-text`), expanded headers use info (`--bs-info` + `--bs-info-text`). Drag-handle now `color: currentColor` so it follows the header colour. NB: contents of `#streamsEditor`/`#streamEditorList` live in the smd-page shadow root — page.evaluate must query `document.getElementById("streamsEditor").shadowRoot`, not light-DOM querySelector (Playwright locators pierce automatically).
- Job tasks tab now has two distinct Add Task buttons: the top `#jobAddTaskBtn` only shows when there are tasks (hidden when the list is empty) and `jobAddTaskTop()` prepends via `unshift`; the bottom `#jobAddTaskBottomBtn` is always visible and appends via `jobAddTask()`. `renderJobTasks()` toggles the top button's `display` by task count (shown when tasks.length >= 1) and is called once from `buildJobEditPage` (edit mode). Tests: single-task flows use the bottom button; the top button is exercised once a task exists (visibility + prepend at index 0).
- Lesson: `showSmdModal` is a single shared `#smdConfirmModal` host — every call re-renders its shadow content, so set `.content`/`.buttons`/`.title` before `show()`. Inline global `onchange="..."` handlers inside the shadow content still fire, but the handler bodies must resolve elements via the shadow root.
- What did not work: `rg` is not available on this machine (use Grep tool instead). Ripgrep via the Grep tool also chokes on very large matched lines (minified vendor files) — limit searches to `js/**` or exclude vendor files.

### 2026-09-22
- `pmd-job-today-card` rework (the today-list tile): now a self-contained Bootstrap-styled widget with its own injected stylesheet.
  - Template: a checkbox column (`justify-content-center`) + content column. Each wrapping row is `d-flex flex-row align-items-center justify-content-between` so the title row sits flush with the rows above/below.
  - Title row: title (`h2.job-title mb-0`) + suffix badge straight after the text with a fixed `ms-2` gap (user preference: badge "straight after the text": `Job Title | gap | badge`). The badge is `<smd-badge class="suffix ms-2" variant="secondary" hidden>` (hidden until a suffix exists; re-check `hidden` when the title changes).
  - Second row wraps thumbs (`d-flex gap-1`) + the View button; a `.job-view-btn` spacer keeps the title row's checkbox column height when there is no image.
  - View button is now an `<smd-button class="job-view-btn" variant="primary" size="small">View</smd-button>` (previously a low-utility `<a class="job-view"?>`); smd-button only forwards variant/disabled (NOT host classes) and clicks bubble — keep styling hooks on the host, assert via `#id button` for disabled state.
  - `smd-button` gained a `size` attribute: `normal` (default) | `small` (adds `btn-sm` to the inner button). Storybook `smd-button` section demos normal + small + disabled. `_applySize()` removes prior size class then adds `btn-sm` only for `small`.
  - The card's old shared-css style block (`--pmd-today-*`) was removed from `PlanMyDay/css/styles.css` (the bus-width class on `#todayCardList` also got the `mb-*` reset removed since cards inject their own margin).
  - Test updates: `pmd-regression` today-card titles select `.title` (now `.job-title`); `pmd-touch`/geometry use `.job-title` bounding boxes.
- Font Size setting = BODY font-size ONLY (`shared/css/styles.css`): classes `font-size-xsmall|small|large|xlarge|jumbo` set `body { font-size: Xrem }`; `normal` removes the class. Type tokens are em-based (`--smd-type-p:1em`, `--smd-type-h2:1.25em`, `--smd-type-h1:2em`, `--smd-type-badge:0.75em`). LIVE FILE VALUES: current classes = 0.6/0.9/1.1/1.2/1.4rem (entry (16) in the log recorded 0.8/0.925/1.125/1.3/1.6 — the FILE is the source of truth; default saved size is `xlarge` = 1.2rem = 19.2px). Exact px don't matter — what matters is that everything scales from the body token.
- Rebuilt `pmd-touch` test 113 to assert SCALING RELATIONSHIPS instead of exact px: xTitle/xBase ≈ 1.25 (h2 em token), jumbo > xlarge (title grew), body grew, compact → cTitle/jBase ≈ 1 and title = 1em. Exact-px asserts broke once the title became an h4/em-based element (was expecting 26/32/25.6 vs actual 24).
- `smd-h1`/`smd-h2` shared components (`shared/js/components/smd-h1.js`, `smd-h2.js`): light-DOM wrappers that render a REAL inner `<h1>`/`<h2>` (heading semantics + theme colour/weight on the inner element preserved). Host owns the em font-size token; shared css adds `smd-h1{display:block;font-size:var(--smd-type-h1,2em)}`, `smd-h2{...var(--smd-type-h2,1.25em)}`, `smd-h1 h1,smd-h2 h2{margin:0;font-size:inherit}`. The descendant selector (0,0,2) beats Bootswatch theme element rules (0,0,1) REGARDLESS of link order — this is why they work even though `applyTheme` re-appends themed `<link>`s AFTER the shared stylesheet. Each has a childList MutationObserver that re-mounts the inner heading when the HOST's `textContent` is replaced wholesale (needed by `pmd-job-today-card._render`, which writes host text after connect); `_mount()` is a no-op if the inner element already exists.
- PlanMyDay uses them: main-view date heading is now `document.createElement("smd-h1")` (class `mb-0`, the old `h1` class dropped), and the today-card title is `<smd-h2 class="job-title">`. The component-injected style keeps `pmd-job-today-card .job-title { font-size: var(--pmd-today-title-size, var(--smd-type-h2, 1.25em)) }` so compact density still pins the title to 1em.
- The 9-test failure saga: after the today-card title became `<h4 class="job-title mb-0">` (user edit), regression selectors `locator("h2")` went stale → first "fixed" to `locator("h4")` (8/9 then green), but touch test 113 then measured the title at ~1.12× instead of 1.25×. Root cause: the `h4` came from the Bootswatch theme's own `calc(...)` rem rule which BEATS `shared/css/styles.css`'s equal-specificity `h4 { font-size: var(--smd-type-h2) }` — theme links load first AND `applyTheme` re-appends them after shared, so the Font Size setting stopped reaching the title. Solution chosen (with the user): the `smd-h1`/`smd-h2` components above. The `<h4>` was then reverted in code and the 11 `locator("h4")` selectors in `tests/pmd-regression.spec.js` reverted back to `locator("h2")` (smd-h2 renders its inner `<h2>`, so tests should target `h2` again). Both new component files are in `PlanMyDay/index.html` (right after the smd-button script tag) and `sw.js` SHARED_ASSETS.
- LESSON: user-edited components can invalidate test selectors + theme overrides mid-session. When a Font Size setting stops applying, check for equal-specificity element/font-size rules vs the em token — give headings component-scoped rules with higher specificity instead of relying on shared-vs-theme link order. Verify both suites: pmd-regression + pmd-touch (the touch suite runs at iphone-12-pro viewport and exercises density/em scaling).

# 2026-09-23 Search Jobs layout fix, Search Jobs menu item, pmd-stream-job-card rename, injectStyleInto fix, stream-card surface unification

- Search Jobs page: the header form in `buildSearchJobsContent()` (`PlanMyDay/js/job-search.js`) used Bootstrap `.row`/`.col` gutters (`ml/mr:-12px`) against the editor page body padding (`16px 20px`), which scrolled the controls past the page edges AND left a ~11px gap under the search box (input 38px in a 50px row). Replaced with `d-flex align-items-stretch gap-2`  `<input class="form-control flex-grow-1">` + `<smd-button class="flex-shrink-0">Clear</smd-button>`  so the input fills the 50px row and nothing overflows. Probe-verified: input x=20..1169, Clear x=1177..1260, both h=50, list starts y=153.078. No gap, no overflow.
- Search Jobs menu item: `PlanMyDay/index.html:56` was `<button class="dropdown-item" onclick="openSearchJobs()">` while its siblings were `<a>`  Bootswatch styles anchors with `.dropdown-item` (14px/21px) but leaves buttons at browser default (17.5px/26.25px), so the item looked oversized. Converted to `<a class="dropdown-item" onclick="openSearchJobs()">`. Menu probe: all 9 items are anchors, 14px/21px. Test selectors updated `button.dropdown-item` ? `a.dropdown-item` for "Search Jobs" in `pmd-regression.spec.js:1176`, `pmd-screenshots.spec.js:458,470`.
- Renamed `pmd-stream-job-card` ? `pmd-job-stream-card` (`PmdStreamJobCard` ? `PmdJobStreamCard`). The old component was still the pre-Bootstrap-utilities light-DOM sheet-driven style; the new one mirrors `pmd-job-search-card` (Bootstrap utilities in the template, `card bg-dark text-white border-0` surface, single injected element stylesheet `pmd-job-stream-card-style`, `smd-h2.job-title`, `smd-image` thumb, `smd-badge` suffix/schedule/time/extra, `smd-checkbox.active-toggle` + `smd-button` Edit). Keeps `_bound && isConnected` render guard, `_adoptSlottedHandle()` (consumer slots `<smd-draghandle class="drag-handle" slot="drag-handle">`), same observedAttributes + `pmd-job-edit`/`pmd-job-toggle-active` events. Touchpoints renamed: `streams-editor.js` (renderJobsInAccordion emits `<pmd-job-stream-card>`), `PlanMyDay/index.html` script include, `sw.js`, `storybook/index.html` (23 refs incl. section ids, CSS selector, seed), `tests/storybook-regression.spec.js:34`, `tests/pmd-regression.spec.js:1361`. Old file `PlanMyDay/js/components/pmd-stream-job-card.js` deleted; old `pmd-stream-job-card` CSS block in `PlanMyDay/css/styles.css` replaced (only `pmd-job-stream-card smd-checkbox.active-toggle { font-weight:700 }` kept  the label-weight rule the regression test `active label is bold on job tiles` asserts).
- `injectStyleInto` was broken for 19 single-arg callers: `injectStyleInto(css)` treated the css as `root` and fell back to `SETTINGS_STYLES` (empty)  nothing was ever injected after light-DOM refactor (regression introduced by `2e729b3` "removed shadow dom in components"). Fixed in `shared/js/smd-app.js`: `if (css === undefined && typeof root === "string") { css = root; }`. The 2-arg call (`smd-settings.js:353`) unaffected. Editors (Search Jobs, Streams, Images) now inject their chrome styles again.
- Stream-card background unification: probe across superhero/quartz/cerulean/flatly/darkly showed stream cards rendered `--bs-dark-border-subtle` (gray, e.g. #b4bcc2 flatly) while today/search cards used `card bg-dark` (`--bs-dark`)  mismatched next to page surfaces. New `pmd-job-stream-card` uses `card bg-dark text-white border-0` like the other job cards. This supersedes the old AGENTS note (85) that said cards use opaque `--bs-body-bg`  the current templates use `bg-dark`.
- Full regression green: pmd-regression 432/432, qrlinks+cmd+solarcontrolar 65/65, storybook 3/3, touch+example+sample-images+launch 10/10, pmd-touch 5/5. Screenshots suites intentionally not run.

## 2026-09-23 — Bootstrap-only application markup, global theme modes, dual-mode screenshot pipeline

### Application CSS removal and ownership

- The six standalone application stylesheets are deleted: `PlanMyDay/css/styles.css`, `CountMyDays/css/styles.css`, `QRLinks/css/styles.css`, `SolarControlar/css/styles.css`, `Launch/css/styles.css`, and `FreeFormOX/css/styles.css`. Their `<link>` tags and `sw.js` precache entries are removed. `shared/css/styles.css` remains the shared shell/component stylesheet; Bootswatch and vendor CSS remain external dependencies.
- Application markup now puts Bootstrap utilities directly on static HTML, component templates, and dynamically generated DOM: `d-flex`, `d-grid`, `row`/`col-*`, `gap-*`, `p-*`, `m-*`, `d-none`, `flex-grow-1`, `text-truncate`, `card`, `form-control`, `form-select`, `btn`, `alert`, `table`, and responsive row/column classes. Static inline `display`, flex, width, and spacing declarations were replaced with utilities where Bootstrap has a direct equivalent; runtime-computed geometry remains inline.
- Custom elements used as block cards receive `d-block` on the HOST in app markup and Storybook demos (`pmd-job-today-card`, `pmd-job-search-card`, `pmd-job-stream-card`, `cmd-countdown-card`, `cmd-date-card`, `cmd-category-card`, `qrlink-card`). Do not rely on an app stylesheet to make an unknown custom element block-level.
- Theme-aware cards use semantic theme surfaces rather than permanently dark `bg-dark text-white`: CountMyDays cards are `card border-0 w-100` with an inner `border rounded-3` row (host spacing `d-block mb-2`), matching PlanMyDay's `card smd-card border-0 w-100` + inner `border rounded-3`. The old `card bg-body-tertiary text-body border-0` surface is retired. QRLinks `qrlink-card` now follows the same pattern (`card smd-card border-0 w-100` + inner `d-flex align-items-center gap-3 p-2 border rounded-3`, title `<smd-h2 class="title fw-bold mb-0">`, description `small text-body`); the old permanently dark `card bg-dark text-white border-0` link card is retired too.
- Remaining application-specific CSS is minimal and local to the behavior that owns it. Examples: PMD done/swipe/title/compact state, stream accordion expansion, FreeFormOX board geometry and game states, Solar split-flap/battery animation/output geometry, and empty-image placeholders. Do not recreate `.form-control`, `.row`, `.col-*`, `.d-flex`, `.gap-*`, `.btn-*`, dropdown, or input-group CSS in light DOM—Bootstrap already owns those.
- The app `editor-styles.js` files were pruned from large Bootstrap recreations to the few true editor exceptions. The pages/components are light DOM, so those old “shadow-root CSS” rules were both obsolete and the source of broad regressions. `injectStyleInto` remains available for the small remaining style blocks.
- Use Bootstrap flex markup and spacing classes instead of CSS where possible: prefer `d-flex`, `flex-row`/`flex-column`, `align-items-*`, `justify-content-*`, `flex-grow-1`, `flex-fill`, and `gap-*`/`p-*`/`m-*` directly on static HTML, templates, and generated DOM. Do NOT add `display`, `flex-direction`, `gap`, or alignment rules to `shared/css/styles.css` for something Bootstrap utilities already cover; keep layout out of the shared stylesheet and reserve raw CSS for host-level display and behavior-specific exceptions. Watch that Bootswatch's `.card` defaults to `flex-direction: column`, so row-layout cards use `d-flex flex-row`.

### Light-DOM component rules learned

- A component that clones its template in `connectedCallback` MUST gate attribute renders with `if (this._bound && this.isConnected)`. `isConnected` alone is insufficient while Chromium is parsing/upgrading an already-connected custom element; Storybook's `host.innerHTML` is the regression trigger.
- `<smd-button>` renders a real inner `<button>` and captures authored text once. Use `variant="primary|danger|..."` and `size="small"`; do not put `btn-sm` on the host expecting it to forward. Clicks bubble from the inner button to the host. Accessible button names should be visible text where practical; `title` is supplementary, not a replacement for the accessible label.
- `<smd-badge>` is the shared themed badge. Prefer it over app-created `.event-badge` colour rules while retaining stable class hooks such as `.event-badge-google` for tests.
- Custom cards must preserve observable contracts even when markup changes: PMD `.job-title`, `.active-toggle`, drag handles and `pmd-job-edit`/`pmd-job-toggle-active`; CountMyDays `.title`, `.meta`, `.event-badge-*`, Edit/Delete names, image dropdown hooks; Storybook counts for every component demo.
- CountMyDays no longer overloads the native `hidden` attribute to mean “hidden Google event.” It uses `data-google-hidden="true"`; the row remains visible and shows a Hidden badge. Native `hidden` still means actual UI hiding.

### `injectStyleInto` regression and CountMyDays editor failure

- `injectStyleInto(css)` was broken after the light-DOM refactor: the CSS string was interpreted as the `root` argument and the function fell back to the empty `SETTINGS_STYLES`, so 19 single-argument callers injected nothing. The compatibility fix in `shared/js/smd-app.js` is `if (css === undefined && typeof root === "string") { css = root; }`; the two-argument caller remains valid.
- During the CSS migration, emptying `CountMyDays/js/editor-styles.js` and removing `injectEditorStyles(page)` caused 18 unrelated editor/wizard/Google tests to fail: `injectEditorStyles` was undefined, every editor action threw, and downstream Add Date/Edit/Import flows silently failed. Root cause was an accidental broad deletion, not selector drift. Lesson: prune editor CSS, but preserve the injection function and every app-specific state rule before running a broad migration.
- Button selector failures after replacing native `<button>` with `<smd-button>` can look like unrelated editor failures. Verify the actual accessible name and event target before changing test selectors.

### Touch regressions

- The iPhone expanded-stream drag test failed because `touchDrag` measured the last item before pointerdown, while Sortable intentionally collapses the open stream in `onStart`; the target moved before the drag moved. The helper now accepts a target locator/function and remeasures after pointerdown. The product behaviour remains: collapse all streams during drag, then restore the captured expanded stream after reorder.
- Removing the PlanMyDay app stylesheet initially removed the compact density variables. Compact title sizing now belongs to the injected `pmd-job-today-card` CSS (`body.compact` sets the component title token to `--smd-type-p`). Do not restore a PlanMyDay app stylesheet just for this hook.
- `pmd-touch` 5/5 is the minimum verification for drag handles, expanded-state restoration, font scaling, task reordering, and swipe behaviour.

### Shared global Light/Dark theme mode (no per-theme default; Default removed 2026-09-26)

- `shared/js/smd-settings.js` is the single theme engine. `themeConfig[theme]` carries ONLY `css`; there is NO `defaultMode`/`bsTheme`. `smdKey("themeMode")` stores ONE GLOBAL mode per app: `light` or `dark` (the old `default` value and any invalid value normalize to `light` — there is no per-theme fallback). The six keys are `planmydays_themeMode`, `countmydays_themeMode`, `qrlinks_themeMode`, `ffox_themeMode`, `launch_themeMode`, and `solarcontrolar_themeMode`.
- `data-theme` is the normalized Bootswatch slug; `data-bs-theme` is the explicit `light|dark` mode and remains authoritative for Bootstrap variables, native controls, Flatpickr, and `<smd-image theme="auto">`. Invalid stored themes normalize to `superhero`.
- Override stylesheet order is guaranteed: Bootswatch base -> shared/app CSS -> shared MODE layer `shared/css/themes/<mode>.css` (the `#theme-override-mode` link) -> per-theme+mode `<theme>.<mode>.css` (the `#theme-override-specific` link). Both are re-pointed by `applyThemeOverrides()`; a theme swap re-points only the specific one, a mode swap re-points both. Mode-only switches do not reload the base theme or call `renderMain()`/network refresh for the APP assets; they update `data-bs-theme` and mode-dependent images in place. (The `light.css`/`dark.css` mode files were REMOVED on 2026-09-26 and RE-ADDED, empty, on 2026-09-30 — see that session's log entry.)
- `<smd-theme>` renders TWO labelled fields with stable hooks: `.smd-theme-select` (label "Theme") and `.smd-theme-mode-select` (label "Theme Mode", options Light/Dark). Theme options show the bare title (e.g. "Superhero"), never "Superhero (dark)". It dispatches `smd-theme-change` with `{ theme, mode, source }`, where source is `theme` or `mode`. Tests must target the stable classes.
- Storybook uses its own `storybook_theme` / `storybook_themeMode`, preserves the app's PlanMyDay keys around every apply, and exposes the same `<smd-theme>` control in its header. Seeded image stores must exist before elements carrying `image=` are upgraded.
- Mode-only changes must not trigger `renderMain()`, especially in SolarControlar where that performs a server fetch. Theme changes may rerender as before.

### Component/application refactors

- `pmd-stream-job-card` was renamed to `pmd-job-stream-card` (`PmdJobStreamCard`). All app, Storybook, service-worker, CSS, and test references changed together. Its light-DOM handle adoption and `_bound` guard are required for Sortable and Storybook upgrades.
- CountMyDays date/category/countdown cards now use Bootstrap cards/flex and shared controls. Date/category action buttons remain named Edit and Delete; Date and Google flows continue through the same delegated events.
- FreeFormOX state no longer depends on exact `className` strings. Each board cell has `data-state`; Bootstrap state classes and utility classes can be changed without breaking move/winner detection. Only viewport/aspect-ratio and non-Bootstrap game visuals remain in the injected `ffox-game-styles` block.
- SolarControlar flash/status messages use Bootstrap alerts/badges. Split-flap, battery, pulse, and no-data visuals moved into `solar-top-tiles`; output monospace/overflow geometry remains where the output is created. Removing its app stylesheet exposed that the shared Buy Me A Coffee image had no intrinsic dimensions while loading; `smd-buymeacoffee` now sets its 545×153 aspect-ratio dimensions plus `d-block`.
- Launch uses a responsive Bootstrap row/column grid and `card bg-body-tertiary text-body` tiles. Screenshot/cross-app tests confirmed the PlanMyDay Launch link remains visible.
- Static hamburger font size remains a documented shared exception; it is not an application stylesheet concern.

### Screenshots: generation source versus output directory

- `screenshots/` is OUTPUT ONLY (and ignored by Git). The source of screenshot generation is `tests/<app>-screenshots.spec.js`; do not add generation logic or product UI to the output directory. The viewer and generated PNGs live under `screenshots/`, but scene setup/capture belongs in the tests.
- All five existing screenshot suites (`pmd`, `cmd`, `qrlinks`, `ffox`, `launch`) now import `tests/screenshot-helpers.js`. The helper reads the live 26-theme `themeConfig`, iterates explicit modes `light` then `dark`, calls `applyTheme(theme, mode)`, emulates the requested media colour scheme, waits for all three stylesheet links, fonts, visible image decode, and two animation frames, and preserves app-specific `afterTheme` refresh callbacks.
- Chosen output structure: `screenshots/<app>/<theme>/<light|dark>/<scene>.png`. There is no `default` output directory for generated images. Scene filenames remain stable. The full matrix is 26 themes × 2 modes × 56 existing scene names = 2,912 gallery images, plus the separate root `sample-images.png` gallery.
- Screenshot generation ran with `--workers 16`: all 53 screenshot tests passed. Output audit found 2,912 files: pmd 1,872 (936 light + 936 dark), cmd 364, qrlinks 260, ffox 260, launch 156; every app had 26 themes and zero legacy direct PNGs. ALWAYS generate screenshots with `--workers 16`; this is the documented standard for every `tests/*-screenshots.spec.js` command.
- SCREENSHOT GALLERY COVERAGE (2026-10-18): only SIX suites exist - `cmd`, `ffox`,
  `launch`, `lol`, `pmd`, `qrlinks`. **SolarControlar, PhoneButtons and the
  storybook have NO gallery** (user: "we haven't written screenshots for the other
  apps yet"). The Screenshots command in `commands.md` lists exactly those six, in
  alphabetical order; when an app gains a `<app>-screenshots.spec.js`, add it there
  in alphabetical position (`screenshots/viewer.js` picks the new gallery up with no
  code change). A `*`-GLOB DOES NOT WORK for that command on Windows: neither
  cmd.exe nor PowerShell expands it and Playwright does not glob CLI paths, so
  `test tests/*-screenshots.spec.js` collects 0 tests (verified) - keep the
  explicit list.
- `screenshots/viewer.js` supports the nested mode layout and legacy direct `<app>/<theme>/<scene>.png` files (shown as synthetic `Default`). The API shape is `theme -> modes[] -> { name, path, images }`. The UI has separate App, Theme, and Mode selectors; section identity is composite app/theme/mode so open state and drag ordering cannot collide. Selections persist under `screenshotViewerGallery`, `screenshotViewerTheme`, and `screenshotViewerMode`.
- The viewer is covered by `tests/screenshot-viewer.spec.js` with a temporary synthetic tree; it verifies nested mode scans, legacy fallback, deep image serving, app/theme/mode filtering, persisted choices, and composite open-state. `createServer()` is exported behind a `require.main === module` guard so tests can use an ephemeral port.

### Verification state for this session

- Syntax checks passed for all changed JavaScript files; `git diff --check` passed.
- Targeted/full non-PlanMyDay verification completed: CountMyDays 45/45, Launch 6/6, FreeFormOX 11/11, Storybook 7/7 (including Superhero dark blue), pmd-touch 5/5. QRLinks and SolarControlar passed within the combined 38-test run; its only initial failure was the Buy Me A Coffee image and was fixed/retested.
- Final workers=16 verification: the complete 522-test non-screenshot regression set reached 519 passed / 3 failed. All three were infrastructure/concurrency flakes, not theme failures: two CountMyDays QR canvas/image render waits under load and one transient `page.reload(): net::ERR_CONNECTION_REFUSED`. Both local servers answered 200 immediately afterward, and the same three tests passed 3/3 on an isolated workers=16 rerun. The final theme-colour tests assert raw Bootswatch button/badge/tab colours without runtime contrast correction.

### Final theme decision — Bootswatch colours are authoritative (2026-09-23)

- This supersedes the earlier `applySmdVars()` / `smd-contrast.js` / centralized-WCAG-colour notes in this history. The runtime contrast layer has been removed permanently: `shared/js/smd-contrast.js` is deleted; `smd-settings.js` no longer creates hidden body probes, no longer publishes generated `--smd-*-text`/`--smd-on-*` variables, and no longer recomputes colours on stylesheet load.
- Shared CSS no longer overrides Bootstrap button, badge, tab, page-header, or modal-header colours with generated contrast values. Those components now consume the colours and Bootstrap variables supplied directly by the selected Bootswatch stylesheet. Structural layout, sizing, borders, typography, and component behaviour remain shared CSS; colour selection does not.
- KEEP the theme engine: `themeConfig`, app-namespaced `theme` + global `themeMode`, `applyTheme()`, `applyThemeMode()`, `data-theme`, `data-bs-theme`, base/shared/specific stylesheet order, `<smd-theme>`, Storybook theme/mode controls, and SVG image auto-mode all remain. Users can swap all 27 themes and choose Light/Dark (Default removed 2026-09-26; see the theme-mode note above).
- Per-theme `shared/css/themes/<theme>/<theme>.<mode>.css` files are the only permitted colour exceptions (`light.css`/`dark.css` at the `themes/` root were deleted 2026-09-26). Superhero's specific file keeps its dark-blue `#0f2537` body at its base palette.
- The PlanMyDay theme test group is now named `Theme colours`. It verifies native button/badge/tab computed colours against fresh Bootswatch elements in Cerulean/Darkly/etc. It does not assert generated WCAG substitutions. Do not reintroduce hidden probes or runtime palette mutation without a new explicit user decision.
- Screenshot generation still calls `applyTheme(theme, mode)` and therefore captures the actual Bootswatch light/dark result after contrast removal.

### Test policy learned in this session

- Use `--workers 16` for screenshot generation and broad regression runs.
- For broad runs, classify failures before changing product code: missing resources/404s, `ERR_CONNECTION_REFUSED`, browser/server crashes, and transient canvas/image waits are infrastructure/concurrency failures. Re-run the exact failed tests with the same worker setting; only persistent failures count as regressions.
- In the final workers=16 run, two QR-render waits and one connection refusal passed immediately on isolated rerun with both servers confirmed healthy. This is the expected handling for transient infra failures.

### Storybook theme selector parity (2026-09-24)

- The user requested a Storybook-only selector fix; do not change the main apps or shared selector component for this issue.
- `storybook/index.html` now uses the same `<smd-theme>` custom element as the main app instead of maintaining custom theme/mode `<select>` elements. It listens for `smd-theme-change`, applies the selected theme through `applyTheme()`, re-renders demos on theme changes, and mirrors theme/mode changes into the component demo.
- Storybook continues to persist only `storybook_theme` and `storybook_themeMode`. The existing `planmydays_theme` and `planmydays_themeMode` values are captured before applying Storybook preferences and restored after every call, because `applyTheme()` otherwise writes the app-namespaced theme key.
- Keep the Storybook-only Superhero body rule (`html[data-theme="superhero"] body { background-color: #0f2537; }`) because Storybook's regression contract requires the dark-blue surface even in forced Light mode.
- Regression selectors use `#storybookThemeSelector .smd-theme-select` and `#storybookThemeSelector .smd-theme-mode-select`; the old `#themeSelect` / `#modeSelect` IDs must not return. `tests/storybook-regression.spec.js` passes 7/7 with `--workers 16`.

### Storybook all-theme card viewer (2026-09-24)

- `storybook/cardViewer.html` is a standalone comparison tool linked from the Storybook header. The top Card dropdown selects one of eight real card components: Today, Job Stream, Job Search, Countdown, Date, Category, QR Link, and Image. Selection persists under `cardViewerCard`.
- The top Theme dropdown offers `All themes` plus each of the 26 Bootswatch names and persists under `cardViewerTheme`. `All themes` renders 26 rows/52 iframes; one named theme renders one row/two iframes. Both views always place explicit Light then Dark across the row.
- Frames are required because Bootstrap/Bootswatch theme CSS and `data-bs-theme` are document-global; changing one frame cannot theme another frame.
- Each frame writes `data-theme="<bootswatch>"`, `data-bs-theme="light|dark"`, and loads base theme -> mode override -> theme-specific override -> shared CSS. Its base stylesheet uses `id="bootstrap-theme-css"` so shared components can derive the correct shared root through `smdAppRoot()`.
- Frames seed/read only the `cardviewer_images` image namespace. They load `smd-app.js`, `build-number.js`, `smd-settings.js`, the selected card and its nested-component dependencies. Do not call global `applyTheme()` inside frames because that would mutate app-namespaced storage and the whole document at once.
- Iframes are lazy-loaded and auto-fit their height after rendering. A card/theme change replaces the currently selected 2 or 52 frames; frame load is not intended to mutate the main Storybook theme. Rapid replacement can intentionally abort in-flight shared font requests, so regression checks ignore only `net::ERR_ABORTED` for `/shared/vendor/fonts/` while retaining all other request failures.
- The Superhero experiment now lives in `shared/css/themes/superhero/superhero.css`: `.smd-card` text is green for forced Light and red for forced Dark. This supersedes the earlier Storybook-only Superhero body-background experiment; keep this only while it serves as the requested proof of theme- and mode-specific CSS.
- Verification: `tests/storybook-regression.spec.js` passes 8/8 with `--workers 16`; the card-viewer test verifies All/single-theme filtering and persistence, 26/52 versus 1/2 dimensions, all eight card recipes, and zero unexpected console/page/request failures. Color-specific assertions are intentionally outside the functional-only shared CSS contract.

### HTML size-state attributes (2026-09-24)

- Shared appearance settings mirror their current values onto one root element using the namespaced contract: `html[data-smd-font-size]`, `html[data-smd-icon-size]`, `html[data-smd-touch-size]`, and `html[data-smd-tile-density]`. `changeFontSize()`, `changeIconSize()`, `changeTouchSize()`, and `changeDensity()` update these attributes immediately after persisting the app-namespaced value.
- The shared `DOMContentLoaded` initializer writes the same attributes from stored values before applying the existing body classes. Defaults are Font `xlarge`, Icon `medium`, Touch `normal`, and Tile Density `normal`.
- Body classes remain the implementation mechanism for CSS and component behaviour; the root data attributes are the inspectable/selectable state mirror and must not be used to duplicate appearance CSS rules.
- PlanMyDay Settings regressions assert startup defaults plus live changes for all four root attributes. The Settings-focused run passes 40/40 with `--workers 16`.

### Functional-only shared CSS and shell state (2026-09-24)

- `shared/css/styles.css` is mechanics-first but retains intentional shared component chrome needed for usability and theme fidelity. It includes state selectors, touch/scroll behavior, smd-page slide transforms/transitions, modal open/close positioning and restored modal chrome, page header surface, tab panel visibility, the wrapping image-picker grid, and the Streams Editor header/toggle. Bootstrap/Bootswatch and app-specific CSS own remaining appearance.
- Do not reintroduce the removed runtime contrast/palette layer or a global font-size ramp without an explicit request. Intentional component skins belong in the shared stylesheet only when they are required for a component to be usable across apps; app-specific exceptions belong in app CSS.
- The PlanMyDay custom pull-to-refresh script is no longer loaded or precached. Service-worker `waiting`/`updatefound` events use the existing shared `smd-modal` update prompt instead; do not recreate the top pull indicator.
- `smd-app.js` observes `smd-page[open]` state and hides `#btnMainMenu` only while a secondary page is open, restoring it when the page closes. The observer must only write when the boolean changes to avoid a self-triggering MutationObserver loop.
- Verification: the full non-screenshot regression set passed **532/532** with `--workers 16`; PlanMyDay passed 432/432, touch passed 5/5, and no infrastructure failures occurred. Visual-only assertions affected by the functional CSS cleanup were removed or rewritten to state/behavior checks.

### 2026-09-25 - Shared light-DOM styling and page-stack recovery

- Every app and Storybook entry body now has `id="smd-app"`. Shared component selectors that must beat Bootswatch use that ID scope, for example `#smd-app smd-tabs .smd-tab-btn`; do not rely on a low-specificity `.nav-link` rule because theme CSS can win the cascade.
- The current tab contract is Bootstrap-native except that `smd-tabs` renders NO `.tab-content` wrapper (removed 2026-10-15 - some themes gave it unwanted padding/margins/borders): it renders `.nav.nav-tabs`, `.nav-link`, the `.smd-tab-line`, and the `.tab-pane.smd-tab-panel` panels as DIRECT children of the host, and synchronizes `.active`, `aria-selected`, `tabindex`, and the `hidden` attribute. Panel show/hide is the component's own `smd-tabs .smd-tab-panel { display:none }` / `.active { display:block }` (Bootstrap's `.tab-content > .tab-pane` no longer applies, and Bootstrap's tab JS does NOT reference `.tab-content`). Use the same `.tabs = [...]`/`activeIndex` API as the Storybook demo; query/serve panels with `.smd-tab-panel.active`, never `.tab-content > .smd-tab-panel`.
- `smd-modal` light-DOM chrome was recovered from the deployed `https://ownimage.github.io/MyApps/shared/css/styles.css` stylesheet. The dialog uses `--bs-body-bg`/`--bs-body-color`/`--bs-border-color`, the overlay dims the page, and header/body/footer padding, borders, radius, and shadow are intentional shared styles. Keep the deployed block as the reference when the local functional CSS cleanup removes component chrome.
- `smd-page` does not automatically hide a previously open page. App-specific code must capture and restore the underlying page: `PlanMyDay/js/job-editor.js` uses `_jobEditReturnView` plus `hideJobEditBackground()`/`restoreJobEditBackground()`; `PlanMyDay/js/image-picker.js` uses `pickerBackground` to hide every open `smd-page` and `#countdownContainer` before showing `imagePickerPage`, then restores them on every close path (cancel, No Image, and selection). Preserve the `d-none`/slide timing contract.
- `activeEditorView()` treats the `d-none` state of `#streamsEditor` and `#jobSearchEditor` as the source of truth for the return view. Do not hide an editor page without storing its prior state, or Done/Cancel will render the wrong view.
- The shared image picker needs a real wrapping layout: `smd-image-picker .grid` is `display:flex; flex-wrap:wrap` with `gap`, and `.item` has a minimum tile width. Without those rules the `.grid` and `.item` divs stack vertically. Restore the shared picker grid styles when changing the functional CSS sheet.
- The Streams Editor header is scoped to `#smd-app #streamsEditor pmd-stream-header`: expanded uses `--bs-primary`, collapsed uses `--bs-info`, and the chevron is a visible sized button with a rotating `::after` arrow. Verify both states in the browser.
- `pmd-job-today-card` receives `description` in `main-view.js` and renders it in `.description`; the earlier invisible-text report was a contrast problem, not missing data. `text-secondary` can be nearly the same luminance as a dark themed card, so the card uses `text-body` for readable theme text. Check computed color and bounding boxes before changing data plumbing.
- `smd-page` headers now use a distinct theme surface (`--bs-secondary-bg` with a `--bs-border-color` separator). Keep page background/header/footer colors theme-driven; do not hardcode a single dark or light value.
- Browser-only verification pattern for this session: seed localStorage, call the app render function, inspect `getComputedStyle`/bounding rectangles, and wait for CSS transitions before judging colors. `node --check` and `git diff --check` are the lightweight syntax/whitespace checks; the user asked not to run the Playwright suite during the visual iteration.
- What worked: `node --check` on edited JS, `git diff --check`, and manual browser probes for the page stack, tab state, modal surface, picker wrapping, and card description. What did not work: reading only the DOM text for visual issues; the description existed but its computed color was unreadable, and a screenshot was needed to distinguish that from a layout bug.

### Authoritative CSS cascade and page-stack contract (2026-09-25)

- Required stylesheet order for every app shell: vendor product styles first (including `shared/css/vendor-overrides.css` immediately after the vendor sheet it repaints, e.g. flatpickr), then `shared/css/themes/<theme>/bootstrap.min.css`, then `shared/css/styles.css`, then the shared mode layer `shared/css/themes/<mode>.css`, then the per-theme+mode override `shared/css/themes/<theme>/<theme>.<mode>.css`, and finally any app-owned sheet (e.g. `PlanMyDay/css/gantt.css`). This note is the authoritative cascade order and supersedes older notes that described the mode/specific sheets before shared CSS. See the 2026-10-03 session note.
- The two overrides are the final layers. Keep the four theme link ids (`bootstrap-theme-css`, `smd-shared-css`, `theme-override-mode`, `theme-override-specific`) and preserve this order when changing index pages or dynamic theme loading. The `theme-override-mode` link and `light.css`/`dark.css` were removed 2026-09-26 and re-added 2026-09-30.
- GOTCHA (fixed 2026-09-25, do not reintroduce): `applyTheme()` re-points the override sheet at runtime, and the old `orderThemeOverrideLinks()` anchored it on `#bootstrap-theme-css`. Because the shared sheet sits AFTER the base link in the correct order, that anchored it BEFORE it and pushed `shared/css/styles.css` to the end of `<head>` — so the theme was no longer the last cascade layer. The overrides are now anchored on the shared sheet: `themeOverrideAnchor()` returns `#smd-shared-css` (falling back to an href match for `shared/css/styles.css`, then the base link), and `setOverrideLink()`/`orderThemeOverrideLinks()` insert `theme-override-mode` then `theme-override-specific` immediately after it, in that order. Every shell carries `id="smd-shared-css"` on its shared stylesheet link.
- This order is ENFORCED in every static shell (`index.html`, `PlanMyDay/index.html`, `CountMyDays/index.html`, `QRLinks/index.html`, `SolarControlar/index.html`, `FreeFormOX/index.html`, `storybook/index.html`, `storybook/cardViewer.html` including its iframe `frameDocument()`), and locked in by the "app shells load stylesheets in the documented cascade order" test in `tests/launch-regression.spec.js`, the frame check in `tests/storybook-regression.spec.js`, and the runtime order assertions in the Storybook theme-swap test. Keep new shells and the card viewer generator in the same order.
- WHY the override file wins without qualification: `shared/css/styles.css` declares its defaults in a bare `:root` (specificity 0,1,0), and so may the per-theme file. Being the LAST stylesheet, the per-theme `:root` beats it by document order. Since the 2026-09-27 split the mode lives in the FILE NAME, so mode variants are separate `<theme>.light.css` / `<theme>.dark.css` sheets rather than `[data-bs-theme="light|dark"]` rules inside one file. This was the 2026-09-26 fix for `superhero.css` overrides not applying (verified live: header = `--bs-black` light / `--bs-dark` dark, tabs = `--bs-secondary`; the old failure came from the override links loading BEFORE `styles.css`).
- `smd-page` shows a single active overlay without destroying background state. `show()` adds `smd-page-suspended` to every other open `smd-page` (they keep `open`, so app state is preserved) and cancels stale `requestAnimationFrame` opens; `hide()` invalidates pending opens and unsuspends the pages it was covering. `smd-page-suspended` is `display: none !important` in `shared/css/styles.css`, so a suspended page is invisible but alive. `SmdApp.openPage()` must NOT call `closePages()`; opening B over A must leave A with `open` plus `smd-page-suspended`, and closing B must reveal A again. App code that hides pages itself (`PlanMyDay/js/job-editor.js`, `PlanMyDay/js/image-picker.js`, QRLinks picker) still works because it owns its own `d-none`/background restore timing.
- Nested pages must chain: A opens B, B opens C; closing C restores B, closing B restores A. `restoreSmdPageBackgrounds()` only unsuspends the pages recorded on the closing page's `__smdBackgroundPages`, so do not blanket-unsuspend everything in `hide()`.
- The menu observer in `smd-app.js` continues to hide `#btnMainMenu` while any `smd-page[open]` is active. Keep the observer write conditional to avoid a MutationObserver feedback loop.
- Verification for the page-stack change is `tests/pmd-regression.spec.js` plus the workers=16 non-screenshot suite; distinguish infrastructure failures from product failures before changing behavior.

### 2026-09-26 - Themes have NO default colour mode; light.css/dark.css removed; smd-page opaque surface

- `shared/js/smd-settings.js`: `themeConfig` entries now carry ONLY `css` (no `defaultMode`/`bsTheme`). `SMD_THEME_MODES` and `getThemeDefaultMode()` are gone; `normalizeThemeMode(mode)` returns `"dark"` only for `"dark"`, else `"light"` (old `"default"` and any invalid value normalize to `light`). `resolveThemeMode(theme, mode)` is now just `normalizeThemeMode(mode)` (signature kept for the storybook caller). `applyTheme(name, modeOverride)` sets `data-bs-theme` directly from the resolved mode; `applyThemeMode(theme, mode)` only sets `data-theme`/`data-bs-theme`.
- Removed the mode override sheet: `applyThemeOverrides(theme, prefix, v)` now manages ONLY `#theme-override-specific`; `orderThemeOverrideLinks()` only orders that one link after `#smd-shared-css`. DELETED `shared/css/themes/light.css` and `dark.css`, removed the `#theme-override-mode` link from all 7 shells + `storybook/cardViewer.html`, and removed both entries from `sw.js` SHARED_ASSETS. `storybook/cardViewer.html` frame generator no longer loads a mode css and no longer prints a "Default: <mode>" label.
- `shared/js/components/smd-theme.js`: theme options are bare titles (`Superhero`, not `Superhero (dark)`); mode options are `Light`/`Dark` only; the component now renders TWO labelled Bootstrap rows - `Theme` + `.smd-theme-select`, and `Theme Mode` + `.smd-theme-mode-select`. App settings pages replace their old "Theme" row with `<smd-theme id="themeSelector" class="col-md-8 mt-3">` (all 6 apps). The storybook header drops its external `<label>Theme</label>` and now shows the component inline (CSS in `storybook/index.html` flexes `.smd-theme-field`); its static `<html data-bs-theme>` is now `light`.
- Verified: `node --check` on all edited JS; storybook 8/8; pmd-regression 436/436; launch/ffox/cmd/qrlinks/solar/storybook/sample-images/pmd-example/pmd-touch combined 101/101; `pmd-screenshots.spec.js` with `SCREENSHOT_THEME=superhero` 33/33. Tests updated: removed `"Default"` from mode option lists (cmd/ffox/launch/qrlinks/storybook), discarded `themeConfig.superhero.defaultMode`, changed the cascade rank helpers + `screenshot-helpers.js` STYLESHEET_IDS to drop the mode sheet, and the pmd "current app theme selects active override" test now uses explicit `applyTheme("darkly", "dark")` (a dark theme no longer implies dark mode).
- BUG FIX (reported after the theme change): the Launch settings page let the app grid show through. Root cause was the 2026-09-25 functional-CSS cleanup dropping `background: var(--bs-body-bg)` from `smd-page .smd-page`, leaving the full-screen page surface transparent; apps that explicitly hide their main content (PlanMyDay etc.) masked it, but Launch does not. Restored `background-color: var(--bs-body-bg)` on `smd-page .smd-page` in `shared/css/styles.css` and added a launch-regression assertion that the settings `.smd-page` surface is opaque.
- `BUILD_NUMBER`: working tree was already at `202609260716` (build-number.js + sw.js agree); left as-is. The user ships.
- CountMyDays card parity (applied before this note): `cmd-countdown-card`/`cmd-date-card`/`cmd-category-card` templates changed from `card bg-body-tertiary text-body border-0 px-3 py-2|p-3` to `card border-0 w-100` with the existing content row gaining `border rounded-3`. Host spacing `d-block mb-3` -> `d-block mb-2` in `main-view.js`, `dates-editor.js`, `categories-editor.js`, and `googleCalendarEditor.js`. Bootstrap classes only; no new shared CSS.
- Edit Dates search row now stays on one line: `CountMyDays/js/dates-editor.js` dropped `flex-wrap` from the search row and added `flex-shrink-0` to the Clear button (`.form-control` is `width:100%`, so its flex basis filled the row and wrapped the button). No inline/CSS change.
- Shared `<smd-image-dropdown>` styling (2026-09-26; supersedes the earlier utility-class version): the trigger no longer carries `btn-outline-secondary bg-body-tertiary` and the menu no longer carries `bg-body border` — both are skinned from a `--smd-dropdown-*` palette declared at the top of `shared/css/styles.css` (`--smd-dropdown-{background,foreground,border-color,hover-background,hover-foreground,disabled-background,disabled-foreground,menu-background,menu-foreground,menu-border-color,item-hover-background,item-hover-foreground,item-active-background,item-active-foreground}`). Defaults reproduce the old Bootstrap-utility look for every theme; a theme reskins the dropdown by overriding the palette in its own stylesheet (`shared/css/themes/<theme>/<theme>.<mode>.css`). Superhero overrides it to match its themed form fields (`--smd-form-*`) with a `--bs-primary` hover/active. The trigger/menu keep their structural classes (`btn`, `gap-2`, `list-unstyled`, `rounded`, `shadow-sm`, `mb-0`) and ids (`smdImageDropdownBtn`/`smdImageDropdownMenu`); `list-unstyled`+`mb-0` kill the Reboot `ul` markers/padding/margin, and each `.item` row keeps `gap-2` (0.5rem image/name gap). Do NOT add Bootstrap's `dropdown-menu` class to the menu - it sets `display:none` and would break the component's `hidden`-attribute toggling. Applies to CountMyDays `#dateCategoryFilter`/`#dateCategorySelect` and PlanMyDay `#jobStreamDropdown`; no test asserted the old class strings.
- FLAKY TEST FIX (2026-09-26): `pmd-regression.spec.js` "applies light and dark svg theme overrides..." was flaky under load. `applyTheme("flatly")` swaps `#theme-override-specific` asynchronously, and the default `superhero.css` pins `--smd-image-theme: dark`. Until flatly's override replaces it, BOTH `<smd-image>` and `getThemedImageDataUrl()` resolve `dark`, so the light pass renders/compares `#ffffff` and fails. The test now sets `data-bs-theme`, then `await page.waitForFunction((want) => getThemeKey() === want, theme, ...)` BEFORE creating the element, plus `test.setTimeout(30000)`. When a theme-dependent assertion is flaky, wait on the app's own resolver (`getThemeKey`) rather than the raw `<link>` load.
- NEW SHARED COMPONENT `shared/js/components/smd-search.js` (`<smd-search>`): the one-line search input + Clear button. Light DOM, template cloned in `connectedCallback` via `_build()`; the host is made `display:block` in `shared/css/styles.css` (`smd-search`), layout is the inner `d-flex gap-2 align-items-center` row. Clear button defaults to `btn btn-danger btn-sm` (user chose danger red), overridable via `variant`/`size`. Attributes: `placeholder`, `value`, `input-id`, `button-id`, `clear-label`, `variant`, `size`, `disabled`. Events bubble+compose: `smd-search-input` ({ value }) per keystroke, `smd-search-clear` ({ value: "" }) on Clear. IMPORTANT: it sets NO default ids (only `input-id`/`button-id` when given) so multiple instances across the always-in-DOM editor pages cannot collide; callers that keep `$id(...)` lookups pass `input-id`, and test-referenced clears pass `button-id` (`#btnJobSearchClear`, `#btnImageFilterClear`). Registered in the root/CountMyDays/PlanMyDay/QRLinks shells, `storybook/index.html`, and `sw.js` SHARED_ASSETS.
- Replaced every hand-rolled search+Clear row with `<smd-search>`: CountMyDays `categories-editor.js`/`dates-editor.js`/`googleCalendarEditor.js`, PlanMyDay `job-search.js`, shared `smd-images.js` (Edit Images + `openImagePicker`) and `smd-image-picker.js`. Bindings are event-delegated on the persistent page/host (guards like `page.__jobSearchBound`, `page.__imageSearchBound`, `page.__pickerBound`) so a content rebuild does not need rebinding. The CountMyDays export-wizard searches (`ewDateFilterName`/`ewCatFilterName`/`ewImageFilterName`) have NO Clear button and were left as-is. `smd-image-picker .search` is now `display:block` (the removed `.search input`/`.search button` flex rules were superseded by the component row). Storybook gained an `smd-search` section; the nav-link count assertion moved 30 -> 31 in `tests/storybook-regression.spec.js`.
- The three image-picker clear tests in `pmd-regression.spec.js` target `#imagePickerPage smd-image-picker smd-search button` now (the old picker-local `.clear` class is gone): `clear button resets picker search` (x2) and `bootstrap tab search filters icons and clear restores them`.
- MAIN-VIEW CARD RHYTHM (2026-09-26): both main screens now space their cards with the Bootstrap `mb-1` utility on the HOST (0.25rem), not a component-owned margin. PlanMyDay's `pmd-job-today-card` injected style dropped `margin-bottom: var(--pmd-today-margin, 0.5rem)` and the `--pmd-today-margin` var (base + `body.compact`); `PlanMyDay/js/main-view.js` host class is now `today-drag-card d-block user-select-none mb-1`. CountMyDays `cmd-countdown-card` never had a margin rule (a density-aware one was trialled and reverted) and `CountMyDays/js/main-view.js` host class is now `d-block mb-1`. Measured: both cards are 4px apart in normal AND compact density. The compact density still only affects the pmd job-title size (`--pmd-today-title-size`).
- LAUNCH TILES (2026-09-26): `Launch/js/app.js` `renderAppGrid` now wraps each tile in a Bootstrap `.col` and mirrors `pmd-job-today-card`'s card pattern: `<a class="app-tile card smd-card border-0 h-100 d-flex flex-column text-decoration-none">` holding a `border rounded-3` inner surface (with `flex-grow-1`, centred content). Title is `<smd-h2 class="fw-bold mb-0">` (so `smd-h2.js` was added to the root `index.html` script block) and the description is `small text-body mb-0`. This is why the app-name headings are now VISIBLE: the old tile combined `bg-body-tertiary` with `text-body`, and in superhero both resolve to rgb(235,235,235) so the `div.h4 fw-bold` name was light-on-light. The old `rounded-4`/`h4`/`text-secondary` classes are gone. The `.col` wrapper makes the existing `#appGrid` `row row-cols-2 row-cols-md-3 row-cols-xl-4 g-3` gutter show on BOTH axes (16px horizontal AND vertical) and gives equal-height tiles per row; note pure `d-flex flex-wrap gap-3` cannot equalise column widths without a calc() rule, so the Bootstrap grid gutter is the utility-only way to get identical gaps. `tests/launch-regression.spec.js` still passes (it only asserts `.app-tile` count/text/href).
- CYBORG OVERRIDE FIX (2026-09-26): `shared/css/themes/cyborg/cyborg.css` had a broken selector (`tml[data-theme=...]` missing the `h`) AND both rules targeted `data-theme="superhero"` inside the cyborg file, so neither applied anywhere. Fixed to `html[data-theme="cyborg"][data-bs-theme="light|dark"] .smd-card { color: white }`. `.smd-card` is a real class (PlanMyDay `pmd-job-today-card`/`pmd-job-stream-card`/`pmd-job-search-card`, QRLinks `qrlink-card`, Launch `.app-tile`), so this now whitens card text in cyborg in BOTH modes - including forced-Light, where white-on-light is a contrast risk; revisit if it bothers users (use `var(--bs-body-color)` or drop the light rule).
- NEW PLANMYDAY GANTT VIEW (2026-09-26): optional, read-only Stream -> Job chart, OFF by default, enabled via Settings -> Display -> "Show Gantt" (`#showGantt`) which persists to `localStorage` key `showGantt` and reveals the `li.gantt-menu-item` -> `openGantt()`. New `PlanMyDay/js/gantt.js` (`buildGanttTasks`, `ganttAddDaysStr`, `ganttJobNotes`, `buildGanttContent`, `renderGantt`, `updateGanttMenu`, `changeShowGantt`). KEY DATA MODEL FACT: PlanMyDay jobs have NO start/end dates - only a recurrence `schedule` rule, an optional `sleepUntil` not-before date, and now an optional `duration` in DAYS (new field, `1` on job creation, editable in the Job Schedule tab directly under Sleep Until via `jobDurationChanged`, clamped to a positive int). So the chart is a READ-TIME PROJECTION: `start = job.sleepUntil || getTodayStr()`, `end = start + (duration || 1)` days, and NOTHING is ever written back (a test asserts localStorage is byte-identical after opening the page, and that a job seeded without `duration` still has none). Recurring occurrences are deliberately NOT materialised (one bar per job, not per occurrence). Streams are collapsible groups (`pGroup: 1`): a stream WITH jobs spans min(start)..max(end) as a summary bar; a stream with NO jobs keeps empty `pStart`/`pEnd`, which the library renders as a plain header line - so every stream has a row, ready for future reordering. `vUseSort: 0` is REQUIRED or the library re-sorts by start date and scrambles the stream -> job hierarchy; the view selector is limited to Day/Week/Month and the Resource column is hidden. VENDORED: `shared/vendor/jsgantt.js` (~234KB self-contained UMD bundle, exposes `window.JSGantt`, verified in-browser) + `shared/vendor/jsgantt.css`, from jsgantt-improved 3.0.0; both are in `sw.js` SHARED_ASSETS and `PlanMyDay/js/gantt.js` in the PlanMyDay APPS list, all `?v=BUILD_NUMBER`-versioned. Page is an `smd-page` (`#ganttPage`, `buildContent` -> nested `requestAnimationFrame` before `g.Draw()` because smd-page setters re-render `innerHTML` and the chart needs a laid-out container; see the smd-page section for the setter-ordering rule). Footer is Close only. `tests/pmd-gantt.spec.js` (8 tests) covers the setting default/ordering, menu visibility + persistence, date derivation, per-row rendering incl. the empty job-less stream header, the read-only guarantee, WCAG contrast in BOTH real modes, left-pane scaling + row/bar alignment, and Close. GOTCHA when testing menu visibility: the `li` sits inside a Bootstrap DROPDOWN that is `display:none` until opened, so assert visibility with `#btnMainMenu` clicked - otherwise `toBeVisible()` passes for the wrong reason. GANTT THEME FIX (2026-09-26): the chart first shipped badly washed out in dark mode. TWO separate causes, and the second one is the trap. (1) Much of `shared/vendor/jsgantt.css` is scoped to `.gantt` (`div.gantt { color: #656565 }`, `.gantt table`, `.gantt td`), but the host was `<div id="ganttChart">` with no `gantt` class - so those rules silently missed, the task-list cells inherited the app theme's LIGHT body colour, and they landed on the library's hard-coded `#ffffff` rows = effectively invisible. Fix: the host is now `<div id="ganttChart" class="gantt">`. (2) Even with that class the library is a fixed LIGHT theme, so the chart rendered as a bright white panel inside a dark app. Fix: `injectGanttTheme()` in `gantt.js` adds an id-guarded `<style>` (repo's `pmd-*-style` pattern) that re-points every hard-coded surface at Bootstrap vars (`--bs-body-bg`, `--bs-tertiary-bg`, `--bs-body-color`, `--bs-secondary-color`, `--bs-border-color`, `--bs-primary-bg-subtle`, `--bs-emphasis-color`) scoped to `#ganttPage`, so it follows ANY theme and mode with no per-theme work; the `#000` summary bar (`.ggroupblack`) is lightened to `#9aa0a6` under `html[data-bs-theme="dark"]` where black-on-dark is invisible. Do NOT edit the vendored CSS - it stays a verbatim third-party copy. TWO SELECTOR TRAPS in this DOM, both of which silently no-op: the row is `tr.gname.glineitem` (`.gname` and `.glineitem` are on the SAME element, so `.glineitem .gname` never matches - use `tr.glineitem`), and the name CELL is `td.gtaskname`, not `.gname` (`.gname` is on the row). THIRD TRAP, found later: the vendor pairs `.gmajorheading` with `.gminorheading` on ONE `#ffffff` rule, so theming only the minor heading leaves the week-range dates ("21/09/2026 - 27/09/2026") white-on-white in dark mode - both must be themed. Test gotchas: `applyTheme(theme, mode)` takes the MODE as its 2nd arg; flipping only `data-bs-theme` does NOT update the `--bs-*` vars, so measure against a real `applyTheme` call; and assert theme/mode AFTER any reload, or the reload wipes it. `tests/pmd-gantt.spec.js` guards this with a WCAG AA check (>=4.5) in BOTH real modes - measured 7.9-10.3:1 dark, 14.6-15.4:1 light. IMPORTANT: a contrast-only assertion does NOT catch this regression - with the `gantt` class present the vendor's own `div.gantt { color: #656565 }` keeps text readable on white rows (5.9:1), so the test also asserts the chart row fill tracks `<body>`'s fill (<12 drift) - that is the assertion that actually fails without the override. See the next bullet for the left-pane scaling fix; the chart still does not stretch to fill page height.
- GANTT LIGHT-MODE PAGE CHROME (2026-09-26): the shared rule `#smd-app smd-page .smd-page-header/footer { background-color: var(--smd-page-header-background) }` resolves to `var(--bs-primary)`, and flatly's LIGHT primary is the dark navy #2c3e50 - so every smd-page header was white-on-black in the light theme. The user asked for the GANTT ONLY, so `gantt.js` overrides it with `#smd-app #ganttPage .smd-page-header, #smd-app #ganttPage .smd-page-footer { background-color: var(--gantt-surface); color: var(--gantt-text); }`. The `#smd-app #ganttPage` prefix is REQUIRED to outrank the shared (1,1,2) rule - a bare `#ganttPage` selector loses. The h1 has no colour rule of its own and inherits from the header, so it follows automatically. This also fixes a genuine shared bug: the shared FOOTER rule sets a background but no foreground, so in light mode the footer inherited dark body text onto a dark primary fill. Other pages still have the primary-coloured header by design - if that is ever changed, do it in `styles.css` and delete this override.
- GANTT VARIABLE SCOPE (2026-09-26): the `--gantt-*` custom properties MUST be declared on `#ganttPage`, NOT on `#ganttPage .gantt`. The page chrome (header, footer, Streams button/menu) is a SIBLING of the chart, not a descendant, so scoping the variables to `.gantt` made them resolve to nothing outside the chart and the header rendered with a transparent background. Same applies to the dark-mode `--gantt-summary-bar` override - it goes on `html[data-bs-theme="dark"] #ganttPage`.
- GANTT STREAMS FILTER (2026-09-26): a "Streams" dropdown in the smd-page header via `page.headerHtml` (`buildGanttContent` sets it; note smd-page re-renders its whole innerHTML on every property setter, so the header HTML is rebuilt on each open). One `smd-checkbox` per stream plus an "All" master toggle, and the button label shows the included/total count ("Streams (2/3)"). State is stored as the EXCLUDED stream titles (`smdKey("ganttHiddenStreams")`, a JSON array) rather than the included ones, so a stream added later is SHOWN by default instead of being silently hidden by a stale list. `ganttRefreshStreamFilter()` syncs checkbox states and the count WITHOUT calling `buildGanttContent()`, which would re-render the page and close the dropdown mid-interaction. "All" is a standard master toggle (ticked = all included, unticked = none). The change handler is delegated on the PAGE (`page.addEventListener("change", ganttStreamFilterChanged)`) next to the existing `__ganttActionsBound` guard, because per-checkbox listeners would not survive the header re-render. CSS notes: `.dropdown-menu` is absolutely positioned by Bootstrap but the smd-page header flex row provides no positioning context, so `.gantt-stream-filter` sets `position: relative` and the menu is pinned to it; open/close is driven by toggling `.show` in JS rather than `data-bs-toggle`, so no Bootstrap dropdown instance is involved; and the button is styled from the page variables rather than `btn-outline-secondary`, which flatly renders as a filled grey block with white text (~2.5:1). `buildGanttTasks` filters excluded streams out entirely, so both the group row and its jobs disappear.
- GANTT ROW LABELS (2026-09-26, format changed 2026-09-30): job rows in the chart are labelled `"<title> (<frequency>)"` (e.g. `Review (Weekdays)`, `Gym (Mon, Wed, Fri)`) — ROUND brackets, via `ganttJobLabel(job)` in `PlanMyDay/js/gantt.js`. A plain DAILY job gets NO bracket at all: "Every day" is the default schedule, so `(Every day)` on every row is noise (the check tests the rendered text `/^every\s*day$/i`, so both `schedule.type === "daily"` and an absent schedule are left bare). The frequency text comes from the app's existing `getScheduleText(schedule)` in `utils.js` - do NOT add a second frequency formatter for the chart, or the wording will drift from the rest of the app. The trailing parenthetical is stripped, but ONLY when its content contains a space or a dash: `getScheduleText` returns `"Weekdays (Mon-Fri)"`, trimmed to `Weekdays`, while `"Every 14 day(s)"` MUST be left alone (a naive `/\s*\([^)]*\)\s*$/` mangles it into `"Every 14 day"`). Stream group rows are NOT labelled with a frequency - they are not jobs. Long titles still ellipsise.
- GANTT DAY-CELL TINTS + SCROLLBARS (2026-09-26): three colour defects, all caused by my own overrides. (1) The "today" column had lost its highlight and weekends had lost their shading because the surface rule contains `#ganttPage tr.glineitem td` - specificity (1,1,2), ONE ELEMENT TYPE higher than any `td.gtaskcellcurrent` variant - so a normally-written tint rule silently lost the cascade. `!important` is required here (the repo already uses it for vendor overrides); do not "clean it up". (2) The today tint is `color-mix(in srgb, var(--bs-primary) 12%, var(--gantt-surface))`, NOT `--bs-primary-bg-subtle`: on a saturated theme (superhero's primary is orange) the subtle variant rendered as a muddy dark-orange smear. `color-mix` is already used elsewhere in the shared CSS. (3) The chart's scrollbars were the browser default (`scrollbarColor: auto` = light grey), which read as a foreign light panel inside a dark chart and made the corner grip a light `///` block. Now themed via `scrollbar-width`/`scrollbar-color` (Firefox) AND `::-webkit-scrollbar{,-track,-thumb,-corner}` (Chrome/Edge/Safari) - both families are needed, they are not alternatives. WARNING when debugging this area: my "surface everywhere" rule is a long selector list ending in `#ganttPage .gcontainercol`, and it matches far more than intended - check what a cell actually matches before assuming a selector is scoped to one thing.
- GANTT RESIZE-GRIP BREAKAGE (2026-09-26): the vendor ships `.gmain { resize: horizontal }` (the double-headed-arrow grip in the bottom-right corner of each pane - that is the "thumbtick", NOT a drag handle and NOT a scrollbar; there is no `mousedown`/`mousemove` code anywhere in `jsgantt.js`). A native CSS resize grip works by writing an INLINE `width`, and `flex-basis` takes precedence over `width` for a flex item - so when the left-pane scaling fix expressed the proportional width as `flex: 0 0 clamp(360px, 32%, 460px)` it silently killed the drag: the arrow cursor still appeared (so it looked alive) but the pane never moved. Express it as `flex: 0 0 auto; width: clamp(360px, 32%, 460px)` instead - the basis stays `auto`, the clamp still drives the initial width and still re-evaluates on window resize, AND the grip works. Measured: writing an inline `width: 620px` moves the pane 404 -> 620 and the task table follows; with the flex-basis version the same write leaves it at 404. Do NOT "tidy" this back into a `flex-basis` shorthand. `tests/pmd-gantt.spec.js` guards it three ways: the computed `flex-basis` must be exactly `auto`, `resize` must still be `horizontal`, and a behavioural check writes an inline `width` (exactly what the grip does) and asserts the pane actually grows.
- GANTT LEFT-PANE SCALING FIX (2026-09-26): "the data columns scale at the wrong rate on window resize" was THREE vendor defects stacking. (a) `.gmainleft` declares `flex: 0 0 20%` and then overrides it on the very next line with `flex: 1 0 auto` - the 20% basis is dead code and the pane is sized purely by leftover flex space, so it took 64% of the chart at 800px and ~52% at 1600px (non-proportional). (b) The task cells are `white-space: nowrap`, so the pane also stretched to fit the LONGEST job title. (c) `.gtaskname` is pinned to a FIXED `220px`, making the whole task table a constant ~472px that ignored the pane entirely and overflowed it on a narrow window, clipping the End Date column behind `.gmainleft { overflow: hidden }`. Meanwhile the timeline is a fixed pixel grid (`vTaskLeftPx = vNumCols * (vColWidth + 3)`), so on resize the data columns absorbed every pixel of slack while the day columns did not. Fix: `injectGanttLayout()` (a second id-guarded `<style>`, id `pmd-gantt-layout-style`) gives the pane a real proportional width, sets `table-layout: fixed` + `width: 100%` on `.gtasktable`, makes the NAME column the flexible one (`width: auto` + ellipsis, overriding the vendor's 220px) and keeps the three date columns at a constant 88px - which is what the timeline day columns do too, so the two halves scale consistently. Measured: pane 340/379/460px at 800/1200/1600 viewports, table always == pane, End Date never clipped, row-to-bar drift 0px, date columns identical at every width. Do NOT narrow the date columns below 88px (that is the vendor's own value; at 72px adjacent columns run together as "28/09/202630/09/2026"). The header table `.gtasktableh` CANNOT be `table-layout: fixed`: its first row is a single `.gspanning` cell with `colspan=11` (the "Format:" row), so fixed layout derives a 12-column grid from it and every label collapses to ~36px ("Dura... | Start... | End ...") - it is left on auto layout with the same explicit widths instead. Residual cosmetic: header and body are separate tables with different column structures (12 vs 5) so their vertical grid lines differ by a few px; a pixel-perfect fix would mean moving the "Format: Day/Week/Month" selector out of the header table, which is not worth it. TEST TRAP: the table-fits-pane, End-Date-not-clipped and date-columns-constant assertions ALL pass with or without this fix, so they do not guard it - the test additionally asserts the pane never takes >=50% of the chart, and that is the one that fails without the override (verified: "left pane took 65% of the chart").
- GANTT DAY-VIEW HEADER (2026-10-04): the grid header row is 30px (compact
  rows), which CLIPS the vendor's two-row timeline header (`.rg-gantt-header`
  is 56px) down to just the month row. In the Day view the header is grown back
  to 56px (`--rg-theme-header-height` + `.header-rgRow { height }`, scoped by
  `#ganttChart[data-gantt-zoom-preset="day-week"]`) so the day-number row
  ("2 Fri", "3 Sat", ...) shows UNDER the month (the vendor's natural order).
  Week/Month keep the 30px single-row header. RevoGrid reads the header height
  ONCE on mount, so a zoom change RECREATES the grid (`grid.__ganttZoom`);
  `drawGantt` sets `data-gantt-zoom-preset` on `#ganttChart` (the `-preset`
  suffix avoids clashing with the zoom BUTTONS' own `data-gantt-zoom`). TWO
  alignment fixes so the dates line up with the columns: (a) the header divider
  is a LEFT border, not the vendor's RIGHT border - the right border sat 1px
  left of the data gridline (which is the column's first pixel); (b) the
  timeline DATA `.rgCell` has 4px left/right padding that the header cell lacks,
  so `#ganttPage revogr-data .rgCell:has(.rg-gantt-cell) { padding-left/right: 0 }`
  puts the bars/gridlines and the header on ONE x origin. Test: "day view shows
  the date numbers under the month, aligned to the columns".
- GANTT START/END COLUMN TOGGLE (2026-10-04): a "Start/End" button in the Gantt
  header shows/hides the Start and End date columns. It is the LAST control
  before the Streams filter and floats right WITH it: the toggle carries
  `margin-left: auto` (`.gantt-stream-filter` no longer does) so the two sit
  together on the right while zoom/undo stay left. `ganttShowDates()` reads
  `smdKey("ganttShowDates")` (default SHOWN); `drawGantt` filters
  `lib.DEFAULT_TASK_COLUMNS` to drop `startDate`/`endDate`, and the grid is
  recreated when the zoom OR the show-dates flag changes (`grid.__ganttKey`).
  `ganttPaintDatesToggle()` re-asserts the active state on every render.
  `openGantt` now also clears a pending `_ganttCloseTimer` (fast close -> reopen
  used to add `d-none` after the open and render into a zero-height box).
  ALL header buttons carry `btn-sm`: without it the shared
  `button, .btn { font-size: var(--smd-type-h2) }` rule made the zoom + undo/redo
  buttons the h2 size (49px at the default font) while the Start/End + Streams
  `.btn-sm` buttons were 41px; `btn-sm` pins them to the p token so every header
  control is the same height.
- GANTT WEEKEND COLUMN HIGHLIGHT (2026-10-04): the Day view shades the Sat+Sun
  columns via a `repeating-linear-gradient` on `.rg-gantt-cell` (chart) and
  `.rg-gantt-header` (band), scoped to `data-gantt-zoom-preset="day-week"`. The
  COLOUR is `--gantt-weekend-bg` (default
  `color-mix(in srgb, var(--bs-body-color) 7%, transparent)`) - change that ONE
  variable to restyle it. The phase is `--gantt-weekend-offset` = the first
  Saturday's x, set by `ganttWeekendOffsetPx(items)` (the vendor's range starts
  2 days before the earliest date; Day columns are 44px). GOTCHA: the weekend
  layer MUST tile at `background-size: 308px 100%` (its own period), NOT `100%`.
  A `100%` tile makes the period the element width (32120px) and, because
  `32120 % 308 = 88`, the `background-position` shift lands the pattern wrongly
  at the left edge - an extra day (e.g. the Friday) gets highlighted on the first
  weekend. Test: "weekend highlight lands on exactly Saturday and Sunday for
  every start weekday" (samples the RENDERED pixels for all 7 start weekdays).
- GANTT endDate IS INCLUSIVE (2026-10-04): the vendored plugin's
  `createGanttBarLayout` (revolist-gantt.js:105) draws a bar from `startDate` to
  `endDate + 1 day`, so `endDate` is the LAST day the bar covers.
  `buildGanttTasks` therefore sets `end = ganttAddDaysStr(start, duration - 1)`:
  a 1-day job has `startDate === endDate` and its bar covers exactly ONE column
  (44px at the Day preset), and a 3-day job ends two days after it starts. Keep
  the consumers in sync: the drag ghost shows `ganttDaysBetween(start, end) + 1`
  days, and `ganttPersistBarDrag`'s resize-end persists
  `duration = ganttDaysBetween(start, end) + 1`. `ganttDaysBetween` stays the raw
  date delta. A stream summary spans `min(start)..max(end)` inclusive. Tests:
  "derives bar dates..." (endDate expectations) + "a one-day job's bar spans
  exactly one day column" (compares two 1-day bars one day apart, so the
  reference day width is self-derived, not hardcoded).
- GANTT MIGRATED TO REVOLIST (2026-09-30): `shared/vendor/jsgantt.js` / `jsgantt.css` were REPLACED by the MIT `@revolist/gantt` on `@revolist/revogrid` (vendored whole under `shared/vendor/revolist/`; see the sw.js comment + the notes at the top of `tests/pmd-gantt.spec.js`). The chart is STILL a read-only projection with the same Stream->Job data model and the same "Streams" header filter + zoom + frequency row labels (`ganttJobLabel`), but the DOM, hooks and CSS variables are completely different — the old jsgantt notes above (`vUseSort`, `pStart`/`pEnd`, `.gmainleft`/`.gtasktable`/`.glineitem`, resize grip, `afterDraw`, `data-gantt-*` drag) NO LONGER APPLY. Read-only is enforced TWO ways for the CELLS (both asserted in `tests/pmd-gantt.spec.js`): `grid.readonly = true` (stops cell edits) and `sortable: false` on each of the three app columns (`DEFAULT_TASK_COLUMNS.map(c => ({...c, sortable:false}))` - the plugin appends its own `__ganttTimeline` column which has no sortable prop, so filter it out when asserting). JOB BARS ARE DRAGGABLE via the plugin's OWN pointer handling: the vendored plugin draws `data-gantt-interaction="move"` on each bar and `resize-end` on its end handle, then rewrites startDate/endDate in its internal source and re-renders the grid live. The app only (a) splits the bar in CSS - LEFT half stays the bar's own `move` zone (grab cursor, drag moves the whole bar -> persists as `sleepUntil`), RIGHT half is the end handle stretched to 50% width (`ew-resize`, drag resizes -> persists as `duration`). SUMMARY (stream) bars are draggable too, as a WHOLE bar only (their end handle is hidden, so no resize): dragging a stream bar shifts EVERY child job's start by the same day delta (persisted as each job's `sleepUntil`, `ganttPersistStreamShift` reads the stream's stored index from the `"s"+idx` task id). The start/progress handles stay disabled - and (b) persists the result: `ganttBindBarDrag()` captures `{taskId, mode}` on pointerdown, and on document pointerup `ganttPersistBarDrag()` reads the updated dates out of `grid.source` and writes `sleepUntil` (move) or `duration` (resize-end, `Math.max(1, daysBetween + 1)` - endDate is inclusive)   into the stored streams via `saveStreams()`, then `renderGantt()` re-projects. Task ids are `"j" + job.id`; the `j` prefix is stripped to find the job. `PlanMyDay/js/gantt-drag.js` was DELETED. Config order matters: `grid.columns` -> `grid.plugins=[GanttPlugin]` -> `grid.gantt` -> `grid.source` (the plugin installs the `gantt` accessor). `TaskEntity` needs `id`/`parentId`/`name`/`type`/`startDate`/`endDate`/`progressPercent`. Rows are COMPACT 30px (`grid.rowSize = 30`; the injected theme drops the vendor timeline cell's 40px min-height and shrinks bars to 18px / summary 8px so the full-page chart shows many rows instead of a few chunky ones), empty streams keep a zero-length span on today which the vendor draws as its 6px minimum bar, and zoom presets are `day-week`/`week-month`/`month-quarter` (persisted in `smdKey("ganttZoom")`; Day renders ~755 timeline header cells, Month ~50). LAYOUT: the chart fills the whole page — `#ganttPage .smd-page-body` is turned into a `flex-column` with `overflow: hidden` and `padding: 0 !important` (the `p-2` utility is `!important`, so this has to be too), and `#ganttChart` is `flex: 1 1 auto; min-height: 0` so RevoGrid's own virtualiser owns the scrollbar. INDENTATION: job names are indented under their stream by a `cellTemplate` on the `name` column that stamps `.pmd-gantt-job-name` (24px padding-left) on `type === "task"` rows — the rows carry no task/summary DOM marker, so this is the reliable hook. COLLAPSE: streams collapse via a toggle in the summary name cell (`.pmd-gantt-collapse-toggle`, glyph ▸/▾, aria-expanded). The set of collapsed stream TITLES is persisted in `smdKey("ganttCollapsedStreams")` (mirrors the hidden-stream filter). `buildGanttTasks` measures ALL jobs for the summary span but only EMITS job rows for non-collapsed streams, so a collapsed stream keeps its summary bar at full min..max range while its job bars vanish; `ganttToggleStreamCollapsed(title)` flips the set + re-renders.  ROW DRAG (2026-09-30, jobs reorder within/across streams): `ganttBindRowDrag()` is a custom pointer drag on the job name cells (`.pmd-gantt-job-name`, grab cursor) - RevoGrid native row drag was avoided because the plugin re-projects `grid.source` from stored streams every render, so a native reorder would be thrown away. On pointerdown it records the stored job + `grabOffsetY` (name-center minus row-top, ~15px); the drop resolves by the dragged row's TOP edge (`clientY - grabOffsetY`), not the pointer. The insertion line resolves to a JOB via `ganttRowAnchor(grid, dropY, jobId)` and the job is inserted before/after it (recomputed AFTER removal so indices can't shift); sequence is renumbered in both affected streams via `saveStreams()` + `renderGantt()`. DROP-TARGET RULES (final, resolved with the user): a line on a JOB row anchors that job (before/after by midpoint). A line on a SUMMARY row NEVER targets the header's own stream - it always joins the stream ABOVE the line: a COLLAPSED header is the visible target for its hidden stream (append to its bottom), and an EXPANDED header joins the stream above it too (append to that stream's bottom), because a drop above a stream's header is not part of that stream (e.g. A open/B closed/C open: dropping between B and C appends to the BOTTOM of B, never the top of C). The very first header with nothing above it is rejected. You can always drop before or after a job. Tests: `pmd-gantt.spec.js` "dragging a JOB row within its stream", "dropping a JOB on its own original slot", "dragging a JOB row onto another stream", "dropping a JOB on a stream header appends it to the stream above (bottom), never the header's own stream".Theming is CSS-custom-property only, in `injectGanttTheme()` (style id `pmd-gantt-theme-style`): `--rg-theme-*` for the grid, `--rg-gantt-*` for the timeline, all pointing at Bootstrap variables so every Bootswatch theme + light/dark follow for free. NAME TRAP: RevoGrid documents its tokens as `--revo-grid-*`, but the SHIPPED stylesheet reads `--rg-theme-*` — overriding the documented names does nothing. The `theme` ATTRIBUTE may only be `default`/`dark` (light/dark mode); the five bundled named palettes (ocean/midnight/aurora/highContrast/highContrastDark) have NO matching CSS and leave the grid unstyled (text vanishes). VENDORING TRAP: RevoGrid is a Stencil app whose component code loads via a RUNTIME template-literal `import()` (`dir + '/' + tag + '.entry.js'`), so a static scan of import specifiers CANNOT enumerate the real file set. The exact symptom: `revo-grid.entry.js` 404 -> `TypeError: Failed to fetch dynamically imported module` + `Error: Constructor for "revo-grid#undefined" was not found` while the page otherwise looked fine and every grid property read back correctly. The fix is to vendor the ENTIRE `revogrid/dist/esm/` directory (24 files, ~878KB; 26 with the two Gantt files, ~956KB) and to confirm the graph by RECORDING the browser's real network requests (see `C:\Users\Keith\AppData\Local\Temp\opencode\revolist-probe\record.cjs`). `sw.js` precaches all 26. `PlanMyDay/index.html` loads it via a RELATIVE import map (`shared/vendor/revolist/revogrid/esm/`) + `PlanMyDay/js/gantt-lib.js` (the ESM entry exposing `window.PMD_GANTT_LIB.GanttPlugin` + `DEFAULT_TASK_COLUMNS`, dispatching `pmd-gantt-lib-ready` / `pmd-gantt-lib-failed`), and `gantt.js` awaits `ganttLibReady()`. New selectors for tests: `#ganttChart revo-grid` (`aria-rowcount` = total rows), `revogr-header .rgHeaderCell` (4: Task/Start/End/timeline), `revogr-data .rgCell` (20 for 5 rows: 15 cells + 5 timeline labels), `.rg-gantt-bar`, `.rg-gantt-bar--summary`, `.rg-gantt-bar-label`, `.rg-gantt-header-cell`. KNOWN REGRESSION vs jsgantt: there is no tooltip equivalent in `GanttVisualConfig`, so old tooltip-only details are dropped (recurrence still shows in the row label); revisit if wanted. `tests/pmd-gantt.spec.js` was rewritten for this grid (12 tests: settings/menu, date derivation, render + empty-stream bar, read-only projection, frequency labels, WCAG AA contrast in both modes, read-only chart = no edit/sort/drag, Streams filter + persistence, zoom + persistence, full asset graph with no failed requests, Close).
### 2026-10-03 - Shared palette moved to the mode layer; vendor/app CSS extracted

- GOAL: `shared/css/styles.css` is now RULES ONLY (no colour defaults, no `[data-bs-theme]` selector). The shared `--smd-*` palette lives in the mode layer: `shared/css/themes/light.css` + `dark.css` (previously empty stubs), loaded after `styles.css` and before the per-theme sheet. The old `html[data-bs-theme="dark"] { ... }` block was deleted from `styles.css`.
- CONSEQUENCE: `--smd-image-theme` and every palette token now flip with the MODE SHEET, not the `data-bs-theme` attribute. A test that set `data-bs-theme` directly to flip image tinting must call `applyThemeMode(theme, mode)` instead (updated `pmd-regression.spec.js` "applies light and dark svg theme overrides to nested elements like the editor preview"). `isDarkTheme()`'s attribute fallback is now inert because the var is always defined by the loaded mode sheet.
- FORM REPAINT PROMOTED: the `.form-control/.form-select/.flatpickr-input` repaint (was duplicated in `superhero.light.css`, commented out in `superhero.dark.css`) now lives once in `styles.css`; `dark.css` supplies the dark `--smd-form-*` palette so the promoted rule does not paint white fields on a dark page. Superhero keeps only its palette overrides.
- DATE-PICKER: `light.css` derives the date-picker surface/text from `--smd-form-*` (not raw `--bs-white`/`--bs-body-color`), so a visually-dark theme forced to Light (darkly/cyborg/slate) no longer gets a white-on-white calendar. `dark.css` points it at the theme's dark tokens.
- NEW FILES: `shared/css/vendor-overrides.css` (flatpickr repaint) and `PlanMyDay/css/gantt.css` (the one PlanMyDay-specific rule, `#ganttPage`). vendor-overrides loads right after `flatpickr.min.css` in PlanMyDay/CountMyDays/storybook; gantt.css loads LAST in PlanMyDay (after the per-theme override). Both registered in `sw.js` SHARED_ASSETS/APPS and the shell heads; `BUILD_NUMBER` bumped via `npm run bump:build`.
- TEST: `tests/launch-regression.spec.js` `cascadeRank` learned the new layers (vendor-overrides = 0, app css = 5, unknown = 6; the `rank < 5` guard is `< 6`). The `#streamsEditor pmd-stream-header` rules STAYED in `styles.css` on purpose: simplex's per-theme sheet overrides them, and an app-css file loading after the theme would beat it.
- VERIFIED: launch-regression 7/7; pmd-regression + cmd-regression 494/494; the other non-screenshot specs 168/168; pmd-screenshots (superhero) 33/33.
- PMD STREAM HEADER LAYOUT (same day): `pmd-stream-header` now lays out as a TITLE ROW (`.stream-header-main`, full width) plus a META ROW (`.stream-header-meta`) that puts the badges AND `.header-actions` on one line, instead of a title/badge column with the actions as a separate right-hand column that squeezed the title. The title button now spans the whole content column; the actions moved inside the meta row (`ms-auto`, `flex-wrap` so they wrap on narrow/phone widths rather than clipping), and the delete button rides with them. Every selector the suite uses is unchanged (`.stream-header-main`, `.editor-title`, `.tab-badge`, `.count-badge`, `.chevron`, `.drag-handle`, `[data-action=...]`); only the internal `.body`/`.row1`/`.row2` wrappers were replaced. Verified: pmd-regression + pmd-touch + storybook-regression 452/452 (external server).

- TOOLING GOTCHAS (2026-09-30): (1) WATCH THE BROWSER CONSOLE after wiring a new library: a page can render "successfully" (every `page.evaluate` returns, no test throws) while the feature is silently dead, because the failure happened in a worker, a dynamic import, or an unawaited promise. Attach `page.on("console")` + `page.on("pageerror")` + `page.on("requestfailed")` and FAIL the run on any hit; assert RENDERED OUTPUT (row/bar/cell counts, visible text), never just that the container element exists. The RevoGrid 404 above was only caught by a human reading the console, because every property set on the broken `<revo-grid>` read back fine while it rendered ZERO rows. (2) The test servers (`node tests/serve-tests.mjs`) are sirv in PRODUCTION mode: they snapshot the file tree at STARTUP and serve from an in-memory map. After ADDING new files (e.g. vendoring RevoGrid) the server must be RESTARTED or the new file 404s exactly like a broken import — and `reuseExistingServer` means Playwright happily reuses the stale one. Restart after any file add/edit.

### 2026-10-04 - smd-image-dropdown closed-state layout + smd-image-select image alignment
- THREE reported issues on the PlanMyDay Edit Job General tab:
  1. The closed dropdown label was CENTERED (Bootstrap `.btn { text-align:center }`
     inherited by the title span), so the name floated mid-button instead of
     sitting next to the image. FIX (shared component): the title now lives in a
     `.labels` grid with `text-align:left`; image + label are 8px apart (`gap-2`).
  2. The Stream button was pinned by `min-width:14em` (~364px at the default
     font, 448px Jumbo) and overlapped the Image column below ~600px. FIX: the
     component sizes the button to the WIDEST option (all labels stacked in one
     hidden `.sizer` grid cell), so it hugs the widest title and the visible
     title ellipsises on a narrow column; the job page CSS is now
     `width:fit-content; max-width:100%` (14em removed). Measured: 263.8px (was
     364), stable across selections, shrinks to 230px at a 500px viewport so it
     never crosses into the Image column. CountMyDays inline `min-width:180/220px`
     and the stream tab picker `13.5em` still win, so those usages are unchanged.
  3. The dropdown image sat ~10px ABOVE the Image-selector image when the job
     HAD an image (the `smd-image-select` name+Edit meta grows to ~84px and
     vertically centered its 50px thumb). FIX: `smd-image-select` host is now
     `align-items:flex-start` and its `.thumb` has
     `margin-top: calc(0.375rem + 1px)` (the dropdown button's padding+border
     offset); the job-edit Image wrapper dropped `d-flex align-items-center`.
     Both images now line up (delta 0) WITH and WITHOUT a job image.
- TDD: 5 new tests in `tests/pmd-regression.spec.js` ("Stream dropdown layout"
  describe) written RED first, then GREEN.
- Verified: pmd `[Ss]tream` 58/58, cmd `[Cc]ategor` 10/10, storybook 8/8,
  pmd-screenshots "job edit modal - general tab" (`SCREENSHOT_THEME=superhero`)
  1/1 (visually confirmed).
- Files: `shared/js/components/smd-image-dropdown.js`,
  `shared/js/components/smd-image-select.js`, `PlanMyDay/js/editor-styles.js`,
  `PlanMyDay/js/job-editor.js`, `tests/pmd-regression.spec.js`.
- `BUILD_NUMBER` NOT bumped (user runs the full regression, then ships).

### 2026-10-04 (b) - coverage hooks in every regression spec + ?v= merge fix + shared-helpers spec
- WHY the number looked lower: coverage is reset each run and only records specs
  that call startCoverage/stopCoverage, so pmd-gantt (the 2026-09-30 Gantt
  feature: PlanMyDay/js/gantt.js = 4/151 functions) plus QRLinks/Launch/
  SolarControlar/storybook were INVISIBLE to the report. The smd-image change
  itself added mostly-covered code (only pre-existing getters/dead `idAttr`
  were uncovered in the touched files).
- ITEM 1: added top-level startCoverage/stopCoverage hooks to pmd-gantt,
  qrlinks-regression, launch-regression, solarcontrolar-regression,
  storybook-regression, pmd-touch, settings-alignment, image-edit-preview-size
  (screenshot specs stay hook-free).
- ITEM 2: covered the smd-image-dropdown `options`/`selected` getters and the
  injectJobEditStyles/injectStreamsEditorStyles guards in pmd-regression;
  deleted the dead `idAttr` (and an unused `thumb` local) in smd-image-select.js.
- ITEM 3: new `tests/shared-helpers-coverage.spec.js` drives the pure helpers the
  UI never reaches: smdImageHash/smdImagePaintVariants/smdImageCacheUrl, the
  pure SHA-256/HMAC fallback (asserted against known digests), resolveThemeMode,
  smdConfirmClearAllData (real modal click), and the CountMyDays editor setters.
- TOOLING FIX: `tests/coverage.js` now strips `?v=` before adding, so the
  storybook's un-versioned shared-script copies merge with the apps' versioned
  copies (36 files were double-counted, +717 phantom functions).
- RESULT (full non-screenshot run, 635/635 pass, --workers=4): functions
  81.2% (partial scope) -> 89.75% (full scope, merged); statements 87.53%;
  lines 84.97%; bytes 92.54%. Per app: PlanMyDay 95.3% (was 66.8%), CountMyDays
  94.1%, shared 87.0%, FreeFormOX 88.9%, QRLinks 78.2%, SolarControlar 77.7%,
  Launch 72.7%.
- REMAINING biggest holes (for a future item-3 pass): smd-images.js (SW-gated
  image-cache GC + editor callbacks, ~17), smd-minio.js importMinioFile + callbacks
  (~11), smd-qr-import.js (~10), CountMyDays import-wizard.js (~9), QRLinks
  links-editor.js (~7), SolarControlar app/tab files (~30).
- `BUILD_NUMBER` NOT bumped (test-only + tooling change).

### 2026-10-04 (c) - Edit Images tile: light/dark theme swatches
- `<smd-image-card>` (the `#imagesEditor` tile) now shows, on ONE row: the main
  image (normal background), a light-theme square with the image, a dark-theme
  square with the image, then the three buttons spread across the remaining
  space (`d-flex flex-grow-1 justify-content-between`). The squares use the app
  light/dark body surfaces (`bg-body` + `data-bs-theme`), have `p-1` space round
  the image, and carry NO name (the single name stays below the row). Gap
  between the images is `gap-2` (0.5rem = the requested m-2).
- TDD: added the cmd-regression test RED first, then the component change.
- GOTCHA: `data-bs-theme="light"` on the swatch resolves `--bs-body-bg` from the
  LOADED theme's light mode, which for superhero is the dark navy #0f2537 - so
  the "light" swatch is not lighter than the dark one. The test compares each
  swatch's computed background to a probe element with the same `data-bs-theme`
  rather than assuming light > dark luminance.
- SELECTOR FALLOUT: a card now holds 3 `<smd-image>`, so `card.locator("smd-image")`
  is ambiguous - updated cmd/pmd/qrlinks to `.thumb smd-image`.
- Verified: cmd "Images editor" 5/5, pmd `[Ii]mage` 107/107, qrlinks 9/9,
  storybook 8/8, image-edit-preview-size green, pmd-screenshots "images editor"
  (SCREENSHOT_THEME=superhero) 1/1 (visually confirmed).
- `BUILD_NUMBER` NOT bumped - it MUST be bumped before shipping (shared
  component changed): `npm run bump:build`.

### 2026-10-04 (d) - Gantt: 1-day job spanned 2 days (endDate off-by-one)
- BUG (user): a job with duration 1 starting 4 Oct drew a bar over 4 AND 5 Oct,
  looking 2 days long.
- CAUSE: the vendored plugin treats `endDate` as INCLUSIVE (`createGanttBarLayout`
  draws to `endDate + 1 day`), but `buildGanttTasks` set `end = start + duration`,
  so every bar was one column too long.
- FIX: `end = ganttAddDaysStr(start, duration - 1)`. Also fixed the two
  consumers that assumed the old convention: the drag ghost now shows
  `ganttDaysBetween(start, end) + 1` days, and resize-end persists
  `duration = ganttDaysBetween(start, end) + 1`.
- TDD: updated "derives bar dates..." to the inclusive expectations and added
  "a one-day job's bar spans exactly one day column" (two 1-day jobs one day
  apart; the reference day width is their left delta, so nothing is hardcoded).
  Both RED first, then GREEN.
- Verified: full `tests/pmd-gantt.spec.js` 50/50.
- `BUILD_NUMBER` NOT bumped - bump before shipping (`npm run bump:build`).

### 2026-10-04 (e) - Gantt Day view: date numbers under the month, aligned
- User: in the Day view show the day-of-month numbers; then "underneath the
  Month" and they must "exactly line up with the columns".
- ROOT CAUSE of "no numbers": the grid header row is 30px (compact rows) and
  CLIPS the vendor's 56px two-row timeline header down to the month row.
- FIX: in the Day view grow the header to 56px (`--rg-theme-header-height` +
  `.header-rgRow` height, scoped by `data-gantt-zoom-preset`), keeping the
  vendor order (month top, day numbers below). Week/Month keep 30px. RevoGrid
  reads the header height once on mount, so a zoom change RECREATES the grid
  (`grid.__ganttZoom`); the host attribute is `data-gantt-zoom-preset` to avoid
  the zoom buttons' `data-gantt-zoom`.
- ALIGNMENT (the 1-2px the user saw): (a) the header divider was the vendor's
  RIGHT border, 1px left of the data gridline -> switched to a LEFT border;
  (b) the timeline DATA `.rgCell` has 4px left/right padding the header cell
  lacks -> `#ganttPage revogr-data .rgCell:has(.rg-gantt-cell) { padding-left/right: 0 }`.
  After both, the header dividers, the gridlines and the bars share one x
  origin (measured: day-cell left 569 == bar left 569 == gridline).
- TDD: "day view shows the date numbers under the month, aligned to the columns"
  (asserts tick below month, bar on a day-cell boundary, and border-left: 1px /
  border-right: 0).
- Updated the scroll-anchor test's hard-coded `r.top >= 95` to derive from the
  header bottom (the taller Day header shifted the data area 26px).
- Verified: full `tests/pmd-gantt.spec.js` 51/51.
- `BUILD_NUMBER` NOT bumped - bump before shipping (`npm run bump:build`).

### 2026-10-04 (f) - Gantt weekend highlight + off-by-one at the start
- FEATURE (user): subtly highlight the Saturday/Sunday columns in the Day view,
  changeable from CSS. Implemented as a `repeating-linear-gradient` on
  `.rg-gantt-cell` + `.rg-gantt-header`, colour `--gantt-weekend-bg`, phase
  `--gantt-weekend-offset` (first Saturday's x).
- BUG (user): the timeline started Fri 2 Oct but Fri+Sat+Sun were all
  highlighted; later weekends were correct. Cause: the weekend layer tiled at
  `background-size: 100% 100%`, so its period was the ELEMENT width (32120px)
  and `32120 % 308 = 88` made the `background-position` shift land the pattern
  wrongly at the left edge. FIX: tile at the pattern's own `308px 100%`.
- TDD: added "weekend highlight lands on exactly Saturday and Sunday for every
  start weekday" - it samples the RENDERED pixels (screenshot + sharp) for all 7
  start weekdays and asserts the bright columns are exactly Sat/Sun. It FAILED on
  the buggy CSS (e.g. start 2026-10-06 got "8 Thu, 9 Fri, 10 Sat, 11 Sun" instead
  of "4 Sun, 10 Sat, 11 Sun") and passes after the fix.
- Also: "day view highlights the weekend columns via a CSS variable" and
  "week and month views do not highlight weekend columns".
- HEADER CONFLICT: `PlanMyDay/css/gantt.css` deliberately sets
  `.rg-gantt-header { background: var(--bs-body-bg); background-image: none }`
  (clears the vendor's vertical gradient). The weekend rule must add ONLY
  `background-image` (keeping the flat body-bg colour) - do NOT re-add the
  vendor's `linear-gradient(...)` layer or the dark-navy band returns on
  superhero light. The theming test now strips `repeating-linear-gradient(` and
  asserts no NON-repeating gradient remains.
- `BUILD_NUMBER` NOT bumped - bump before shipping (`npm run bump:build`).

### 2026-10-04 (g) - Gantt: per-row Edit button column
- FEATURE (user): an Edit button for every job/stream in a column between the
  Task name and the Start date.
- IMPLEMENTATION: a new pinned app column `__ganttEdit` (size 72) is spliced
  into the column list in `drawGantt()` right after the `name` column, so
  `grid.columns` is now `["name","__ganttEdit","startDate","endDate",
  "__ganttTimeline"]`. It survives the Start/End toggle (it is not a date
  column). Its `cellTemplate` renders `<button class="btn btn-primary btn-sm
  pmd-gantt-edit-btn">Edit</button>` via the same `h(...)` vnode the name column
  uses; `ganttEditRow(model)` maps the row id back to storage at click time
  (`s<idx>` summary -> `editStream(idx)`; `j<id>` task -> find its stream + job
  index -> `editJobInAccordion`) and opens the editor STACKED over the Gantt
  (smd-page suspends the Gantt, then restores it on close). The row-drag press
  handler only grabs `data-rgcol='0'`, so pressing the button is a plain click.
- CSS: trimmed padding/line-height on `.pmd-gantt-edit-btn` so the ~18px button
  sits inside the 30px row. Probe confirmed zero console/page errors and zero
  failed requests; a screenshot confirmed placement.
- TESTS: new test "every row has a primary Edit button ... opening the matching
  editor" (button count = rows, all `btn-primary`, column order, geometry
  between name and Start, job + stream editor open/cancel with the Gantt still
  open). Updated the old column-count assertions (`pmd-gantt`: header cells
  4->5, hidden 2->3, body cells 20->25, `appCols.length` 3->4).
- Verified: full `tests/pmd-gantt.spec.js` 56/56 (`--workers=2 --retries=0`).
- `BUILD_NUMBER` bumped `202610040831` -> `202610042128` via `npm run bump:build`.

### 2026-10-04 (h) - Gantt: removed grid column filters, added "Active only" header filter
- TWO changes requested together.
- (1) The RevoGrid built-in column filter (the funnel button on every header cell,
  class `.rv-filter` / `.filter-button-wrapper`) is switched OFF with
  `grid.filter = false` in `drawGantt()` (the grid `filter` property defaults to
  true, so it reappears on every new grid unless set). Our own header controls are
  unaffected.
- (2) New "Active only" header toggle (`#ganttPage .gantt-active-toggle`, between
  the Start/End toggle and the Streams dropdown) that hides INACTIVE jobs
  (`job.active === false`, the app's standard flag) from the chart. Persisted at
  `smdKey("ganttActiveOnly")` (`planmydays_ganttActiveOnly`), default OFF (show
  everything = previous behaviour). `ganttActiveOnly()`/`ganttToggleActiveOnly()`/
  `ganttPaintActiveToggle()` mirror the Start/End toggle; `buildGanttTasks()`
  filters `streamJobs` when on, so a stream's summary span shrinks to its active
  jobs and a stream left with none keeps its minimum tick. Button style copied
  from `.gantt-dates-toggle` (solid secondary, primary when active).
- TEST GOTCHA: `toHaveClass(/active/)` FALSE-MATCHES the class NAME
  `gantt-active-toggle` (it contains "active"), so a state assertion must use
  `classList.contains("active")`, not a regex on the whole class string.
- TESTS: new "the grid columns have no RevoGrid filter buttons" (`.rv-filter`
  count 0 + `grid.filter === false`) and "the Active only header filter hides
  inactive jobs, defaults to off, and persists" (order, default, hide/show, bar
  count, persisted key, close/reopen). Full `tests/pmd-gantt.spec.js` 58/58
  (`--workers=2 --retries=0`). Probe confirmed zero console/page errors and
  screenshots confirmed the funnels are gone and the toggle hides the inactive
  row.
- `BUILD_NUMBER` bumped `202610042128` -> `202610042138` via `npm run bump:build`.

### 2026-10-05 - Upload Standard Images: choose Replace or Merge (shared)
- FEATURE (user): Settings -> Danger -> Upload Standard Images now opens an
  application `smd-modal` (via `showSmdModal`) asking whether to replace the
  existing images. Footer order + colours: `Cancel` (secondary), `Replace`
  (danger), `Merge` (primary), `Add` (success, far right). The body (with blank
  lines between each clause) is: "You already have N image(s). / Replace them
  all with the standard images, / or / Merge the standard images into your
  existing set, / or / Add missing images, don't change anything else."
- SEMANTICS (shared `uploadStandardImages()` in `shared/js/smd-images.js`):
  - Replace: clear all existing images, then write the standard set.
  - Merge: keep existing images; a same-named image is overwritten ONLY when
    its serialized contents differ (`imagesContentEqual`, a `JSON.stringify`
    compare), otherwise it is left as-is and counted as "unchanged (identical
    contents)"; standard names not present are appended; existing names not in
    the standard set are kept.
  - Add: append ONLY standard images whose name is not present locally; every
    existing image is left untouched (no overwrite, no identical/replaced
    counting). Same-named standards are counted as "already exist".
  - The choice modal calls the new `applyStandardImages(mode)` ("replace" /
    "merge" / "add"); the summary `showInfoConfirm` reports:
    - replace: `${total} images uploaded.` + `All previous images were replaced.`
    - merge: `${added} added`, `${replaced} replaced`,
      `${identical} unchanged (identical contents)`, `${kept} existing kept.`
    - add: `${added} added`, `${skipped} already exist.`
  - The summary's single OK button is the SUCCESS variant (`showInfoConfirm`
    in `shared/js/smd-app.js`; it is now only used by this upload summary).
- SCOPE: the shared function drives PlanMyDay ("Upload Standard Images") and
  QRLinks ("Load Sample Images") unchanged; CountMyDays gained the row
  (`#uploadStandardImagesRow` -> `#btnUploadImages`) in its Danger tab and
  `uploadStandardImagesRow` was added to `CMD_DANGER_IDS`, so it is hidden until
  "Show danger" (same as every other danger row).
- TESTS (TDD, red first): `pmd-regression` — the 4-button modal order/colours +
  Merge, Add only appends missing names and leaves existing untouched (reports
  `${total-1} added` / `1 already exist`), Replace clears custom images and
  loads the full standard set, Cancel leaves storage untouched, merge de-dupes
  names, the summary counts, and a synthetic case proving `1 replaced` vs
  `1 unchanged (identical contents)` (standard image seeded twice, one
  byte-identical / one modified).
  `cmd-regression` — CountMyDays danger row hidden until Show danger then
  Replace clears existing images. `pmd-screenshots` — "images editor" now clicks
  Merge then the summary OK; "sample images upload confirmation" now captures
  the choice modal. All pass (screenshot specs run with `SCREENSHOT_THEME=superhero`).
- GOTCHA hit again (2026-09-30 note): a fresh `tests/serve-tests.mjs` served a
  TRUNCATED `smd-images.js` (38714 of 40295 bytes) so the page had the new
  `uploadStandardImages` but `applyStandardImages` was `undefined` — the tell was
  `typeof applyStandardImages === "undefined"` plus a modal that still rendered.
  Fix: kill the 8080/8081 listener and restart the server; verify the served
  bytes match disk (`Invoke-WebRequest -UseBasicParsing`) before rerunning.
- `BUILD_NUMBER` bumped `202610042145` -> `202610050338` -> `202610050342` ->
  `202610050816` via `npm run bump:build` (shared assets changed).

### 2026-10-05 (b) - tab contrast via Bootstrap .text-bg-*; stream header + dropdown fixes
- BUG (user): brite/cerulean LIGHT inactive tabs were white-on-white. `smd-tabs`
  was painted from `--smd-tab-background: var(--bs-secondary)` with
  `--smd-tab-color: var(--bs-white)`; brite's secondary is `#fff` and cerulean's
  is `#e9ecef`, so the hardcoded white text vanished. Root cause: no per-variant
  contrast variable exists at `:root` in Bootstrap 5.3/Bootswatch (there is NO
  `--bs-{variant}-contrast`), so a shared `color: var(--bs-white)` cannot adapt.
- FIX (user chose the Bootstrap `.text-bg-*` approach): `smd-tabs.js`
  `_updateActive()` now toggles `text-bg-primary` on the active tab and
  `text-bg-secondary` on inactive tabs. `.text-bg-*` is a Bootstrap helper that
  supplies BOTH the variant surface and its designed contrast text (colour +
  background, `!important`), so it adapts per theme/mode with zero runtime code.
  `styles.css` dropped the `.smd-tab-btn` background/colour rules and the
  `--smd-tab-*` var usage; only `.smd-tab-line` stays (`var(--bs-primary)`).
  The `--smd-tab-*` palette entries were removed from `light.css` / `dark.css`
  and the per-theme files that set them (simplex/cyborg/darkly/superhero); the
  `smd-badge#editJobsTotalBadge` override was also removed from light.css.
- REVERTED (user request, same session): the first cut made the Edit Streams
  `pmd-stream-header` use `.text-bg-success`/`.text-bg-danger`. That was undone —
  the component is back to `bg-body-tertiary` (collapsed) / `bg-info-subtle`
  (expanded) plus the original `styles.css` `var(--bs-success)`/`var(--bs-danger)`
  !important rules, and the per-theme `color-mix(...)` overrides. `light.css`
  keeps the stream-header rules with `--bs-primary` (collapsed) / `--bs-danger`
  (expanded). So ONLY tabs moved to Bootstrap classes; the stream header keeps its
  previous colours.
- DROPDOWN (user): the closed `<smd-image-dropdown>` label was unreadable on
  light themes because `--smd-dropdown-foreground: var(--bs-secondary)` is white
  on brite. Changed to `var(--bs-body-color)` in BOTH `light.css` and `dark.css`
  (probe: brite `#212529` on `#f8f9fa`, cerulean `#495057`, superhero `#ebebeb`
  on `#0f2537`). Per-theme dropdown palettes (superhero/cyborg) override it with
  their own form foreground, so they were left alone.
- TESTS: `pmd-regression` "Theme colours" gained "inactive tabs use the Bootstrap
  text-bg-secondary contrast (no white-on-white)" (brite + cerulean: inactive tab
  computed colour/bg must equal a hidden `text-bg-secondary` probe, active equals
  `text-bg-primary`, and text != bg). Verified: Theme colours 5/5, PMD `[Ss]tream`
  60/60, PMD `[Dd]ropdown` 10/10, cross-app `[Ss]ettings` 53/53, one-theme
  (superhero) settings/stream screenshots 7/7.
- `BUILD_NUMBER` -> `202610050816`.
- SHELL/TEST GOTCHA: `--grep "a|b"` strands when passed through PowerShell's
  `Start-Job` ScriptBlock to `playwright.cmd` — cmd.exe parses the `|` as a pipe
  and errors `'b' is not recognized`. Run each grep separately, or avoid `|` in
  the pattern.
- AGENTS rule 17 added: at the start of every session ask for access to the WHOLE
  of `p:\git\MyApps`.

### 2026-10-05 (c) - date-independent Google sample test (fixed a time-bomb)
- `cmd-regression` "loads sample Google data and unifies Google entries in the
  dates editor" failed on 2026-10-06: it asserted a `cmd-countdown-card` for
  "Dentist Appointment" was visible, but `CountMyDays/js/googleCalendarSample.json`
  has FIXED dates (`sample_1` = 2026-10-05; the two "Weekly Team Meeting" rows =
  2026-09-21/28), and `CountMyDays/js/main-view.js` renders only `days === 0`
  (today) and `days > 0` (future) - so those events had fallen into the past and
  were dropped. NOT related to the tab/CSS work.
- FIX (test-only, date-independent, no BUILD bump): after `loadGCalSampleData()`
  caches the 7 events, the test now rewrites `sample_1`'s cached `start`/`end` to
  `today + 7` in `googleCalCacheKey()` and calls `renderMain()` before the
  main-view assertion. The `7 events cached` and all dates-editor counts
  (10 total / 6 Google / 4 Local / 2 Repeat / 1 Hidden) are unchanged.
- The dates editor is date-independent (it lists ALL events, past included), so
  only the main-view assertion needed the fix. Verified: cmd Google Calendar
  13/13.
- RULE (2026-10-05): ANY test involving a date must use the `today + N` (or
  `today - N`) pattern computed at run time - NEVER a hardcoded/fixed date or a
  bundled sample's fixed dates. Seed or rewrite the event to a date relative to
  `new Date()` before asserting, so the test can never go stale. This applies to
  every app and every spec, not just CountMyDays main-view cards.

### 2026-10-07 - app-shell hamburger menu: solid body-coloured background + font follows Font Size
- Two shared-shell fixes in `shared/css/styles.css` (all 6 apps inherit them):
  `#mainNav` was transparent (`getComputedStyle` = `rgba(0,0,0,0)`), so with the
  auto-hide menu (`position: fixed`) the toolbar let page content show through and
  scroll under it. It now has `background-color: var(--bs-body-bg)`.
- `#mainNav .dropdown-menu` (the hamburger menu ONLY) is painted
  `var(--bs-body-bg)` (opaque, matches the page; some themes ship a translucent
  `--bs-dropdown-bg`, e.g. morph's `rgba(240,245,250,0.8)`; superhero's is opaque
  `#4e5d6c`, NOT the body colour). SCOPED TO `#mainNav` ON PURPOSE: an
  `#smd-app .dropdown-menu` selector also repaints the Gantt Streams filter menu
  AND the hidden `.dropdown-menu` probe `pmd-gantt` uses to read the theme's
  dropdown token, which broke "the Streams filter dropdown uses the themed
  dropdown surface..." (the probe expected `--bs-dropdown-bg` #4e5d6c but read
  the navy body colour). Other `.dropdown-menu`s own a themed surface via
  `--bs-dropdown-bg` and must keep it.
- The menu font did NOT track Settings -> Font Size: Bootswatch re-declares
  `.dropdown-menu { font-size: .875rem }` (a fixed 14px on superhero) AFTER the
  Bootstrap `--bs-dropdown-font-size: 1rem`, so a later shared rule is needed.
  `#mainNav .dropdown-menu { font-size: var(--smd-type-p) }` makes it follow the
  body token. Probe (superhero, auto-hide on, menu open): before menuFont was a
  fixed 14px; after it is 20.8px (xlarge body) -> 25.6px (jumbo), i.e. 1:1 with
  `<body>`.

### 2026-10-07 (b) - smd-image auto theme now reads the element's ACTUAL background
- BUG (user): with the stock `bootstrap` theme in Light mode, a black image on
  the light `pmd-job-today-card` was fine, but the SAME image inside
  `pmd-stream-header` (whose `.stream-accordion-header` paints a DARK
  `color-mix(in hsl, var(--bs-primary) 40%, black)` even in Light mode) had no
  contrast. `theme="auto"` used `--smd-image-theme` (a global mode variable), so
  it could not react to a dark surface inside a light theme.
- FIX (`shared/js/components/smd-image.js` `_autoTheme`): resolve the variant
  from the element's real background. New module helpers
  (`effectiveBackgroundColor` / `parseBackgroundColor` / `relativeLuminance` /
  `isDarkBackground`) walk up from the host to the first ancestor that paints a
  background (skipping `transparent`), then pick dark when the WCAG relative
  luminance is < 0.179 (the black/white contrast crossover). The host is now
  styled `background-color: inherit` (added to the injected `smd-image-layout`
  sheet) so an image sitting directly on a surface resolves in one step; the walk
  covers transparent wrappers such as pmd-stream-header's `.thumb`. Fallback when
  nothing paints: `data-bs-theme`. `window.smdIsDarkBackground` is exported and
  `smd-images.js`'s `isDarkTheme()` / `getThemeKey()` now use it (the editor's
  "current theme" preview and `getThemedImageDataUrl` default).
- PARSING GOTCHA: Chromium serialises a `color-mix()` background-color as
  `color(srgb r g b)` (channels 0..1), NOT `rgb(...)`. The first cut only matched
  `rgba?()` and so walked past the dark header to the white body and chose the
  wrong variant. `parseBackgroundColor` now handles both `rgb()/rgba()` and
  `color(srgb ...)`.
- `--smd-image-theme` is REMOVED everywhere: `shared/css/themes/light.css`,
  `dark.css`, `superhero.light.css` / `superhero.dark.css`, `cyborg.light.css`,
  `darkly.light.css`, and the `pmd-stream-header`-scoped value in
  `simplex.light.css`.
- TDD: new `tests/pmd-regression.spec.js` "auto theme follows the element's
  background, not the theme mode" (bootstrap Light: today-card thumb renders the
  dark variant #000000; the streams-editor header thumb renders the light variant
  #ffffff). Verified: pmd smd-image rendering 7/7, storybook 8/8 (card viewer,
  all themes x both modes), image-edit-preview-size 10/10.
- `BUILD_NUMBER` NOT bumped - bump before shipping (`npm run bump:build`).

### 2026-10-07 (c) - new shared/js/library.js (window.SmdLib); generic helpers de-duplicated
- NEW `shared/js/library.js` (`window.SmdLib`), loaded FIRST (before the
  components and smd-app.js) in all 6 app shells + root Launch index + storybook
  + cardViewer (both the outer page AND its iframe generator, which now prepends
  `sharedScripts.library` to every recipe). Registered in `sw.js SHARED_ASSETS`.
- Moved IN: `escapeHtml`/`escAttr`/`$id` (were in smd-app.js), the colour/
  background helpers (`parseColor`, `relativeLuminance`,
  `effectiveBackgroundColor`, `isDarkBackground`) and the SVG data-URL
  recolouring (`isSvgDataUrl`, `updateSvgColor`, `applySvgAttr`, `themedSvgSrc`)
  that were duplicated byte-for-byte between smd-image.js and smd-images.js.
- `smd-app.js` keeps thin GLOBAL facades (`$id`/`escapeHtml`/`escAttr`) that
  delegate to SmdLib, because inline `onclick` handlers, app code and tests call
  the globals; smd-images.js keeps an `updateSvgColor` facade (tests call it).
  `smd-image.js` and `smd-images.js` call `SmdLib.*` directly everywhere else.
  `themedSvgSrc(data, overrides)` dropped the old unused `theme` argument.
- GOTCHA: every page that loads smd-app.js/smd-settings.js must load library.js
  first or the facades throw `ReferenceError: SmdLib is not defined` at boot.
  The cardViewer OUTER page (not just its iframes) was the one that bit.
- STILL CANDIDATES (not moved): `getImageColors`/`decodeVal` (SVG colour parse),
  `smdImageHash` (FNV-1a, image-cache-specific), the private `escapeHtml` copies
  in `smd-image-picker.js`/`smd-theme.js`, and `smdDownloadJson`/`smdReadJsonFile`.
- Verified: storybook 8/8, solar 12/12, ffox 11/11, launch 7/7, qrlinks 9/9,
  cmd Images editor 5/5, pmd smd-image rendering 7/7, image-edit-preview-size
  10/10, pmd updateSvgColor 1/1.
- `BUILD_NUMBER` NOT bumped - bump before shipping (`npm run bump:build`).

### 2026-10-07 (d) - Sortable fallback ghosts showed DOUBLED content
- BUG (user, long-standing): the drag preview for PMD's reorderable cards
  (`pmd-job-today-card`, `pmd-job-summary-card`, `pmd-stream-header`) "did not
  look right".
- ROOT CAUSE: Sortable's `forceFallback` ghost is a `cloneNode(true)` of the host.
  `cloneNode` copies attributes but NOT JS own-properties, so the clone re-ran
  `connectedCallback` with `_bound` undefined and appended the template a SECOND
  time -> every ghost showed two copies of its card/header ("Add Job Edit Delete"
  twice, two `.smd-card`, two `.stream-accordion-header`). Native (non-fallback)
  drag was unaffected because the browser snapshots the element instead of
  cloning it.
- FIX: the three PMD components guard the build with a CLONE-SAFE marker:
  `if (!this._bound && !this.hasAttribute("data-smd-built")) { this._bound = true;
  this.setAttribute("data-smd-built", ""); ...build... } this._bound = true;`.
  Attributes survive `cloneNode`, so a ghost skips the rebuild (and its event
  listeners / swipe binding) while still running `_render()` to stay in sync.
  `smd-button` is already clone-safe because it clears `innerHTML` and rebuilds
  from a stored label; badge/checkbox/image are idempotent. `smd-draghandle` was
  NOT clone-safe (it used a `_rendered` JS flag, which `cloneNode` drops), so
  ghosts showed TWO hamburger glyphs - fixed 2026-10-20 with `data-smd-built`.
- Also gave `pmd-job-today-card` the SAME fallback ghost as the other two
  (`forceFallback`, `fallbackOnBody`, `fallbackTolerance: 0`, and the
  fallback/ghost/chosen/drag classes in `PlanMyDay/js/main-view.js`) - it
  previously used the native HTML5 drag image, which cannot be styled. Added
  shared `.sortable-ghost { opacity: 0.4 }` + `.sortable-fallback { box-shadow }`
  in `shared/css/styles.css`.
- TDD: new `pmd-regression` "Drag ghosts > the fallback ghost is a single copy of
  the card (no doubled content)" (stream header, job card, today card).
- Verified: pmd reorder 6/6, pmd `[Dd]rag` 11/11, pmd-touch 5/5, storybook 8/8.
- `BUILD_NUMBER` NOT bumped - bump before shipping (`npm run bump:build`).

### 2026-10-20 - drag ghost doubling + streams-editor scroll preservation
- BUG 1 (user, iPhone): reordering streams or jobs after scrolling reset the
  streams editor to the top. `renderStreamsEditor()` rebuilds the page through
  `page.title/content/buttons` -> `smd-page._render()` -> `innerHTML`, which
  destroys `.smd-page-body` (the scroll container) and its `scrollTop`. FIX:
  `renderStreamsEditor(preserveScroll)` captures the body offset at the top and
  restores it (plus once on `requestAnimationFrame`) at the end; only the two
  reorder `onEnd` handlers pass `true`.
- BUG 2 (user): drag ghosts for streams/jobs showed doubled content.
  `smd-draghandle` used a `_rendered` JS flag that `cloneNode` does not copy, so
  every fallback clone appended a second `.glyph`; now guarded by the
  clone-safe `data-smd-built` attribute. `<smd-image>` also skips its render
  when a clone already carries a painted `img[src]` (re-rendering swapped in a
  second bitmap while the ghost moved). `.sortable-fallback` is forced opaque
  (`opacity:1 !important`; Sortable writes inline 0.8) so the dimmed placeholder
  cannot show through as a doubled card/image.
- TDD: new pmd-regression tests "reordering streams preserves the editor scroll
  position" and "reordering jobs preserves the editor scroll position"; the
  existing Drag ghosts test now also asserts ONE `.drag-handle .glyph` and
  `opacity: 1` on the stream and job ghosts.
- `BUILD_NUMBER` bumped via `npm run bump:build`; restart the test server afterwards.

### 2026-10-07 (e) - dark-mode page/stream header surfaces aligned with light (hsl mixes)
- BUG (user): in dark mode the `smd-page` header/footer and the
  `pmd-stream-header` (expanded + non-expanded) did not match light mode.
- `shared/css/themes/dark.css` now mirrors `light.css`:
  `--smd-page-header-background: color-mix(in hsl, var(--bs-primary) 40%, black)`
  (was raw `--bs-primary`) and it carries the stream-header rules. The
  non-expanded stream header uses `var(--smd-page-header-background)` (NOT a
  second copy of the mix), so the page header/footer and the collapsed stream
  header can never drift. `in hsl` (not srgb) keeps the HUE constant - black is
  achromatic, so the powerless-hue rule leaves the theme hue untouched (verified:
  bootstrap #0d6efd hue 217 deg -> mix hue 216 deg).
- MIX LEVEL (user, 2026-10-07): every header-surface mix is **40% colour / 60%
  black** (`color-mix(in hsl, var(--bs-<variant>) 40%, black)`) - grep
  `%, black` across `shared/css/themes/` to change it in one place per rule.
- Per-theme alignment (each theme's dark now matches its light):
  superhero/cyborg/darkly `.light.css` dropped
  `--smd-page-header-background: var(--bs-black)` (they now use the shared
  primary mix) and their `.dark.css` gained the same expanded success-mix as
  light; `superhero.dark.css` dropped
  `--smd-page-header-background: var(--bs-dark)`. `simplex.light.css` /
  `simplex.dark.css` dropped their
  `#smd-app smd-page .smd-page-header { background-color: var(--bs-primary) }`
  rule and the dark footer `background: var(--bs-body-bg)`; simplex.light's
  collapsed stream header now uses `var(--smd-page-header-background)`.
- Probe across bootstrap/superhero/cyborg/darkly/simplex/flatly/quartz/morph x
  light/dark: pageHeader == pageFooter == collapsedStream, and light == dark, for
  every theme.
- TDD: new pmd-regression "Header surfaces > page header/footer and the
  non-expanded stream header are one surface mix, identical in light and dark".
- Verified: pmd-gantt 59/59, pmd Theme colours 5/5, storybook 8/8.
- `BUILD_NUMBER` NOT bumped - bump before shipping (`npm run bump:build`).

### 2026-10-11 - hamburger dropdown item contrast in dark mode + screenshot hover hook
- BUG (user): the Pulse theme in DARK mode had very low contrast on the hamburger
  dropdown (`.dropdown-item`) text. Root cause: `pulse.dark.css` (and most other
  themes' `<theme>.dark.css`) are comment-only stubs, so a theme whose own
  `--bs-dropdown-link-color` / `--bs-dropdown-link-hover-bg` reads poorly on its
  dark menu surface had no override. `#mainNav .dropdown-menu` (shared/css/styles.css)
  paints the popup with `--bs-body-bg` and only re-points `--bs-dropdown-divider-bg`.
- FIX (centralised): `shared/css/themes/dark.css` (the shared DARK mode layer,
  loaded for EVERY theme before the per-theme file) now owns the rule:
  `.dropdown-item { color: var(--bs-body-color) !important }` plus
  `.dropdown-item:hover,:focus { color: var(--bs-white) !important;
  background-color: var(--bs-primary) !important }`. That gives every dark theme a
  legible item colour and a primary hover. Per-theme files still win by document
  order, so a theme can override in its own `<theme>.dark.css`. This is the
  correct layer for a fix that applies to all dark themes - do NOT copy it into
  each `<theme>.dark.css`.
- LIGHT MODE (user, same session): `shared/css/themes/light.css` now carries the
  IDENTICAL `.dropdown-item` / `.dropdown-item:hover,:focus` block, so every light
  theme also gets the primary highlight on hover. The two mode layers are kept
  symmetric - change one, change the other.
- SELECTOR AUDIT: NO theme override file (`shared/css/themes/*/*.{light,dark}.css`)
  defines `.dropdown-item`, `--bs-dropdown-link*` or `--bs-dropdown-bg`, so
  nothing was redundant to remove. The only "dropdown" hits are the
  `--smd-dropdown-*` vars for the `<smd-image-dropdown>` custom element, which are
  a DIFFERENT thing (the image+name selector) and must stay.
- BRITE EXCEPTION: brite's primary is a bright green (`#a2e436`) whose own buttons
  use BLACK text - `bootstrap.min.css` sets `.btn-primary{--bs-btn-color:#000}`
  GLOBALLY, with NO `[data-bs-theme=dark]` override, so the button text is black
  in BOTH modes. White-on-primary (the shared rule) is therefore unreadable for
  brite in both modes. `brite.light.css` AND `brite.dark.css` each override
  `.dropdown-item:hover,:focus { color: var(--bs-black) !important }` to match the
  theme's button. Verified both brite screenshots. GENERAL RULE: the shared white
  foreground assumes a primary that carries light text; a theme whose primary is
  light (needs dark text) overrides the foreground in its own
  `<theme>.<mode>.css`. Check `--bs-btn-color` on that theme's `.btn-primary`.
- SCREENSHOT HOVER GOTCHA (important, cost real time): a `:hover` screenshot
  taken by `screenshotAllThemes` is LOST for themes whose menu item rect moves
  away from the fixed pointer. The mouse is placed ONCE (before the theme loop),
  then the helper re-applies 27 themes x 2 modes; different themes ship different
  Bootstrap versions/padding (brite is 5.3.8, the rest 5.3.3), so the item's
  y/height differs (observed y 97..164, h 29..47) and the fixed pointer no longer
  sits over it -> no `:hover` -> the screenshot silently shows no hover, even
  though the live app (pointer stays on the item) always shows it. This is NOT a
  Playwright limitation; the probe showed `item.matches(":hover")` going false for
  litera/lux/sandstone (pointer below item) and quartz (pointer above item).
- FIX: `tests/screenshot-helpers.js` `createScreenshotAllThemes().screenshotAllThemes(page, scene, { beforeCapture })`
  gained an optional per-call `beforeCapture(page, {theme, mode})` Node hook that
  runs AFTER the theme/mode settles and BEFORE the image-wait + screenshot. The
  pmd "main menu dropdown" test now passes `beforeCapture` that re-hovers the
  "Launch" item each iteration. Verified brite/dark + litera/dark screenshots now
  show the primary hover. Use `beforeCapture` for ANY pointer-dependent scene.
- TEST ADDED: pmd-screenshots "main menu dropdown" now hovers "Launch" and is the
  visual reference for the dark-mode dropdown contrast fix.
- `BUILD_NUMBER` NOT bumped - bump before shipping (`npm run bump:build`).

### 2026-10-12 - CountMyDays "today" events on the PlanMyDay main page (swipe to dismiss)
- FEATURE (user): on the PlanMyDay main page, between the date heading and the
  tabs, show any CountMyDays event that falls TODAY as a `<cmd-countdown-card>`.
  Each card swipes LEFT or RIGHT (mouse or touch) to hide it for the rest of
  today - no confirmation, and CountMyDays' own data is never modified.
- SCOPE: both LOCAL dates (`countmydays_dates`) and DOWNLOADED Google events
  (`countmydays_google_cal`), INCLUDING events marked hidden in CountMyDays (see
  the follow-up below): `cmdGoogleTodayEvents()` maps EVERY feed item via
  `SmdGcal.gcalEntries()`, while CountMyDays' own main view keeps using
  `visibleGoogleEntries()` (`show !== false`). Nothing is fetched.
- NEW `shared/js/smd-gcal.js` (`window.SmdGcal`): the PURE Google-feed helpers
  (`extractCmdPayloadBlock`, `parseCmdUsersObject`, `parseCmdPayloadFromDescription`,
  `gcalEventToDate`, `visibleGoogleEntries`) extracted from
  `CountMyDays/js/googleCalendar.js` and parameterised by user name, so PlanMyDay
  keeps EXACTLY the events CountMyDays shows without duplicating the payload
  parser. CountMyDays keeps thin globals (`gcalEventToDate`, `loadGoogleCalendarEntries`,
  `extractCmdPayloadBlock`, `parseCmdUsersObject`, `parseCmdPayloadFromDescription`)
  that delegate with `getGCalUserName()` bound in - behaviour unchanged.
- NEW `PlanMyDay/js/cmd-today.js`: `renderCmdTodayCards(container)` reads the
  CountMyDays keys raw (its own app namespace is `planmydays_`), keeps today's
  events (`cmdTargetDate`/`cmdIsToday` mirror `CountMyDays/js/utils.js`
  `targetDate`, using PlanMyDay's `getTodayDate()` so the Dev Today override
  applies), builds `<cmd-countdown-card dismissable event-key=…>` and persists
  dismissals. `main-view.js` `renderMain()` appends `#cmdTodayList` right after
  the heading row (before the split-list tabs) and calls it.
- SWIPE: opt-in `dismissable` attribute on the shared
  `CountMyDays/js/components/cmd-countdown-card.js` (CountMyDays passes nothing,
  so it is unchanged). Pointer events on the host, `touch-action: pan-y`, either
  direction past threshold animates off then emits `cmd-countdown-dismiss`
  ({ key }); the app removes the node AND persists. Modelled on
  `pmd-job-today-card._setupSwipe`.
- DISMISSAL FLAG (must not build up over time): `planmydays_cmdDismissed` =
  `{ date: "YYYY-MM-DD", keys: [...] }`, keys `"l|<name>"` / `"g|<name>"`.
  `cmdDismissedKeys()` DELETES the record when its `date` is not today, so it can
  hold at most the current day's dismissals and can never grow across days.
- WIRING: `PlanMyDay/index.html` loads `../shared/js/smd-gcal.js`, then
  `../CountMyDays/js/components/cmd-countdown-card.js`, then `js/cmd-today.js`
  (before main-view.js); `CountMyDays/index.html` loads `../shared/js/smd-gcal.js`
  before googleCalendar.js; `sw.js` SHARED_ASSETS += `shared/js/smd-gcal.js`,
  APPS["PlanMyDay/"] += `PlanMyDay/js/cmd-today.js` (the cmd card is already
  precached once under CountMyDays - the SW cache is origin-wide, see the
  duplicate-URL gotcha above).
- TESTS: 8 in `tests/pmd-regression.spec.js` "CountMyDays Events" (single today
  event; two today events; non-today hidden; renders between the heading and the
  tabs via DOM order + y; swipe LEFT removes only that card and persists one key;
  swipe RIGHT removes; the date-scoped flag resets on a stale record and writes
  exactly one key, not five; downloaded Google events are shown even when marked
  hidden in CountMyDays) + 1 touch swipe in `tests/pmd-touch.spec.js`. All green; cmd full
  65/65 (Google refactor), pmd full run green after the precache fix.
- LESSON (the one that cost time): the first `sw.js` cut ALSO listed
  `CountMyDays/js/components/cmd-countdown-card.js` under APPS["PlanMyDay/"],
  creating a DUPLICATE in `PRECACHE_URLS`; `cache.addAll` rejected, the worker
  never installed and 5 SW/offline tests failed with a misleading "Not found".
  Confirmed by A/B: clean tree installs (`reg.active === true`), change fails,
  and removing the duplicate fixes it. Always check for duplicate precache URLs.
- FOLLOW-UP (same day, user): `regenerateTiles()` (Settings -> Danger ->
  Regenerate Today's Tiles, and `importData()` which calls it) now also removes
  `planmydays_cmdDismissed`, so regenerating brings back any swiped-away
  CountMyDays tiles. New test "Regenerate Today's Tiles clears today's
  CountMyDays dismissals" (dismiss one, run the Settings/Danger flow, assert the
  key is gone AND both cards are back).
- FOLLOW-UP (same day, user): `<cmd-countdown-card>` gained a boolean `hide-count`
  attribute that suppresses the whole `.counts` column
  (`root.querySelector(".counts").hidden = hasAttribute("hide-count")`) - a
  "0 days" countdown on a "today" tile is noise. `PlanMyDay/js/cmd-today.js` sets
  it on every cmd-today card; CountMyDays passes nothing and is unchanged.
  Asserted in the "shows a single CountMyDays event" test (`.counts` hidden).
- FOLLOW-UP (same day, user): PlanMyDay shows downloaded Google events EVEN IF
  they are marked hidden in CountMyDays. Added `SmdGcal.gcalEntries(feed, name)`
  (maps every feed item; `visibleGoogleEntries()` is now `gcalEntries().filter(d
  => d.show !== false)`) and `cmdGoogleTodayEvents()` uses `gcalEntries()`.
  CountMyDays behaviour is unchanged. The Google test now seeds a `show:true` and
  a `show:false` event and expects BOTH.
- FOLLOW-UP (same day, user): a "Refresh Google Calendar" menu entry in PlanMyDay,
  LAST in the hamburger menu after a divider, shown only when CountMyDays' Google
  Calendar is enabled. It calls the EXISTING CountMyDays refresh code: PlanMyDay
  now loads `CountMyDays/js/googleCalendar.js`, and `js/cmd-today.js` points its
  storage at CountMyDays via the new `SmdGcal.setGcalPrefix("countmydays_")`.
  Supporting changes: `SmdGcal` gained `gcalKey`/`googleCalCacheKey`/`loadFeed`/
  `storeFeed` (+ the settable prefix) and CountMyDays' `gcalKey`/
  `googleCalCacheKey` delegate to it; `googleCalendar.js` now calls
  `SmdGcal.loadFeed`/`storeFeed`, guards the optional spinner
  (`gcalShowSpinner`/`gcalHideSpinner`), and returns the refresh/sample promises
  so PlanMyDay can chain `renderMain()`. The menu is `li.gcal-menu-item` (divider
  + item) toggled by `updateGcalMenu()` (called at boot in app.js);
  `refreshPlanMyDayGoogleCalendar()` is the click handler. NOTE:
  `CountMyDays/js/googleCalendar.js` is already precached once under CountMyDays,
  so it must NOT be re-listed under APPS["PlanMyDay/"] (the duplicate-URL
  `addAll` gotcha). New tests: item hidden by default, then visible and LAST after
  a divider when `countmydays_gcal_enabled`; clicking it stubs `fetchEvents`,
  caches `countmydays_google_cal`, and re-renders today's cards. cmd-regression
  full 57/57.
- `BUILD_NUMBER` -> `202610120948` via `npm run bump:build`.

### 2026-10-13 - slate theme: swapped the active/inactive smd-tabs gradients
- BUG (user): on the `slate` theme the smd-tabs active/non-active styling read
  backwards. `shared/css/themes/slate/bootstrap.min.css` (Bootswatch, NEVER
  edited) paints the non-active tab `.nav-tabs .nav-link` with
  `linear-gradient(#313539,#34393d 40%,#373b40)` and the active/hover state
  (`.nav-tabs .nav-link:not([disabled]):not(.disabled).active|:active|:focus|:hover`)
  with `linear-gradient(#44494d,#3a3f44 20%,#2e3236)`.
- FIX (user request): swap them in `shared/css/themes/slate/slate.light.css` and
  `slate.dark.css` (the same swap in both modes - Slate ships ONE gradient set):
  `#smd-app smd-tabs .smd-tab-btn { background-image: <the old active gradient> }`
  and `#smd-app smd-tabs .smd-tab-btn.active { background-image: <the old
  non-active gradient> }`. The `#smd-app` scope gives the rules an ID, so they
  outrank the theme's `(0,5,0)` active/hover selector and the swap HOLDS through
  hover/focus (no extra hover rules needed). This is a per-theme override file
  carrying COMPONENT SELECTORS (like `simplex`/`cyborg`), which the 2026-09-26
  "variables only" guidance discouraged - the user asked for it here.
- TDD: new `pmd-regression` "Theme colours" test "slate swaps the active/inactive
  tab gradients in both modes" (applyTheme slate light/dark, wait for
  `#theme-override-specific` sheet, then assert the computed `background-image`
  of the active and inactive `.smd-tab-btn` equals the swapped literals). Probe
  confirmed both modes.
- `BUILD_NUMBER` -> `202610131043` via `npm run bump:build`.

### 2026-10-13 (b) - auto-hide nav now closes an open hamburger dropdown
- BUG (user): with auto-hide menu on, tapping the hamburger opened the dropdown,
  but when the nav timed out and slid away the dropdown remained over the page.
  ROOT CAUSE: the dropdown is a CHILD of `#mainNav`, but it is much TALLER (a
  ~340px menu vs a ~65px nav). `hideNav()` adds `.nav-hidden` (translateY(-100%)),
  which moves a 65px nav fully off screen but only shifts the tall menu part-way,
  so the button vanished while the menu lingered (probe: menu y went 59 -> -6,
  still on screen).
- FIX (`shared/js/smd-settings.js`): new `closeMainNavDropdown()` (uses
  `bootstrap.Dropdown.getInstance(#btnMainMenu).hide()`, with a manual
  `remove("show")` + `aria-expanded=false` fallback) and `hideNav()` calls it
  before adding `.nav-hidden`. Only the hamburger menu is affected; other
  `.dropdown-menu`s are untouched.
- TDD: new pmd-regression test "Auto-Hide Nav Behavior > nav auto-hide also closes
  an open hamburger dropdown" (open the menu, `hideNav()`, assert `nav-hidden` AND
  the menu is not visible). Probe also confirmed the REAL 4s timer path (menu
  `display:none`, `aria-expanded=false` after the timeout with no interaction).
- `BUILD_NUMBER` -> `202610131100` via `npm run bump:build`.

### 2026-10-13 (c) - CountMyDays Add Date: empty Title placeholder + today's date
- REQUEST (user, "CountMyDays Add Job" = the Add/Edit Date page): the Title must
  have NO default text (only a `placeholder="Title"`), and the date must default
  to TODAY for both the Annual and Once options.
- FIX (`CountMyDays/js/dates-editor.js`): `addNewDate()` no longer seeds
  `name: "New Event"` (now `name: ""`) and no longer seeds `month: 1, day: 1` -
  it seeds `month/day/year` from `new Date()`. `renderDateEditContent()` adds
  `placeholder="Title"` to `#dateNameInput`. Annual reads month/day, Once reads
  day/month/year (via `onceDateValue`), so both now open on today; switching type
  keeps the day/month. NOTE: `doneDateEdit()` still falls back to `"Untitled"`
  when the name is left empty - unchanged.
- TDD: new cmd-regression "Dates editor" test "Add Date has an empty Title
  placeholder and defaults the date to today" (empty value + `placeholder=Title`;
  annual `#dateDaySelect`/`#dateMonthSelect` = today; `#smdDatePickerAlt` = today's
  `d/m/Y` after picking Once; switching back to Annual still today). Dates editor
  suite 11/11 (user runs the full regression later).
- `BUILD_NUMBER` -> `202610131105` via `npm run bump:build`.

### 2026-10-13 (d) - two flaky tests diagnosed + hardened (test-only)
- The full run had two tests fail once then pass on retry:
  `cmd-regression` "Sub-path deployment > no console errors ... SW precache" and
  `pmd-regression` "Theme colours > slate swaps the active/inactive tab gradients".
- SLATE (test race, NOT the CSS): `applyTheme()` sets the override `<link>`'s
  href synchronously, but the browser keeps the PREVIOUS CSSStyleSheet in
  `link.sheet` for a tick (probe: `href` reads slate.dark.css while `link.sheet`
  is still the old sheet with `cssRules.length > 0`). So the old wait
  ("href matches AND link.sheet.cssRules > 0") passed BEFORE the new sheet was
  applied and the read caught the theme's UNSWAPPED gradient. FIX: the test now
  `expect.poll`s the COMPUTED `background-image` of `.smd-tab-btn.active` /
  `:not(.active)` until it equals the expected swapped literal (15s) - a wrong or
  missing override still fails with a clear diff. Verified non-vacuous by
  mutating `slate.dark.css` (test failed, then reverted). GENERAL LESSON: after a
  theme/mode swap, assert the APPLIED computed style, never the link/`sheet` (a
  stale sheet makes a link-based wait pass early).
- SUB-PATH SW (infra): the only console error was
  "Failed to load resource: net::ERR_CONNECTION_REFUSED" - the single
  `tests/serve-tests.mjs` Vite server refusing a connection under parallel shard
  load (the test's own install-retry poll recovers). FIX: the console handler now
  ignores transient network-level
  `Failed to load resource: net::ERR_(CONNECTION_REFUSED|CONNECTION_RESET|
  CONNECTION_CLOSED|NETWORK_CHANGED|EMPTY_RESPONSE)`; every other console error
  still fails. (Encodes the documented "treat ERR_CONNECTION_REFUSED as infra".)
- TEST-ONLY: no app or BUILD change (`BUILD_NUMBER` unchanged).

### 2026-10-13 (e) - smd-image-dropdown now mirrors the form-field palette (all themes) + materia sheen
- BUG (user, PlanMyDay > Add Stream page): the shared `<smd-image-dropdown>`
  (`#streamTabDropdown`) looked odd/low-contrast next to the other form fields —
  reported on materia dark, then minty dark+light, pulse dark, quartz light,
  simplex dark, slate dark and vapor light.
- CAUSE (probed across all 27 themes x both modes, not guessed): the shared
  `--smd-dropdown-*` palette derived from `--bs-tertiary-bg`/`--bs-body-color`,
  which diverge per theme, while the form fields use the fixed `--smd-form-*`
  surface (`--bs-white`/`--bs-gray-900` in light, `--bs-body-bg`/`--bs-body-color`
  in dark). So on dark themes the button was a lighter grey than the fields, and
  on "light" themes whose body text is light (quartz `#fff`, vapor `#32fbe2`,
  slate `#aaa`) the LABEL went white/near-white on the `#f8f9fa` button (contrast
  1.05/1.24). SEPARATE cause on materia ONLY: its stock `.btn` sets
  `background-image: var(--bs-gradient)` (a white 15% sheen) on top of the
  background-color — a 27-theme sweep showed materia is the only theme whose
  dropdown `.btn` computes a background-image.
- FIX (user chose the central fix): `shared/css/themes/light.css` AND `dark.css`
  (the shared MODE layer) now point `--smd-dropdown-background/foreground/
  border-color` at `--smd-form-*`. `shared/css/themes/materia/materia.dark.css`
  clears the sheen with `#smd-app smd-image-dropdown .btn { background-image:
  none }` (the `#smd-app` scope is required: materia re-applies the gradient on
  `.btn:focus-visible` (0,2,0), which beats a bare `smd-image-dropdown .btn`
  (0,1,1)).
- NO HOVER COLOUR (user, same session): the closed control is field-like (it
  replaced <select>s) and a plain `.btn` toggle does not change background on
  hover, so the `smd-image-dropdown .btn:hover,:focus-visible` rule now just
  RE-ASSERTS the base colours (no change) and the `--smd-dropdown-hover-*` vars
  were dropped from light.css/dark.css; a short-lived brite hover override was
  reverted. The menu ITEM hover (real dropdown behaviour) is untouched.
- TDD (3 new pmd-regression "Theme colours" tests, RED first, GREEN after):
  "materia dark image dropdown matches the form field surface (no Bootstrap
  gradient)"; "image dropdown surface and label match the form fields across
  themes" (the 7 reported theme/modes, asserts button bg/label == the live
  `.form-control` AND contrast >= 4.5). GOTCHA encoded: `applyTheme()` swaps the
  base/mode sheets async and the palette is momentarily absent (button AND input
  transparent + default black), so the poll REQUIRES the contrast, not just a
  match (seen on simplex/dark).
- Verified: Theme colours + pmd `dropdown` 13/13 (incl. the 7 Stream-dropdown
  layout tests), cmd-regression 58/58, storybook-regression 8/8. Full regression
  left to the user.
- `BUILD_NUMBER` NOT bumped — bump before shipping (`npm run bump:build`); all
  edited sheets are precached SHARED_ASSETs, so the bump is what installs the worker.

### 2026-10-13 (f) - theme contrast sweep: minty hamburger, page-header headings, quartz tabs, form focus
- Several PRE-EXISTING theme-contrast bugs reported while testing (e) (none caused
  by it):
  1. MINTY hamburger white-on-white: Bootswatch minty ships
     `.btn,.btn:hover{color:#fff}` (every button white text) and the
     background-less `#btnMainMenu` is a plain `.btn` -> invisible on the white
     nav. FIX (`shared/css/styles.css`): `#btnMainMenu { color:
     var(--bs-body-color) }` — the ID scope (1,0,0) beats `.btn` (0,1,0) and
     `.btn:hover` (0,2,0).
  2. PAGE-HEADER h1 dark-on-dark (minty light): Bootstrap's
     `h1 { color: var(--bs-heading-color) }` wins over the header's inherited
     colour, so a theme that sets `--bs-heading-color` (minty #5a5a5a) painted a
     dark h1 on the dark header band. FIX (`styles.css`): the `.smd-page-header`
     rule also sets `--bs-heading-color: var(--smd-page-header-color)`.
  3. QUARTZ tabs white-on-white (BOTH modes): quartz paints
     `.nav-tabs .nav-link.active` with
     `linear-gradient(125deg,#fff,rgba(255,255,255,.9) 70%)`, a near-white sheen
     over the `text-bg-primary` (pink) active tab. FIX (`quartz.light.css` +
     `quartz.dark.css`): `#smd-app smd-tabs .smd-tab-btn { background-image: none }`.
     (Slate KEEPS its gradient — the 2026-10-13 swap is intentional — so this is a
     per-theme fix, NOT a blanket clear in smd-tabs.)
  4. FORM FOCUS not primary (vapour dark): `--smd-form-focus-border-color` was a
     50% primary/body-bg mix (reads muted). FIX (`light.css` + `dark.css`): now
     `var(--bs-primary)`.
  5. CHECKBOX tick mid-blue (vapour dark, all themes): `--smd-checkbox-accent` was
     `auto` (the browser's default accent). FIX (`light.css` + `dark.css`): it is
     now `var(--bs-primary)` for every theme, so the checked box matches the UI.
- TDD: 4 pmd-regression "Theme colours" tests: "the hamburger icon is legible on
  the nav surface across themes", "page header headings use the header foreground
  across themes", "quartz tab buttons are not white-on-white in either mode",
  "focused form fields use the theme primary border" (added a shared `smdContrast`
  helper that parses rgb()/color(srgb)).
- REVERTED (user): the smd-image "auto theme re-tints on hover" change from the
  earlier attempt was backed out COMPLETELY — `shared/js/components/smd-image.js` is
  byte-identical to HEAD again (it was only needed for the now-removed dropdown
  hover). The dropdown `:hover` also no longer changes colour (see (e)).
- NOT FIXED, BY DESIGN (user): a native `<select>` open option list and its hovered
  row are rendered by the browser/OS (Windows Chrome = the OS accent blue) and
  cannot be styled from page CSS. Matching the primary there would need replacing
  native selects with a custom dropdown; the user chose to leave native selects
  as-is.
- Verified: Theme colours 12/12, smd-image rendering 7/7, pmd `dropdown` 13/13,
  cmd-regression 58/58, storybook-regression 8/8. Full regression left to the user.
- `BUILD_NUMBER` NOT bumped — bump before shipping (`npm run bump:build`); all
  edited sheets are precached SHARED_ASSETs.

### 2026-10-13 (g) - PlanMyDay main view: job list now renders inside the active tab panel
- BUG (user): on the PlanMyDay main screen with Split List on, the job list was
  rendered BELOW the `smd-tabs` `.tab-content` (the panels were empty; the app set
  `hide-panels` and appended `#countdownScrollBody` as a sibling). The user wants
  the content INSIDE the tab panel.
- FIX (`PlanMyDay/js/main-view.js`): drop `hide-panels`; after the tabs render,
  append `#countdownScrollBody` into `#todayTabs > .tab-content >
  .smd-tab-panel.active`. New `injectTodayTabsLayout()` injects a flex chain
  (`#todayTabsWrap` / `#todayTabs` / `.tab-content` / `.smd-tab-panel.active` = flex
  column with `min-height:0`) so the tab bar stays put and the ACTIVE panel scrolls
  its body — the smd-tabs sheet only sets `display:block`, so this app-specific
  layering lives in the app. Non-split mode still appends the scroll body to
  `#countdownContainer`.
- TDD: new pmd-regression `Split List` test "the job list renders inside the active
  tab panel, not below it" (RED first: scrollInPanel false; GREEN after). Asserts
  `#countdownScrollBody`/`#todayCardList` are inside the active panel and
  `hide-panels` is gone.
- Verified: Split List 7/7, Main View + Coverage 163/163, pmd-touch 6/6, Theme
  colours 13/13. Full regression left to the user.
- `BUILD_NUMBER` NOT bumped — bump before shipping (`npm run bump:build`);
  `PlanMyDay/js/main-view.js` is a precached `APPS["PlanMyDay/"]` asset.

### 2026-10-13 (h) - new shared <smd-select>; theme/mode + all appearance settings migrated
- WHY (user): a native `<select>`'s open list is OS-rendered (Windows Chrome = the
  OS accent blue) and cannot be themed; the user wants the hovered/selected row to
  use the primary BUTTON variant, cross-browser.
- NEW `shared/js/components/smd-select.js` — see the durable note in "Project
  status". Button reuses `.form-select`; rows `.smd-select-item[data-value]`; the
  hovered row gets the primary surface from CSS `:hover`/`:focus-visible` (always
  shows) plus `.text-bg-primary` for the theme-correct contrast text; the selected
  row is `.active.text-bg-primary`; `text-decoration: none` (rows are `<a>`); menu
  `z-index: 1030`.
- WIRED: `smd-theme.js` uses it for the Theme / Theme Mode fields. Registered in
  all 8 shells BEFORE `smd-theme.js` and in `sw.js SHARED_ASSETS`. (PhoneButtons was
  initially missed -> its settings theme control stayed an unupgraded empty element
  and one test failed with "hidden"; ALWAYS grep EVERY shell when adding a shared
  component.)
- ENABLERS (so later phases are a tag swap): bubbling `change` event; declarative
  `<option>` children; drop a host `form-select` class; `w-auto`; keyboard nav.
- PHASE 2: all appearance-settings selects in the 7 shells converted (font/icon/
  density/touch size, slide duration, CM format + max countdowns, PMD suffix-start/
  jan1/monday/start-week, FFox x/o piece style). Tests: new
  `tests/theme-controls.js` `pickOption` (clicks `[data-value]`); `.selectOption` ->
  `pickOption`, `option` count -> `.smd-select-item`, `toHaveValue` ->
  `toHaveAttribute("value")` across pmd/cmd/launch/ffox/phonebuttons.
- Verified: storybook 8/8, settings-alignment 13/13, launch 7/7, qrlinks 9/9,
  cmd 58/58, ffox 11/11, solarcontrolar 12/12, phonebuttons 18/18, pmd `Setting`
  48/48, pmd `theme and mode` 2/2. Full regression left to the user.
- TOUCH: there is no hover on touch (expected); the selected row stays highlighted
  and a tap picks.
- `BUILD_NUMBER` NOT bumped — bump before shipping.

### 2026-10-13 (i) - smd-select rollout: enablers + Phase 2 (appearance settings) + Phase 3
- ENABLERS added to `smd-select.js` so a migration is a tag swap: bubbling `change`
  event (inline `onchange="fn(this.value)"` keeps working), declarative `<option>`
  children read on connect, host `form-select`/`form-select-sm` class dropped,
  `w-auto` (shrink-to-fit), keyboard nav. `_build()` clears ALL children
  (`this.textContent = ""`) and the template is whitespace-free, so the inter-tag
  whitespace left by the `<option>`s cannot render as a stray line in the host
  (reported on FFOX; it was actually a misread of the row below, but the cleanup
  is correct).
- PHASE 2: all appearance-settings selects in the 7 shells are `<smd-select>`
  (font/icon/density/touch size, slide duration, CM format + max countdowns, PMD
  suffix-start/jan1/monday/start-week, FFox x/o piece style).
- PHASE 3: SolarControlar `#log-file`/`#graph-date` (graph-tab's `loadGraphDates`
  now assigns `.options`, NOT `innerHTML`), PhoneButtons `#buttonKeyNamed`/
  `#buttonPressSelect`.
- TESTS: `tests/theme-controls.js` `pickOption` clicks `.smd-select-item[data-value]`;
  `.selectOption` → `pickOption`, `option` count → `.smd-select-item`, `toHaveValue`
  → `toHaveAttribute("value")`. Also fixed a strict-mode locator: solar's
  `.log-controls button` now matches the select's inner button too → use
  `.log-controls .btn-primary`.
- Verified: cmd 58/58, launch 7/7, ffox 11/11, phonebuttons 13/13, solarcontrolar
  12/12, qrlinks 9/9, storybook 8/8, settings-alignment 13/13, pmd `Setting` 48/48,
  pmd `theme and mode` 2/2. Full regression left to the user.
- `BUILD_NUMBER` NOT bumped — bump before shipping.

### 2026-10-13 (j) - smd-select rollout: Phase 4 (CountMyDays editors + wizards)
- `smd-select.js` gained a `disabled` getter/setter (reflecting the attribute): the
  import wizard assigns `select.disabled = …`, and a plain own property on a custom
  element would never have reached `attributeChangedCallback`.
- Migrated (tag swap, `<option>` children kept): CM `#dateDaySelect`/`#dateMonthSelect`/
  `#dateTypeSelect` (dates-editor), `#gcalCategorySelect` (googleCalendarEditor), the
  export wizard category filter (export.js, no id) and `#imgExistingSelect`/
  `#catExistingSelect`/`#dateExistingSelect` (import-wizard).
- TESTS (cmd-regression): `#dateDaySelect`/`#dateMonthSelect` toHaveValue →
  toHaveAttribute("value"); `#dateTypeSelect`/`#dateDaySelect`/`#dateMonthSelect`/
  `#gcalCategorySelect`/`#dateExistingSelect` `.selectOption` → `pickOption`.
- Verified: cmd-regression 58/58. Full regression left to the user.
- `BUILD_NUMBER` NOT bumped — bump before shipping.

### 2026-10-13 (k) - smd-select rollout: Phase 5 (PMD job editor + schedule modal)
- Tag swaps in `PlanMyDay/js/job-editor.js`: `#jobTimeHour`/`#jobTimeMin` and the
  dayType/mod selects (kept their `<option>` markup, so `selected`/`disabled` work).
- The SCHEDULE MODAL's `#schedNInterval`/`#schedNOffset`/`#schedMonthlyDay` had NO
  markup options (they were populated with `innerHTML=""` + `appendChild(<option>)`),
  so `openScheduleModal` and `onScheduleNDaysChange` now assign `.options` and set
  `.value` instead — assigning `.innerHTML`/appending `<option>` would wipe the
  component. The modal content is LIGHT DOM inside `#smdConfirmModal`, so
  `scheduleEl()` (`host.querySelector`) reaches the elements.
- TESTS: `#jobTimeHour`/`#jobTimeMin`/`#schedMonthlyDay`/`#schedNInterval`/
  `#schedNOffset` `.selectOption` → `pickOption`.
- Verified: pmd-regression `[Ss]chedule` 39/39. Full regression left to the user.
- `BUILD_NUMBER` NOT bumped — bump before shipping.

### 2026-10-13 (l) - smd-select rollout: Phase 6 (storybook + cardViewer) — COMPLETE
- storybook `#ctrl-modal-buttons`/`#ctrl-image-theme`/`#ctrl-image-size` tag-swapped
  (their `form-select-sm` moved onto the inner button); `cardViewer.html`
  `#cardSelect`/`#themeSelect` tag-swapped AND their JS builders now assign
  `.options` (`populateCards` flattens the optgroups — `<smd-select>` is
  data-driven; `populateThemes` builds the list). `cardViewer.html` now loads
  `shared/js/components/smd-select.js`.
- `<smd-select>` gained small-size support: `_small` is captured from a host
  `.form-select-sm` class OR `size="small"` and applied to the button.
- TESTS (storybook-regression): cardViewer `#cardSelect`/`#themeSelect` `option`
  count/text → `.smd-select-item`, `toHaveValue` → `toHaveAttribute("value")`,
  `selectOption` → `pickOption`; the "chrome and controls use Bootstrap utilities"
  test now treats `.sb-controls smd-select` as a control (asserting its inner button
  has `form-select`+`form-select-sm`) and excludes `.smd-select-btn` from the
  generic button check.
- Verified: storybook-regression 8/8 (incl. the card viewer across every theme x
  both modes). REPO-WIDE: no native `<select>` element remains in the app shells or
  storybook (only comments mention `<select>`); the dev-only `screenshots/viewer.js`
  is untouched.
- `BUILD_NUMBER` NOT bumped — bump before shipping.

### 2026-10-13 (m) - PhoneButtons server: icon filename + bracket keys
- Two `PhoneButtons/server/app.py` bugs (app names come from
  `_get_friendly_name(exe)` and can contain odd characters):
  1. `_cache_icon` used the raw app name as the icon FILENAME, so "Intel(R)
     PROSet/Wireless Event Log Service" (a `/`) made `open()` look for a
     non-existent subdirectory -> `FileNotFoundError` -> HTTP 500 on `/api/apps`.
     FIX: new `_icon_filename(name)` maps Windows-illegal filename characters
     (`< > : " / \ | ? *`, control chars) to `_`, trims trailing dots/spaces and
     falls back to `icon.png`; spaces/dots/parens are KEPT so existing cache files
     and their URLs are unchanged. Used in `_cache_icon` + `_set_app_icon_pref`.
  2. `_resolve_key` used `ord(value.upper())` for a single character, but `ord` is
     NOT the virtual-key for punctuation: `ord("[") == 0x5B == VK_LWIN` and
     `ord("]") == 0x5D == VK_APPS`, so `[`/`]` were sent as the Windows / context
     menu keys (same class of bug for semicolon/quote/comma/period/slash/backslash/
     backtick/minus/equals). FIX: map the character with
     `ctypes.windll.user32.VkKeyScanW` (the ACTIVE layout) -> `(vk, needs_shift)`,
     and `_parse_key_string` folds the SHIFT requirement into the modifiers (so `{`
     sends Shift+`[`). `handle_button_press` now reuses `_parse_key_string`.
- NO Playwright coverage (the specs mock the server); verified with `py_compile`
  and a ctypes simulation (`[`->0xDB, `]`->0xDD, `{`->Shift+0xDB, `alt+F4`->Alt+0x73,
  `MEDIA_NEXT_TRACK`->0xB0, `ctrl+shift`->mods only).
- No front-end/BUILD change.

### 2026-10-13 (n) - form fields now keep the Bootswatch surface (reference fidelity)
- REQUEST (user): on lux (e.g.) the form field background differed from the
  Bootswatch reference - the shared form repaint forced the surface.
- AUDIT (all 27 themes x both modes, parsing each theme file): Bootswatch's
  `.form-control` background is mode-INDEPENDENT; 16 themes use
  `var(--bs-body-bg)` (field == page, so the reference has no difference either)
  and 11 give the field a DISTINCT surface (lux #f7f7f9, materia transparent,
  morph #f0f5fa/#bed1e6, quartz transparent, simplex #fcfcfc, solar #adb5bd,
  vapor #30115e, cyborg/darkly/slate/superhero #fff).
- FIX (user chose full fidelity): `shared/css/styles.css` no longer repaints the
  form field `background-color` OR `color`, so Bootswatch's own surface AND text
  show for every theme/mode. It keeps ONLY the BORDER repaint
  (`--smd-form-border-color`, plus the primary FOCUS border
  `--smd-form-focus-border-color` the user asked for earlier); the `:disabled`
  rule was dropped. `--smd-form-*` stay defined (the flatpickr palette consumes
  them). NOTE the earlier per-theme `--smd-form-background: var(--bs-body-bg)`
  overrides (superhero/cyborg/darkly) are now inert for fields.
- KNOCK-ON: the `smd-image-dropdown` (#streamTabDropdown/#jobStreamDropdown/
  #dateCategorySelect/...) and PhoneButtons `pb-image-dropdown` buttons were
  `.btn` on the `--smd-dropdown-*` palette, so they no longer matched the (now
  Bootswatch) fields. BOTH components' buttons are now `class="form-select"`
  (Bootswatch surface + text, no `.btn` gradient), with the shared flex layout,
  the component's OWN caret, and `background-image: none; padding: .375rem .75rem`
  in the components' injected layout so the geometry is unchanged. The `.btn`
  colour rules were removed from styles.css + the pb component, and
  `PlanMyDay/js/editor-styles.js` selectors became `.form-select`. `materia.dark.css`
  is now EMPTY (its `.btn` sheen clear is moot).
  GOTCHA: a `//` comment containing BACKTICKS inside a component's template-literal
  CSS terminates the literal and turns the CSS into code
  (`ReferenceError: select is not defined`) - use `/* */` and no backticks.
- FIELD TEXT (follow-up): dropping the shared `color` repaint exposed Bootswatch
  bugs where the field TEXT is wrong on its own surface. A full audit (27 themes x
  2 modes, browser ground truth) found exactly three unreadable combos: lux dark
  (`.form-select` = `--bs-body-color` #eceeef on the light #f7f7f9 field - Bootswatch
  only re-colours `.form-control` in dark), morph dark (1.19) and materia dark
  (2.80). Fixed with per-theme dark overrides in `shared/css/themes/<t>/<t>.dark.css`
  using `--bs-*` vars (NOT hex): lux + morph `.form-select`/`.form-control` ->
  `var(--bs-gray-700)` (their own field text, mode-stable), materia ->
  `var(--bs-body-color)`. Remaining sub-4.5 combos (minty light 3.54, morph light
  3.10, spacelab light 4.48) are Bootswatch's own muted palette = the reference, so
  they are left alone.
- TESTS (pmd-regression "Theme colours"): new "form fields keep the Bootswatch
  surface across themes and modes" AND "form field text stays legible on the field
  surface across themes" (contrast >= 3 over the previously-broken + representative
  combos); "materia dark image dropdown matches the form field surface";
  "image dropdown surface and label match the form fields across themes" now asserts
  the dropdown button (a `.form-select`) matches the field bg + text (no contrast
  assertion; for transparent-field themes it requires the base theme sheet to have
  loaded). "Stream dropdown layout" selectors `.btn` -> `.form-select`.
- Verified: pmd Theme colours 15/15, pmd `dropdown` 13/13, cmd-regression 58/58,
  phonebuttons 13/13. Full regression left to the user.
- `BUILD_NUMBER` NOT bumped.

### 2026-10-13 (o) - Bootswatch borders restored, ALL themes re-vendored to 5.3.8, no hardcoded hex in app code
- BORDERS: dropped the last form repaint (the non-focus `border-color`), so
  `.form-control`/`.form-select` take Bootswatch's OWN border too. Only the primary
  FOCUS border (`--smd-form-focus-border-color`) remains. This fixed litera, darkly,
  quartz, sketchy, slate, solar and superhero (litera dark was #495057 instead of
  Bootswatch's `rgba(0,0,0,.1)`).
- VERSION DRIFT (the real cause of "lux's field is a slightly different shade"):
  the vendored themes were Bootswatch **5.3.3** while bootswatch.com is **5.3.8**
  (only brite was 5.3.8). Re-vendored ALL 27
  `shared/css/themes/<t>/bootstrap.min.css` from 5.3.8 (bootswatch.com/5/<t>; the
  stock `bootstrap` theme from `bootstrap@5.3.8` on jsdelivr) plus
  `shared/vendor/bootstrap.bundle.min.js` 5.3.3 -> 5.3.8. The transform replaces
  the live Google Fonts `@import url(...)` with the local
  `@import "../../fonts/fonts.css";` for the themes that already had it (the rest
  have no @import). Verified every vendored file was an UNMODIFIED upstream 5.3.3
  first; the rule-level drift audit now reports 0 changed rules for every theme.
  lux's field surface therefore changed #f7f7f9 -> #f0f1f2 and gained a 1px border
  (the reference look).
- STILL NEEDED at 5.3.8: lux's `[data-bs-theme=dark] .form-select` still sets only
  the caret image, not the colour, so `lux.dark.css`'s
  `#smd-app .form-select { color: var(--bs-gray-700) }` stays; the morph/materia
  dark overrides stay too.
- NO HARDCODED HEX in app code - converted the last 5 spots to theme vars:
  `PlanMyDay/js/gantt.js` 13x `color:#fff` -> `var(--smd-secondary-text,
  var(--bs-white))` / `var(--smd-primary-text, var(--bs-white))`;
  `SolarControlar/js/graph-tab.js` chart series -> `--bs-warning/-info/-success/
  -purple/-danger` (resolved at draw time by `resolveSeriesColor`, re-read on
  theme change + base-sheet load); `SolarControlar/js/components/solar-top-tiles.js`
  flap gradient -> color-mix on `--bs-dark`, separator -> `--bs-danger`, battery
  fills -> `--bs-{danger,warning,success}`; `shared/css/themes/slate/slate.{light,dark}.css`
  tab gradients -> color-mix on `--bs-gray-800` (percentages picked so the stops
  match Bootswatch's literals exactly); `shared/js/smd-images.js` preview swatches ->
  NEW fixed constants in light.css/dark.css. Those swatches are deliberately
  theme-INDEPENDENT: the image editor shows the icon on a plain WHITE and a plain
  BLACK background, so the values are pure `#ffffff` / `#000000` (plus fixed
  border/text: `--smd-preview-{light,dark}-{background,border,foreground}`).
  NEVER drive them from `--bs-body-bg`/`--bs-body-color`: superhero's LIGHT mode is
  itself dark, so its light body TEXT is light and the white swatch went
  light-on-light (the reported "Edit Image page is not right"). REMAINING hex is intentional:
  the `<input type="color">` defaults in smd-images.js must be hex, and hex inside
  COMMENTS. The vendored `bootstrap.min.css` files legitimately contain hex (they
  define the --bs-* vars).
- TESTS: pmd-regression "Theme colours" lux field surface -> `rgb(240, 241, 242)`;
  the slate gradient test normalises Chromium's `color(srgb ...)` serialisation of
  a color-mix() stop. GOTCHA: a computed `color-mix()` serialises as
  `color(srgb r g b)` with 0..1 channels, NOT `rgb()` - parse, don't string-compare.
- Verified: pmd Theme colours 15/15, pmd `dropdown` 13/13, Image Editing UI 23/23,
  pmd-gantt 130/130, cmd 58/58, phonebuttons 13/13,
  storybook+launch+ffox+qrlinks+solar 47/47. The user's full regression found exactly
  one failure (the image-editor preview panels) which is now fixed.

### 2026-10-13 (p) - smd-select exclusivity + item padding, tab-line gap, white/black image swatches
- SMD-SELECT EXCLUSIVITY: only ONE `<smd-select>` menu may be open at a time (a
  native `<select>` popup is exclusive too). `smd-select.js` tracks the open
  instance in a module-level `_openSelect`; `_toggleMenu()` closes any other open
  menu before opening, and `_closeMenu()` clears the reference. Before this,
  opening a second select left the first open.
- SMD-SELECT ITEM PADDING: `smd-select .smd-select-item` had NO padding, so the
  option text sat flush against the menu border. Now `padding: 0.25rem 0.75rem` -
  0.75rem matches the `.form-select` button's left padding, so the option text
  lines up with the button label.
- TAB-LINE GAP: the `smd-tabs` underline had no gap to the panel content, so the
  main view's job tiles touched the line. The layout injection now sets
  `smd-tabs .smd-tab-list + .smd-tab-line { margin-bottom: 0.25rem; }` (Bootstrap
  `mb-1`) so the space under the line matches the `mb-1` gap between the tiles.
- IMAGE SWATCHES ARE WHITE/BLACK: `<smd-image-card>`'s two theme swatches used
  `bg-body` under `data-bs-theme`, so a theme whose "light" surface is not lighter
  (superhero light = dark navy #0f2537) rendered the LIGHT swatch dark. Both the
  card swatches AND the edit dialog's swatches now use the fixed
  `--smd-preview-{light,dark}-{background,border,foreground}` constants (white
  #ffffff / black #000000 with fixed border + text) from light.css/dark.css. The
  card swatch also drops Bootstrap's `.border` class (its `!important` border
  colour beat the inline one) for an inline `border: 1px solid var(...)`.
- TESTS: cmd-regression "image tile shows the main image plus light and dark theme
  swatches on one row" now asserts the FIXED white/black swatch backgrounds (it
  used to compare against `--bs-body-bg`); pmd-regression "theme panels use fixed
  white and black backgrounds".
- Verified: cmd 58/58, pmd (Theme colours|dropdown|tab|select) 106/106,
  storybook/launch/ffox/qrlinks/solar 47/47 (the one cmd swatch failure in the
  combined run was the assertion updated above).

### 2026-10-14 (q) - quartz: smd-page uses the body gradient; cards use the alert glass
- Both edits are confined to `shared/css/themes/quartz/quartz.{light,dark}.css`.
- SMD-PAGE BACKGROUND: quartz's `<body>` carries the brand gradient
  (`linear-gradient(90deg,#33b7e2,#5e62b0,#dc307c)`; it is NOT dark-scoped, so it
  applies in both modes). The shared sheet paints `.smd-page` with the flat
  `--bs-body-bg` colour only, so dialogs showed a plain purple / near-black slab.
  The override mirrors the body gradient on `#smd-app smd-page .smd-page`.
- CARDS LIKE ALERTS: the shared mode layer (light.css) forces
  `.card { background: var(--bs-secondary-bg-subtle) !important }` for the other
  themes, which flattened quartz's own glass card into an opaque panel AND left
  quartz's white card text on a near-white surface. `quartz.<mode>.css` now
  restores quartz's card/alert glass treatment - `!important` is needed to beat the
  shared rule (this sheet loads after it, so the tie goes here): transparent
  background + the `linear-gradient(125deg, rgba(255,255,255,.3), rgba(255,255,255,.2) 70%)`
  sheen, `border:none`, the inset + drop box-shadow, `backdrop-filter: blur(5px)`
  and white text.
- Verified with screenshots in both modes (page shows the body gradient; tiles are
  glass with readable white text) and pmd Theme colours + cmd Images editor greps
  44/44. No test was added because the fix was constrained to the two quartz files.
- JOB TILES IN THE STREAMS EDITOR: quartz's `.accordion-item` is glass too, so the
  streams editor's job tiles (`<pmd-job-summary-card>` -> `.card`, inside
  `.stream-accordion-item`) composited over a SECOND glass layer and read far
  lighter than the main page cards. The same two quartz files now clear
  `.stream-accordion-item`'s own surface (transparent + no image + no backdrop
  filter), so the tiles sit directly on the page background - the SAME background
  as the main page cards. pmd (Theme colours|Streams|stream|accordion) 76/76.

### 2026-10-14 (r) - PMD screenshots: added a Gantt scene
- `tests/pmd-screenshots.spec.js`: new "gantt" scene writing
  `screenshots/pmd/<theme>/<mode>/gantt.png` for all 27 themes x light/dark.
- The Gantt page only exists once the `planmydays_showGantt` setting is on, and the
  chart needs seeded streams (`seedMainView`), so the test sets the flag, reloads,
  calls `openGantt()` and waits for `.rg-gantt-bar`.
- It lives in a NESTED describe with a WIDE viewport (1280x900, no mobile
  emulation). At the sheet's phone viewport (390x797) the revo-grid virtualises the
  timeline columns off-screen and NO bars render - the scene would be an empty
  grid (verified: desktop = 5 bars, phone = 0).
- `refreshPmdAfterTheme()` now also calls `refreshGanttIfOpen()`: the chart reads
  the theme tokens itself and its own MutationObserver only watches
  `data-bs-theme` (which does NOT change on a same-mode theme swap), so without
  this the bars kept the previous theme's colours across the 27-theme loop.
- Verified for superhero + quartz (light/dark). No BUILD bump (test-only change).

### 2026-10-14 (s) - New ListOfLists app (copy of PlanMyDay, full rename)
- WHAT: created `ListOfLists/` by copying PlanMyDay and applying a FULL rename.
  Stream -> Category, Job -> List, Task -> List Item; `pmd-*` components/events
  -> `lol-*`; `SmdConfig.storagePrefix = "lol_"`. Dropped the Gantt and the
  CountMyDays/Google integrations. "today page" naming -> "main" (date logic
  kept). See the durable LISTOFLISTS note above for the exact mapping.
- HOW: a one-shot Node script copied the tree (skipping gantt/cmd-today/css),
  renamed the files, and applied an ORDERED literal token map (pmd->lol specific
  first, then Stream/Job/Task case-aware, then the today-page rules). A manual
  pass then removed the Gantt/Google leftovers (index.html head+menu+settings+
  script tags, app.js wiring, the Schedule "Duration" field) and fixed a few
  doubled comments ("main main", "list list").
- SHARED: added `lol-*` selectors to the existing PlanMyDay theme rules as comma
  lists (styles.css + light.css/dark.css + superhero/cyborg/darkly/simplex) and
  `lol-list-items .item-row` to the row rule; made `smd-app.js`/`smd-images.js`
  accept `mainContainer` and added `listSearchEditor` + `LISTS_EDITOR_STYLES`.
- ASSETS: new `ListOfLists/icon.svg` (stacked list cards logo) + generated
  icon-192/512 PNGs; the same SVG added as the shared sample image "List of
  Lists" (appended to `shared/sampleImages.json` with a surgical text insert so
  the 900KB file stayed byte-identical apart from the new entry); a Launch tile.
  Registered in `sw.js APPS` (duplicate precache check: 407 URLs, 0 dups).
- WHAT WORKED: the ordered token map + `node --check` on every file; a static
  check that every `getElementById`/`$id` literal resolves (only the shared
  `#smdConfirmModal` and a pre-existing dead `listImageRemoveBtn` non-hits).
- WHAT DID NOT WORK / NOT RUN: no regression/screenshot specs were written or run
  (user request), so the app is UNVERIFIED at runtime - a first load should be
  smoke-checked before shipping. `BUILD_NUMBER` bumped 202610140845 ->
  202610141617 via `npm run bump:build`.
- TODO (noted above): rename `countdownContainer` -> `mainContainer` in
  PlanMyDay/CountMyDays; add the ListOfLists components to the Storybook.
- FOLLOW-UP (same session): removed the Settings "Split list", "Hide done" and
  "Auto Ad Hoc" toggles (and their code: the main view's Progress/Maintenance
  tabs, the completed-list filter, the Ad Hoc skip-confirm branch) and the whole
  Settings "Schedule" tab (`changeSuffixStart`/`changeJan1`/`changeMonday`/
  `changeStartWeek` + their restore blocks; `getListSuffix` hardcodes the old
  defaults; the list Sleep-Until picker drops `first-day-of-week`). Also removed
  the stale `--pmd-tasks-*` comment from `lol-list-items.js`. ADD/EDIT CATEGORY
  page: removed the "Tab" label + the `#categoryTabDropdown` `smd-image-dropdown`
  (`initCategoryTabDropdown` and the `.category-tab-picker` CSS are gone) and
  moved the Image picker between Title and Description (form is now Title /
  Image / Description). Also removed the WHOLE progress/maintenance concept: the
  `tab` attribute + `.tab-badge` from `lol-list-main-card`, `lol-category-header`
  and `lol-list-summary-card` (templates, `observedAttributes`, `_render`), the
  `tab` header attribute in `categories-editor.js`, the `category.tab` reads in
  `main-view.js`/`list-search.js`, and the `tab: "progress"` seed on new
  categories. `node --check` clean; no residual references. SHARED FIX (also
  covers PlanMyDay's Add/Edit Stream and the other page OK buttons): a disabled
  `smd-button` was clickable - see the durable gotcha note above; guarded in
  `smd-page.js` + `smd-button.js`. TEST-ONLY follow-up (no BUILD bump):
  `tests/launch-regression.spec.js` "root shows the grid of available apps" now
  expects 6 tiles (added the `nth(5)` "List of Lists" / `ListOfLists/`
  assertions and widened the icon loop), and `/ListOfLists/` was added to that
  spec's `SHELL_CASCADE`. EDIT LIST page (same session): removed the Suffix /
  Day-of-Year / mod controls from the General tab and the WHOLE Schedule tab -
  the schedule radio modal, Sleep Until / Wait for / Schedule Time, plus
  `openListEditSchedule` / `openListSleepPickerWhenReady` / `listTimeChanged`;
  `lol-list-main-card`'s swipe is now LEFT=delete only (no
  `lol-list-main-tomorrow`), and `main-view.js` no longer listens for it. General
  + List Items tabs remain. `getListSuffix`/`getNextDueText`/`getTomorrowStr` are
  now unused (left in place). STRIP (same session): removed those unreachable
  helpers (`getListSuffix`, `getNextDueText`, `getTomorrowStr`) plus `getScheduleText`
  and `formatDate`, the `.suffix` badge (main + summary cards), the summary card's
  `.schedule`/`.time`/`.extra` badges, the main card's daily `repeat-1` icon, the
  Edit Categories header badge (`#editListsTotalBadge`) and the accordion
  `count-badge`/`listcounts`; dropped the `schedule`/`frequency`/`time`/`sleepUntil`/
  `waitFor` defaults from new lists and the dead Sleep-Until date-picker listener.
  `getListCountBadgeText`/`updateEditorListCountBadges` only fed the Search Lists
  header badge; BOTH were DELETED 2026-10-15 when that badge was removed, along
  with their three call sites (`list-search.js` x2, `categories-editor.js` x1). LAYOUT (2026-10-15): removed the `.card smd-card border-0
  w-100` wrapper div from `pmd-job-summary-card` and `lol-list-summary-card` (see
  the durable note above) so the editor-accordion child rows are flush and
  full-width with the header's bottom line matching the item border; updated
  `storybook-regression` cardViewer selectors + the `pmd-regression` drag-ghost
  check. BUILD -> 202610150748. TABS (2026-10-15): `smd-tabs` no longer renders a
  `.tab-content` wrapper (some themes gave it unwanted padding/margins/borders on
  the PlanMyDay main-page split-list tabs) - panels are now DIRECT children of the
  host; updated `PlanMyDay/js/main-view.js` (`#todayTabs > .smd-tab-panel` layout
  + the `.smd-tab-panel.active` query) and the `pmd-regression` split-list nesting
  assertion. Verified via probe: panels hide/show, tab clicks switch, the job list
  renders inside the active panel. BUILD -> 202610150803. EDIT LIST SINGLE PAGE
  (2026-10-15): removed the Edit List tabs (was General + List Items) - the page
  is now ONE form: Title row with the Active checkbox relabelled "Show"; the title
  input; ONE row `[category dropdown | Image select | Description checkbox]`
  (`d-flex gap-2`); a collapsible description box (`#listDescriptionWrap`, shown
  when the list already has a description, toggled by the `#listShowDescription`
  checkbox's `onchange="toggleListDescription(this.checked)"`); then the list
  items + the two Add buttons.
  `getListEditSections`/`getListGeneralTabHTML`/`getListItemsTabHTML` deleted;
  `buildListEditPage` lost its `activeTabIndex` arg and `editListFromView` no
  longer passes one. BUILD -> 202610150810. VIEW LIST (2026-10-15): opening the
  page read-only (main card > View) now renders ONLY the read-only list items; the
  page h1 = the list Title (`data.title || "No Title"`); the Show checkbox, title
  input, category + image selectors, Description checkbox and box, and both Add
  buttons are dropped. Footer keeps Edit | OK so Edit still flips the same page
  into the full editor. BUILD -> 202610150819. VIEW-ONLY ITEMS (2026-10-15): the
  `lol-list-items` attribute `read-only` was REPLACED by a single `view-only`
  switch (one flag, not one per behaviour - its behaviours always co-vary):
  `view-only` drops the drag handle AND the delete button, leaves the done
  checkbox + the note (pencil) button/textarea LIVE, and locks ONLY the
  description input (`readonly`). The view-mode footer's OK was changed from
  `cancel` to `done`, so ticking items / editing notes in View List PERSISTS
  (previously OK discarded the buffer). Verified by probe: view mode h1 = list
  title, 2 rows, 0 handles, 0 delete buttons, checkboxes + note buttons enabled,
  desc inputs readonly, note textareas editable, and OK saved `done:true` +
  the edited note. BUILD -> 202610150833. MAIN PAGE SIMPLIFIED (2026-10-15): three
  removals on the ListOfLists main page: (1) the `#btnAddCard` "+ Add List" button
  is GONE from the date heading row (the only remaining Add entry point is
  `addNewListFromSearch()` on the Search Lists page, which still calls
  `addMainCardWithModal()` - the function was KEPT); (2) the main cards
  (`lol-list-main-card`) no longer have a drag handle: the template handle cell,
  `_adoptSlottedHandle()`, the app's slotted `<smd-draghandle>`, the
  `initMainCardsSortable()` Sortable wiring, the `mainCardsSortable` var and the
  `main-drag-card`/`user-select-none` classes were all deleted - the main list is
  NOT reorderable and its cards are selectable again. The swipe's
  `.drag-handle` composedPath guard was dropped too (no handles left). (3) the
  tile's DONE checkbox (`smd-checkbox.list-checkbox`) is GONE, so
  `lol-list-main-toggle`, `markListDone()` and `removeAdhocList()` (the "Remove
  from Ad Hoc?" confirm) were deleted with it; the `checked` attribute plumbing
  went too. `done` / `loadCompletedLists` / `saveCompletedLists` / `ensureMainList`
  carry-over were LEFT in place (they still honour legacy stored completed ids).
  Only the `done` styling path is now unreachable from the UI. Verified by probe:
  0 Add button, 0 handles, 0 checkboxes, View opens with the list title as h1, and
  swipe-LEFT still opens the Delete confirm. BUILD -> 202610150841.
- 2026-10-15 (b) - Edit List item rows were 83px tall (a drag-handle size regression).
  BUG (user): "a lot of space between the items" on the ListOfLists Edit List page.
  ROOT CAUSE was NOT the note row (collapsed = `d-none`, contributes nothing; the
  row gap is 4px): commit `63d7c0c` ("touch sizes") converted the DOCUMENTED
  `<smd-draghandle>` sizes (normal `1.2rem` / large `1.6rem`) into EM values
  (`1.2em` / `2em`) + em padding. Em is relative to the surrounding font, so at
  touch size `large` (the app default - `|| "large"` in `ListOfLists/js/display.js`)
  inside a `body.font-size-xlarge` page (20.8px) the glyph became 41.6px, and with
  the inherited 1.5 text leading (62.4px) + em padding the HOST was ~75px tall -
  which stretched every `.item-row` (and PMD's `.task-row`) to 83px around a 38px
  input. FIX (`shared/css/styles.css`): back to FIXED rem (`1.2rem`, `1.6rem` for
  `html[data-smd-touch-size="large"]`) plus `line-height: 1` (a glyph must not
  carry text leading). Measured: rows 83px -> 49px (the 41px `.btn-sm` note button
  is now the tallest child), handle 75px -> 33px large / 25px normal, gaps still
  4px. SHARED CHANGE: every app's handles got smaller, so PMD's task/job rows
  tighten the same way (screenshots will differ - user regenerates). Verified:
  pmd-regression `touch size` 5/5, `drag handle` 5/5, pmd-touch 6/6. AGENTS also
  gained the TERMINOLOGY note above (user uses "Note"/"Description"
  interchangeably for a List Item's fields). BUILD -> 202610150851.

### 2026-10-15 (c) - PMD main view jumped to the top when the job editor closed
- BUG (user): with a long today list scrolled down, viewing a job and editing it
  so it leaves today's list (or swipe-right then OK) redrew the main view at the
  TOP. Deleting (swipe left) did not jump.
- CAUSE: `PlanMyDay/js/job-editor.js` `hideJobEditBackground()` hid
  `#countdownContainer` with `d-none`; `display:none` collapses the document,
  which clamps the window scroll to 0. Delete never hides the container, so only
  the editor paths jumped.
- FIRST ATTEMPT (reverted): capture `window.scrollY` before hiding and re-apply
  it at the end of `renderMain()`. It restored a position, but ~50ms later the
  auto-hide nav re-expanded (the doc grows by the nav height) and the browser's
  scroll anchoring shifted the offset, so the value drifted (~37-49px) and the
  "restore" had to fight the browser. Also `overflow-anchor: none` did NOT stop
  the drift.
- FIX: hide with Bootstrap `.invisible` (`visibility:hidden`) instead of
  `d-none`, and remove both classes on restore. Layout - and the scroll position
  - stay intact, so the browser anchors naturally and the list does not jump.
  FOLLOW-UP (user: "I still see the scroll bar"): because `.invisible` keeps the
  document tall, the background scrollbar stayed visible, so the root scroll is
  now ALSO locked (`document.documentElement.style.overflow = "hidden"`) while the
  editor is open and cleared on restore - `overflow:hidden` keeps the offset
  (probe: y stayed 551), so the position still survives. Only
  `PlanMyDay/js/job-editor.js` changed.
- TESTS (TDD, red -> green): `tests/pmd-regression.spec.js` "Main View Scroll"
  with a new `seedManyJobs(page, 30)` helper - view + edit the date 5 days into
  the future, swipe-right then OK, and (follow-up) root `overflowY === "hidden"`
  while the editor is open and not after close. The two scroll tests scroll to
  600, click with a RAW `page.mouse` (no auto-scroll), and assert the edited card
  left the list and `window.scrollY` is still within 4px. RED on the old code
  (scrollY 0), GREEN after. Verified together: 3/3.
- TOOLING: top-level `CleanTestServerStart.cmd` (kills anything listening on
  8080/8081, clears `node_modules\.vite`, starts `node tests/serve-tests.mjs`
  DETACHED in the background, waits for BOTH ports to accept a connection, prints
  the run command, then EXITS — the servers keep running). Updated 2026-10-16: it
  used to run the server in the SAME window and block until Ctrl+C. It logs to
  `%TEMP%\myapps-serve.log` / `.err.log` and tails them on failure. One node
  process serves both origins. Use it to get a clean, non-stale server before a
  run, then `set EXTERNAL_SERVERS=1` and run Playwright (it reuses them).
- VITE EPERM ON START (2026-10-15): starting the server can die immediately with
  `Error: EPERM: operation not permitted, rename 'node_modules\.vite\deps_temp_*'
  -> 'node_modules\.vite\deps'` (the ports open briefly then close, exit code 1).
  Cause: a leftover `deps_temp_*` folder / locked dep cache from an earlier
  Vite instance that was killed. FIX: delete `node_modules\.vite` before starting
  (the .cmd does this) - verified a clean start after the clear.
- NOT bumped / full regression NOT run here: the user runs it. Bump
  `npm run bump:build` before shipping (`PlanMyDay/js/job-editor.js` is a
  precached APPS asset, so the bump is what installs the new worker).

### 2026-10-15 (d) - PMD swipe-right: Sleep date picker opened mid-slide
- BUG (user): swiping right sometimes left the Sleep date picker unopened, or
  opening half off the screen ("might be related to the slide timer").
- CAUSE (confirmed with a probe): `openJobSleepPickerWhenReady()` polled the
  picker rect and opened when it was "stable across two frames". The first frames
  can be EQUAL before the slide transition starts, so flatpickr opened against the
  panel at `translateX(-1280)` (off-screen) and the calendar stayed there. With a
  long slide the 120-frame cap instead expired mid-slide and it never opened.
- FIX: `shared/js/components/smd-page.js` gained `whenSlideDone(callback)` -
  waits for the `.smd-page` transform `transitionend` (next-frame fallback when
  there is no slide; `transitionDuration + transitionDelay + 250ms` fallback if the
  event never arrives). `openJobSleepPickerWhenReady()` now waits for `open` then
  `page.whenSlideDone(...)`. PROBE: calendar open at `translateX(-1280)` (t=40ms)
  before -> `translateX(0)` (t=1286ms) after.
- TESTS: new pmd-regression "smd-page: slide duration > whenSlideDone runs the
  callback only after the slide transition finishes" (RED before the helper,
  GREEN after). It creates its own page and commits the off-screen start style
  before `show()` (a page rendered and shown in one task never transitions). A
  swipe-gesture test was NOT usable: this harness's page build often does not run
  the slide at all (no `transitionstart` for `.smd-page`), so it passed on the old
  code too; removed. Verified: pmd `Today Card Swipe|Sleep|Schedule|Job Edit|
  smd-page` 115/115, storybook 8/8, pmd-touch 6/6.
- `BUILD_NUMBER` not bumped - bump before shipping.

### 2026-10-15 (e) - ListOfLists: removed the Search Lists header count badge
- REQUEST (user): on the ListOfLists Search Lists page, remove the list-count
  badge from the header. The badge was `page.headerHtml = '<smd-badge
  id="listSearchTotalBadge" …>'` in `list-search.js buildSearchListsContent()`.
- REMOVED the `headerHtml` line, its three feeder calls
  (`updateEditorListCountBadges()` in `list-search.js` x2 + `categories-editor.js`
  x1) and the now-dead `getListCountBadgeText`/`updateEditorListCountBadges`
  helpers in `editor-common.js` (a repo-wide grep showed they existed only to feed
  that badge). The `smd-page` header now shows just the "Search Lists" title.
- Verified with a probe on `/ListOfLists/`: header badges 0, page title
  "Search Lists", 2 result cards, zero console/page errors. `node --check` clean.
  (ListOfLists has no regression spec by user request.) The user ran the full
  regression green.

### 2026-10-15 (f) - Launch app: app registry, settings "Menu" tab, Launch flyout submenu
- FEATURE (user): a second Settings tab "Menu" on the Launch app listing EVERY app
  (incl. Launch) as a re-orderable tile with a drag handle, a "Show on Launch" tick
  and a "Show in Menu" tick; the Launch grid shows the ticked apps in the Menu
  order; every app's "Launch" menu entry becomes a flyout of the Menu-ticked apps.
  See the durable LAUNCH APP MENU / APP REGISTRY note above for the full shape.
- NEW `shared/js/smd-apps.js` (`window.SmdApps`): the app registry + the
  origin-wide `launch_appMenu` config + `href()` + `buildLaunchSubmenu()`. Loaded
  by all 8 shells and in `sw.js SHARED_ASSETS`.
- NEW `Launch/js/components/launch-app-menu.js` (`<launch-app-menu>`): light DOM,
  clone-safe (`data-smd-built`), two stacked labelled `smd-checkbox`es. Registered
  in `sw.js APPS["Launch/"]`.
- Launch `index.html`: `shared/vendor/sortable.min.js`, `smd-draghandle.js`,
  `smd-apps.js`, `launch-app-menu.js` script tags + the "Menu" `<section>` in
  `#settingsTemplate`. Launch `js/app.js`: grid from `SmdApps.launchApps()`,
  `renderAppMenuTab()` + Sortable + `onAppMenuChange`, and `openSettings()` passes
  `{ restore: renderAppMenuTab }`. Every other shell: one `smd-apps.js` script tag;
  PhoneButtons also gained the static Launch `<li>`.
- SAMPLE IMAGES: added "Launch" + "Phone Buttons" (native SVG in
  `shared/sampleImages/` + a SURGICAL append to `sampleImages.json` — a full
  `regen` rewrites 22 pre-existing entries whose source SVG drifted from the JSON).
  The append initially broke the JSON because the marker swallowed the last entry's
  closing brace; the working marker is the array close `\n]\n}\n`.
- TESTS: launch-regression grid test -> 8 tiles (names + hrefs incl. Launch `./`),
  the menu test -> the submenu across 6 shells, plus a new "Launch Menu tab"
  describe (tile controls + stacked-layout geometry, the two tick behaviours, the
  Sortable reorder -> grid order). `SHELL_CASCADE` gained `/PhoneButtons/`.
  launch-screenshots gained "settings menu tab"; pmd-screenshots "main menu
  dropdown" hovers `#mainNav .launch-submenu-toggle`.
- GOTCHA (cost a debugging round): the FIRST reorder test dragged the LAST tile,
  but the settings list SCROLLS, so the last tile's rect sits under the page
  FOOTER and the mousedown landed on the OK button (`elementFromPoint` proved it;
  the container saw only `mousemove`, no `mousedown`). Drag a VISIBLE tile (the
  first) in tests.
- VERIFIED: launch-regression 12/12, cmd 58/58, qrlinks+ffox+phonebuttons+solar
  45/45, pmd Navigation + gcal-last-item 10/10, launch-screenshots (superhero)
  green, pmd-screenshots "main menu dropdown" (superhero) green. sw.js precache:
  409 URLs, 0 duplicates. Visual check of the superhero screenshots confirms the
  `Launch >` flyout, the 2 settings tabs and the stacked tick tiles.
- `BUILD_NUMBER` -> `202610151808` via `npm run bump:build`.
- FOLLOW-UP (2026-10-15, from the user's full run — 2 failures, both fixed):
  1. `pmd-regression` "nav auto-hide also closes an open hamburger dropdown"
     STRICT-MODE failed: the new nested `<ul class="dropdown-menu
     launch-submenu-menu">` made `#mainNav .dropdown-menu` match TWO elements.
     RULE: to target the app's top-level menu use `#mainNav > .dropdown >
     .dropdown-menu`, never `#mainNav .dropdown-menu`.
  2. `launch-screenshots` "settings menu tab" was FLAKY with
     `EncodingError: The source image cannot be decoded` inside
     `screenshot-helpers.js`. A themed `<smd-image>` clears + swaps its blob src
     on every `applyTheme()`, so the helper's old `await image.decode()` could run
     against an empty/just-swapped src. FIXED in the helper: poll up to 3s for an
     img with a src that actually decodes (retrying, since the src can change
     mid-settle) and IGNORE a persistently undecodable image instead of aborting
     the screenshot. Verified: Auto-Hide Nav Behavior 4/4, launch-screenshots
     "settings menu tab" + "app grid" `--repeat-each=5` 10/10.

### 2026-10-16 - Gantt contrast test: a hardcoded date pushed the bar labels off-screen
- FAILURE (user): `pmd-gantt` "task text meets WCAG AA contrast in BOTH light and
  dark mode" threw `TypeError: Cannot read properties of null (reading 'slice')`.
- ROOT CAUSE: the spec's `SAMPLE` pinned `sleepUntil: "2026-10-05"` - a HARDCODED
  date - while the other jobs start at TODAY. The chart range begins 2 days before
  its earliest job, so as "today" advances the today-based bars march right by one
  44px day column every day; on 2026-10-16 the bar label sat at x=1269 on a 1280px
  viewport, so `document.elementFromPoint` (used to resolve the surface actually
  painted UNDER the right-offset bar label) returned null -> `parse(null)` ->
  `String(null).match(/\d+/)` is null -> `.slice` TypeError. The app was correct;
  ONLY the test had aged out - exactly the 2026-10-05 "never hardcode a date in a
  test" rule, caught late.
- FIX (test-only): (a) `SAMPLE.sleepUntil` is now RELATIVE via a new `isoDay(n)`
  helper (`isoDay(-3)`), and the two date assertions use `isoDay(-3)`/`isoDay(-2)`;
  (b) `parse()` now throws a clear `not a colour: ...` instead of a TypeError (all 4
  copies in the spec); (c) `readLabel` CLAMPS its sample point into the viewport so
  a half-off-screen label still resolves a background; (d) the ratio loop asserts
  `v.bg` is truthy with a message.
- MUTATION-CHECKED (not vacuous): forcing `.rg-gantt-bar-label { color: transparent }`
  fails with "superhero/dark timelineLabel contrast 1.36 (color rgba(0, 0, 0, 0) on
  rgb(33, 37, 41))". Full `pmd-gantt` 59/59 after reverting the mutation.
- ALSO: `.gitignore` had been REVERTED, so the `--gen-cert` CA/key were trackable
  again; `/PhoneButtons/server/*.crt` + `*.key` re-added (`git check-ignore`
  confirms). NEVER commit those private keys.
- FOLLOW-UP (2026-10-16): FULL DATE AUDIT of every spec, after the user asked
  whether the relative-date rule already existed (it did - the 2026-10-05 note).
  Greps: `20[0-9]{2}-[0-9]{2}-[0-9]{2}` = 27 hits; `new Date("...")`, literal years
  >= 2027 and hardcoded month names = ZERO. EVERY hit is safe: cmd-regression gcal
  payloads (assert only `items.length` / modal text), `pastDate "2020-01-01"` and
  `"2000-01-01"` (intentionally past, asserted as such), Minio XML
  `LastModified`/`CreationDate` (display-only fixtures), solarcontrolar mocked
  server dates (echoed into `power-date` / `#graph-date`), and the Gantt
  weekend-phase `base = "2026-10-05"` (every expectation DERIVED from that same
  base, so it cannot age). `loadGCalSampleData` is used by 4 cmd tests and only the
  main-view one needs the `today + 7` rewrite (already there). `"09:00"` literals
  are job SCHEDULE TIMES, not dates. Conclusion: no other test will age out.
  Because the rule was violated anyway, it is now ALSO a prominent numbered rule 18
  at the top of this file, with the concrete layout-drift failure and an audit
  recipe.

### 2026-10-16 (b) - PhoneButtons: Settings | Server address + Scan QR + server CORS
- REQUEST (user): put the server ADDRESS config back on PhoneButtons Settings |
  Server — the https checkbox, the server address and port, and a camera Scan QR
  button — because they will publish the local http server through CLOUDFLARE to
  get a fully-signed https URL. See the durable PHONEBUTTONS SERVER ADDRESS note
  above for the full shape.
- FILES: `PhoneButtons/js/api.js` (address helpers `pbServerHttps`/
  `pbServerAddress`/`pbServerPort`/`pbHostComplete`/`pbServerBase`/
  `pbParseServerUrl`; `_fetch` prefixes the base); `PhoneButtons/js/socket.js`
  (`socketUrl` + `isActive()`; `connect()` uses `pbServerBase()` and REBUILDS when
  the address changed); `PhoneButtons/js/settings-tab.js`
  (`serverAddressChanged`/`restoreServerAddress` + `openServerScan`/`hideServerScan`
  and the raw-QR handler; restored in `restoreServerTab`);
  `PhoneButtons/index.html` (the Server-tab fields + `#serverScanPage` + the
  `smd-qr.js`/`smd-qr-import.js` script tags);
  `shared/js/components/smd-qr-import.js` (+`raw`);
  `PhoneButtons/server/app.py` (+CORS); `PhoneButtons/server/README.md`.
- DESIGN NOTES: the PORT is OPTIONAL (empty = scheme default 80/443) so a tunnel
  URL (port 443, no explicit port) works; the address accepts an IP or a DNS name;
  the socket must be able to RE-TARGET (see `socketUrl`) or a changed address is
  ignored; CORS is now REQUIRED because the app and the tunnel host are different
  origins.
- TESTS: the fake `window.io` now RECORDS the URL; 4 new tests (address fields drive
  the base incl. https + empty port and the REST URL; Scan QR parsing + the scan-page
  wiring; Connect re-targets; `raw` mode). 17/17 pass.
- `BUILD_NUMBER` -> `202610161321` via `npm run bump:build`.

### 2026-10-16 (c) - PhoneButtons: server-relative icons prefixed; cloudflared + QR
- BUG (user): the GitHub-Pages copy requested app icons from ITS OWN host —
  `https://ownimage.github.io/app-icon-cache/Windows%20Terminal%20Host.png` instead
  of the configured tunnel server. CAUSE: the server answers with ROOT-RELATIVE icon
  paths (`_cache_icon()` -> `/app-icon-cache/<name>.png`, used by `/api/apps` AND the
  `app_change` socket push) and `edit-layout.js` built one from a NAME; a
  root-relative URL resolves against the APP's origin, not the server's. FIX:
  `pbServerUrl(path)` (api.js) prefixes server-relative paths with `pbServerBase()`
  (absolute / protocol-relative / empty-base pass through), applied in `main-view.js`
  (app_change icon), `edit-app.js` (Manage App dropdown `imageUrl`) and
  `edit-layout.js` (`iconCacheUrl`). Test added (asserts the prefixed src + that
  absolute/protocol-relative URLs are untouched).
- FEATURE (user): `PhoneButtonServer.cmd` should parse the Cloudflare response and
  show a QR to scan. `app.py` gained `--tunnel` (starts `cloudflared tunnel --url
  http://127.0.0.1:5000`, echoes its output, regexes the first
  `https://<name>.trycloudflare.com`, prints the Settings values), `--no-tunnel`, and
  `--qr <url>`; the launcher passes `--tunnel` BY DEFAULT (only when the user gave no
  tunnel/QR choice) and AGAIN kills anything on port 5000 first (that step had been
  lost in the rollback). The QR comes from a new `/phonebuttons-qr?value=<url>` route
  rendered with the shared vendored `qrcode.min.js`, opened at
  `http://127.0.0.1:5000/phonebuttons-qr?...`. `_find_cloudflared()` checks
  `PB_CLOUDFLARED` -> PATH -> usual install dirs; cloudflared is NOT installed on this
  box so the server runs anyway and prints `winget install cloudflare.cloudflared`.
  HARDENED: the route escapes its value for html AND js (`json.dumps` +
  `\u003c/\u003e/\u0026`) because a raw `</script>` would break out of the script
  block on a PUBLIC (tunnelled) route — verified all hostile values keep exactly 2
  `<script` tags.
- VERIFIED: `node --check` + `py_compile` clean; the QR route via Flask's test client
  (200 + text/html, vendored lib, value passed, missing value 400, hostile values
  escaped); `phonebuttons-regression` 18/18.
- `BUILD_NUMBER` -> `202610161801` via `npm run bump:build`.

### 2026-10-18 - app full name next to the hamburger in every nav bar
- FEATURE (user): show each app's FULL NAME in the menu bar next to the hamburger.
  Implemented ONCE, in the shared registry, not as 7 copies of markup:
  `SmdApps.mountAppTitle()` (`shared/js/smd-apps.js`) resolves the CURRENT app
  from the page path (`SmdApps.currentPath()`, derived from this module's own
  script URL like `href()`) and inserts
  `<span id="appNavTitle" class="navbar-text fw-semibold mb-0">NAME</span>`
  directly after the hamburger's `.dropdown` wrapper. `APPS[].navTitle`
  overrides `name`: `"My Apps"` for Launch, `false` (opt out) for Phone Buttons,
  which already shows the running server app's name there. Called from `boot()`
  next to `buildLaunchSubmenu()`; idempotent; a no-op without a `#mainNav`
  (Storybook / card-viewer frames).
- DUPLICATE REMOVED: the Launch page's content `<h1 class="h4 mt-2 mb-0">My
  Apps</h1>` is gone (the nav shows it now). No test referenced it.
- VISIBILITY: `updateMainMenuVisibility()` (smd-app.js) now hides the title
  together with `#btnMainMenu` while any `smd-page[open]` is present, and
  `#appNavTitle { color: var(--bs-body-color) }` was added to styles.css so a
  theme's `--bs-navbar-color` (which may target a different navbar surface)
  cannot make the title illegible - the same reason `#btnMainMenu` is pinned.
- TDD: new `launch-regression` "each app's nav shows the app name next to the
  hamburger" (7 shells: exactly one `#appNavTitle` with the registry name,
  same-row + right-of-the-button geometry + body colour; then PhoneButtons must
  have none) and the pmd-regression "hides the main menu while a secondary page
  is open" test extended to assert the title hides and returns.
  MUTATION-CHECKED: disabling the `mountAppTitle()` call in `boot()` fails the
  new test with `Expected: 1, Received: 0`.
- VERIFIED: launch-regression 13/13, phonebuttons-regression 18/18,
  pmd-regression + pmd-touch `Main View|Auto-Hide Nav` 171/171,
  settings-alignment 13/13, cmd/qrlinks/ffox/solar boot tests 7/7.
- SCREENSHOTS ARE NOW STALE in every app (the nav text changed) and the Launch
  grid moved up (the removed h1): regenerate with `--workers 16` before shipping.
- `BUILD_NUMBER` -> `202610180853` via `npm run bump:build`.

### 2026-10-18 (b) - ListOfLists regression + screenshot suites; PhoneButtons server (app.py) tests
- LISTOFLISTS TESTS (user request - the app had NONE): NEW
  `tests/lol-regression.spec.js` = 63 tests over boot/namespace, the main view
  (cards, order, empty state, swipe-left delete + cancel), View List read-only
  (title as h1, no handles/delete, locked description, live tick/note, OK
  persists), Edit List (single form, OK disabled with an empty title, description
  reveal, category move, Delete, Show toggle, Cancel), list items (add top/bottom,
  description/done/note persistence, delete confirm, drag reorder, note-row state
  across a re-render), the Categories editor (headers in sequence order, exclusive
  expansion, can-delete only when empty, Add/Edit/Delete category, Add List,
  Active toggle -> main order, Edit a list, drag reorder, OK returns to main), Search
  Lists (all lists, filter + Clear, no-match message, Edit, Active toggle, Add List
  creates the Ad Hoc category, cancel removes it), the shared Images editor, Settings
  (4 tabs, appearance controls, font/theme persistence under `lol_`, auto-hide,
  Show danger, Clear All Data, Regenerate Main Tiles, Sort Lists, Minio menu gating)
  and Export/Import (payload shape via a stubbed `smdDownloadJson`, import + reject).
  NEW `tests/lol-screenshots.spec.js` = 7 scenes x 27 themes x light/dark
  (`screenshots/lol/`), verified for superhero in both modes.
- WHY THERE WAS NO COVERAGE: `tests/coverage.js` only merges `/<app>/js/` paths it
  LISTS, and `/ListOfLists/js/` + `/PhoneButtons/js/` were missing, so those apps
  read as 0% no matter how well they were tested. Both are now in the filter.
- PHONEBUTTONS SERVER: NEW `PhoneButtons/server/test_app.py` (pytest, 120 tests,
  ~90% of app.py): icon-filename sanitising, the config helpers, friendly-name
  resolution, foreground info, the key parser (brackets must go through
  `VkKeyScanW` - `ord("[")` is VK_LWIN), every HTTP route incl. traversal refusal
  and the QR route's escaping, the socket events (key press ordering, pong,
  set_default_icon), the running-apps scan and the focus hook (both mocked), the
  tunnel URL parse/timeout branches, and a real-GDI smoke test of the icon
  pipeline against notepad.exe. NEW `tests/phonebuttons-server.spec.js` runs that
  pytest suite from the Playwright run (skip when the deps are absent, fail below
  80% coverage). `pytest`/`pytest-cov` were installed for `py -3.13` (the only
  interpreter here with Flask/pywin32); the default `python` is 3.14 and has none.
- BUGS FOUND BY THOSE TESTS: `win32gui.ExtractIcon(exe_path, 0)` was called with
  two args (pywin32 needs `(hInst, exeName, index)`), so the "ExtractIcon(0)" icon
  source silently never worked - caught by a new test, fixed, red-then-green. And
  three icon functions (`_collect_icons`, `_extract_exe_icons_via_resources`,
  `_extract_uwp_icons`) had NO callers; `_extract_exe_icons_via_resources` even
  ACCESS-VIOLATED the process when a test called it, so all three were deleted
  (216 lines) - coverage of app.py then reflects real code.
- TOOLING LESSONS: (1) my first deletion script pre-computed absolute line ranges
  and then collapsed blank lines between splices, so an index shifted by one and it
  ate the NEXT function's `def` line (leaving an orphaned body) - it only surfaced
  because the script verified the def-name multiset. Re-resolve anchors on the LIVE
  array for every removal, and always verify after editing (py_compile + a def
  list). (2) A test that drives real GDI code can crash the RUNNER, not just fail:
  the access violation above was printed by faulthandler while pytest still exited
  0 - check for "Windows fatal exception" in the output, not only the exit code.
- VERIFIED: lol-regression 63/63, lol-screenshots 7/7 (superhero, both modes),
  phonebuttons-server 2/2 (wrapping 120 pytest tests at 90% app.py coverage),
  launch-regression 13/13 + phonebuttons-regression 18/18 (unchanged), and the
  full app.py `pytest` run. No app/web asset changed, so `BUILD_NUMBER` was NOT
  bumped.

### 2026-10-18 (c) - the Gantt theme-loop flake diagnosed + fixed; app.py coverage visible
- FLAKE (user, from a full run): `pmd-gantt` "Gantt uses theme primary/secondary for
  the zoom buttons, solid success/danger bars, and a standard header background in
  light and dark" failed once with `bootstrap/light active zoom is primary:
  expected rgb(13,110,253), received rgb(86,115,155)` - 836 passed / 1 failed, and it
  passed on every isolated rerun. NOT an app bug: a probe that sampled the active
  zoom button's `backgroundColor` every 20ms from the moment `openChart()` ran showed
  it walking secondary -> primary over ~240ms
  (rgb(108,117,125) -> **rgb(86,115,155) at 65ms** -> rgb(13,110,253) at 240ms). The
  header is rebuilt by `openChart()` and `ganttPaintZoomButtons()` flips `.active`
  immediately after, so Bootstrap's 150ms transition was still running when the test's
  single computed-style read landed; under full-suite load the read fell inside that
  window. The `waitForTimeout(700)` cannot help because the class flip happens later.
- FIX (test-only): the zoom / bars / header reads in that test - and the
  toggle/menu read in the sibling "Streams filter dropdown..." test, which has the
  same shape - are now `expect.poll(...).toMatchObject({...})` on the SETTLED
  computed style; the sibling keeps the last snapshot for its contrast maths.
  MUTATION-CHECKED by painting `.gantt-zoom > .btn.active` with `--bs-secondary`:
  the polled test still fails with `activeBg rgb(223,105,25)` vs `rgb(78,93,108)`,
  so it is not vacuous. VERIFIED: the two tests `--repeat-each=5` 10/10, then the
  whole `pmd-gantt` spec 59/59.
- app.py COVERAGE IS NOT IN THE TERMINAL: `tests/phonebuttons-server.spec.js` passes
  `--cov-report=term-missing` to pytest but the list/line reporter does NOT replay a
  PASSING test's stdout (neither `console.log` nor `process.stdout.write` in the test
  shows up), so the table only ever appeared in the captured output. The wrapper now
  ALSO writes `PhoneButtons/server/coverage.txt` (full pytest output + the table) and
  `PhoneButtons/server/htmlcov/index.html` (browsable, per line; both gitignored) and
  adds them as test annotations. Embedding the whole output in a FAILING assertion
  message stays, so a real failure still prints the table in the terminal.
- FOLLOW-UP (user): `coverage.txt` was full of control characters - pytest colours
  its output with ANSI escapes even when stdout is a pipe, and the wrapper wrote the
  raw bytes. Now the pytest run gets `--color=no` + `NO_COLOR=1`/`PY_COLORS=0`/
  `TERM=dumb` and the captured text is ANSI-stripped before it is written or parsed
  (verified: 0 ESC bytes, 0 non-ASCII). Use the same treatment for any future spec
  that saves subprocess output to a file.
- No app/web asset changed (app.py + test files only), so `BUILD_NUMBER` NOT bumped.

### 2026-10-18 (d) - CountMyDays Edit Google Event follows the Edit Date layout
- REQUEST (user): the Edit Google Event screen should look like Edit Date - Title
  on the first row, Category + Image next, then the (non-editable) Date and the
  Once/Annual-style control.
- WHAT: `renderGcalEditContent()` (CountMyDays/js/googleCalendarEditor.js) rebuilt
  as four rows matching `renderDateEditContent()`: Title (label + full-width
  readonly `#gcalTitleInput`) / Category + Image (`#gcalCategorySelect` is now the
  shared `<smd-image-dropdown>` - same control and 220px width as Edit Date - next
  to `#gcalImageSelect`) / `#gcalDateInput` + `#gcalTypeInput` (readonly, compact,
  `aria-label`ed, keeping the app's "Once"/"Recurring" wording since Google owns
  the recurrence) / `#gcalShowCheck` on its own row. Deleted `#gcalCategoryPreview`
  + `updateGcalCategoryPreview()` (the dropdown carries the image now) and the
  separate `<smd-select>` + `<option>` markup. The page binds one
  `smd-image-dropdown-change` listener via `composedPath()` (guard
  `__cmdGcalCategoryBound`), mapping "No Category" -> "". Footer button order
  normalised to Cancel | OK (it was OK | Cancel).
- VERIFIED visually (probe screenshots of both pages, since this is a layout
  change): same label positions, same 220px category control, same row spacing;
  the only intended differences are the read-only values and the Show row.
- TDD: new cmd-regression test "Edit Google Event uses the Edit Date layout
  (Title / Category+Image / Date+Type / Show)" (ids, readonly state, no preview
  tile, row order + geometry). My first cut compared the two controls' vertical
  CENTRES (within 8px) and failed with 23px - the Image control is genuinely
  taller (thumb + name + Edit button) and the row is `align-items-start`, so the
  assertion now requires the same START (<=12px) + a shared vertical band
  (>20px), which is the real "same row" invariant. The older gcal edit test now
  drives the category through the dropdown menu instead of `pickOption`.
- GOTCHA (again): after editing `CountMyDays/js/googleCalendarEditor.js` the run
  failed with `openGoogleEventsEditor is not defined` on 6 tests, because the
  long-running Vite server was serving a TRUNCATED copy (its tail stopped mid
  expression). Not an app bug: kill the 8080/8081 listeners + clear
  `node_modules\.vite` + restart `tests/serve-tests.mjs`, then verify the served
  text equals the file (I checked `Invoke-WebRequest` length + tail). ALWAYS
  restart the server after editing a served file - the earlier mutation checks
  happening to pick up changes made me skip it this time.
- VERIFIED: cmd-regression 59/59 (58 existing + the new layout test).
- `BUILD_NUMBER` -> `202610181947` via `npm run bump:build` (the app script is a
  precached `APPS["CountMyDays/"]` asset).

### 2026-10-18 (e) - CountMyDays MinIO export/import (app-owned, via SmdConfig hooks)
- REQUEST (user): add MinIO saving to CountMyDays like PlanMyDay. The user chose
  the RICHER variants for both ends: the export reuses CountMyDays' EXPORT WIZARD
  scope choices (not a one-click dump), and the import goes through CountMyDays'
  IMPORT WIZARD (per-section keep/replace prompts) instead of overwriting.
- WHAT: `shared/js/smd-minio.js` gained two optional hooks (`onMinioExport` /
  `onMinioImport`) so the module stays data-agnostic; PlanMyDay sets neither, so
  its behaviour is byte-for-byte the same. CountMyDays sets both in `app.js`:
  export -> `startExportWizard("minio")` (title "Export to Minio", unchanged
  steps) and `finishExportWizard()` routes to a new `doMinioExport(data)` which
  PUTs `countmydays-<ts>.json` with `{ dates, categories, images }` (the same
  shape as the JSON export); import -> validate + `closeMinioImport()` +
  `startImportWizard(data)`. Full UI wiring: Minio settings tab (General | G Cal |
  Minio | Danger), the two `.minio-menu-item` menu entries, `#minioImportPage`,
  the script tag, `updateMinioMenu()` at boot and `minioImportPage` in
  `hideMainPages()`. See the durable note for the details.
- DECISIONS WORTH REMEMBERING: (1) the shared `exportToMinio()` validates the
  config BEFORE calling the hook, so an unconfigured MinIO never opens the wizard;
  (2) the validated config is passed through `window.__minioExportConfig` because
  the wizard returns later; (3) the import hook must close the import page itself
  - otherwise the import wizard (an smd-page) SUSPENDS it and the MinIO page
  reappears when the wizard closes.
- TESTS: cmd-regression "Minio" = 8 new tests (settings tab + disabled fields +
  `countmydays_minio_*` persistence, menu gating, refuse-without-config, export
  runs the wizard and uploads the full payload with a `countmydays-\d{12}.json`
  key, a partial selection is honoured, import hands the downloaded file to the
  import wizard - asserted via its "1 categories" prompt - , an invalid file is
  rejected with the list reloaded, a disabled import is a no-op). PlanMyDay's 50
  Minio tests re-run green, so the shared-module change did not disturb it.
- VERIFIED BY EYE as well (layout/UX change): screenshots of the Minio settings
  tab and the "Export to Minio" wizard step, then the probe files were deleted.
- The user runs the full regression themselves; the test servers were left
  freshly restarted and serving build `202610182015` (verified in BOTH
  `shared/js/build-number.js` and `sw.js`, on disk and over HTTP).
- `BUILD_NUMBER` -> `202610182015` via `npm run bump:build`.

### 2026-10-18 (f) - one Settings page shape across all apps
- REQUEST (user): same Settings page everywhere - tabs in the order General,
  Display, others; REMOVE a tab that ends up empty; the Display tab must hold
  Theme, Theme mode, Font Size, Icon Size, Touch Size, Slide Speed, Auto-hide Menu
  in that order, plus Tile density where the app supports it; other tabs untouched
  for now (Danger is the next pass).
- SHAPE APPLIED (8 shells): Launch [Display, Menu]; PlanMyDay [General, Display,
  Schedule, Minio, Danger]; CountMyDays [General, Display, G Cal, Minio, Danger];
  QRLinks [Display, Danger]; SolarControlar [General, Display, Danger];
  FreeFormOX [Display, Game]; ListOfLists [Display, Minio, Danger]; PhoneButtons
  [Display, Server, Danger]. QRLinks + ListOfLists General tabs were left EMPTY, so
  they were deleted (QRLinks' Display reuses nothing from the old id - it is
  `appearance-tab`). CountMyDays' General keeps Countdown display + Max
  countdowns; Solar's keeps the Flask fields + Auto-refresh; FreeFormOX's Game
  keeps the X/O names/styles + Show undo/redo + Swap.
- NO DEAD CONTROLS (user correction mid-task): "do not add any of them if they are
  not used by the app or the shared components the app uses". So Icon size was NOT
  added to SolarControlar/FreeFormOX (no `<smd-image>`), Tile density stays only in
  the four apps that had it, and Touch size / Slide speed / Auto-hide menu were
  added to the six apps missing them because every app uses `<smd-checkbox>` /
  `<smd-draghandle>` (Launch's tick-boxes and handles live inside
  `launch-app-menu`, so a source grep for the tag undercounts them), `<smd-page>`
  and the shared nav respectively. Labels aligned: Launch + PhoneButtons "Image
  size" -> "Icon size".
- SHARED ENGINE so a moved row works without per-app code:
  `smdSetupSettingsPage()` restores touch + slide too, and `changeTouchSize()` +
  the boot push the value into `SmdCheckbox`/`SmdDragHandle` directly (the
  attribute alone already drove the checkbox CSS).
- TDD: new `tests/settings-alignment.spec.js` "Settings page shape is consistent
  across apps" - one test per shell asserting the EXACT tab list and the EXACT
  Display row labels in order (read from the DOM, so the markup is what is tested).
  It caught SolarControlar immediately: that app shows a startup modal when its
  Flask API is not mocked, and the modal's overlay intercepted the tab click, so
  the test dismisses an open `#smdConfirmModal` first (via an in-page click - a
  Playwright `getAttribute` on the modal HANGS for 30s in apps that never created
  the host).
- TESTS UPDATED for the moves (a settings page opens on its FIRST tab, so anything
  on Display needs the tab clicked first): cmd theme/font/icon/density tests and
  its tab-list assertion; qrlinks + lol tab-list assertions; pmd "shows all main
  settings controls" (auto-hide now on Display) + the three auto-hide tests;
  ffox names/styles tests (Game is the second tab now); solar's Flask steps moved
  before the Display click.
- VERIFIED: settings-alignment 21/21, launch 13/13, qrlinks 9/9, ffox 11/11,
  solar 12/12, phonebuttons 18/18, cmd 67/67, and pmd+lol `--grep Settings` 50/50.
  Spot-checked the restructured pages visually (Solar General+Display, FFOX
  Display, CountMyDays Display); probes deleted.
- SCREENSHOTS: every app's settings scene changed (new rows/tabs) - regenerate.
- `BUILD_NUMBER` -> `202610182041` via `npm run bump:build` (all 8 shells + two
  shared scripts are precached assets).

### 2026-10-18 (g) - Settings Display order: Screen resolution last, Touch before density
- FOLLOW-UPS (user, same session): (1) `Screen resolution` must be the LAST row on
  every app that has it - only PlanMyDay needed a change (it sat before "Show
  Gantt"; ListOfLists already had it last). (2) The density position from the
  earlier answer was corrected: on CMD the order is Font size / Icon size / TOUCH
  size / TILE DENSITY / Slide speed / ..., and (asked, then confirmed) the same
  order applies to ALL four apps with Tile density (CountMyDays, PlanMyDay,
  QRLinks, ListOfLists) so the shared shape stays consistent.
- The row swap was done with a one-shot node script that anchors on the LABEL text,
  swaps the two whole row blocks (bottom-first so the top indices stay valid) and
  VERIFIES the resulting label order per file before writing - the earlier
  line-index deletion bug in this repo is exactly what that guard is for.
- TEST: the `settings-alignment` consistency table was updated for the four apps
  (Touch size before Tile density; PlanMyDay's Show Gantt before Screen resolution).
- VERIFIED: settings-alignment 21/21, pmd `--grep Settings` 40/40.
- `BUILD_NUMBER` -> `202610182132` via `npm run bump:build`.

### 2026-10-18 (h) - FreeFormOX spacing, the Launch app's Launch menu, and a stale-server lesson
- FFOX SPACING (user): "Settings | Display has not consistent vertical spacing".
  CAUSE: FFOX's rows were `mb-3` (1rem) while `<smd-theme>` injects a `mb-4`
  (1.5rem) gap, so the Theme -> next-row gap differed from every other gap on the
  page. FIX: FFOX Display rows -> `mb-4`; then (user follow-up) its **Game** tab
  rows too, so the whole app is one rhythm. CHECKED every other app: their Display
  tabs were already uniformly mb-4 (only FFOX differed).
- TDD: the old "theme gap == sibling row gap" test ran for PlanMyDay ONLY, which
  is why FFOX was never caught. Replaced it with a per-app loop over ALL EIGHT
  shells - "<App>: the Display tab keeps one uniform vertical rhythm" - reading the
  computed `margin-bottom` of every `.smd-theme-field` and every `div.row.col-md-8`
  in the active panel and requiring exactly ONE distinct value.
- LAUNCH APP MENU (user): "even the Launch app should have the launch menu option
  in the same way as the other apps - Settings | separator | Launch | separator |
  others". The root `index.html` now carries the same static
  `<a class="dropdown-item" href="./">Launch</a>` (after a divider) that
  `SmdApps.buildLaunchSubmenu()` replaces with the flyout, so the launcher can jump
  straight to any app. There is NO trailing divider - nothing follows Launch in
  that menu and a dangling `<hr>` would look like a bug. `launch-regression`'s
  submenu test now includes the root, with per-shell href prefixes ("" on the root,
  "../" in the sub-apps; the Launch entry resolves to "./" at the root).
- STALE-SERVER LESSON (cost three debugging runs): restarting is needed for HTML
  too. See the LENGTH-CHANGE VARIANT note above - shortening
  `PhoneButtons/index.html` by one line made the long-running server send a
  mismatched Content-Length, the page died with
  `net::ERR_CONTENT_LENGTH_MISMATCH` and `page.goto` never reached `load`, which
  looked exactly like a broken PhoneButtons app (console errors absent,
  `Invoke-WebRequest` fine). A restart fixed all 18 phonebuttons tests instantly.
- VERIFIED: settings-alignment 28/28 (12 alignment + 8 rhythm + 8 shape),
  launch-regression 13/13, ffox-regression 11/11, phonebuttons-regression 18/18.
- `BUILD_NUMBER` -> `202610182146` via `npm run bump:build`; the test servers were
  restarted afterwards and verified serving that build.
- FALLOUT (user's full run: exactly 1 failure): `pmd-gantt` "Show Gantt is the last
  control on the Display tab and defaults to off" asserted `order[last] ===
  "Show Gantt"`, which the Screen-resolution-is-last rule invalidated. My own miss:
  I ran pmd-regression `--grep Settings`, settings-alignment and the app suites, but
  not pmd-gantt, and I did not grep for ORDER assertions when moving the row. Updated
  to `expect(order.slice(-2)).toEqual(["Show Gantt", "Screen resolution"])` (and the
  test renamed to "...last SETTING..."). VERIFIED: pmd-gantt 59/59. Test-only change,
  so no `BUILD_NUMBER` bump.

### 2026-10-18 (i) - one Danger tab shape across all apps
- REQUEST (user): "For the danger tab there should be consistency across all apps"
  with a canonical order - Show danger / No cache / <gap> Regenerate Main Tiles /
  Sort (existing name) / <gap> Refresh App / Clear local storage <APP> /
  Clear Google cache (CMD only) / <gap> Load Sample Data - only the items that
  apply to an app, dropping the rest, never two gaps in a row, consistent
  danger/warning colours.
- DECISIONS (asked): (1) "No cache" is now on EVERY Danger tab (it is an
  origin-wide worker mode); (2) "Clear local storage" added to SolarControlar too
  (the 5 apps that had it keep it); (3) labels: PlanMyDay's "Regenerate Today's
  Tiles" -> "Regenerate Main Tiles", clear buttons -> "Clear local storage
  PMD/CMD/QR/LoL/Solar/PB" (the code's own abbreviations), CountMyDays' combined
  Google row SPLIT into "Clear Google cache" + "Load Sample Data", the two Sort
  buttons keep their existing names; (4) COLOURS: destructive = danger, bulk
  maintenance (Regenerate/Sort) = warning, Refresh App + every loader = SECONDARY
  ("loaders are secondary ... nothing is safe/success" - user correction of my
  first proposal). Launch + FreeFormOX still have no Danger tab.
- IMPLEMENTATION: `changeNoCache` de-duplicated into `shared/js/smd-settings.js`
  (two identical copies removed = one CPD group fewer); all rows normalised to
  `mb-4` with `mt-4` as the group gap; danger-id lists extended in CMD/QR/PB/Solar
  so the new rows stay hidden until "Show danger"; Solar gained
  `confirmClearAllData()` + a `#noCache` restore (it owns its settings page);
  button IDs kept (tests keep targeting `#btnClearAllData` etc.).
- TDD: new `settings-alignment` describe "Danger tab shape is consistent across
  apps" - per app: exact visible row order, the colour of every row (reading the
  `variant` ATTRIBUTE for `<smd-button>` and the `btn-*` class for raw buttons - my
  first probe returned null for QRLinks' loaders and failed), and no two
  consecutive gaps. 6/6 green.
- TESTS UPDATED for the renames: pmd-regression "Regenerate Today's Tiles" ->
  "Regenerate Main Tiles" (13 occurrences) and its Clear button name; cmd's danger
  test now asserts the two split Google rows + "Load Sample Data"/"Clear Google
  cache".
- VERIFIED: settings-alignment 34/34 (12 alignment + 8 rhythm + 6 Danger + 8
  shape), cmd+qrlinks+solar+phonebuttons 106/106, pmd
  `--grep 'No Cache|danger|Regenerate|Sort Jobs|clear all data|Settings'` 58/58,
  lol `--grep Settings` 10/10.
- `BUILD_NUMBER` -> `202610182214` via `npm run bump:build`; the servers were
  restarted afterwards (app JS is served from the startup snapshot).

### 2026-10-20 - immutable CountMyDays category ids
- REQUEST (user): add a short immutable id to categories and use it in the events
  so renaming a category no longer breaks the link; migrate missing ids at open,
  defaulting to the category name (no Google-data migration); show an smd-modal
  reminder on every open; new ids = highest + 1; if a category is NAMED "1" skip
  that number.
- IMPLEMENTED: `CountMyDays/js/storage.js` (`categoryRef`, `findCategoryByRef`,
  `categoryNameForRef`, `nextCategoryId`, `migrateCategoryIds`); the `category`
  field on dates/Google payloads now holds the id; `categories-editor.js`
  allocates ids and no longer rewrites dates on rename; `dates-editor.js`/
  `main-view.js`/`googleCalendarEditor.js`/`export.js`/`import-wizard.js` resolve
  ids to names; `PlanMyDay/js/cmd-today.js` does too. Import/export remap old
  name-based files to ids. The boot reminder is in `CountMyDays/js/app.js`.
- TDD: new cmd-regression tests for the migration popup + id=name, next-id
  allocation (including the name "1" skip), rename-keeps-linkage (main + dates
  editor), numeric-id date rendering, and a Google event surviving a rename while
  the payload keeps `category: "1"`; import expectations now assert ids.
- GOTCHA: the always-on popup blocks clicks, so tests dismiss it via
  `tests/cmd-helpers.js` `dismissCategoryIdMigration`. `seed()` dismisses by
  default (`{ dismissMigration: false }` for the migration test itself).
- VERIFIED: cmd-regression 75/75; settings-alignment + display-settings 45/45;
  cmd-screenshots (one theme) + image-edit-preview-size 17/17; pmd-regression
  CountMyDays Events 12/12 (incl. a new id-resolution test); launch-regression
  13/13 (its cross-shell menu test also dismisses the reminder).
- `BUILD_NUMBER` -> `202610200820` via `npm run bump:build`; restart the test
  server afterwards (it snapshots app JS at startup).
- REMOVED (2026-10-20, user request): the temporary migration step.
  `migrateCategoryIds()`, `showCategoryIdMigrationReminder()`, the boot calls,
  the cmd-regression migration test, `tests/cmd-helpers.js` and its uses
  (cmd-regression `seed()`/`enableMinio()`, cmd-screenshots beforeEach,
  launch-regression cross-shell menu test) are gone. The ID mapping/lookups
  remain unchanged, and `sampleData.json` now carries ids (`id` = name) so
  first-visit data is already id'd.

### 2026-10-20 - ListOfLists MinIO filename + backup data
- REQUEST (user): ListOfLists exported `planmydays-<datetime>.json`; it must be
  `listoflists-<datetime>.json`.
- FOUND: the name AND payload were hard-coded for PlanMyDay in
  `shared/js/smd-minio.js` (`planmydays-`, `smdKey("streams")`), so a LoL MinIO
  backup also contained no categories.
- IMPLEMENTED: `SmdConfig.minioExportPrefix` + `SmdConfig.minioExportData()`
  hooks (defaults preserve `planmydays-` + streams for PlanMyDay);
  `SmdConfig.onMinioImport(data, key)` now receives the object key. ListOfLists
  sets `minioExportPrefix = "listoflists"`, shares `lolExportPayload()` between
  JSON download and MinIO export, and restores `lol_categories` + images through
  `onMinioImport`. CountMyDays is untouched (its own `onMinioExport`).
- VERIFIED: lol-regression 65/65 (2 new MinIO tests: filename/payload + import
  hook); pmd-regression "export to minio keeps the planmydays filename and
  streams payload" 1/1.
- `BUILD_NUMBER` -> `202610201050` via `npm run bump:build`; restart the test
  server afterwards (it snapshots app JS at startup).

### 2026-10-20 - ListOfLists front screen follows Edit Categories order
- REQUEST (user): the front-screen card order must match the Edit Categories
  order. The main view used the daily `lol_main_order` snapshot, which only
  changed on a new day or "Regenerate Main Tiles" - category/list drags never
  touched it.
- IMPLEMENTED: `renderMain()` derives the cards directly from categories sorted
  by `sequence` + each category's `lists` array order (filtering active lists by
  `shouldShowListToday`), and no longer reads `main_order` for ordering. The
  legacy snapshot is still maintained for other code/tests.
- TESTS: replaced "a seeded main order is respected" with "the main view follows
  the Edit Categories order, not the daily main_order snapshot"; added "reordering
  lists within a category reorders the main view"; the Sort Lists in Categories
  test now also asserts the main card order.
- VERIFIED: lol-regression 66/66.
- `BUILD_NUMBER` -> `202610201427` via `npm run bump:build`; restart the test
  server afterwards (it snapshots app JS at startup).

### 2026-10-20 - Native checkboxes replaced with <smd-checkbox>
- REQUEST (user): native checkboxes in app UI must use the shared
  `<smd-checkbox>`; example was Edit Dates in CountMyDays.
- CONVERTED: CountMyDays Edit Dates source filters (`#filterShowLocal` /
  `#filterShowGoogle` / `#filterShowGoogleHidden`), the export wizard
  (`#ewDatesCascade`, `#ewCategoriesCascade`, `.ew-date-cb`, `.ew-cat-cb`,
  `.ew-img-cb`) and SolarControlar graph series + `#graph-points`.
  Radios stay native (`smd-checkbox` is checkbox-only). Storybook demo controls
  stay native (dev-only).
- `smd-checkbox` gained a host-level `value` getter/setter (matching a native
  checkbox) so the export/graph code can keep reading `cb.value`.
- Export selectors that used `:checked` now filter hosts by `cb.checked`
  (the host is not an `<input>`); the graph `onchange` uses
  `if (!event.detail)` to ignore the component's duplicate custom `change`
  event and call `loadGraphData()` once.
- EDIT DATES LAYOUT: three rows - (1) search + Clear, (2) Category Filter,
  (3) the three source `<smd-checkbox>`s.
- GUARD: new `tests/native-checkbox-guard.spec.js` scans app JS/HTML and fails
  on any `type="checkbox"` outside `shared/js/components/smd-checkbox.js`.
- TESTS: new "date filters use the shared smd-checkbox component" + "date
  filters stack search, category and source checkboxes on separate rows";
  export wizard asserts the converted hosts; Solar graph asserts the five
  `.graph-series` + `#graph-points` are SMD-CHECKBOX and toggle.
- VERIFIED: cmd-regression + solarcontrolar-regression + the guard 90/90.
- `BUILD_NUMBER` bumped via `npm run bump:build`; restart the test server.


### 2026-10-21 - <smd-checkbox>: one CSS-drawn border (no native double ring)
- REPORTED: the shared checkbox showed two borders - the themed one (a
  contrast-generated `outline`) plus the browser-native input's own UA border.
- FIX (`shared/css/styles.css`): `smd-checkbox input` now has `appearance: none`
  (plus `-webkit-appearance`), so the UA border/tick are gone. The component
  draws the only border (`1px solid currentColor`, `border-radius: .2em`),
  checked fill `var(--smd-checkbox-accent, var(--bs-primary))` and a white tick
  SVG as `background-image`; `:focus-visible` gets a currentColor outline;
  `:disabled` dims to .5. The input stays a REAL `<input type=checkbox>` (no JS
  change), so keyboard/focus/Playwright `check()`/`toBeChecked()` and the
  `smd-checkbox input` locators still work.
- TICK COLOUR: only brite's bright lime primary needs a dark tick, so
  `brite.light.css` + `brite.dark.css` override `smd-checkbox input:checked`
  with a `#000` stroke (Bootstrap gives brite's own `.form-check-input` a black
  tick); every other theme uses the shared white tick.
- CONTRAST LAYER REWRITTEN: the generated block no longer adds
  `outline: 1px solid X; outline-offset: 0` (a second ring). It now emits
  `smd-checkbox input { border-color: X; }` - the SAME single border. All 54
  `<theme>.<mode>.css` blocks were converted in place. `contrast-css.spec.js`
  measures `borderColor/Width/Style` and always re-picks the colour against the
  page bg (same pick as before), so `SMD_CONTRAST_FIX=1` reproduces the
  converted files byte-for-byte; `contrast.spec.js` measures the same border.
- OBSOLETE NOTES: the older `accent-color` KNOWN LIMIT and the
  `color-scheme: dark` workaround no longer apply. `accent-color` is still set
  (probes/callers read it) but paints nothing on an `appearance:none` input.
  Do NOT reintroduce a theme `outline` or a `color-scheme` fix for smd-checkbox.
- At the user's request NO Playwright/pytest suite was run - visual check only.
  `BUILD_NUMBER` -> `202610210745` (so the SW serves the new sheets).
### 2026-10-21 (c) - contrast + cache-busting ordered by tags/projects (one Playwright run)
- REQUEST (user): one single run; no separate contrast process/config; no flaky
  retry layer. Contrast annotated to run first and overlap the rest; asset
  cache-busting annotated to run last under less contention. Move the contrast
  specs back into the main test directory.
- VERIFIED CONSTRAINT: Playwright 1.52 has NO test sequencer/priority config.
  `--test-list` only FILTERS (a reversed list still lists in source order), and
  file collection is alphabetical. The native scheduling hooks are project order
  (test groups are dispatched in config order) and project dependencies
  (dependencies run first, but a failed dependency SKIPS the dependent project -
  unusable for cache tests, which must run even when others fail). The order is
  therefore implemented as ordered PROJECTS selected by tags.
- MOVED: `test-contrast/{contrast,contrast-css,menu-legibility}.spec.js` ->
  `tests/` (git mv). `test-contrast/playwright.config.js` and
  `run-tests.mjs` deleted. `tests/contrast-css.spec.js` still resolves ROOT
  from `__dirname/..` (now `tests/` -> repo root). The explanatory header was
  REMOVED from all 54 theme sheets: each generated block is now just
  `/* smd-contrast:start */` + rules + `/* smd-contrast:end */`. The regeneration
  recipe lives in this file (rule 13 and the CONTRAST FIXES block above).
- TAGGED: all three contrast describes `{ tag: "@contrast" }`; the
  "asset cache-busting" describe `{ tag: "@cache" }`.
- CONFIG (`playwright.config.js`) project order is the schedule:
  1. `contrast` - grep /@contrast/
  2. `chromium` - grepInvert /@contrast|@cache/, testIgnore pmd-touch
  3. `iphone-12-pro` - testMatch pmd-touch
  4. `cache` - grep /@cache/
  Both annotated projects inherit `fullyParallel: true`, so they share the ONE
  global worker pool and `--workers=32` is honoured everywhere (contrast can use
  up to its 11 tests, cache up to its 11 at the tail); project order only decides
  who is first in the queue.
  Counts from `--list`: contrast 11, chromium 888, iphone-12-pro 6, cache 11,
  total 916. `--list` project order is exactly contrast -> chromium ->
  iphone-12-pro -> cache.
- SCRIPTS: `npm test` = `playwright test` (one run, all projects);
  `npm run test:main` = chromium + iphone + cache (skips contrast);
  `npm run test:contrast` = `--project=contrast`.
  Regenerate: `SMD_CONTRAST_FIX=1 npx playwright test --project=contrast --workers=1`.
- REPORT + RERUNS: one Playwright run = one `playwright-report/` HTML report
  (the `html` reporter is configured with `open: "never"`) and one
  `test-results/.last-run.json` covering ALL projects.
  `.\node_modules\.bin\playwright.cmd test --last-failed` therefore reruns every
  failed test from that run, not just the last project's. Any later Playwright
  invocation using the same output dir overwrites the file; use
  `--last-failed-file <file>` to keep a separate history when needed.
- CAVEAT: project order makes contrast START first and cache START last (after the
  preceding groups have been dispatched), not "cache waits for every other test to
  finish" - Playwright has no in-run hook for that. Exact after-everything
  semantics would need a separate final invocation, which the user explicitly
  did not want.
- VERIFIED: `node --check` on the config and specs; the `--list` counts/order
  above; no @flaky tags remain. The suites were not run for this change.
### 2026-10-21 (d) - Main View Scroll tests: smooth-scroll timing flake
- FAILURE (user): pmd-regression "Main View Scroll" -> "editing a job off today's
  list keeps the main view scrolled to the same place" and "swipe right then OK
  keeps the main view scrolled to the same place" failed with
  `expect(before).toBeGreaterThan(0)` receiving 0.
- CAUSE: every theme's Bootstrap CSS contains
  `@media (prefers-reduced-motion: no-preference) { :root { scroll-behavior: smooth } }`.
  The helper's `window.scrollTo(0, 600)` therefore ANIMATES, and the immediate
  `window.scrollY` read in the next evaluate can still be 0. It is a latent
  timing flake, exposed by the faster 32-worker run - unrelated to the contrast /
  checkbox changes.
- FIX (test-only): `scrollDownToViewButton` now sets
  `document.documentElement.style.scrollBehavior = "auto"` around the setup
  `scrollTo` (restoring the previous inline value afterwards) and waits for
  `window.scrollY > 0` before returning the card coordinates.
- VERIFIED: both tests pass together with `--workers=2 --retries=0` (2 passed).

### 2026-10-21 (e) - Storyboard: new app (stickers + text + backgrounds, named boards)
- REQUEST (user): a new `Storyboard` app based on PlanMyDay, with ONLY the
  hamburger menu and Settings | Display; a left toolbar that flies out and can be
  pinned; Backgrounds (space + underwater, 2k), Stickers (mermaid, shark,
  seaweed, spaceman, spaceship) and Text (coloured/transparent background;
  fancy, hand-drawn or stamp borders); stickers and text scalable + rotatable.
  Answers to the design questions: MULTIPLE NAMED BOARDS, handles PLUS two-finger
  pinch/rotate, original SVG artwork in the repo, four borders + a colour palette,
  and the seven live Display rows.
- BUILT: `Storyboard/` (index/manifest/icons/css/js/assets), registered in
  `SmdApps.APPS`, `shared/sampleImages.json` (+ native Storyboard SVG) and
  `sw.js APPS["Storyboard/"]`. Full contract + gotchas are in the STORYBOARD APP
  architecture note above. Settings is a single Display tab (Theme, Theme Mode,
  Font size, Touch size, Slide speed, Auto-hide menu, Screen resolution last).
- WHAT WORKED: a throwaway Playwright probe (outside `tests/`, deleted after)
  driving the real UI end to end. It proved background apply, sticker add, body
  drag (+9% x for +130px), corner scale 1.0 -> 1.89, synthetic two-finger pinch
  (scale 1.89 -> 4.49, rotation 0 -> 18.4) and rotate-handle (-> 37.6), text
  placement with fancy border + danger bg + white text, double-click edit,
  board add/rename/delete/switch, pin persistence across reload, Settings shape
  (one Display tab, exact rows), font size 29.9 -> 36.8px, 8081 sub-path load,
  Launch tile + nav title, and ZERO console/page errors. Screenshots confirmed
  the space/underwater art, all five stickers, all four border styles, sketchy
  dark recolouring, and the phone layout.
- BUGS THE PROBE CAUGHT (all fixed): panel buttons re-render the panel via
  `innerHTML`, so the clicked node was DETACHED before the document outside-click
  handler ran -> `closest("#sbToolbar")` failed and the panel closed itself
  (fixed with `sbState.panelClickAt`); the open tool panel covered the hamburger
  dropdown (fixed with `#mainNav .dropdown-menu { z-index: 1035 }`); assigning
  `background-image: ""` for "no background" overrode the CSS dot grid (fixed
  with `removeProperty`); the first item was placed at 41% instead of centre
  (cascade formula rewritten); and rail labels were clipped by the badge-sized
  font (fixed 10px labels, 74px rail, hidden <=520px).
- USER-FOUND AFTER THE FIRST BUILD: "I can't see the grab handle at the top." The
  action bar was centred above the selection (`rect.top - 14`, translated -100%),
  so it exactly covered the 22px rotate handle - the handle had `display:flex`
  but `elementFromPoint` at its centre returned the duplicate icon, and a mouse
  user saw only the bar. Fixed by placing the bar OUTSIDE the object's AABB
  (right, else left, else above the rotate handle, else below) with an inline
  transform per side. Verified with a probe: the bar moved from x=665..775
  (covering the handle at 709..731) to x=800..910, and `elementFromPoint` now
  returns the `fa-rotate` icon. Mouse rotation works.
- NOT RUN (explicit user instruction): no regression tests were run and NO tests
  were added. Deferred test updates are listed in the STORYBOARD APP note.
- BUILD: `202610211932` via `npm run bump:build`.

### 2026-10-21 (f) - Storyboard: text font picker
- REQUEST (user): "I want to be able to select a font for the text."
- ADDED: text items carry `font` (default `theme`); `SB_TEXT_FONTS` (storage.js)
  offers the theme stack, system Serif/Monospace and the 12 vendored families
  (Roboto, Lato, Open Sans, Montserrat, Ubuntu, Nunito, Nunito Sans, Source Sans
  Pro, Inter, News Cycle, Cabin Sketch, Neucha). `sbNormalizeItem` validates it;
  `sbStyleTextElement` adds `.sb-font-<id>`; storyboard.css owns each stack.
  The Text panel has a **Font** row (an `<smd-select>`, 15 options) between the
  textarea and Background; its `change` writes the live item or the draft for the
  next text, and a live `.sb-font-preview` line underneath shows the family even
  when the panel covers the object. `sbPlaceText` copies the draft font onto the
  new item.
- NO EXTRA SCRIPT/LINK: the theme sheet already `@import`s
  `shared/css/fonts/fonts.css` (all @font-face declarations are in the SW), so a
  selected family loads on first use.
- VERIFIED with a deleted probe: the select renders 15 options; choosing Cabin
  Sketch gives `fontFamily: "Cabin Sketch", Neucha, cursive`,
  `document.fonts.check` true, `item.font = "cabin-sketch"`, and the panel stays
  open; editing the placed text to News Cycle and reloading keeps
  `font: "news-cycle"` + the rendered family; the font dropdown is above the
  selection bar (toolbar raised to 1035, nav dropdown 1038/1039) and the live
  preview follows the selection (Montserrat checked + loaded); zero
  console/page errors.
- BUILD: `202610211939` via `npm run bump:build`.

### 2026-10-21 (g) - Storyboard: directional connectors between text boxes
- REQUEST (user): "From the text boxes I want to be able to add connectors so
  that I can add a directional connector to another text box."
- BUILT: per-board `connectors: [{id,from,to}]` (text-to-text only, one per
  pair); selection-bar Connect arrow -> connect mode -> click the target text
  box; arrowhead at the TARGET. Click an arrow to select it, then Reverse or
  Delete from the same bar; Delete/Backspace also works. Escape/blank/non-text
  cancels connect mode. Deleting a box removes its links. Full contract is in the
  STORYBOARD APP note above.
- RENDER: SVG layer under the objects, body-color line + body-bg halo + arrow
  marker; endpoints recomputed against each box's ROTATED rectangle (item
  rotation + offsetWidth/Height) with a 5px gap, so arrows stay glued while a box
  moves, scales or rotates. Redraws on every transform/text style, window resize
  and a per-object ResizeObserver (font loading changes metrics).
- GOTCHA FOUND WHILE BUILDING: `#sbItems` had to become `pointer-events:none`
  (with `.sb-object` auto) or its transparent full-board box swallowed every
  click aimed at a connector's hit stroke. Handles/selection outlines were also
  switched from primary to body-color + a body-bg halo - sketchy's primary is
  #333, so its handles/outline vanished on the dark background.
- VERIFIED (throwaway probes, deleted): Connect button text-only; hint + source
  outline + dashed targets during connect; from/to + arrow marker; move and
  rotate move the path endpoints; clicking the line selects it; Reverse swaps
  from/to; Delete removes path + selection; Escape cancels; connector survives
  reload; deleting a box drops its connectors; per-board isolation; font-size and
  handle-scale redraw the endpoints; theme switch recolours the line/arrow;
  zero console/page errors. Screenshots checked on superhero + sketchy dark +
  flatly light over the space background.
- NOTE: clicking a text box twice within 340ms opens the text editor by design,
  so a pointer drag started immediately after selecting a box can be swallowed
  as a double-click. Wait ~400ms or click once, then drag. Not a connector bug.
- BUILD: `202610211957` via `npm run bump:build`.

### 2026-10-23 - smd-image-dropdown: menu thumbnails match the closed button (no clipped icons)

- REPORTED (user): "the space for the image in the dropdown seems to be too
  narrow for all of the options if some of the images are wider", clarified as
  Font Awesome `fa:computer` and "there might be other".
- DIAGNOSIS (probe): the menu `.thumb` was pinned to `1.5rem` (24x24) in
  `shared/css/styles.css` while the inner `<smd-image>` kept the app's Icon size
  (50px at medium). As a flex item it shrank in WIDTH only -> a 24x50 host; the
  glyph font-size came from the host's 50px (40px) so a 50px-wide `fa:computer`
  was cropped to a 24px window (13px off each side), `fa:bars` lost ~5.5px,
  `fa:image` ~8px. A 300x60 upload became a 24x4.8 sliver.
- FIX: removed the fixed wrapper rule; added `smd-image-dropdown .thumb >
  smd-image { flex:none; }` so the image stays square and sizes the wrapper;
  no-image options now render an EMPTY `<smd-image>` inside `.thumb.thumb-blank`
  (like `smd-image-select`) so the column follows the Icon size setting.
  Result: menu thumbs equal the closed button (50x50 at medium), wide images
  50x10, icons unclipped.
- WIDEST AVAILABLE ART: swept the vendored sets in Chrome (canvas ink at
  100px). FA solid `fa:braille` is the widest (ink 1.31em / advance 1.25em),
  then `fa:bell-slash`/`fa:bug-slash`/`fa:eye-slash` (1.29), brands
  `fab:opencart` (1.30); bootstrap-icons tops out at 1.08 (`bi:crop`); sample
  SVGs max "Wedding 2" 1.164 (but `<img>`s are already constrained).
  `smd-image._renderIcon` used `px * 0.8`, which makes braille's ink 1.048x the
  box -> 1.2px clipped each side at 50px (2.4 at jumbo). Changed the glyph
  scale to `px * 0.75` (1.31 x 0.75 = 0.98), so every available icon fits.
  Test `pmd-regression` "renders a bi: prefixed name..." now expects 48px for a
  64px box (was 51px).
- TESTS (added; the USER RAN THE FULL SUITE, not this session):
  pmd-regression "menu thumbnails match the closed button and keep a square
  image box" (square, equals the button, 300x60 keeps 5:1) and "the widest Font
  Awesome glyph (fa:braille) fits the menu thumbnail" (canvas ink fits in the
  button AND the row); cmd-regression's blank "No Category" thumb assertion now
  expects the empty `<smd-image>` (and no `image` attribute).
- NOT CHANGED / IGNORED (user): the superhero light-mode palette mismatch
  (white form field vs dark dropdown menu) and the auto light/dark artwork
  choice on the ACTIVE row (orange highlight resolves "light"). Separate issue.
- BUILD: `202610232000` via `npm run bump:build`.
- SAME SESSION (full suite): the user's run reported the 5 expected
  launch-regression failures from the deferred Storyboard update (counts/lists
  still said 8). Updated `tests/launch-regression.spec.js` (see the STORYBOARD
  APP note). Test-only change, so no additional BUILD bump.
- SAME SESSION (feature, user request): Storyboard stickers gained Flip
  horizontally / Flip vertically (see the STICKER FLIP note above). Files:
  `Storyboard/index.html` (buttons), `js/board.js` (`sbFlipSelected`,
  `sbApplyStickerFlip`, selection UI), `js/storage.js` (`flipX`/`flipY`
  normalize + `sbFlipItem`), `css/storyboard.css` (image-only mirror + pressed
  style). No Storyboard spec exists (tests still deferred), so this was NOT
  run here - the user runs the full suite. Follow-up: the action-bar buttons are
  now flex-centred (`padding:0`, `line-height:1`) - the UA button padding had
  pushed the two flip glyphs off centre. BUILD -> `202610232043`.
- SAME SESSION (feature, user request): Storyboard "Save" rail button downloads
  the current board as a JPG (see SAVE AS JPG above). Verified with a throwaway
  probe: space background, two flipped/rotated stickers, fancy + hand text
  (Cabin Sketch and theme font), a connector; the 2560px JPG matched the board
  and excluded the UI, with no console/page errors. GOTCHA found and fixed:
  canvas text needs a ~1.5px wrap tolerance (integer offsetWidth vs fractional
  browser layout) or the last word falls to a hidden second line. FOLLOW-UP
  (user): the first cut saved the visible `cover` crop, so the JPG now exports
  the WHOLE background artwork at natural size with items mapped back through
  the cover transform (see the SAVE AS JPG note). Verified on a 390x575 board:
  the JPG is 2560x1440 with the full space art, and items keep their position
  on the art (LEFT moved from 20% of the crop to ~39% of the artwork).
  BUILD -> `202610232126`.
- FOLLOW-UP 2 (user, browser zoom): "the background and images do not zoom but
  the placed text does ... it moves inconsistently", then "I want the whole
  background image to scale as one image". The live board is the WHOLE artwork:
  `sbLayoutBoard()` fits the background aspect (2560x1440) inside
  #storyboardArea, centred with bars; `#sbBackground` is 100% 100%; stickers use
  the board-relative `--sb-sticker-base`; a click on the bars deselects. The
  earlier `--sb-zoom` layer + object inverse scale experiment was REMOVED.
- FOLLOW-UP 3 (user, final zoom model): "the Menu and the side panel ... and the
  name at the top right should all scale with the browser zoom. But the
  background should be shown as large as possible (keeping its original ratio)
  in the space available. Then the text and stickers need to be scaled to stay
  in the normal places. I will implement canvas zoom next." Replaced the
  no-refit/DPR guard: every resize (120ms debounce), including a page zoom,
  re-fits the artwork. `--sb-design-scale` = fitted board height /
  `SB_DESIGN_HEIGHT` (655, the board of a 1280x720 window) is set on #sbCanvas;
  the text font/padding/border/radius, `--sb-sticker-base`, the dot grid,
  connector stroke widths and the connector end gap multiply by it. The UI (nav,
  rail, board chip, action bar) is untouched and the browser magnifies it.
  Verified with a throwaway probe using a 640x360 CSS viewport at
  deviceScaleFactor 2 (the equivalent of 200% page zoom): nav 65 -> 130
  physical, board 1164.4x655 -> 524.4x295 CSS (1048.8x590 physical), font 29.9
  -> 13.47, sticker 117.9 -> 53.1, line 2.5 -> 1.126 (all x0.4504); text and
  sticker centres stayed at the same % of the artwork; both JPGs are 2560x1440
  and match. No console errors. The user runs the full regression suite.
  BUILD -> `202610241449`.

### 2026-10-24 - Storyboard rename
- REQUEST (user): rename the app to Storyboard (directory, localStorage keys,
  Launcher title/menu and all supporting references), with NO compatibility
  layer for the old name.
- RENAMED with `git mv` (history preserved): the app folder, its stylesheet and
  its shared sample icon.
- UPDATED: the `SmdApps.APPS` row (name/description/path/icon), the Launch grid
  and flyout (both read the registry), `shared/sampleImages.json` (entry name +
  embedded aria-label), `sw.js` `APPS["Storyboard/"]` and every precache path,
  `Storyboard/manifest.json` (name/short_name/description), `<title>`, the nav
  title (from the registry), the toolbar aria-label, the settings QR URL, the
  update-prompt copy, `window.__storyboardSwUpdater`, app comments, the default
  board name "My Storyboard", the JPG fallback slug, `README.md`, and
  `tests/launch-regression.spec.js`. The board-area id is now
  `#storyboardArea`. The internal `sb*` globals, `sb-*` CSS classes and `#sb*`
  DOM ids were deliberately left alone (implementation detail; no user-facing
  name).
- STORAGE: `SmdConfig.storagePrefix = "storyboard_"`. There is deliberately NO
  key migration and NO old-path mapping: the first load starts a fresh
  `storyboard_*` state, and any pre-rename Launch path is simply unknown and
  dropped by `SmdApps.loadConfig()`.
- VERIFIED with throwaway probes (NOT the regression suite): the Launch grid
  tile (icon loaded) and flyout both show Storyboard -> `Storyboard/`;
  `/Storyboard/` title/nav/toolbar/QR all say Storyboard; a fresh load creates
  `storyboard_boards`, `storyboard_activeBoard` and `storyboard_toolbarPinned`;
  manifest name/short_name/description are new; the old URL is 404; the 8081
  `/PlanMyDay/Storyboard/` mount renders the default "My Storyboard"; no
  console/page errors or failed same-origin requests. The user runs the full
  suite.
  BUILD -> `202610241517`.

### 2026-10-24 - Storyboard stamp frame colour
- REQUEST (user, TDD): in the "Space" board the stamp edge around the `xczx`
  text (`color:"auto"`, `border:"stamp"`) is black on screen but white in the
  saved JPG.
- CAUSE: a text frame is an SVG data URI with its colour baked by
  `sbFrameDataUri(item.border, sbResolveColor(item.color))` at render time,
  while the text colour is live CSS. `applyTheme()` only re-points the
  stylesheet links, so their CSS can land after the first render (or after the
  `smd-theme-change` render). The text then updates live, but the frame keeps
  the old baked colour. The JPG exporter re-resolves the colour at save time,
  which is why it could disagree with the screen.
- TEST FIRST: added `tests/storyboard-stamp.spec.js` (the first Storyboard
  spec). It loads a minimal auto/stamp board, switches the theme to Cerulean
  and waits for the sheet, then requires the baked frame stroke to equal both
  the live text colour and `sbResolveColor("auto")`. Before the fix it failed
  with stale `#ebebeb` vs live `#495057`; after it passes.
- FIX: `Storyboard/js/app.js` now listens for `load` on
  `#bootstrap-theme-css`, `#theme-override-mode` and
  `#theme-override-specific` and schedules one `requestAnimationFrame`
  `sbRender()` when they arrive. This covers initial boot, live theme/mode
  switches, and the exporter's resolved colour. Ran only the focused spec; the
  user runs the full regression suite.
  BUILD -> `202610241537`.

### 2026-10-24 - Launch Storyboard icon
- REQUEST (user): the Launch grid has no icon for Storyboard.
- CAUSE: Launch resolves each app icon by NAME from the origin-wide
  `shared-images` library. `seedSampleImages()` only seeds when that key is
  absent, so an existing browser library seeded before the rename still has the
  old sample entry and no `Storyboard` entry; `<smd-image>` then has no source
  and the tile is blank. A fresh browser was fine, which is why the existing
  grid test did not catch it.
- TEST FIRST: added `tests/launch-app-icons.spec.js`. It waits for the normal
  seed, replaces the store with one missing both `Storyboard` and an ordinary
  sample (`Person 1`), reloads, and requires the Storyboard tile's
  `<smd-image img>` to paint. Before the fix the image had no `src`/natural
  width; after it passes. It also asserts `Person 1` stays deleted, proving the
  fix only reconciles app icons rather than merging the whole standard set.
- FIX: `Launch/js/app.js` now calls `ensureAppIcons()` after
  `seedSampleImages()`. It runs only when the library already exists (so it
  never races the first seed), adds only missing registered app icons from
  `shared/sampleImages.json`, saves the list, and refreshes the grid images. No
  old-name migration or deletion of the user's existing samples.
- Also ran the existing "root shows the grid of available apps" icon test;
  passes. Full suite left to the user.
  BUILD -> `202610241547`.

### 2026-10-24 - Storyboard JPG stamp edges
- REQUEST (user): on the same "Space" board, the stamp border around the text
  renders in the saved JPG with the dots stretched along the sides.
- CAUSE: the live CSS uses `border-image-repeat: round` plus
  `border-image-slice: 30`, so the 120px frame SVG's middle edge slices repeat.
  `sbDrawCanvasText()` drew each middle slice once with `drawImage()`, stretching
  one 60x30 (top/bottom) or 30x60 (left/right) slice across the whole side.
- TEST FIRST: extended `tests/storyboard-stamp.spec.js` with a tall/wide
  three-line stamp box. It wraps `CanvasRenderingContext2D.prototype.drawImage`
  during `sbDownloadJpg()` and records the 120x120 frame slices. It requires all
  four middle edge source rectangles to be drawn more than once. Before the fix
  each edge was one stretched call; after it passes.
- FIX: added `sbDrawCanvasFrameEdge()`, which scales the slice across the border
  to the frame width and then draws `Math.round(edge / naturalTile)` copies along
  the edge, matching CSS "round". The four middle-edge draw calls now use it; the
  corners are still single draws. This applies to every frame style, not just
  stamp. Also inspected a JPG crop of the reported Space item: the dots are
  round and evenly spaced.
- Ran only the focused spec; the user runs the full regression suite.
  BUILD -> `202610241647`.

### 2026-10-24 - Storyboard live text baseline
- REQUEST (user): the "Space" glyphs sit slightly higher in the JPG than on the
  live board; other text boxes do the same, and the JPG alignment is preferred.
- CAUSE: `sbDrawCanvasText()` centres each line with `textBaseline="middle"` at
  `contentTop + lineHeight / 2`. CSS instead positions glyphs from the font's
  ascent/descent, leaving the visual glyph centre a little lower. The gap is
  font-dependent (about 0.08em for the theme Lato, less for mono).
- FIX: text now lives in an inner `.sb-text-body` block span. `sbApplyTextNudge()`
  measures the live font with an offscreen canvas (alphabetic vs middle
  `fontBoundingBox` metrics) and sets only that span's relative `top` in `em`.
  The box, frame, background, handles, wrapping and export geometry are
  untouched; the JPG code still uses the item text and its existing baseline.
  The nudge is recomputed after a webfont loads and on style/font changes.
- TEST: added a third test to `tests/storyboard-stamp.spec.js`. It renders white
  text on a black surface, screenshots the live element, exports the JPG, crops
  the same box, and compares the white-pixel bbox centres. The old screen was
  several px low; the test requires the centres within 2.5px (currently well
  under). A throwaway six-font probe also checked theme, serif, mono, Roboto,
  Montserrat and Cabin Sketch.
- Ran only the focused spec; the user runs the full regression suite.
  BUILD -> `202610241647`.

### 2026-10-24 - Storyboard app zoom + scroll
- REQUEST (user): zoom the canvas in/out; magnifier + and - side by side in the
  side panel; a Fit button; scrollbars when zoomed; always be able to scroll to
  see the working space (a selected sticker's grab handles and the action bar).
- IMPLEMENTED: `#storyboardArea > #sbScroller (overflow:auto) > #sbStage (flex
  centred) > #sbCanvas`; `sbLayoutBoard(anchor)` now multiplies the fitted size by
  `sbState.zoom` (`SB_ZOOM_LEVELS`, stored as `storyboard_zoom`; no percentage
  UI). `sbSizeStage()` + `sbBoardOverhang()` measure every object and its visible
  handles and grow a pasteboard (min 56px) only when zoomed past the fitted view,
  so 100% has no scrollbars and looks exactly as before. `#sbCanvas` is
  `overflow: visible` so handles at the artwork edge are not clipped. Zoom
  anchors on the selection (else viewport centre); the action bar repositions on
  scroller scroll; board/background switches recentre.
- TEST FIRST: `tests/storyboard-zoom.spec.js` (7 tests) failed with no
  `#sbScroller`/buttons, then passed. It hit-tests the handles with
  `elementFromPoint` (a clipped handle still reports a rect, so geometry alone
  would lie) and covers the real order "zoom, THEN select". That order exposed a
  real bug: the pasteboard had been sized with no handles visible, so the rotate
  handle stayed clipped. Fixed with `sbRefreshPasteboard()`, called from
  `sbUpdateSelectionUi()` and at the end of a drag.
- Also ran `storyboard-stamp.spec.js` + `storyboard-zoom.spec.js` (10 passed) and
  `launch-regression.spec.js` (13 passed). Visual probe (deleted) checked 100%,
  150%, both edge handles, and the open Stickers panel.
- GOTCHA (cost a full red run): a `serve-tests.mjs` process from a previous run
  was still listening on 8080/8081 and Playwright reused it
  (`reuseExistingServer`). sirv had snapshotted files from BEFORE the edits, and
  mid-write reads produced truncated JS ("Invalid or unexpected token",
  "sbLoadState is not defined") with every test seeing an empty board. ALWAYS
  check/kill ports 8080/8081 before a run, or start `npm run dev:test` yourself
  and use `EXTERNAL_SERVERS=1`.
- The user runs the full regression suite.
  BUILD -> `202610241647`.

### 2026-10-24 - Storyboard: `wb`→`sb` internal rename + multi-select + nested groups
- RENAME (user): `wb`/`WB_` were the old Whiteboard prefix (the app-name rename had
  left every internal token alone). Renamed with a word-boundary script across
  `Storyboard/js/*.js`, `index.html`, `storyboard.css`, both storyboard specs and
  the Storyboard notes in AGENTS.md: `wb*`→`sb*`, `wb-*`→`sb-*`, `#wb*`→`#sb*`,
  `--wb-*`→`--sb-*`, `WB_*`→`SB_*` (~1,553 occurrences, 282 identifiers). File
  names, storage keys (`storyboard_*`) and behaviour unchanged; no `sb*` name
  collisions existed. Verified by running stamp+zoom 10/10 AFTER the rename.
- MULTI-SELECT + GROUPS (user): Ctrl/Cmd/Shift+click toggles; touch long-press
  (450ms, cancelled by movement or a second finger) adds. Group/Ungroup live on
  the floating selection bar and are HIDDEN unless usable (2+ nodes / one group).
  Groups nest.
- MODEL: `board.groups = [{id, children:[leafId|groupId]}]` (a forest over the
  flat item list). `sbNormalizeGroups` sanitises on load/mutation: unknown/dup/
  cyclic links dropped, one parent per node, wrappers with <2 children dissolved
  and hoisted into their parent. A group has NO transform of its own: gestures
  bake the composed result into each selected leaf, so rendering, connectors,
  z-order and the JPG export are untouched.
- SELECTION: `sbState.selectedIds` (top-level nodes) + `selectedId` (single leaf
  for text edit/Connect/Flip). Clicking a member selects the OUTER-MOST group. A
  plain click on a member of a multi-selection COLLAPSES to it on pointerup; a
  drag moves the whole set (`drag.collapseOnTap` + `drag.moved`). New
  `#sbSelectionBox` inside `#sbCanvas` (above `.sb-items`) draws ONE outline +
  scale/rotate handles for a group/multi selection; members get `.sb-member`
  (outline only); a single leaf keeps its per-object handles.
- TRANSFORMS: `sbApplyDrag(drag, factor, deltaDeg, moveX, moveY)` from a
  pointerdown SNAPSHOT over the selection rect. Scale multiplies each leaf's
  scale and its offset from the rect centre; rotate is rigid about that centre
  (position orbits, `rotation += delta`); move clamps the SET's box (single items
  keep 2..98); every member's scale stays 0.2..5. Pinch now spans the selection.
- GROUP/UNGROUP: `sbCreateGroup` / `sbDissolveGroup` (ONE level; children take the
  group's place inside its parent, or become top-level). Delete removes all leaves
  + nested groups (and their connectors); Duplicate deep-copies the nesting (+4%,
  z above); Front raises members preserving their order.
- PASTEBOARD: `sbBoardOverhang` also measures `#sbSelectionBox` + its handles, so
  group handles can be scrolled into view when zoomed (tested at 1.5x).
- TESTS (TDD, red first): new `tests/storyboard-groups.spec.js` (16): bar
  visibility, Ctrl toggle, grouping, nesting + one-level ungroup, move/scale/
  rotate maths, loose-selection move, delete, duplicate (incl. nested),
  persistence, touch long-press, mixed text+sticker, zoomed handles. RED
  confirmed before implementing (buttons/selection box missing). GREEN: 16/16;
  stamp 3/3; zoom 7/7. BUILD -> `202610241753`.
- GOTCHA for these tests: the fixed nav can cover a top handle at max scroll -
  centre the selection box in the scroller before `elementFromPoint`; and do not
  overlap two stickers (the second intercepts the click).

### 2026-10-24 - Storyboard Space-drag pan
- REQUEST (user): holding the space bar turns the pointer into a grabbing hand
  and pans the canvas.
- DECISIONS (user): pan only when zoomed/overflowing (100% stays fitted with no
  scrollbars); keep the existing selection when a pan starts on a sticker;
  releasing Space mid-drag keeps panning until mouse-up.
- IMPLEMENTED: `sbState.panReady`/`sbState.pan`; capturing pointerdown on
  `#sbScroller` ahead of the object/group handlers; pan branches at the top of
  `sbOnPointerMove`/`sbOnPointerUp`; Space branch in `sbOnKeyDown` with guards
  for typing/interactive targets/settings/modals; `keyup` + window `blur`
  listeners; `#sbScroller.sb-pan-ready|.sb-pan-active` cursor rules.
- TEST FIRST: new `tests/storyboard-pan.spec.js` (10 tests) was RED (no cursor
  classes/scroll movement) then GREEN. It asserts rendered results: scroll
  offsets, item SCREEN position moving with the canvas while stored x/y stay
  50/50, selection/bar unchanged when grabbing a sticker, grabbing during drag /
  grab after mouse-up / normal after keyup, clamping at scroll 0, and the
  guards (textarea space, focused button activates, settings inert, blur).
- VERIFIED: pan 10/10; storyboard pan+zoom+stamp+groups 36/36 (workers=4);
  launch-regression 13/13. Node syntax checks clean.
- The user runs the full regression suite.
  BUILD -> `202610241816`.

### 2026-10-24 - Storyboard: zoom + pan are per board (stored in the board data)
- BUG (user): after zooming and panning, reopening the page restored the zoom but
  CENTRED the board. `sbRender()` called `sbCentreBoard()` on the first render
  (the `layoutKey` branch) and only the global `storyboard_zoom` was persisted.
- FIX (user): zoom and pan are now PART OF EACH BOARD:
  `board.view = { zoom, fx, fy }`, where fx/fy is the BOARD fraction at the
  centre of the visible scroller (0.5/0.5 = fitted + centred). `sbNormalizeBoard`
  validates it (`sbNormalizeZoom` + `sbNormalizeViewFraction`, -0.25..1.25,
  default 0.5) and `sbAddBoard` starts at `{1, 0.5, 0.5}`. NO legacy migration:
  the old `storyboard_zoom` key is no longer read or written (a stale value is
  left in storage and ignored). There is no browser-fraction test dependency on
  window size: fractions were chosen so the same artwork point survives a
  window-size change (raw scrollLeft/Top would not).
- CAPTURE: `sbCaptureView()` + `sbSaveViewSoon()` from the scroller's scroll rAF
  (covers wheel/touchpad/scrollbar/SPACE-DRAG panning) and `sbSaveViewNow()` on
  `sbZoomTo`, board switch/add (BEFORE `activeId` changes) and
  `pagehide`/`visibilitychange:hidden`.
- RESTORE: `sbRender()`'s `layoutKey` branch calls
  `sbRestoreBoardView(board)` (`sbApplyZoomAnchor({fx, fy, sx/sy = viewport
  centre})`) after the final `sbLayoutBoard()`, so a zoomed pasteboard already
  exists. A never-panned board restores 0.5/0.5, i.e. the old centred view.
  `sbState.zoom` is only the runtime mirror of the ACTIVE board's `view.zoom`;
  `sbLoadState`, `sbSetActiveBoard`, `sbAddBoard` and `sbDeleteBoard` sync it
  from the incoming board, so switching boards ALSO restores that board's zoom
  (it used to be one global zoom).
- TESTS (TDD, red first) in `tests/storyboard-zoom.spec.js`:
  "panning is remembered when the page is reopened" (zoom 1.5, scroll to 0,0 ->
  reload -> same board fraction and NOT centred; `board.view` holds zoom/fx/fy)
  and "each board keeps its own zoom and pan position" (A 1.5 + top-left; B
  starts at 1 and centred -> set 2 + bottom-right; switch back and forth, then
  reload, then switch again - each restores its own). RED on the old code (no
  `view`; switching kept the global zoom). GREEN 2/2; FULL Storyboard suite
  38/38 (groups 16 + stamp 3 + zoom 9 + pan 10). BUILD -> `202610241833`.
- GOTCHA: call `sbCaptureView()` BEFORE changing `activeId` in
  `sbSetActiveBoard`/`sbAddBoard`, or the outgoing board's pan is lost; and keep
  saving on the `pagehide`/`visibilitychange` path because a last pan may not
  have passed the 150ms debounce.

### 2026-10-24 - Storyboard: one-button align/distribute (hover to expand)
- FEATURE (user): with 2+ objects selected, align them left/centre/right,
  top/middle/bottom, or distribute horizontally/vertically. The user refined the
  UI mid-implementation: ONE align button that lights up, expanding on hover to
  show the options (not eight permanent icons).
- UI: `#sbSelAlign` in the floating selection bar (hidden unless 2+). Hover/tap
  expands `#sbSelAlignRow` (a second `.sb-sel-row`), with the 6 align buttons and,
  at 3+ nodes, the 2 distribute buttons. Collapses on a selection change and 180ms
  after the pointer leaves the bar. Hover-capable pointers open it on
  mouseenter; touch toggles on click. The bar RE-ANCHORS on the button when the
  row opens (otherwise the height change moved the button out from under the
  pointer and the bar's mouseleave collapsed it instantly).
- MATHS: `sbNodeRect()` = the rendered AABB of a top-level node (a group counts
  as ONE unit). `sbAlignSelection(mode)` targets the selection bbox edge/centre;
  `sbDistributeSelection(axis)` equalises the GAPS between adjacent edges and
  keeps the first/last objects fixed. `sbMoveNode()` moves every leaf of the
  node by the same delta (viewport px -> board %), so groups keep their shape.
  Using rendered AABBs makes it work with rotation and zoom (client px = canvas
  px).
- TESTS (TDD, red first): `tests/storyboard-align.spec.js` (12): button
  visibility + hover expand/collapse, the six aligns, both distributions, a
  group aligned as one unit, and persistence. RED before the UI existed. GREEN
  12/12; FULL Storyboard suite 50/50 (align 12 + groups 16 + pan 10 + stamp 3 +
  zoom 9). BUILD -> `202610241850`.
- GOTCHA: the align row changes the bar's height and `sbPositionSelectionBar()`
  repositions it; without the button-anchor shift the pointer no longer hovers
  the button, the bar's mouseleave fires and the options collapse immediately.


### 2026-10-24 - MinIO directories + Storyboard board save/load
- FEATURE (user): shared MinIO **Directory** setting on every app's Minio tab
  (`smdKey("minio_directory")`; empty = bucket root). `getMinioConfig().directory`
  is normalised by `minioNormalizeDirectory()` (forward slashes, no leading/
  trailing slash, no "."/".." segments); `changeMinioDirectory()` persists it.
  `minioBuildKey(dir, extraDir, filename)` joins a FURTHER directory level into a
  key, and `minioDirectoryPrefix(dir)` returns the trailing-slash list prefix.
- LISTING: `minioListFolder(bucket, prefix, config)` = list-type=2 +
  `delimiter=/` -> `{objects, prefixes}`; `minioListAllUnder()` follows
  continuation tokens; `minioLatestJsonKey()` picks the lexicographically
  greatest `.json` key (backup names carry YYYYMMDDHHMM). The import page is
  scoped to the configured Directory and shows immediate files, subdirectory
  rows, `<subdir>:latest` (newest JSON inside that subdir), and Up when nested.
  Stable classes: `.minio-folder-item`, `.minio-latest-item`, `.minio-file-item`,
  `.minio-up-item`. Navigation helpers: `minioNavigate()`/`minioParentPrefix()`;
  the page NEVER lists above the configured Directory.
- EXPORTS: the shared default export and CountMyDays' app-owned
  `doMinioExport` now upload under `config.directory`; with an empty Directory
  the old filenames/keys are unchanged (PMD/CMD/LoL MinIO tests still green).
- STORYBOARD: new `Storyboard/js/app-minio.js` (registered in `sw.js`), a Minio
  settings tab, `#minioImportPage`, and hamburger items "Save Story to Minio" /
  "Load Story from Minio" (deliberately NOT on the rail; `#sbSaveBtn` is still
  Save scene as JPG). UPDATED for Stories/Scenes: save key =
  `<Directory>/<sanitised story name>/story-YYYYMMDDHHMM.json` with payload
  `{version, app:"storyboard", exportedAt, story}` (the WHOLE story including all
  scenes). Load goes through `SmdConfig.onMinioImport`: an unused story name is
  added as a new story with fresh story/scene ids; a name that ALREADY EXISTS
  asks via `showSmdModal` (Cancel / Overwrite) and Overwrite replaces that
  existing story IN PLACE (same story id). Cancel returns to the file list. Old
  board-level files (`data.board`) are deliberately rejected.
- TESTS: `tests/minio-directory.spec.js` (4: settings persistence, export path,
  listing + `:latest` + folder navigation, CMD app-owned export),
  `tests/storyboard-minio.spec.js` (6: tab/menu, menu ORDER, whole-story save
  key/payload, story-name sanitising, load-latest adds a story, same-name
  overwrite prompt/cancel/overwrite) and `tests/storyboard-stories.spec.js`
  (5: default Story 1/Scene 1, New Story/New Scene, per-scene content + clicking
  a story opens its scenes, rename persistence, delete guards). Also re-ran 63
  existing MinIO tests and all 56 Storyboard specs: green.
- GOTCHA: `tests/serve-tests.mjs` snapshots files at startup, so a long-running
  dev server serves STALE code after edits - restart `npm run dev:test` before
  trusting a red/green run.

### 2026-10-24 - Storyboard: Stories contain Scenes (model rewrite)
- REQUEST (user): call boards STORIES; a Story has any number of SCENES and each
  scene is a board (background, stickers, text, connectors, groups, zoom/pan).
  Loading a story shows it where the board was, but the sidebar lets you pick
  any scene; clicking the story opens its scene list. NO data migration -
  Storyboard has not shipped, so the old board store is deliberately ignored.
- MODEL: `sbState.stories = [{id,name,scenes:[scene],activeSceneId}]` plus
  `sbState.activeStoryId`; `sbState.activeId` is still the ACTIVE SCENE id (and
  `sbActiveBoard()` returns that scene), so board-scoped render/edit/group/
  connector/JPG-export code is untouched. Keys: `storyboard_stories`,
  `storyboard_activeStory`, `storyboard_activeScene` (the old
  `storyboard_boards`/`storyboard_activeBoard` keys are gone). New names: story
  "Story N" with first scene "Scene 1"; further scenes "Scene N".
- UI: rail's first tool re-labelled **Stories** (still `data-tool="boards"`
  internally). Panel = one `.sb-story-row` per story; only the ACTIVE story is
  expanded into `.sb-story-scenes` (sibling container, NOT inside the row - a
  selector must use `.sb-story-row.active + .sb-story-scenes`). Clicking a story
  selects/expands it; clicking a scene edits it. Story and scene rows have inline
  rename + delete; `#sbAddStory` and each expanded story's `.sb-add-scene`.
  Deleting the LAST scene of a story / the LAST story is disabled. The chip
  reads `Story / Scene` and still opens the Stories panel.
- MINIO: `js/app-minio.js` now saves/loads the whole Story
  (`<dir>/<story>/story-YYYYMMDDHHMM.json`, payload `{... story}`); old
  board-level files are rejected. Same-name load asks Overwrite/Cancel and
  overwrite replaces that story in place; a new name adds a story with fresh
  story+scene ids (active scene index preserved).
- TESTS: new `tests/storyboard-stories.spec.js` (5) + rewritten
  `tests/storyboard-minio.spec.js` (6). ALL Storyboard specs re-seeded to the
  nested store (`storyboard_stories` / `activeStory` / `activeScene`): 61/61
  green (align 12, groups 16, pan 10, stamp 3, zoom 9, minio 6, stories 5).
- GOTCHA: the Story row and its scene list are SIBLINGS by design (the row is a
  horizontal flex bar). Tests/selectors must use the adjacent-sibling form; a
  descendant selector finds zero scenes. `sbSaveState()` mirrors
  `activeId` into the active story's `activeSceneId`, so switching scenes and
  reloading are consistent.

### 2026-10-24 - PWA title-bar colour follows the chosen theme
- REQUEST (user): the installed MyApps PWA on Windows 11 had a "weird green"
  title bar. Wanted something sympathetic to the OS, else based on the chosen
  theme (secondary suggested).
- FINDING: Windows 11 takes the installed PWA title bar from the manifest
  theme_color; the page meta theme-color overrides it. No manifest option makes
  it follow the OS accent (W3C manifest#695): omitting theme_color gives the OS
  default but loses mobile branding, so used the user's fallback.
- WHAT: shared `applyThemeColor()` (smd-settings.js) writes the live
  `--bs-body-bg` into `<meta name="theme-color">`; `smdRefreshThemeColor()`
  runs it immediately + next rAF, and `smdBindThemeColorLink()` re-runs it on
  each theme/mode stylesheet `load` (the computed colour belongs to the sheet
  that is currently loaded). applyTheme + applyThemeMode call it. Static metas
  and manifests that shipped `#3ddc84` (Launch/root, PlanMyDay, CountMyDays,
  ListOfLists, QRLinks) now ship `#212529` as the pre-load/install default.
- SECONDARY WAS WRONG (same day follow-up): the first version used
  `--bs-secondary`. Yeti's secondary is `#eee` in BOTH modes, so its dark
  title bar was white and did not change with the theme mode; Storyboard's
  superhero secondary `#4e5d6c` also did not match its navy top bar
  (`#0f2537`). Switched to `--bs-body-bg` - the SAME surface as `#mainNav` -
  which is correct for every theme and flips white -> dark with the mode.
  Tests assert cerulean #fff, superhero #0f2537 light / #212529 dark, Yeti
  #fff light / #222 dark.
- NOTE: an already-installed PWA may keep the old colour until Chromium
  refreshes the manifest (later launch after windows close); the page meta
  applies on load. If the user ever prefers the pure OS title bar, remove
  theme_color from the manifest and the meta.
- TESTS: `tests/pwa-theme-color.spec.js` (2): meta follows the top-bar surface
  (cerulean #fff, superhero #0f2537 light / #212529 dark, yeti #fff light /
  #222 dark), updates on runtime theme AND mode switches, never #3ddc84; all
  five main shells sync meta to their computed `--bs-body-bg`. RED before the
  change, GREEN after. Also ran 37 existing theme/storybook tests: green.

### 2026-10-24 - Window Controls Overlay: hamburger in the title bar
- REQUEST (user): use the Windows Window Controls Overlay to put the hamburger
  menu in the title bar and save the in-app top row; Auto-hide menu is then
  irrelevant.
- WHAT: all 9 manifests got `"display_override": ["window-controls-overlay"]`.
  Shared `smdInitWindowControlsOverlay()` (smd-app.js) adds `body.smd-wco` while
  `navigator.windowControlsOverlay.visible` is true (init + geometrychange +
  display-mode query). `injectSettingsLayout()` CSS fixes `#mainNav` into
  `env(titlebar-area-*)` (33px fallback), insets the body by the same height,
  forces `transform:none !important` and removes the auto-hide container
  padding, and marks buttons/menus `app-region: no-drag` inside a draggable nav.
- CAVEAT: the overlay is USER-controlled (PWA menu -> "Hide title bar") and
  starts disabled, so this is progressive: the normal nav row is unchanged
  until the user enables it. The app cannot turn it on. On Chrome 144+ manifest
  display_override changes are picked up without reinstalling; older installs
  may need a relaunch.
- TESTS: new `tests/wco.spec.js` (4): every manifest opts in; Storyboard nav is
  fixed at 33px/top 0 with body padding 33px, hamburger still opens, `hideNav()`
  leaves transform:none; turning the overlay off restores the static row;
  PlanMyDay starts its container below the strip. RED before, GREEN after; also
  ran pwa-theme-color + all Launch regression + Storyboard stories: 20/20.
- FOLLOW-UP (same day): the left rail was too close to the WCO hamburger, so
  `body.smd-wco #sbToolbar { top: 24px }` doubles its inset only in the overlay
  window; the web app stays at 12px. wco.spec now asserts the rail gap
  (>=24px) and the 12px restored inset; 4/4 green.
- GOTCHA: do NOT set `overflow:hidden` on the WCO nav - the hamburger dropdown
  is a child and gets clipped; only the title text ellipsises.
