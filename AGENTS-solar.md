# SolarControlar working guide

Consolidated from AGENTS.md and current source on 2026-11-11. Read AGENTS.md for repository-wide rules; newer dated guidance supersedes historical entries.

## Workflow
- User authorized work in the whole P:/git/MyApps tree. Preserve unrelated user changes and runtime files unless explicitly authorized.
- TDD: reproduce bugs with failing rendered-result tests before changing application code. Run 2-3 affected tests first, then the complete affected specs, retries=0. Capture first-run output. No fixed dates that influence now-relative behavior or geometry.
- Use .\node_modules\.bin\playwright.cmd. Full repository sweeps use sequential shards 1/40 through 40/40, fixing each shard before proceeding. Start the dual test server once and verify both ports; EXTERNAL_SERVERS=1 prevents ownership races.
- Production-mode sirv caches file lengths. Use a fresh server after edits or dev:true. Existing work/serve-gantt.mjs and work/gantt.config.cjs provide a dev server on 8090/8091. Browser binaries may require PLAYWRIGHT_BROWSERS_PATH=C:/Users/Keith/AppData/Local/ms-playwright.
- Extend screenshot coverage (repository guidance specifies tests/pmd-screenshots.spec.js) and validate one theme in both modes.
- Ship runtime changes with npm run bump:build; it updates shared/js/build-number.js AND sw.js together. BUILD_NUMBER is YYYYMMDDHHMM. Never edit these separately; worker URL remains stable.
- Add useful dated findings to AGENTS.md and this guide. Documentation uses UTF-8.

## Architecture and data
- SolarControlar is a PWA frontend for the Flask backend now under SolarControlar/server; do not modify that server for frontend issues. Global functions/scripts, not ES modules.
- app.js configures SmdConfig with solarcontrolar_ storage prefix, shared- image prefix. storage.js owns Flask URL/basic-auth and refresh settings; api.js owns requests.
- main-view.js configures MAIN_TAB_DEFS once (Now, Settings, Files, Config, Forecast, Power, KWh), orchestrates startup and top-tile power data, auto-refresh and errors. Both charts are lazy initialized. Keep panel DOM stable when switching tabs.
- power-tab.js shows latest readings; solar-settings-view.js parses GET /solar/ settingsForm rows and CSRF token, renders editable settings, and POSTs changes. config-tab.js also parses server HTML for charge_to_percentage: there is no GET /api/config.
- files-tab.js fetches log/JSON text; forecast-tab.js runs forecast pipeline; graph-tab.js uses vendored Chart.js + date-fns adapter to show power and battery state of charge.
- api.js POST uses redirect:manual; opaqueredirect means PRG save succeeded. Following a cross-origin 302 loses auth and can produce CORS failure. API _post returns text, not a Response. Include basic-auth on all requests when configured.
- settings-tab.js is the APP Settings page (General/Display/Danger), distinct from the main server Settings tab. General holds Flask fields and refresh. Display owns shared appearance controls; no Icon size because there are no smd-image tiles. Danger controls follow shared shape.
- components/solar-top-tiles.js owns date, latest-reading split-flap time, battery, pulse and no-data visuals. Avoid recursively setting observed no-data unchanged. Build light-DOM children in connectedCallback, guard attribute renders until built, and render time only from power-time.

