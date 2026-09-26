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
13: CENTRALIZED WCAG CONTRAST GENERATOR (2026-09-22): low contrast on themed surfaces was systemic (white-on-info ≈1.8–2.1 on quartz/slate/yeti/superhero/lumen, white-on-success ≈1.5–2.9 on vapor/minty/slate/darkly, white-on-warning ≈1.3–2.5). The fix is ONE shared module `shared/js/smd-contrast.js` (`window.SmdContrast` + global `applySmdContrastVars()`), loaded right AFTER `smd-settings.js` in every app's `index.html` (all 5 apps + root Launch index + storybook) and in `sw.js` SHARED_ASSETS. It reads the loaded theme's `--bs-*` surfaces off `:root` and publishes `--smd-on-{primary,secondary,success,danger,warning,info,body}`, `--smd-tab-active-text`, `--smd-muted-header-text`, `--smd-rgb-*` (debug) and the existing consumer aliases `--smd-{variant}-text`. HYBRID RULE: a theme keeps its OWN text when its choice already meets WCAG AA ≥4.5 (read from the `--smd-*-text` values `applySmdVars()` set just before), otherwise the generator substitutes pure `#000`/`#fff` (`bestText`, max contrast) — so thumb-tested themes (cerulean dark-grey secondary etc.) are untouched and only genuinely failing themes change. `applySmdVars()` in smd-settings.js calls `applySmdContrastVars()` (guarded by `typeof`) at its end, so the theme-selector flow triggers it; the module also self-heals on load if the palette already went live. PROBE GUARD `smd-probe`: shared/css/styles.css overrides `--bs-btn-color`/badge text with the generated vars matched `:not(.smd-probe)` — the hidden probe `smdBootstrapStyle()` in smd-settings.js and the pmd-regression `bootswatchColor()`/`bootswatchBadge()` helpers all add the `smd-probe` class so they keep reading the RAW Bootswatch colour (no circular read). Surfaces that now consume the palette: active tabs `var(--smd-tab-active-text)` (was hardcoded #fff), `.nav-tabs-info .nav-link.active` `var(--smd-on-info)`, page/modal header h1/h3 `var(--smd-muted-header-text)`, `.badge.text-bg-*`/`smd-badge.text-bg-*` colour, and `button/a/.btn-{primary,secondary,success,danger,warning,info}` `--bs-btn-*-color` overrides (hybrid keeps the theme look where it already passes). pmd-regression "badges use the centralized contrast palette and meet WCAG AA" asserts the badge text equals the palette value AND that its contrast ratio ≥4.5 (helper `ratioOf` recomputes WCAG ratio in-page). When wiring a NEW themed surface: consume `var(--smd-on-<variant>)`/`var(--smd-tab-active-text)`/`var(--smd-muted-header-text)` instead of hardcoding `#fff`/`color-mix(..., white)`.
14: STORYBOOK `_bound` GUARD FOR LIGHT-DOM COMPONENTS (2026-09-22): the pmd-* light-DOM cards/headers (`pmd-stream-header`, `pmd-stream-job-card`, `pmd-job-today-card`, `pmd-job-search-card`) each clone their template in `connectedCallback` under a `this._bound` flag, but their `attributeChangedCallback` used to gate `_render` on only `this.isConnected`. When the storybook's demo code does `host.innerHTML = '<pmd-stream-header ...>'` on an ALREADY-CONNECTED host, the HTML parser fires `attributeChangedCallback` for each attribute BEFORE `connectedCallback` clones the template, so `_render` hit missing nodes (`Cannot set properties of null (setting 'textContent')`, 45 page errors). Chromium's incremental parser inserts the element into the live tree (isConnected=true) before the upgrade finishes, so `isConnected` alone is NOT a sufficient guard. FIX (applied to all four): `attributeChangedCallback() { if (this._bound && this.isConnected) this._render(); }`. Rule: any light-DOM component that builds in `connectedCallback` must gate attribute-triggered renders on the built flag too, NEVER `isConnected` alone. Verify with `tests/storybook-regression.spec.js` (Storybook - Regression: boots with no console/page errors/no failed requests, component demos render their host elements, theme swap re-renders sections without page errors) — run it whenever storybook or the pmd-* components change.
15: Do not write non UTF-8 characters to AGENTS.md

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
- Shared components are LIGHT DOM and are styled from `shared/css/styles.css` plus small component/app-injected style blocks. Do not reintroduce constructable stylesheets or shadow-root styling for these components. `smd-modal`, `smd-page`, `smd-tabs`, and the pmd-* cards expose stable light-DOM classes for shared selectors and tests. `smd-tabs` tab definitions may include `panelClass` (for example `no-padding`) for panel-specific layout.
- Colour/typography conventions: smd-tabs active = `--bs-primary`, inactive = `--bs-secondary`, with `#smd-app` scoping for priority; the Streams Editor header is `--bs-primary` when expanded and `--bs-info` when collapsed; modal/page headers use theme surfaces (`--bs-body-bg`, `--bs-secondary-bg`, `--bs-border-color`) rather than hardcoded colours. Bootstrap/Bootswatch remains authoritative; the runtime contrast layer is not used.
- TYPESCALE TOKENS (2026-09-18): one shared ramp in `shared/css/styles.css` — `body { --smd-type-base: 1rem }` plus `body.font-size-xsmall/small/large/xlarge/jumbo` overrides (0.8/0.925/1/1.125/1.3/1.6rem) — drives exactly four tokens `--smd-type-badge` (base×0.75), `--smd-type-p` (base), `--smd-type-h2` (base×1.25), `--smd-type-h1` (base×2), all declared on `body` (NOT `:root`: the ramp must recompute per font-size body class, and body custom props pierce shadow DOM while `:host-context()` doesn't). Tag map: h1→h1; h2/h3/h4→h2; h5/h6→p; text/inputs/tables→p; badges→badge. BUTTONS ARE h2 (one step above text): `<button>`, `.btn`, `.smd-tab-btn` all use `var(--smd-type-h2)`; `.btn-sm` stays at `var(--smd-type-p)`. Light-DOM home is `shared/css/styles.css` (`button, .btn` / `.btn-sm`); the shared `btnBadgeSheet` covers shadow buttons. Scaffold the h2/p rules inline wherever a shadow root does NOT adopt btnBadgeSheet: the 4 apps' `editor-styles.js`, `smd-settings.js`, `smd-minio.js`, `smd-modal.js`, `smd-image-picker.js`, `smd-image-dropdown.js`. Don't re-add per-component `.btn` font-size rules. Every component + app style now uses `var(--smd-type-*, original-value)` (original as fallback so behaviour is unchanged wherever the token is missing). Media-fit sizes are token CALCs (e.g. CM/QR title `calc(var(--smd-type-h1,1.5rem)*0.7667)`, CM count `*0.8333`, CM container h1 `*0.625`, Solar 480px block). Compact density = `--…-title-size: var(--smd-type-p)` overrides. Deliberate non-token exceptions: the 22px hamburger icon in `smd-app.js`, `smd-checkbox` 1em/1.4em + `smd-draghandle` 1.2rem/1.6rem touch sizes, vendor CSS, storybook chrome. Tests assert heading ELEMENT tags (now `h1` for main-view date/"Today!"/"From …" headings) and pmd-touch.spec.js:119 asserts the NEW pixel values (xlarge 41.6, jumbo 51.2, compact-jumbo 25.6) — update those literals together with any ramp change.
- THEME TEXT COLOURS (2026-09-12): shadow-DOM buttons/tabs cannot use Bootswatch's `.btn-*` rules (document CSS doesn't cross the boundary, and `--bs-btn-*` is set on the `.btn-*` element, not `:root`). `applySmdVars()` reads a hidden light-DOM `<button class="btn btn-<variant>">` probe (`smdBootstrapColor()`) and publishes `--smd-primary/secondary/success/danger/info/warning-text` + `--smd-tab-text` on `<html>`; every shadow `.btn-*`/variant uses those vars. `applyTheme()` re-runs `applySmdVars` on the theme `<link>`'s `load`. Never hardcode white text for a theme-coloured surface; if Bootswatch's own `.btn-*` rule disagrees with its `--bs-btn-color` var (e.g. cerulean's later `.btn-secondary { color: ... }`), the probe wins — always match the probe.
- BADGES (2026-09-12): use the shared `<smd-badge variant="primary|secondary|success|danger|warning|info|light|dark" pill?>` component everywhere — never a `<span class="badge bg-*">` (Bootstrap's badge vars live on the `.badge` element and can't reach shadow roots). `applySmdVars()` probes a hidden light-DOM `.badge.text-bg-<variant>` (`smdBootstrapStyle()`) and publishes `--smd-badge-<variant>-{bg,text}`; the component's own sheet consumes them, so text colour follows Bootswatch exactly (white on cerulean's navy info, black on its light secondary, etc.). `btnBadgeSheet` now only carries `.btn*` rules despite its name; `smd-page`'s badge/bg rules were removed.
- IMAGE DROPDOWN (2026-09-18): the shared `<smd-image-dropdown>` (`shared/js/components/smd-image-dropdown.js`) is the generic image+name picker — the old PlanMyDay `pmd-stream-select` was folded into it and deleted. It is DATA-driven, not DOM: host sets `options = [{name, image}]` (image OPTIONAL → text-only rows, e.g. CountMyDays' no-image "All") and `selected` = the chosen option's NAME string; picks dispatch `smd-image-dropdown-change` ({ name }). Listener wiring: CountMyDays `#dateCategoryFilter` (`smd-image-dropdown-change` → `setDateCategoryFilter`, "" for All) in `dates-editor.js`; PlanMyDay `#jobStreamDropdown` (name mapped back via `streamIndexByName` in `editor-common.js`). Stable shadow ids for test locators: `smdImageDropdownBtn`, `smdImageBtnIcon`, `smdImageBtnText`, `smdImageDropdownMenu`.
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
  `css/styles.css`, `js/app.js`). It shows a grid of app tiles from
  `LAUNCH_APPS` in `Launch/js/app.js` (add a row when an app is added) and has a
  settings page (theme, image size, BMC, share QR, FontAwesome credit) using the
  shared theme engine + `smd-tabs`/`smd-page`. `SmdConfig.storagePrefix =
  "launch_"`. Both other apps' hamburger menus have a **Launch** item
  (`href="../"`). `sw.js` has an `APPS["Launch/"]` entry whose list includes the
  root `"index.html"`; `appIndexFor()` maps the repo root (and unknown paths) to
  `"index.html"`, and `/Launch/...` also falls back to the root index.
  TILE ICONS (2026-09-17): `LAUNCH_APPS[].icon` is a **shared sample-image NAME**
  ("Plan My Day"/"Count My Days"/"QR Links"/"Solar Controlar"/"Noughts &
  Crosses"), rendered with `<smd-image key-prefix="shared-">` (NOT a raw file
  path). The Launch page loads `shared/js/smd-images.js` and calls
  `seedSampleImages()` at boot; `renderAppGrid()` sets a `setInterval` that
  calls `smd-image.refresh()` once `shared-images` is populated (first-visit
  async seeding). There is NO explicit `size` on the tiles — they follow the
  `launch_iconSize` setting via `SmdImage.setDefaultSize` (applied by
  `applyImageSize()`).
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
  General/Danger), `imagePickerPage`. App component `qrlink-card`
  (`QRLinks/js/components/qrlink-card.js`) → emits `qrlink-qr`, which
  `app.js` turns into a shared `showSmdModal` + `<smd-qrcode>` dialog with
  Open/Close. Legacy `qr_*` keys (incl. `qr_images`) are migrated by
  `QRLinks/js/storage.js` + the shared `migrateImagesToShared()` (its sources
  now include `qr_images`); a startup reminder modal shows each boot (same
  pattern as CountMyDays). `JOBS_EDITOR_STYLES` is copied into
  `QRLinks/js/editor-styles.js` (now duplicated in 3 apps — candidate for a
  future shared extraction).
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
  `CountMyDays/js/app.js`. Legacy UNPREFIXED keys are copied to the prefixed
  namespace by `CountMyDays/js/storage.js migrateLegacyStorage()`, which logs a
  `console.warn` on EVERY boot (deliberate TODO reminder — remove function +
  warning once users have migrated). Pages: `datesEditor` + `dateEditPage`,
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
  **5.3.8** (all other themes remain 5.3.3) + `themeConfig` entry + precache —
  theme count is now 26. `pmd-screenshots.spec.js` has its own hardcoded list
  (25) so it is unaffected; `cmd-screenshots.spec.js` screenshots all 26.
