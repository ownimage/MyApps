# PlanMyDay and Gantt working guide

Summarized from AGENTS.md on 2026-11-04, with current Gantt source and tests checked to resolve historical contradictions. This is a focused companion to AGENTS.md; repository-wide rules still apply.

## Working rules

- Obtain access to the whole P:\git\MyApps repository at session start. Ask when requirements or meaningful implementation choices are unclear.
- For bug fixes, use TDD: reproduce the reported behavior in a regression test, confirm red, implement the fix, confirm green, then run the affected spec. Assert rendered behavior, order, styles, geometry and scrolling, rather than just absence of errors.
- Capture complete test output on the first run. Start with 2-3 affected tests, then expand; use --retries=0 while iterating. Apply shared root-cause fixes wherever the same defect occurs.
- Use the repository Playwright executable: .\node_modules\.bin\playwright.cmd.
- Use UTF-8 explicitly for text reads/writes. Keep durable, dated architectural and testing lessons in AGENTS.md, rather than accumulating session narration.
- Newer standalone apps under temp/ are upstream versions: port changes into the shared architecture rather than copying them over the repository app.

## PlanMyDay architecture worth preserving

- Reuse shared smd-* components and the pmd-* job/stream components. Shared components use light DOM. Build child markup in guarded connectedCallback(), never in a light-DOM constructor; attribute-triggered rendering must also check that construction has finished.
- smd-page handles full-screen editors and page stacking; smd-modal handles confirmation dialogs. An editor opened over the Gantt must restore the Gantt when closed. Property setters may rebuild smd-page innerHTML, so avoid keeping stale child references or binding listeners to replaceable controls.
- Keep component layout mechanics with their component and theme/color/size declarations in their established stylesheets. Use shared typography tokens; btn-sm uses the normal text token and keeps Gantt toolbar controls consistent.
- Bootstrap/Bootswatch is authoritative. Contrast corrections are generated into theme CSS, not calculated by a runtime contrast normalizer. Do not revive obsolete runtime contrast layers.
- Preserve stylesheet order: vendor styles and their overrides, Bootstrap theme, shared styles, shared mode layer, theme/mode override, then app-owned CSS such as PlanMyDay/css/gantt.css.
- Use smdKey() for app storage. PlanMyDay keys have the planmydays_ prefix.
- Current General settings order: Split list, Hide done, Auto Ad Hoc, Show Gantt. Auto-hide menu is on Display immediately above Slide speed; Screen resolution remains last. Older notes placing Show Gantt on Display are obsolete.
- Auto-hide must leave an expanded main menu visible. Closing the menu restarts its timer; preserve the current shared behavior when changing navigation.

## Current Gantt files and integration

- PlanMyDay/js/gantt.js: projection, page/header controls, grid configuration, drag persistence, filters, collapse, scroll anchoring and undo/redo.
- PlanMyDay/js/gantt-lib.js: ESM bootstrap exposing window.PMD_GANTT_LIB and ready/failed events.
- PlanMyDay/css/gantt.css: app-owned Gantt styling. inspect the current source before assuming styling still lives in an old injection function.
- PlanMyDay/index.html: relative import map, scripts, page/menu/settings wiring.
- shared/vendor/revolist/: vendored @revolist/gantt and @revolist/revogrid. Preserve vendor code and apply app behavior/style outside it.
- sw.js: precached vendor chunks and app assets.
- tests/pmd-gantt.spec.js: primary behavior and rendering regression suite. Related coverage: pmd-regression, pmd-screenshots, pmd-touch, settings-alignment, display-settings and storybook-regression.

The active renderer is RevoGrid/Revolist, replacing jsgantt on 2026-09-30. Old references to gantt-drag.js, afterDraw, vUseSort, pStart/pEnd, .gmainleft, .gtasktable, native pane resize grips and the old three-zone bar drag are historical, not implementation instructions. Some current source comments also lag later changes; current behavior and tests take precedence.

## Data model and date invariants