## Components, themes and layout
- Shared components are light DOM. Behavior/layout belongs in owning component injection; shared/css/styles.css owns theme/size declarations. MAIN_TAB_STYLES in editor-styles.js owns dashboard-specific geometry. Do not duplicate Bootstrap utilities.
- Stylesheet cascade: vendor Bootstrap -> shared styles -> global mode -> per-theme mode sheet. shared/js/smd-settings.js owns all theme/mode changes; global light/dark persists per app. Mode-only changes must not call renderMain (would fetch server again).
- Contrast fixes are baked into per-theme mode CSS, never runtime measurement/repainting. Old --smd-on-* and --smd-*-text advice is obsolete. Use coherent foreground/background pairs. Generated blocks smd-contrast:start/end are maintained by tests/contrast-css.spec.js; regeneration sets SMD_CONTRAST_FIX=1 and runs the contrast project. Chart canvas needs concrete colors and must refresh after both theme and mode sheet loads.
- Shared smd-select: assign .options/.value, never replace innerHTML after construction. Tests use pickOption from tests/theme-controls.js. Graph series/points use smd-checkbox, not native inputs.
- Shared navbar spacing uses --smd-nav-content-gap. smd-app.js sets body.smd-wco from navigator.windowControlsOverlay.visible. smd-settings.js pins installed-app nav to env(titlebar-area-*) and reserves body inset. Auto-hide cannot hide an expanded dropdown. Test normal, fixed/auto-hide and WCO geometry; negative row gutters can pull cards into menu space.
- All top cards must stretch to the tallest content without clipping, including enlarged fonts, compact density and mobile wrapping. Avoid h-100 percentage sizing in auto-height rows.

## Verification
- tests/solarcontrolar-regression.spec.js stubs all Flask endpoints; never depend on live credentials/server. Coverage hooks must remain active.
- tests/wco.spec.js, tests/nav-spacing.spec.js cover shared installed/menu layout. tests/contrast.spec.js asserts rendered AA text 4.5:1; graphical marks require 3:1. Cover every dashboard tab, changed badges, form states, loading/output and graph legend/axes/series across 27 themes and both modes.
- Check JS syntax, git diff --check and precache entries. Inspect representative desktop/mobile screenshots. Desktop WCO is emulated through the same navigator API hook; a real installed app remains a useful final manual check.

## 2026-11-11 implementation and verified result
- Component grid now equalizes all top tiles to the largest content and avoids negative gutters. It reserves title-bar/menu clearance and stacks below 992px for enlarged clocks. Compact, normal/jumbo fonts, 1280/800/390px and installed/browser states are covered.
- Solar-only accessible content/card/clock/series tokens are baked into all 54 theme-mode sheets between solar-palette markers. Run node shared/generate-solar-palette.cjs with the test server running; optional SOLAR_PALETTE_BASE_URL changes its default localhost:8080. Generator uses an isolated theme document and is idempotent. No app runtime contrast normalizer exists.
- Top tiles use the standard card smd-card surface (same background/gradient as PlanMyDay). Tab buttons must use unmodified shared smd-tabs styling; NEVER add Solar .smd-tab-btn overrides. Contrast adjustments are scoped to tab content and tile text/graphics. The clock and battery use static tokens matched to the card surfaces.
- Graph resolves colors from tab-graph (where tab-panel Solar ink is inherited), updates axes/legend as well as datasets, and listens to all three theme links plus theme/mode attribute changes. Do not assume base CSS load also means mode CSS is ready.
- New tests: tests/solar-appearance.spec.js and tests/solar-appearance-helpers.js. Flask mocks moved to tests/solar-fixtures.js. Existing Solar regression and screenshot scene reuse them. Mocked tests block workers and navigate at domcontentloaded. Theme helpers register load listeners before changing URLs. Screenshot graph checks backing resolution before capture.
- Red confirmed before fixes. Initial revision passed 47/47 appearance/Solar/WCO/navbar checks without retries; all six tabs tested across 27 themes and both modes, including hover/focus/open menus. Superhero screenshot scene passed (14 light/dark desktop/mobile images); representative images visually inspected. Palette generation is idempotent; syntax/diff checks passed. Build 202611110708.
- Installed-app geometry is tested through an emulated windowControlsOverlay API. The actual Windows-installed app has not been manually exercised. Shared unrelated application behavior was checked by WCO/navbar tests; the entire repository suite was not run.