- DEFAULT THEME (2026-09-17; mode removed 2026-09-26): **superhero** everywhere —
  every app's `app.js`/`app-settings.js` theme fallback, `SmdApp.themeDefault`,
  the shared `applyTheme()` invalid-name fallback, the storybook's static
  `<html data-theme>`/`data-bs-theme` hints and every static head `<link>`
  (`bootstrap-theme-css` + `theme-override-specific`) all use `superhero`.
  THEMES HAVE NO DEFAULT COLOUR MODE: the global Theme Mode (Light/Dark) is the
  only mode source and normalizes to `light` when unset/invalid. darkly stays a
  valid selectable theme, just no longer the default.
- THEME OVERRIDE CSS (2026-09-17; mode sheet removed 2026-09-26): each theme's
  `shared/css/themes/<theme>/bootstrap.min.css` is NEVER edited. ONE override
  stylesheet remains, managed by `applyTheme()` in `shared/js/smd-settings.js`:
  `#theme-override-specific` = `css/themes/<theme>/<theme>.css` (per theme). It
  is declared statically in every app/storybook `<head>` and `applyTheme()`
  re-points it (creating on demand) on every theme switch — layering is theme
  base < shared/app css < per-theme override. `shared/css/themes/light.css` and
  `dark.css` and the `#theme-override-mode` link were DELETED (the Light/Dark
  mode now only sets `data-bs-theme`; per-theme files may key off it). All files
  are in `sw.js` SHARED_ASSETS. The per-theme/files are deliberately EMPTY until
  specific overrides are decided.
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
- MENU ORDER (2026-09-17): every app's hamburger menu lists **Settings**, then
  a divider, then **Launch**, then a divider, then the rest of the options. The
  Launch app's own menu keeps only "Settings" (it IS the launcher — no Launch
  item). All apps
  also expose the six font sizes (xsmall/small/normal/large/xlarge/jumbo) in
  Settings; FreeFormOX + Launch gained the Font size selector this session
  (Launch's `.app-name` rules already covered the sizes; FreeFormOX got new
  `body.font-size-*` rules for its game text).