- Jobs store recurrence schedule, optional sleepUntil and optional duration in days; they do not store chart startDate/endDate. Render one bar per job, not a materialized series of recurrence occurrences.
- Start = sleepUntil or today. End = start + duration - 1 days. End is INCLUSIVE: a one-day job has identical start/end and occupies one day column.
- Missing duration falls back to one at read time. Merely opening the chart must not migrate jobs, add dates/duration or change stored streams.
- Keep all consumers consistent: displayed/ghost duration and resize persistence use ganttDaysBetween(start, end) + 1. Clamp duration to at least one.
- Stream summaries span the minimum start through maximum end of their included jobs. Empty streams remain visible as a small minimum-width tick on today.
- Preserve stream/job hierarchy and sequence; cells are readonly and app columns are not sortable. Job task IDs use j + job.id; stream IDs use s + stored stream index. Resolve back to storage rather than treating virtualized DOM positions as stable identities.
- Use ganttJobLabel() and existing getScheduleText(), not a second recurrence formatter. Daily jobs omit the redundant Every day suffix; other frequencies use round brackets without damaging text such as day(s).

## Controls and persisted state

- Show Gantt defaults off; changeShowGantt()/updateGanttMenu() control the main-menu entry. Use smdKey("showGantt").
- Zoom presets are day-week, week-month and month-quarter, stored in ganttZoom.
- Start/End defaults shown, stored in ganttShowDates. Active only defaults off, stored in ganttActiveOnly; when enabled it excludes jobs whose active flag is false and recalculates summary spans.
- Streams filter stores EXCLUDED stream titles in ganttHiddenStreams, so newly added streams are included automatically. The All checkbox selects all or none. Refresh checkbox/count state without rebuilding the page and closing the dropdown.
- Collapsed stream titles are stored in ganttCollapsedStreams. Collapse hides job rows but preserves the summary's full date span.
- The Edit column sits after Task, before Start/End, and remains when dates are hidden. Its primary buttons open the matching stream/job editor above the chart. Do not let row dragging consume these clicks.
- Disable RevoGrid's built-in column filter explicitly with grid.filter = false; the app's header controls remain available.

All state keys above go through smdKey(). Header listeners should survive page rebuilds, typically through guarded delegation on the page.

## Drag, undo and scrolling contracts

- Job bar LEFT half moves the whole bar and persists sleepUntil; RIGHT half resizes its end and persists duration. Stream summary bars move as a whole, shifting every child job by the same day delta; they cannot resize. Do not follow the stale source-header statement that summaries cannot drag.
- The vendor handles live bar pointer interaction; ganttBindBarDrag()/ganttPersistBarDrag() bridge the result back to stored streams. Render from storage after committing.
- Custom row dragging supports job reordering within/across streams and stream reordering. Preserve ownership of all jobs and renumber affected sequences. Filtering must never delete, relocate or lose hidden data.
- Resolve job drops using the pointer Y (the current midpoint regression requires this), and recalculate insertion after removal. A job-row target uses its midpoint for before/after insertion.
- Header midpoint chooses the displayed boundary: the upper half joins the previous stream, while the lower half joins the header's own stream (first job when expanded, append to hidden jobs when collapsed). Resolve and highlight the SAME boundary. Reject a boundary before the first stream. Own-header/original-slot drops must retain their no-op behavior.
- Preserve ghost panels, source/target highlights and cleanup. Auto-scroll near viewport edges must stop after release; wait a frame after scrolling before resolving virtualized row targets.
- Capture undo snapshots BEFORE a mutation. New edits clear redo. Keep bar changes, stream shifts and row moves on the common persistence/history path; preserve toolbar and keyboard undo/redo behavior.
- Preserve the visible row by stable task ID plus its pixel offset when collapsing/filtering/re-rendering. Pixel scrollTop alone does not preserve the content under the cursor.

## Rendering and layout traps