## 2026-11-11 correction: shared tabs and shared card surfaces
- User clarified that contrast fixes apply to tab CONTENT, while tab buttons retain original smd-tabs colours. Removed both .smd-tab-btn overrides and the global body palette override. Scope Solar body ink/background to #mainTabs .smd-tab-panel; the navbar and shared tab controls inherit the normal theme palette.
- Top tiles use card smd-card with no bg-body utility or custom background. Their backgrounds and gradients are identical to PlanMyDay's standard cards, including Quartz glass. Equal-height grid and menu clearance are unchanged.
- Generator includes card ink, clock ink and battery severity colours sampled against actual shared card surfaces. Gradients are alpha-composited over ancestor surfaces; do not treat translucent white gradient stops as opaque white. No runtime contrast adjustment.
- Added rendered palette-parity tests for every theme/mode: Solar active/inactive buttons equal an unmodified smd-tabs; all three tile surfaces equal the standard card smd-card. Confirmed both mismatches red, then green. Content contrast scanner excludes tab buttons (shared-component styling is checked by parity) and now includes composited ancestor gradients and battery graphics.
- Final 74/74 appearance/parity/Solar/WCO/navbar tests pass, no retries. One Superhero light/dark screenshot test also passes (14 images); inspected the restored light Power view and dark Graph. Generator idempotence, syntax and diff checks pass. Build 202611110750. Actual installed Windows chrome remains emulated.


### 2026-11-11 - Solar dashboard actions use shared smd-button

- Converted Files Fetch, Config Save Changes, Forecast Run Forecast Pipeline and main Settings Save Changes to smd-button. Keep existing primary variants and sizes. Removed Solar .btn-primary colour/gradient overrides; shared component/theme styling owns their appearance.
- The shared component creates a real button with default submit type. Inside configForm/solarSettingsForm it continues to submit normally; do not duplicate save handlers on the host (would risk double posts). Forecast disabled property now targets the component, which mirrors it to the inner real button.
- User explicitly requested no new appearance tests and will inspect manually. None added; no tests changed. Existing Solar functional suite passed 12/12 without retries. Additional browser functional probe verified both save payloads/CSRF and Forecast disable/re-enable. When excluding workers in a standalone probe, remove the navigator serviceWorker API too: blocked registration otherwise returns undefined to the existing updateViaCache hook. No runtime worker code changed. Syntax/diff checks passed. Build 202611110757 via npm run bump:build.


### 2026-11-11 - Solar access badge variants

- Settings Read Only badges use standard Bootstrap text-bg-info; Settings/Config Read/Write badges use text-bg-primary. The change-detection reset paths restore primary when a value returns to its original state. Changed badges retain warning. No custom palette or appearance test added. JS syntax and git diff --check passed; build 202611110803.


### 2026-11-11 - Native theme text except genuine contrast failures; shared Files/Graph controls

- User policy: keep Bootswatch foregrounds unless contrast fails, including badges. Existing generator now measures actual states via tests/rendered-controls.js instead of --bs-btn-* variable guesses. Exceptions are disjoint base/hover/focus/pressed/disabled selectors. No base !important colour or custom-property change leaks into already-readable hover/focus colours. Superhero warning's unconditional handwritten foreground block was removed; generation decides each state.
- Standard text-bg badges (including shared smd-badge) and smd-select selected/hover options now receive a correction only when their own native colour fails. Read Only remains info; Read/Write remains primary. Gradient stops and translucent foregrounds are composited correctly; preserve gradients unless no single text colour passes across the ramp. Transparent fields over Quartz's page gradient get a theme surface only where necessary. No runtime contrast layer.
- Superhero light: native white on primary orange is 3.402:1, so normal primary buttons/tabs/badges use theme dark ink (4.606:1). The original white hover/focus (4.536:1) and pressed (5.034:1) text remains. A rendered audit across all 54 theme/mode sheets found zero unnecessary foreground overrides and zero below-AA combinations among the checked states; 1,800 passing native foregrounds were preserved. Logs/data: work/theme-native-audit-final.json.
- Removed Solar-specific form/select menu recolouring. Log File and Graph date retain smd-select; all six graph toggles retain smd-checkbox. Files Lines is now smd-select with 50/100/200/500/1000/5000/10000, default 200. fetchLogs reads its value as before. Existing Files functional regression now selects 500 and checks count=500 on the API request. No new appearance test cases were added.
- Updated existing checks to sample real painted controls and wait for actual changed stylesheet loads. Disable transitions in the contrast harness: otherwise shorter correct load waits exposed intermediate border/disabled colours in four themes. Focused reruns passed, then full contrast suite passed 8/8. Full existing Solar appearance/parity/functional specs passed 69/69, storybook 8/8, and existing Superhero light/dark screenshot scene 1/1 (14 images). Syntax/diff checks and palette regeneration idempotence passed. Build 202611110833 via npm run bump:build. Actual installed Windows app remains emulated.