- GOOGLE CALENDAR (2026-09-13): `CountMyDays/js/googleCalendar.js` (GSI OAuth +
  Calendar REST + `{count_my_days{...}}` description payload helpers) and
  `CountMyDays/js/googleCalendarEditor.js` (unified dates editor Google rows +
  `googleEventsPage`/`googleEventEditPage` smd-pages). Settings has a **G Cal**
  tab (`General | G Cal | Danger`); when enabled, `.google-menu-item` entries
  appear in the hamburger menu. Feed cache + settings are namespaced
  (`countmydays_google_cal`, `countmydays_gcal_*`) by `gcalKey()`/
  `googleCalCacheKey()` (call-time helpers — do NOT turn them into parse-time
  consts: google scripts load BEFORE `app.js`, which sets the storage prefix).
  Legacy `cmd_gcal_*`/`cmd_google_cal` keys are in
  `storage.js CMD_LEGACY_STORAGE_MAP` and migrated on boot. `cmd-date-card` grew
  `source`/`recurring`/`hidden` attributes (Local/Google/Repeat/Hidden badges,
  no Delete for Google rows) and its events now carry `source`. Sample feed:
  `CountMyDays/js/googleCalendarSample.json` ("Load sample data"). The app-info
  dialogs use `showSmdModal`, not a custom overlay.
