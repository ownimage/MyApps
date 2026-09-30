// PlanMyDay — Gantt library bootstrap (ES module).
//
// The Gantt is drawn with the vendored MIT `@revolist/gantt` plugin on top of
// `@revolist/revogrid`. Both ship as native ES modules, so the app needs no
// bundler and no build step for them: the two bare specifiers below are
// resolved by the <script type="importmap"> block in PlanMyDay/index.html,
// which points at RELATIVE paths under shared/vendor/revolist/ so the app still
// works when served from a sub-path (e.g. /PlanMyDay/).
//
// This file exists to bridge two worlds. The rest of the app is classic
// <script> files whose functions are called from inline `onclick=` handlers, so
// they cannot become modules. Rather than converting them, this module loads
// the library and publishes it on `window` once the custom element is defined.
//
// The hand-off is an event, NOT a plain assignment: module scripts are deferred
// until the document has been parsed, while the classic scripts run during
// parsing. So gantt.js can easily reach `ganttLibReady()` before this module has
// executed at all, and it must be able to wait rather than give up. See
// ganttLibReady() in gantt.js.
import { defineCustomElements } from "@revolist/revogrid/loader";
import { GanttPlugin, DEFAULT_TASK_COLUMNS } from "@revolist/gantt";

async function bootGanttLib() {
  // RevoGrid is a Stencil web component: `revo-grid` does not exist in the
  // document at all until this resolves. Callers must also await the element's
  // own `updateComplete` before its layout has settled.
  await defineCustomElements();
  await customElements.whenDefined("revo-grid");

  // DEFAULT_TASK_COLUMNS is the plugin's fallback column set (Task / Start /
  // End). The app passes a copy with `sortable: false`: the plugin's
  // normalizeTaskColumns() keeps an explicit `false` (it only defaults to true
  // when the property is absent), and the previous jsgantt page set
  // `vUseSort: 0` for the same reason — sorting the task table would break the
  // stream -> job hierarchy the projection depends on.
  window.PMD_GANTT_LIB = {
    GanttPlugin: GanttPlugin,
    DEFAULT_TASK_COLUMNS: DEFAULT_TASK_COLUMNS,
  };

  window.dispatchEvent(new CustomEvent("pmd-gantt-lib-ready"));
}

// The catch is load-bearing, not defensive boilerplate. If a vendored chunk were
// ever missing from the service worker precache, the static imports above would
// reject and an unawaited bootstrap would fail SILENTLY: gantt.js would sit on
// its `ganttLibReady()` promise forever and the page would render an empty
// chart area with no explanation. Announcing the failure lets the page show the
// same "library unavailable" message it always did.
bootGanttLib().catch(function (err) {
  window.PMD_GANTT_LIB_ERROR = err;
  window.dispatchEvent(new CustomEvent("pmd-gantt-lib-failed"));
  console.error("PlanMyDay: Gantt library failed to load", err);
});