### 2026-11-11 - PMD theme regression expectations follow the contrast policy

- Updated the two existing Theme colours tests in tests/pmd-regression.spec.js, retaining their coverage. Superhero warning buttons now assert shared warning-palette text and >=4.5:1 rendered contrast in both modes, rather than requiring a particular --bs-btn-color declaration or unconditional body-background foreground. Slate still asserts the danger-coloured active surface, distinct inactive surface and the original swapped inactive gradient; active and inactive text must pass against every composited gradient stop. The active gradient may be flattened by the current contrast policy.
- Local helpers wait for changed theme sheets and sample rendered colours/gradient stops. Both updated tests passed, then the entire Theme colours group passed 16/16 (2 workers, no retries). Syntax/diff checks passed. Test/documentation-only change; application code and build 202611110833 are unchanged. Logs: work/pmd-theme-expectations.log and work/pmd-theme-group.log.

- Backend test integration is documented in SolarControlar/AGENTS.md: top-level tests/test_battery_flags.py and tests/test_metering.py run via tests/solarcontrolar-server.spec.js in the normal Playwright suite.


## 2026-11-11 - Power/Current and bounded KWh history
- Display labels are Now (latest readings, existing power/table IDs), Power (existing graph/chart IDs), and new KWh (kwh panel). Keep the old internal IDs stable. kwh-tab.js is loaded after graph-tab.js and precached in sw.js.
- KWh uses smd-select for period and available value, and five smd-checkbox toggles: Grid Import, Grid Export, AC Charge, Solar, Usage. Toggles update local Chart.js visibility without refetching. Legend changes also synchronize the checkboxes. It shares Power's chart surfaces, palette, line styling and live theme refresh behavior.
- api.js calls GET /api/energy_values?period=day|month|year and GET /api/energy_data?period=...&value=.... These require deploying the updated Flask backend. Neither endpoint transfers raw minute history; the frontend requests data only for the selected value. Request generations discard stale value/data responses; loading, empty and failed requests clear the previous chart.
- Server src/energy_data.py projects minute_totals.json. Only records carrying nonempty usage_method AND solar_method qualify. Counter fields are grid_import_total, grid_export_total, ac_charge_total, solar and usage, all cumulative kWh. Never sum the counters.
- Day samples the first observed minute in each five-minute bucket, subtracts the first observed eligible reading, and returns at most 288 points. Missing buckets/counters are null gaps. Month returns calendar-day totals (at most 31); year returns calendar-month totals (12), calculated as last minus first observed counter in each bucket. Method changes or counter jumps/drops greater than 1000 kWh invalidate the affected projection. Incomplete buckets reflect observed data, not invented midnight values.
- tests/solar-kwh.spec.js covers selected-period requests, all five toggles, stale-response handling, empty/error states. tests/test_kwh.py covers aggregation and isolated Flask endpoints via the ordinary server Playwright wrapper. Existing theme/resize/screenshot coverage includes all seven tabs.
- User explicitly authorized overwriting server/minute_totals.json with synthetic development history: 23,269 readings, 81 days, 35 months, 2024-01-01 through 2026-11-11 (three years). Includes recent complete days and the current partial day. These are test values, not live energy measurements.