- LEGACY MIGRATION REMINDER (2026-09-13): `CountMyDays/js/storage.js`
  `migrateLegacyStorage()` is intentionally temporary and the app now calls
  `showLegacyMigrationReminder()` on EVERY `DOMContentLoaded`, which opens the
  shared `#smdConfirmModal` ("Legacy migration still active"). ANY test that
  loads `/CountMyDays/` and then CLICKS must dismiss it first (the regression
  spec has `dismissLegacyReminder(page)`; `cmd-screenshots.spec.js` dismisses in
  its beforeEach). Pure visibility assertions are unaffected (occlusion does not
  affect `toBeVisible`). Remove the migration, the reminder function and its
  call together once users have migrated. `cmd-countdown-card` shows the
  Local/Google source as an `<smd-badge>` under the date (`source` attribute set
  by `main-view.js`), using the standard primary/secondary button variants for
  now (pending styling refinement).
- SHARED IMAGE EDITOR (2026-09-13): `<smd-image-editor>`
  (`shared/js/components/smd-image-editor.js`) is the ONE image edit form both
  apps host in their Bootstrap `#imageEditModal`. It renders in the LIGHT DOM on
  purpose: Bootstrap/app CSS must style it and the many existing selectors
  (`#imageEditModalBody .card input.form-control`, `.fw-bold`, …) keep working.
  `shared/js/smd-images.js` sets `image`/`index`/`isNew`/`isDuplicate` + calls
  `render()`, and handles `smd-image-editor-action` (`ok`/`cancel`/`upload`).
  The `.date-img` sizing moved from `PlanMyDay/css/styles.css` to
  `shared/css/styles.css` so the dialogs look identical in every app. The
  storybook has a section (its demo needs the `smd-images.js` script, which the
  storybook now loads).