- Configure grid.columns, then grid.plugins, then grid.gantt, then grid.source: the plugin installs the gantt accessor.
- Wait for ganttLibReady(), the custom element definition and its updateComplete. Preserve the monotonic render token so an earlier asynchronous render cannot overwrite a newer chart.
- Opening clears a pending close timer, preventing a fast reopen from hiding the newly rendered page.
- Let the grid virtualizer own scrolling: page body is a flex column with hidden overflow and no padding; chart flexes with min-height: 0. Rows are compact at 30px.
- Day header is 56px so month and day numbers both appear; Week/Month use 30px. Recreate the grid when zoom or date-column visibility changes, since mount-time geometry is cached.
- Use data-gantt-zoom-preset on the chart host; data-gantt-zoom belongs to the buttons.
- Keep header/data origins aligned: timeline cells have zero horizontal padding and day dividers use a left border.
- Day-only weekend shading uses --gantt-weekend-bg and --gantt-weekend-offset. At 44px/day, the weekly gradient tile is 308px wide, not 100%; incorrect tiling shifts the first weekend. Preserve the flat header background when adding the repeating weekend gradient.

## Theme and asset reliability

- Use the SHIPPED --rg-theme-* tokens for RevoGrid and --rg-gantt-* for the timeline; documented --revo-grid-* names do not control this bundle.
- Grid theme attribute is default or dark. Other bundled palette names lack matching CSS here. Use real applyTheme(theme, mode) calls in tests; setting data-bs-theme alone does not load the palette.
- Header controls use shared smd-button components (size=small). Set variant=primary/secondary for selected/unselected zoom and toggles; do not override their colors with obsolete --smd-*-text variables. Streams updates its count span inside the component, preserving the inner button and dropdown semantics. Job bars are solid success and stream bars solid danger. Header/rows follow theme surfaces, with readable foregrounds in both modes.
- Theme changes must refresh an open chart via refreshGanttIfOpen(), because some vendor colors are captured during rendering.
- RevoGrid dynamically imports Stencil chunks using runtime paths. Vendor and precache the complete required ESM tree, keep the import map relative for sub-path hosting, and verify actual browser requests; a static import scan misses chunks.
- Useful selectors: #ganttChart revo-grid, revogr-header .rgHeaderCell, revogr-data .rgCell, .rg-gantt-bar, .rg-gantt-bar--summary, .rg-gantt-bar-label and .rg-gantt-header-cell. Derive counts from enabled columns and data rather than copying historical fixture counts.

## Verification workflow

From the repository root, begin with the affected tests:

```powershell
.\node_modules\.bin\playwright.cmd test tests/pmd-gantt.spec.js --project=chromium --grep "affected test pattern" --workers=2 --retries=0 --reporter=line
.\node_modules\.bin\playwright.cmd test tests/pmd-gantt.spec.js --project=chromium --workers=2 --retries=0 --reporter=line
```

- Compute dates from new Date() for tests whose layout/expectations depend on today. Fixed dates that drive positions eventually push bars off-screen. Fully self-contained calendar-phase fixtures are acceptable only when every expectation derives from the same base.
- Assert rendered outcomes: inclusive widths, header alignment, exact weekend columns across all seven start weekdays, stored results, ownership after three-or-more-stream moves, hidden/collapsed targets, undo/redo and stable visible-row anchors.
- Test menu visibility after opening the hamburger, not while its containing dropdown is hidden. Use classList.contains("active") for Active only: a regex can accidentally match gantt-active-toggle itself.
- Theme transitions can expose intermediate colors. Poll actual computed styles with expect.poll(); check real light/dark themes and body-surface matching as well as WCAG AA contrast. Clamp pixel sample points into the viewport and fail clearly on invalid colors.
- For timer-driven auto-scroll, compare two post-release samples to assert scrolling stopped; a mid-drag sample can race the final timer tick.
- Apply relevant regression fixes to pmd-screenshots.spec.js and validate one theme. Its Gantt scene enables the setting, opens the chart and waits for bars. Run storybook-regression when shared/pmd components change.
- Full-suite runs use one verified npm run dev:test server for ports 8080/8081 and EXTERNAL_SERVERS=1; run shards 1/40 through 40/40 one at a time with --workers=1 --retries=0 --reporter=line, fix each shard's failures and shared root causes before continuing. Do not launch all shards blindly.
- This summary is documentation only: no application tests or build bump are needed for writing it. For shipped runtime/assets changes, use npm run bump:build, which updates shared/js/build-number.js and sw.js together. Never hand-edit those versions independently; the service-worker registration URL stays stable.