- Validation: 18 Solar behavior/server Playwright entries passed (including 38 Python unittest cases), plus all 57 theme/layout/resize checks and the updated seven-tab Superhero screenshot scene, retries disabled. Both modes were visually inspected; screenshot charts disable animation and wait for matching canvas backing resolution after viewport changes. All 81 synthetic day, 35 month and three year projections were checked for bounds, aligned series, nonnegative deltas and day-zero baselines. Build 202611111910.


## 2026-11-11 - Straight chart lines and calendar axes
- Latest readings tab is now labelled Now; keep its internal power/table IDs. Power and KWh datasets use tension:0 so segments are straight.
- graph-tab.js shares solarDayAxis()/solarDayGridColor()/solarTimeLabel() with kwh-tab.js. Both daily charts plot local wall-clock minutes on a linear 0..1440 scale, independent of available data or timezone/DST conversions. Tick every 30 minutes; label every hour 00:00 through 24:00 and leave half-hour labels empty. Half-hour grids use 35% alpha of the theme border colour. Preserve the grid callback in both chart colour refresh functions.
- KWh month ticks show every day number (autoSkip:false), title abbreviated English month plus year (e.g. Sep 2026). Year ticks show all Jan..Dec and title the selected year. Tick rotation can increase on narrow screens without removing labels. Tooltip day titles retain clock formatting after the numeric-axis change.
- This display update requires no Flask/API/data changes. Tests assert Chart.js resolved ticks, point positions, line options, bounds, relative grid alpha and responsive labels. Screenshot scene includes KWh day/month/year in both modes.
- Verification: 17 Solar UI behavior/axis tests, 57 theme/layout/resize checks and the expanded Superhero screenshot scene pass without retries. Day/month/year screenshots were visually inspected. Flask source hash is unchanged for this update. Build 202611111932.

- 2026-11-11: KWh Day X-axis title is the selected date in DD Mon YYYY format (zero-padded day, English abbreviated month). energyCalendarAxis overrides only its own solarDayAxis title; Power retains Time. Frontend-only change; tests cover selecting different days.

- 2026-11-11: Solar top tiles are labelled Latest Date and Latest Time. solar-top-tiles.js no longer starts a wall-clock interval; split-flap digits render only the power-time attribute supplied by the same fetch that updates the Now table. Preserve fetched sample timestamps between refreshes. tests/solarcontrolar-regression.spec.js advances the browser clock and verifies a later fetch updates both date/time and Now; screenshot coverage asserts the labels and fetched digits.

- 2026-11-11: KWh y-axis suggestedMax comes from the highest of the latest finite readings in the five returned series, including hidden series. Skip trailing null calendar slots. Chart.js rounds the upper tick and keeps the zero baseline; checkbox/legend visibility must not collapse the shared range. Recompute on each data fetch. TDD regressions cover day/month/year with peaks above 1 kWh in different series, missing endpoints, all-series hiding/re-enabling and resolved plotted point positions. No Flask changes for scaling. Production Day data was subsequently verified to contain missing grid/AC values and Usage truncated at 1 kWh; a web scale change cannot reconstruct values omitted by that response.

- 2026-11-11 scope clarification: scaling is web-only and anchored to the latest available value from each of the five series (not all historical points). Server projection experiments were reverted at user request. The user replaced minute_totals.json with actual server history; preserve it and do not regenerate the earlier synthetic fixture. Diagnostics confirmed missing initial grid/AC readings and small derived-Usage dips in the source history. No production data or deployed server was changed.

- 2026-11-11: User authorized a server anomaly threshold. energy_data.py MAX_COUNTER_CHANGE_KWH=1000; only absolute adjacent valid counter changes strictly greater than 1000 kWh invalidate a series in Day/Month/Year. Exactly +/-1000 and small dips remain numeric; method compatibility and missing-value guards remain. Tests cover both directions and the exact boundary, plus Usage recovery after a 0.1 kWh dip. Tab display title is kWh (internal kwh ID unchanged). Deploy the updated server/src/energy_data.py to activate the threshold; Flask routes and metering/poller logic are unchanged.