- `hideNav()` (shared smd-settings.js) now hides when NO
  `smd-page:not(.d-none)` is open — generic for any app's page set (was a
  hardcoded PlanMyDay id list).
- `smd-page` GOTCHA: a footer button auto-hides its page BEFORE dispatching
  `smd-page-action` unless the button config sets `close: false`. Any button
  whose handler validates or decides (Add/OK/etc.) MUST use `close: false` and
  hide the page itself, otherwise the page closes under the user on validation
  failure.

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
- Playwright `toHaveText` on an `smd-button` HOST reports the slot fallback text too (e.g. `"Edit\n Button"`), so exact-text assertions fail. Use `toContainText("Edit")` or a `getByRole("button", { name: "Edit" })` locator instead.
- Grep on minified vendor files breaks the tool (giant matched lines) — scope searches to `PlanMyDay/js/**`, `shared/js/**`, or `tests/**`.
- Line endings: this repo stores text files with LF (`core.autocrlf=input`, `core.eol=lf`; no `.gitattributes`). NEVER write CRLF into a file — git will flag every line as changed (whole-file diff) and warn "CRLF will be replaced by LF the next time Git touches it". Do not round-trip files through PowerShell pipe/Get-Content/Set-Content joins; the Edit/Write/Read tools and Node preserve line endings — if you must convert use node with explicit `\n`, NEVER shell-piped measurements of `git show` (PowerShell pipeline re-encodes — it once reported 914 CRLF for a file whose raw blob via `git cat-file` was entirely LF). Verify with `git cat-file blob HEAD:<file>` + `git diff --stat` so only real edits show.
- TEST SERVERS ARE VITE (2026-09-26): `playwright.config.js` runs `node tests/serve-tests.mjs`, which starts BOTH test origins from ONE Node/Vite process: 8080 = repo root (e.g. `/PlanMyDay/` is the app), 8081 = repo mounted under `/PlanMyDay/` (every origin-root path 404s) mimicking a GitHub Pages sub-path deploy. `npm run dev:test` starts them for a full/sharded run; `reuseExistingServer` means Playwright reuses an already-listening server and never kills it, so no manual per-shard server dance. Vite runs with `appType:"custom"` plus a `sirv` static middleware, so there is NO HTML/JS transform and NO HMR client injected (the tests stay byte-faithful); sirv is in production mode (one startup tree scan, then an in-memory file map) and sets `immutable` Cache-Control for build-stamped assets but `no-cache` for `sw.js` and HTML. GOTCHA (unchanged): with `EXTERNAL_SERVERS=1` Playwright does NOT start or verify the servers, so a failed start makes every shard fail with `ERR_CONNECTION_REFUSED` (or hang on web-server waits) with no diagnostic. ALWAYS verify BOTH ports accept a TCP connection BEFORE any test run: use a raw TcpClient (`(New-Object Net.Sockets.TcpClient).Connect('127.0.0.1',8080)`) — `Test-NetConnection -ComputerName localhost -Port 8080` probes IPv6 `::1` first and prints a scary `failed` warning, then `True` for IPv4, which is easy to misread as a down server. (The old Python `tests/http-server.py` + `tests/subpath-server.py` were replaced by `tests/serve-tests.mjs`.)
- CROSS-ORIGIN SAVE 302 GOTCHA (2026-09-17): SolarControlar's Flask POST endpoints (`POST /solar/`, `POST /solar/api/config`) are PRG — they answer `302 Location: /solar/`. A PWA `fetch()` that lets the browser follow that cross-origin redirect can lose its `Authorization` header on the follow-up GET (browser-dependent), so Traefik returns a 401 WITHOUT `Access-Control-Allow-Origin` → the fetch blocks as a CORS error / "Failed to fetch". Fix in the APP: `redirect: "manual"` on the POST and treat `resp.type === "opaqueredirect"` as success (server saved; the caller then re-fetches the GET page which carries auth again). `redirect: "manual"` returns an opaque-redirect response (status 0) for a 302 — you cannot read it, only detect it by `type`. Rule for SolarControlar saves: never follow the Flask redirect; `_post` returns the response TEXT (or `""`), so consumers must not chain `.text()`.

