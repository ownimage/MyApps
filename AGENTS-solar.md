# SolarControlar working guide

Consolidated from AGENTS.md and current source on 2026-11-11. Read AGENTS.md for repository-wide rules; newer dated guidance supersedes historical entries.

## Workflow
- User authorized work in the whole P:/git/MyApps tree. Preserve unrelated changes (AGENTS-gantt.md is already untracked).
- TDD: reproduce bugs with failing rendered-result tests before changing application code. Run 2-3 affected tests first, then the complete affected specs, retries=0. Capture first-run output. No fixed dates that influence now-relative behavior or geometry.
- Use .\node_modules\.bin\playwright.cmd. Full repository sweeps use sequential shards 1/40 through 40/40, fixing each shard before proceeding. Start the dual test server once and verify both ports; EXTERNAL_SERVERS=1 prevents ownership races.
- Production-mode sirv caches file lengths. Use a fresh server after edits or dev:true. Existing work/serve-gantt.mjs and work/gantt.config.cjs provide a dev server on 8090/8091. Browser binaries may require PLAYWRIGHT_BROWSERS_PATH=C:/Users/Keith/AppData/Local/ms-playwright.
- Extend screenshot coverage (repository guidance specifies tests/pmd-screenshots.spec.js) and validate one theme in both modes.
- Ship runtime changes with npm run bump:build; it updates shared/js/build-number.js AND sw.js together. BUILD_NUMBER is YYYYMMDDHHMM. Never edit these separately; worker URL remains stable.
- Add useful dated findings to AGENTS.md and this guide. Documentation uses UTF-8.

## Architecture and data
- SolarControlar is a PWA frontend for the separate Flask solarcontrolar server; do not modify that server for frontend issues. Global functions/scripts, not ES modules.
- app.js configures SmdConfig with solarcontrolar_ storage prefix, shared- image prefix. storage.js owns Flask URL/basic-auth and refresh settings; api.js owns requests.
- main-view.js configures MAIN_TAB_DEFS once (Power, Settings, Files, Config, Forecast, Graph), orchestrates startup and top-tile power data, auto-refresh and errors. Graph is lazy initialized. Keep panel DOM stable when switching tabs.
- power-tab.js shows latest readings; solar-settings-view.js parses GET /solar/ settingsForm rows and CSRF token, renders editable settings, and POSTs changes. config-tab.js also parses server HTML for charge_to_percentage: there is no GET /api/config.
- files-tab.js fetches log/JSON text; forecast-tab.js runs forecast pipeline; graph-tab.js uses vendored Chart.js + date-fns adapter to show power and battery state of charge.
- api.js POST uses redirect:manual; opaqueredirect means PRG save succeeded. Following a cross-origin 302 loses auth and can produce CORS failure. API _post returns text, not a Response. Include basic-auth on all requests when configured.
- settings-tab.js is the APP Settings page (General/Display/Danger), distinct from the main server Settings tab. General holds Flask fields and refresh. Display owns shared appearance controls; no Icon size because there are no smd-image tiles. Danger controls follow shared shape.
- components/solar-top-tiles.js owns date, local ticking split-flap clock, battery, pulse and no-data visuals. Avoid recursively setting observed no-data unchanged. Build light-DOM children in connectedCallback, guard attribute renders until built, and clear clock timer on disconnect.

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
- Solar-only accessible ink/action/field/series tokens are baked into all 54 theme-mode sheets between solar-palette markers. Run node shared/generate-solar-palette.cjs with the test server running; optional SOLAR_PALETTE_BASE_URL changes its default localhost:8080. Generator uses an isolated theme document and is idempotent. No app runtime contrast normalizer exists.
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