## Session log

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
  app's own menu keeps only its Settings item (it is the launcher).
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
  stays just "Settings".
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
  PlanMyDay use the exact same dialog. `.date-img` sizing moved to
  `shared/css/styles.css` (this was why the CountMyDays dialog looked wrong).
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
  the main menu (`importSampleData()` remains but is unused); G Cal Refresh is a
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
- The app now uses `<smd-image key-prefix="planmydays_">` everywhere it shows a job or stream image: main view today cards (stream+job thumbs), `pmd-stream-header`/`pmd-stream-job-card`/`pmd-job-search-card` thumbs (their `image`/`stream-image` attributes now carry NAMES, not data URLs, and they render `<smd-image>` internally), the job-edit stream dropdown + image previews, the stream-edit preview, and `updateJobImagePreview`/`updateJobStreamPreview`/`updateStreamImagePreview` (set the `smd-image` `image` attribute instead of innerHTML). The `#todayCardList img.date-img` regression test now targets `#todayCardList smd-image`. Added a storybook `smd-image` section (seeds a neutral `sb_images` store, name + theme controls).
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
- Theme-aware job cards use semantic surfaces (`card bg-body-tertiary text-body border-0`) rather than permanently dark `bg-dark text-white`. QRLinks may intentionally retain a dark link card; the distinction is component-owned and covered by Storybook tests.
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
- Override stylesheet order is guaranteed: Bootswatch base -> shared/app CSS -> per-theme `<theme>.css` (the `#theme-override-specific` link). Mode-only switches do not reload the base theme or call `renderMain()`/network refresh; they update `data-bs-theme` and mode-dependent images in place. (`shared/css/themes/light.css`/`dark.css` and the `#theme-override-mode` link are GONE; `applyThemeMode()` now only sets the two attributes.)
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
- `screenshots/viewer.js` supports the nested mode layout and legacy direct `<app>/<theme>/<scene>.png` files (shown as synthetic `Default`). The API shape is `theme -> modes[] -> { name, path, images }`. The UI has separate App, Theme, and Mode selectors; section identity is composite app/theme/mode so open state and drag ordering cannot collide. Selections persist under `screenshotViewerGallery`, `screenshotViewerTheme`, and `screenshotViewerMode`.
- The viewer is covered by `tests/screenshot-viewer.spec.js` with a temporary synthetic tree; it verifies nested mode scans, legacy fallback, deep image serving, app/theme/mode filtering, persisted choices, and composite open-state. `createServer()` is exported behind a `require.main === module` guard so tests can use an ephemeral port.

### Verification state for this session

- Syntax checks passed for all changed JavaScript files; `git diff --check` passed.
- Targeted/full non-PlanMyDay verification completed: CountMyDays 45/45, Launch 6/6, FreeFormOX 11/11, Storybook 7/7 (including Superhero dark blue), pmd-touch 5/5. QRLinks and SolarControlar passed within the combined 38-test run; its only initial failure was the Buy Me A Coffee image and was fixed/retested.
- Final workers=16 verification: the complete 522-test non-screenshot regression set reached 519 passed / 3 failed. All three were infrastructure/concurrency flakes, not theme failures: two CountMyDays QR canvas/image render waits under load and one transient `page.reload(): net::ERR_CONNECTION_REFUSED`. Both local servers answered 200 immediately afterward, and the same three tests passed 3/3 on an isolated workers=16 rerun. The final theme-colour tests assert raw Bootswatch button/badge/tab colours without runtime contrast correction.

### Final theme decision — Bootswatch colours are authoritative (2026-09-23)

- This supersedes the earlier `applySmdVars()` / `smd-contrast.js` / centralized-WCAG-colour notes in this history. The runtime contrast layer has been removed permanently: `shared/js/smd-contrast.js` is deleted; `smd-settings.js` no longer creates hidden body probes, no longer publishes generated `--smd-*-text`/`--smd-on-*` variables, and no longer recomputes colours on stylesheet load.
- Shared CSS no longer overrides Bootstrap button, badge, tab, page-header, or modal-header colours with generated contrast values. Those components now consume the colours and Bootstrap variables supplied directly by the selected Bootswatch stylesheet. Structural layout, sizing, borders, typography, and component behaviour remain shared CSS; colour selection does not.
- KEEP the theme engine: `themeConfig`, app-namespaced `theme` + global `themeMode`, `applyTheme()`, `applyThemeMode()`, `data-theme`, `data-bs-theme`, base/shared/specific stylesheet order, `<smd-theme>`, Storybook theme/mode controls, and SVG image auto-mode all remain. Users can swap all 26 themes and choose Light/Dark (Default removed 2026-09-26; see the theme-mode note above).
- Per-theme `shared/css/themes/<theme>/<theme>.css` files are the only permitted colour exceptions (`light.css`/`dark.css` were deleted 2026-09-26). Superhero's specific file keeps its dark-blue `#0f2537` body at its base palette.
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
- The current tab contract is Bootstrap-native: `smd-tabs` renders `.nav.nav-tabs`, `.nav-link`, `.tab-content`, and `.tab-pane`, and synchronizes `.active`, `aria-selected`, `tabindex`, and the `hidden` attribute. Use the same `.tabs = [...]`/`activeIndex` API as the Storybook demo.
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

- Required stylesheet order for every app shell: vendor product styles first, then `shared/css/themes/<theme>/bootstrap.min.css`, then `shared/css/styles.css`, and finally the per-theme override `shared/css/themes/<theme>/<theme>.css`. This note is the authoritative cascade order and supersedes older notes that described the mode/specific sheets before shared CSS.
- The per-theme override is the final override layer. Keep the three theme link ids (`bootstrap-theme-css`, `smd-shared-css`, `theme-override-specific`) and preserve this order when changing index pages or dynamic theme loading. The `theme-override-mode` link was removed 2026-09-26 with `light.css`/`dark.css`.
- GOTCHA (fixed 2026-09-25, do not reintroduce): `applyTheme()` re-points the override sheet at runtime, and the old `orderThemeOverrideLinks()` anchored it on `#bootstrap-theme-css`. Because the shared sheet sits AFTER the base link in the correct order, that anchored it BEFORE it and pushed `shared/css/styles.css` to the end of `<head>` — so the theme was no longer the last cascade layer. The override is now anchored on the shared sheet: `themeOverrideAnchor()` returns `#smd-shared-css` (falling back to an href match for `shared/css/styles.css`, then the base link), and `setOverrideLink()`/`orderThemeOverrideLinks()` insert `theme-override-specific` immediately after it. Every shell carries `id="smd-shared-css"` on its shared stylesheet link.
- This order is ENFORCED in every static shell (`index.html`, `PlanMyDay/index.html`, `CountMyDays/index.html`, `QRLinks/index.html`, `SolarControlar/index.html`, `FreeFormOX/index.html`, `storybook/index.html`, `storybook/cardViewer.html` including its iframe `frameDocument()`), and locked in by the "app shells load stylesheets in the documented cascade order" test in `tests/launch-regression.spec.js`, the frame check in `tests/storybook-regression.spec.js`, and the runtime order assertions in the Storybook theme-swap test. Keep new shells and the card viewer generator in the same order.
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
