import { BasePlugin as je } from "@revolist/revogrid";
const Ue = 1440 * 60 * 1e3;
function x(e) {
  return new Date(e.includes("T") ? e : `${e}T00:00:00Z`);
}
function be(e) {
  return e.toISOString().slice(0, 10);
}
function v(e, t) {
  const n = x(e);
  return n.setUTCDate(n.getUTCDate() + t), be(n);
}
function P(e, t) {
  return Math.round((x(t).getTime() - x(e).getTime()) / Ue);
}
function We(e) {
  return e.reduce((t, n) => x(n) < x(t) ? n : t);
}
function qe(e) {
  return e.reduce((t, n) => x(n) > x(t) ? n : t);
}
function ne(e) {
  const t = x(e);
  return be(new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth(), 1)));
}
function Ge(e, t = "en-US") {
  return new Intl.DateTimeFormat(t, { month: "long", year: "numeric", timeZone: "UTC" }).format(x(e));
}
function Xe(e, t = "en-US") {
  return new Intl.DateTimeFormat(t, { day: "numeric", weekday: "short", timeZone: "UTC" }).format(x(e));
}
function Ke(e, t = "en-US") {
  return new Intl.DateTimeFormat(t, { month: "short", timeZone: "UTC" }).format(x(e));
}
const se = 365 * 2, Ze = {
  "day-week": { tickWidth: 44, tickCountDays: 1 },
  "week-month": { tickWidth: 84, tickCountDays: 7 },
  "month-quarter": { tickWidth: 112, tickCountDays: 30 }
};
function Je(e = "day-week") {
  return Ze[e];
}
function Qe(e) {
  const t = e.flatMap((i) => [i.startDate, i.endDate]).filter(Boolean);
  if (!t.length)
    return {
      startDate: "2026-01-01",
      endDate: v("2026-01-01", se - 1)
    };
  const n = v(We(t), -2), s = v(qe(t), 4), a = v(n, se - 1);
  return {
    startDate: n,
    endDate: P(a, s) > 0 ? s : a
  };
}
function Ve(e) {
  const t = Je(e.zoomPreset), n = Math.max(1, P(e.startDate, e.endDate) + 1), s = Math.ceil(n / t.tickCountDays), a = s * t.tickWidth;
  return {
    startDate: e.startDate,
    endDate: e.endDate,
    tickWidth: t.tickWidth,
    tickCountDays: t.tickCountDays,
    totalWidth: a,
    dateToX(i) {
      return P(e.startDate, i) / t.tickCountDays * t.tickWidth;
    },
    xToDate(i) {
      const r = Math.max(0, Math.round(i / t.tickWidth * t.tickCountDays));
      return v(e.startDate, r);
    },
    getHeaderRows() {
      return et(e.startDate, s, t.tickCountDays, t.tickWidth, e.locale);
    }
  };
}
function et(e, t, n, s, a = "en-US") {
  const i = [];
  for (let d = 0; d < t; d += 1) {
    const h = v(e, d * n);
    i.push({
      key: `tick-${h}`,
      label: n === 1 ? Xe(h, a) : Ke(h, a),
      x: d * s,
      width: s
    });
  }
  const r = [];
  let o = 0, l = ne(v(e, 0));
  for (let d = 1; d <= i.length; d += 1) {
    const h = v(e, d * n), c = ne(h);
    (c !== l || d === i.length) && (r.push({
      key: `group-${l}-${o}`,
      label: Ge(l, a),
      x: o * s,
      width: (d - o) * s
    }), o = d, l = c);
  }
  return [
    { key: "months", cells: r },
    { key: "ticks", cells: i }
  ];
}
const tt = 6;
function nt(e, t) {
  const n = t.dateToX(e.startDate), s = t.dateToX(v(e.endDate, 1)), a = e.type === "milestone" ? 14 : Math.max(tt, s - n), i = Math.max(0, Math.min(100, e.progressPercent || 0));
  return {
    taskId: e.id,
    x: n,
    width: a,
    progressWidth: e.type === "milestone" ? 0 : a * (i / 100),
    kind: e.type
  };
}
function st(e, t) {
  return e.map((n, s) => ({
    ...n,
    __gantt: nt(n, t),
    __ganttRowIndex: s
  }));
}
function at(e, t, n) {
  return Math.round(e / t * n);
}
function it(e, t, n) {
  if (n === 0)
    return e;
  if (t === "move")
    return {
      ...e,
      startDate: v(e.startDate, n),
      endDate: v(e.endDate, n)
    };
  if (t === "resize-start") {
    const a = v(e.startDate, n);
    return {
      ...e,
      startDate: P(a, e.endDate) < 0 ? e.endDate : a
    };
  }
  const s = v(e.endDate, n);
  return {
    ...e,
    endDate: P(e.startDate, s) < 0 ? e.startDate : s
  };
}
function rt(e, t) {
  return {
    ...e,
    progressPercent: Math.min(100, Math.max(0, Math.round(t)))
  };
}
function ot(e, t, n = {}) {
  const s = n.rowHeight ?? 42, a = n.headerHeight ?? 58, i = n.laneOffset ?? 16, r = n.barGap ?? 4, o = n.getRowFrame ?? ((d) => ({
    top: d * s,
    height: s
  })), l = new Map(t.map((d) => [d.id, d]));
  return e.flatMap((d) => {
    if (d.type !== "finish-to-start")
      return [];
    const h = l.get(d.predecessorTaskId), c = l.get(d.successorTaskId);
    return !h || !c ? [] : [
      lt(
        d.id,
        h.__gantt,
        o(h.__ganttRowIndex),
        c.__gantt,
        o(c.__ganttRowIndex),
        a,
        i,
        r
      )
    ];
  }).filter((d) => !!d);
}
function lt(e, t, n, s, a, i, r, o) {
  if (!n || !a)
    return null;
  const l = t.x + t.width, d = i + n.top + n.height / 2, h = Math.max(0, s.x - o), c = i + a.top + a.height / 2, f = l + r, p = Math.max(0, s.x - r), g = h > f ? dt(l, d, f, h, c) : ct(
    l,
    d,
    f,
    p,
    h,
    c,
    a,
    i,
    r
  );
  return {
    dependencyId: e,
    path: g,
    endX: h,
    endY: c
  };
}
function dt(e, t, n, s, a) {
  return [
    `M ${e} ${t}`,
    `L ${n} ${t}`,
    `L ${n} ${a}`,
    `L ${s} ${a}`
  ].join(" ");
}
function ct(e, t, n, s, a, i, r, o, l) {
  const d = o + r.top, h = d + r.height, f = i >= t ? d - l / 2 : h + l / 2;
  return [
    `M ${e} ${t}`,
    `L ${n} ${t}`,
    `L ${n} ${f}`,
    `L ${s} ${f}`,
    `L ${s} ${i}`,
    `L ${a} ${i}`
  ].join(" ");
}
const ut = 32;
class ht {
  /**
   * Create and attach the dependency overlay to the grid host element.
   *
   * The layer is intentionally non-interactive in this package version; it
   * renders finish-to-start links only and lets RevoGrid keep ownership of grid
   * input and focus.
   */
  constructor(t, n) {
    this.container = t, this.providers = n, this.root.slot = "data-rgCol-rgRow", this.root.className = "rg-gantt-dependency-overlay", this.root.setAttribute("aria-hidden", "true"), Object.assign(this.root.style, {
      display: "block",
      position: "absolute",
      inset: "0 auto auto 0",
      pointerEvents: "none",
      overflow: "visible",
      background: "transparent",
      zIndex: "20"
    }), t.appendChild(this.root);
  }
  container;
  providers;
  root = document.createElement("div");
  /** Remove all dependency DOM and detach the overlay from the grid host. */
  destroy() {
    this.root.remove();
  }
  /**
   * Render the current dependency set for projected rows.
   *
   * Passing `showDependencies = false`, an empty dependency array, or a missing
   * scale clears the layer without mutating the public dependency data.
   */
  render(t) {
    if (!t.showDependencies || !t.scale || t.dependencies.length === 0) {
      this.root.replaceChildren();
      return;
    }
    this.root.hidden = !1;
    const n = this.readRowMetrics(t.rows.length), s = ot(t.dependencies, t.rows, {
      headerHeight: 0,
      rowHeight: n.rowHeight,
      getRowFrame: (r) => n.frames.get(r) ?? null
    }), a = Math.max(180, n.contentHeight);
    this.root.style.width = `${t.scale.totalWidth}px`, this.root.style.height = `${a}px`;
    const i = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    i.classList.add("rg-gantt-dependencies"), i.style.background = "transparent", i.style.pointerEvents = "none", i.style.overflow = "visible", i.setAttribute("width", String(t.scale.totalWidth)), i.setAttribute("height", String(a)), i.setAttribute("viewBox", `0 0 ${t.scale.totalWidth} ${a}`), i.appendChild(mt());
    for (const r of s) {
      const o = document.createElementNS("http://www.w3.org/2000/svg", "path");
      o.classList.add("rg-gantt-dependency"), o.dataset.dependencyId = r.dependencyId, o.setAttribute("d", r.path), o.setAttribute("fill", "none"), o.setAttribute("stroke", "#64748b"), o.setAttribute("stroke-width", "1.5"), o.setAttribute("marker-end", "url(#rg-gantt-arrow)"), i.appendChild(o);
    }
    this.root.replaceChildren(i);
  }
  readRowMetrics(t) {
    const n = this.providers.data.stores.rgRow.store, s = this.providers.dimension.stores.rgRow.store, a = s.get("originItemSize") || this.measureRenderedRowHeight() || ut, i = pt(s.get("sizes")), r = n.get("items")?.length ? n.get("items") : n.get("proxyItems"), o = gt(n.get("trimmed")), l = this.providers.viewport.stores.rgRow.store.get("items") ?? [], d = /* @__PURE__ */ new Map();
    for (const p of l) {
      const g = r[p.itemIndex] ?? p.itemIndex;
      d.set(g, {
        top: p.start,
        height: p.size
      });
    }
    const h = ft(t, a, i, d, r, o), c = Array.from(h.values()).reduce((p, g) => Math.max(p, g.top + g.height), 0), f = s.get("realSize") || c || t * a;
    return {
      rowHeight: a,
      contentHeight: f,
      frames: h
    };
  }
  measureRenderedRowHeight() {
    return this.container.querySelector(
      'revogr-data[col-type="rgCol"][type="rgRow"] .rgRow[data-rgrow]'
    )?.offsetHeight || 0;
  }
}
function ft(e, t, n, s = /* @__PURE__ */ new Map(), a = Array.from({ length: e }, (r, o) => o), i = {}) {
  const r = /* @__PURE__ */ new Map();
  let o = 0;
  for (const l of a) {
    if (l < 0 || l >= e || i[l])
      continue;
    const d = n[l] || t;
    r.set(l, s.get(l) ?? { top: o, height: d }), o += d;
  }
  return r;
}
function pt(e) {
  return !e || typeof e != "object" ? {} : e;
}
function gt(e) {
  if (!e || typeof e != "object")
    return {};
  const t = {};
  for (const n of Object.values(e))
    if (!(!n || typeof n != "object"))
      for (const [s, a] of Object.entries(n))
        t[Number(s)] = !!(t[Number(s)] || a);
  return t;
}
function mt() {
  const e = document.createElementNS("http://www.w3.org/2000/svg", "defs"), t = document.createElementNS("http://www.w3.org/2000/svg", "marker");
  t.setAttribute("id", "rg-gantt-arrow"), t.setAttribute("markerWidth", "6"), t.setAttribute("markerHeight", "6"), t.setAttribute("refX", "5"), t.setAttribute("refY", "3"), t.setAttribute("orient", "auto");
  const n = document.createElementNS("http://www.w3.org/2000/svg", "path");
  return n.setAttribute("d", "M 0 0 L 6 3 L 0 6 z"), n.setAttribute("fill", "#64748b"), t.appendChild(n), e.appendChild(t), e;
}
function S(e) {
  return `${Math.round(e * 100) / 100}px`;
}
function $t(e, t) {
  return {
    readonly: !0,
    columnTemplate: (n) => {
      const s = e();
      if (!s)
        return "Timeline";
      const a = s.getHeaderRows();
      return n("div", {
        class: { "rg-gantt-header": !0 },
        style: {
          "--rg-gantt-width": S(s.totalWidth),
          "--rg-gantt-header-rows": String(a.length)
        }
      }, a.flatMap((i, r) => i.cells.map((o) => n("div", {
        key: o.key,
        class: { "rg-gantt-header-cell": !0 },
        style: {
          "--rg-gantt-header-row": String(r),
          "--rg-gantt-cell-left": S(o.x),
          "--rg-gantt-cell-width": S(o.width)
        }
      }, o.label))));
    },
    cellTemplate: (n, s) => {
      const a = e(), i = s.model;
      if (!a || !i.__gantt)
        return "";
      const r = i.__gantt, o = t()?.showTaskLabels !== !1, l = r.kind !== "milestone";
      return n("div", {
        class: { "rg-gantt-cell": !0 },
        style: {
          "--rg-gantt-width": S(a.totalWidth)
        }
      }, [
        n("div", {
          class: {
            "rg-gantt-bar": !0,
            [`rg-gantt-bar--${r.kind}`]: !0
          },
          "data-gantt-task-id": i.id,
          "data-gantt-bar-kind": r.kind,
          "data-gantt-interaction": "move",
          tabIndex: -1,
          "aria-hidden": "true",
          style: {
            "--rg-gantt-bar-left": S(r.x),
            "--rg-gantt-bar-width": S(r.width),
            "--rg-gantt-progress-width": S(r.progressWidth)
          }
        }, [
          l ? n("span", {
            class: {
              "rg-gantt-bar-handle": !0,
              "rg-gantt-bar-handle--start": !0
            },
            "data-gantt-interaction": "resize-start",
            "data-gantt-task-id": i.id
          }) : null,
          n("span", {
            class: { "rg-gantt-bar-progress": !0 }
          }),
          l ? n("span", {
            class: { "rg-gantt-progress-handle": !0 },
            "data-gantt-interaction": "resize-progress",
            "data-gantt-task-id": i.id
          }) : null,
          l ? n("span", {
            class: {
              "rg-gantt-bar-handle": !0,
              "rg-gantt-bar-handle--end": !0
            },
            "data-gantt-interaction": "resize-end",
            "data-gantt-task-id": i.id
          }) : null,
          o ? n("span", { class: { "rg-gantt-bar-label": !0 } }, i.name) : null
        ])
      ]);
    }
  };
}
function yt(e) {
  return {
    prop: "__ganttTimeline",
    name: "Timeline",
    size: e,
    readonly: !0,
    columnType: "gantt"
  };
}
const vt = `<svg aria-hidden="true" viewBox="0 0 21 21" xmlns="http://www.w3.org/2000/svg">
    <g fill="none" fill-rule="evenodd" transform="translate(2 2)">
        <path d="m2.5.5h12c1.1045695 0 2 .8954305 2 2v12c0 1.1045695-.8954305 2-2 2h-12c-1.1045695 0-2-.8954305-2-2v-12c0-1.1045695.8954305-2 2-2z" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"></path>
        <path d="m.5 4.5h16" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"></path>
        <g fill="currentColor">
            <circle cx="8.5" cy="8.5" r="1"></circle>
            <circle cx="4.5" cy="8.5" r="1"></circle>
            <circle cx="12.5" cy="8.5" r="1"></circle>
            <circle cx="8.5" cy="12.5" r="1"></circle>
            <circle cx="4.5" cy="12.5" r="1"></circle>
            <circle cx="12.5" cy="12.5" r="1"></circle>
        </g>
    </g>
</svg>
`, bt = (e, { value: t }) => [
  e("div", { class: { "cell-value-wrapper": !0 } }, t?.toString()),
  e("button", {
    class: { calendar: !0 },
    innerHTML: vt,
    onClick: (n) => {
      const s = new MouseEvent("dblclick", {
        bubbles: !0,
        cancelable: !0,
        view: window
      });
      n.target.dispatchEvent(s);
    }
  })
];
function wt(e, t, n, s) {
  t.style.transform = `translate(${e.left}px, ${e.top}px)`, t.style.width = `${e.width}px`, t.style.height = `${e.height}px`, n.append(t), s?.show();
}
class _t {
  constructor(t, n) {
    this.data = t, this.saveCallback = n;
  }
  componentDidRender() {
    if (!this.element || !this.revoFloat)
      return;
    const t = !this.data.column.appendTo || this.data.column.appendTo == "body" ? document.body : this.data.column.appendTo;
    wt(
      this.element.getBoundingClientRect(),
      this.revoFloat,
      t,
      this.calendar
    );
  }
  isDate(t) {
    return Object.prototype.toString.call(t) === "[object Date]" && !isNaN(t.getTime());
  }
  getValue() {
    var t;
    return (t = this.calendar) == null ? void 0 : t.value;
  }
  disconnectedCallback() {
    var t, n;
    (t = this.calendar) == null || t.hide(), (n = this.revoFloat) == null || n.remove(), this.calendar = null, this.revoFloat = null;
  }
  render(t) {
    var n;
    let s = "";
    return this.editCell && (s = (this.editCell.model || {})[(n = this.editCell) == null ? void 0 : n.prop] || ""), this.isDate(s) && (s = s.toISOString().split("T")[0]), t("div", { class: "revo-holder" }, [
      t(
        "div",
        {
          class: "revo-float",
          onMouseUp: (a) => {
            a.stopPropagation();
          },
          ref: (a) => this.revoFloat = a
        },
        [
          t("duet-date-picker", {
            ...this.data.column,
            ref: (a) => this.calendar = a,
            value: s,
            onDuetChange: ({
              detail: { value: a, valueAsDate: i }
            }) => this.saveCallback(this.data.column.valueAsDate ? i : a),
            onDuetOpen: () => {
              var a, i;
              const { bottom: r } = ((a = this.revoFloat) == null ? void 0 : a.getBoundingClientRect()) || {}, { clientHeight: o } = document.body, l = r + 300 > o ? "top" : "bottom";
              (i = this.calendar) == null || i.setAttribute("position", l);
            }
          })
        ]
      )
    ]);
  }
}
const M = {
  allRenderFn: !1,
  cmpDidLoad: !0,
  cmpDidUnload: !1,
  cmpDidUpdate: !0,
  cmpDidRender: !0,
  cmpWillLoad: !0,
  cmpWillUpdate: !0,
  cmpWillRender: !0,
  connectedCallback: !0,
  disconnectedCallback: !0,
  element: !0,
  event: !0,
  hasRenderFn: !0,
  lifecycle: !0,
  hostListener: !0,
  hostListenerTargetWindow: !0,
  hostListenerTargetDocument: !0,
  hostListenerTargetBody: !0,
  hostListenerTargetParent: !1,
  hostListenerTarget: !0,
  member: !0,
  method: !0,
  mode: !0,
  observeAttribute: !0,
  prop: !0,
  propMutable: !0,
  reflect: !0,
  scoped: !0,
  shadowDom: !0,
  slot: !0,
  cssAnnotations: !0,
  state: !0,
  style: !0,
  svg: !0,
  updatable: !0,
  vdomAttribute: !0,
  vdomXlink: !0,
  vdomClass: !0,
  vdomFunctional: !0,
  vdomKey: !0,
  vdomListener: !0,
  vdomRef: !0,
  vdomPropOrAttr: !0,
  vdomRender: !0,
  vdomStyle: !0,
  vdomText: !0,
  watchCallback: !0,
  taskQueue: !0,
  hotModuleReplacement: !1,
  isDebug: !1,
  isDev: !1,
  isTesting: !1,
  hydrateServerSide: !1,
  hydrateClientSide: !1,
  lifecycleDOMEvents: !1,
  lazyLoad: !1,
  profile: !1,
  slotRelocation: !0,
  appendChildSlotFix: !1,
  cloneNodeFix: !1,
  hydratedAttribute: !1,
  hydratedClass: !0,
  safari10: !1,
  scriptDataOpts: !1,
  scopedSlotTextContentFix: !1,
  shadowDomShim: !1,
  slotChildNodesFix: !1,
  invisiblePrehydration: !0,
  propBoolean: !0,
  propNumber: !0,
  propString: !0,
  cssVarShim: !1,
  constructableCSS: !0,
  cmpShouldUpdate: !0,
  devTools: !1,
  dynamicImportShim: !1,
  shadowDelegatesFocus: !0,
  initializeNextTick: !1,
  asyncLoading: !1,
  asyncQueue: !1,
  transformTagName: !1,
  attachStyles: !0
};
let L, we, q, _e = !1, Y = !1, V = !1, y = !1, ae = null, Z = !1;
const T = (e, t = "") => () => {
}, ie = "http://www.w3.org/1999/xlink", re = {}, xt = "http://www.w3.org/2000/svg", Dt = "http://www.w3.org/1999/xhtml", kt = (e) => e != null, ee = (e) => (e = typeof e, e === "object" || e === "function");
function St(e) {
  var t, n, s;
  return (s = (n = (t = e.head) === null || t === void 0 ? void 0 : t.querySelector('meta[name="csp-nonce"]')) === null || n === void 0 ? void 0 : n.getAttribute("content")) !== null && s !== void 0 ? s : void 0;
}
const u = (e, t, ...n) => {
  let s = null, a = null, i = null, r = !1, o = !1;
  const l = [], d = (c) => {
    for (let f = 0; f < c.length; f++)
      s = c[f], Array.isArray(s) ? d(s) : s != null && typeof s != "boolean" && ((r = typeof e != "function" && !ee(s)) && (s = String(s)), r && o ? l[l.length - 1].$text$ += s : l.push(r ? H(null, s) : s), o = r);
  };
  if (d(n), t) {
    t.key && (a = t.key), t.name && (i = t.name);
    {
      const c = t.className || t.class;
      c && (t.class = typeof c != "object" ? c : Object.keys(c).filter((f) => c[f]).join(" "));
    }
  }
  if (typeof e == "function")
    return e(t === null ? {} : t, l, Mt);
  const h = H(e, null);
  return h.$attrs$ = t, l.length > 0 && (h.$children$ = l), h.$key$ = a, h.$name$ = i, h;
}, H = (e, t) => {
  const n = {
    $flags$: 0,
    $tag$: e,
    $text$: t,
    $elm$: null,
    $children$: null
  };
  return n.$attrs$ = null, n.$key$ = null, n.$name$ = null, n;
}, xe = {}, Tt = (e) => e && e.$tag$ === xe, Mt = {
  forEach: (e, t) => e.map(oe).forEach(t),
  map: (e, t) => e.map(oe).map(t).map(Lt)
}, oe = (e) => ({
  vattrs: e.$attrs$,
  vchildren: e.$children$,
  vkey: e.$key$,
  vname: e.$name$,
  vtag: e.$tag$,
  vtext: e.$text$
}), Lt = (e) => {
  if (typeof e.vtag == "function") {
    const n = Object.assign({}, e.vattrs);
    return e.vkey && (n.key = e.vkey), e.vname && (n.name = e.vname), u(e.vtag, n, ...e.vchildren || []);
  }
  const t = H(e.vtag, e.vtext);
  return t.$attrs$ = e.vattrs, t.$children$ = e.vchildren, t.$key$ = e.vkey, t.$name$ = e.vname, t;
}, Et = (e) => an.map((t) => t(e)).find((t) => !!t), Rt = (e, t) => e != null && !ee(e) ? t & 4 ? e === "false" ? !1 : e === "" || !!e : t & 2 ? parseFloat(e) : t & 1 ? String(e) : e : e, Ct = (e) => e, F = (e, t, n) => {
  const s = Ct(e);
  return {
    emit: (a) => Ft(s, t, {
      bubbles: !0,
      composed: !0,
      cancelable: !0,
      detail: a
    })
  };
}, Ft = (e, t, n) => {
  const s = $.ce(t, n);
  return e.dispatchEvent(s), s;
}, le = /* @__PURE__ */ new WeakMap(), Pt = (e, t, n) => {
  let s = U.get(e);
  ln && n ? (s = s || new CSSStyleSheet(), typeof s == "string" ? s = t : s.replaceSync(t)) : s = t, U.set(e, s);
}, At = (e, t, n, s) => {
  var a;
  let i = De(t, n);
  const r = U.get(i);
  if (e = e.nodeType === 11 ? e : _, r)
    if (typeof r == "string") {
      e = e.head || e;
      let o = le.get(e), l;
      if (o || le.set(e, o = /* @__PURE__ */ new Set()), !o.has(i)) {
        {
          l = _.createElement("style"), l.innerHTML = r;
          const d = (a = $.$nonce$) !== null && a !== void 0 ? a : St(_);
          d != null && l.setAttribute("nonce", d), e.insertBefore(l, e.querySelector("link"));
        }
        o && o.add(i);
      }
    } else e.adoptedStyleSheets.includes(r) || (e.adoptedStyleSheets = [...e.adoptedStyleSheets, r]);
  return i;
}, It = (e) => {
  const t = e.$cmpMeta$, n = e.$hostElement$, s = t.$flags$, a = T("attachStyles", t.$tagName$), i = At(n.shadowRoot ? n.shadowRoot : n.getRootNode(), t, e.$modeName$);
  s & 10 && (n["s-sc"] = i, n.classList.add(i + "-h"), s & 2 && n.classList.add(i + "-s")), a();
}, De = (e, t) => "sc-" + (t && e.$flags$ & 32 ? e.$tagName$ + "-" + t : e.$tagName$), de = (e, t, n, s, a, i) => {
  if (n !== s) {
    let r = fe(e, t), o = t.toLowerCase();
    if (t === "class") {
      const l = e.classList, d = ce(n), h = ce(s);
      l.remove(...d.filter((c) => c && !h.includes(c))), l.add(...h.filter((c) => c && !d.includes(c)));
    } else if (t === "style") {
      for (const l in n)
        (!s || s[l] == null) && (l.includes("-") ? e.style.removeProperty(l) : e.style[l] = "");
      for (const l in s)
        (!n || s[l] !== n[l]) && (l.includes("-") ? e.style.setProperty(l, s[l]) : e.style[l] = s[l]);
    } else if (t !== "key")
      if (t === "ref")
        s && s(e);
      else if (!e.__lookupSetter__(t) && t[0] === "o" && t[1] === "n")
        t[2] === "-" ? t = t.slice(3) : fe(X, o) ? t = o.slice(2) : t = o[2] + t.slice(3), n && $.rel(e, t, n, !1), s && $.ael(e, t, s, !1);
      else {
        const l = ee(s);
        if ((r || l && s !== null) && !a)
          try {
            if (e.tagName.includes("-"))
              e[t] = s;
            else {
              const h = s ?? "";
              t === "list" ? r = !1 : (n == null || e[t] != h) && (e[t] = h);
            }
          } catch {
          }
        let d = !1;
        o !== (o = o.replace(/^xlink\:?/, "")) && (t = o, d = !0), s == null || s === !1 ? (s !== !1 || e.getAttribute(t) === "") && (d ? e.removeAttributeNS(ie, t) : e.removeAttribute(t)) : (!r || i & 4 || a) && !l && (s = s === !0 ? "" : s, d ? e.setAttributeNS(ie, t, s) : e.setAttribute(t, s));
      }
  }
}, zt = /\s/, ce = (e) => e ? e.split(zt) : [], ke = (e, t, n, s) => {
  const a = t.$elm$.nodeType === 11 && t.$elm$.host ? t.$elm$.host : t.$elm$, i = e && e.$attrs$ || re, r = t.$attrs$ || re;
  for (s in i)
    s in r || de(a, s, i[s], void 0, n, t.$flags$);
  for (s in r)
    de(a, s, i[s], r[s], n, t.$flags$);
}, j = (e, t, n, s) => {
  const a = t.$children$[n];
  let i = 0, r, o, l;
  if (_e || (V = !0, a.$tag$ === "slot" && (L && s.classList.add(L + "-s"), a.$flags$ |= a.$children$ ? (
    // slot element has fallback content
    2
  ) : (
    // slot element does not have fallback content
    1
  ))), a.$text$ !== null)
    r = a.$elm$ = _.createTextNode(a.$text$);
  else if (a.$flags$ & 1)
    r = a.$elm$ = _.createTextNode("");
  else {
    if (y || (y = a.$tag$ === "svg"), r = a.$elm$ = _.createElementNS(y ? xt : Dt, a.$flags$ & 2 ? "slot-fb" : a.$tag$), y && a.$tag$ === "foreignObject" && (y = !1), ke(null, a, y), kt(L) && r["s-si"] !== L && r.classList.add(r["s-si"] = L), a.$children$)
      for (i = 0; i < a.$children$.length; ++i)
        o = j(e, a, i, r), o && r.appendChild(o);
    a.$tag$ === "svg" ? y = !1 : r.tagName === "foreignObject" && (y = !0);
  }
  return r["s-hn"] = q, a.$flags$ & 3 && (r["s-sr"] = !0, r["s-cr"] = we, r["s-sn"] = a.$name$ || "", l = e && e.$children$ && e.$children$[n], l && l.$tag$ === a.$tag$ && e.$elm$ && A(e.$elm$, !1)), r;
}, A = (e, t) => {
  $.$flags$ |= 1;
  const n = e.childNodes;
  for (let s = n.length - 1; s >= 0; s--) {
    const a = n[s];
    a["s-hn"] !== q && a["s-ol"] && (Me(a).insertBefore(a, te(a)), a["s-ol"].remove(), a["s-ol"] = void 0, V = !0), t && A(a, t);
  }
  $.$flags$ &= -2;
}, Se = (e, t, n, s, a, i) => {
  let r = e["s-cr"] && e["s-cr"].parentNode || e, o;
  for (r.shadowRoot && r.tagName === q && (r = r.shadowRoot); a <= i; ++a)
    s[a] && (o = j(null, n, a, e), o && (s[a].$elm$ = o, r.insertBefore(o, te(t))));
}, Te = (e, t, n, s, a) => {
  for (; t <= n; ++t)
    (s = e[t]) && (a = s.$elm$, Re(s), Y = !0, a["s-ol"] ? a["s-ol"].remove() : A(a, !0), a.remove());
}, Nt = (e, t, n, s) => {
  let a = 0, i = 0, r = 0, o = 0, l = t.length - 1, d = t[0], h = t[l], c = s.length - 1, f = s[0], p = s[c], g, m;
  for (; a <= l && i <= c; )
    if (d == null)
      d = t[++a];
    else if (h == null)
      h = t[--l];
    else if (f == null)
      f = s[++i];
    else if (p == null)
      p = s[--c];
    else if (z(d, f))
      E(d, f), d = t[++a], f = s[++i];
    else if (z(h, p))
      E(h, p), h = t[--l], p = s[--c];
    else if (z(d, p))
      (d.$tag$ === "slot" || p.$tag$ === "slot") && A(d.$elm$.parentNode, !1), E(d, p), e.insertBefore(d.$elm$, h.$elm$.nextSibling), d = t[++a], p = s[--c];
    else if (z(h, f))
      (d.$tag$ === "slot" || p.$tag$ === "slot") && A(h.$elm$.parentNode, !1), E(h, f), e.insertBefore(h.$elm$, d.$elm$), h = t[--l], f = s[++i];
    else {
      for (r = -1, o = a; o <= l; ++o)
        if (t[o] && t[o].$key$ !== null && t[o].$key$ === f.$key$) {
          r = o;
          break;
        }
      r >= 0 ? (m = t[r], m.$tag$ !== f.$tag$ ? g = j(t && t[i], n, r, e) : (E(m, f), t[r] = void 0, g = m.$elm$), f = s[++i]) : (g = j(t && t[i], n, i, e), f = s[++i]), g && Me(d.$elm$).insertBefore(g, te(d.$elm$));
    }
  a > l ? Se(e, s[c + 1] == null ? null : s[c + 1].$elm$, n, s, i, c) : i > c && Te(t, a, l);
}, z = (e, t) => e.$tag$ === t.$tag$ ? e.$tag$ === "slot" ? e.$name$ === t.$name$ : e.$key$ === t.$key$ : !1, te = (e) => e && e["s-ol"] || e, Me = (e) => (e["s-ol"] ? e["s-ol"] : e).parentNode, E = (e, t) => {
  const n = t.$elm$ = e.$elm$, s = e.$children$, a = t.$children$, i = t.$tag$, r = t.$text$;
  let o;
  r === null ? (y = i === "svg" ? !0 : i === "foreignObject" ? !1 : y, i === "slot" || ke(e, t, y), s !== null && a !== null ? Nt(n, s, t, a) : a !== null ? (e.$text$ !== null && (n.textContent = ""), Se(n, null, t, a, 0, a.length - 1)) : s !== null && Te(s, 0, s.length - 1), y && i === "svg" && (y = !1)) : (o = n["s-cr"]) ? o.parentNode.textContent = r : e.$text$ !== r && (n.data = r);
}, Le = (e) => {
  const t = e.childNodes;
  let n, s, a, i, r, o;
  for (s = 0, a = t.length; s < a; s++)
    if (n = t[s], n.nodeType === 1) {
      if (n["s-sr"]) {
        for (r = n["s-sn"], n.hidden = !1, i = 0; i < a; i++)
          if (o = t[i].nodeType, t[i]["s-hn"] !== n["s-hn"] || r !== "") {
            if (o === 1 && r === t[i].getAttribute("slot")) {
              n.hidden = !0;
              break;
            }
          } else if (o === 1 || o === 3 && t[i].textContent.trim() !== "") {
            n.hidden = !0;
            break;
          }
      }
      Le(n);
    }
}, w = [], Ee = (e) => {
  let t, n, s, a, i, r, o = 0;
  const l = e.childNodes, d = l.length;
  for (; o < d; o++) {
    if (t = l[o], t["s-sr"] && (n = t["s-cr"]) && n.parentNode)
      for (s = n.parentNode.childNodes, a = t["s-sn"], r = s.length - 1; r >= 0; r--)
        n = s[r], !n["s-cn"] && !n["s-nr"] && n["s-hn"] !== t["s-hn"] && (ue(n, a) ? (i = w.find((h) => h.$nodeToRelocate$ === n), Y = !0, n["s-sn"] = n["s-sn"] || a, i ? i.$slotRefNode$ = t : w.push({
          $slotRefNode$: t,
          $nodeToRelocate$: n
        }), n["s-sr"] && w.map((h) => {
          ue(h.$nodeToRelocate$, n["s-sn"]) && (i = w.find((c) => c.$nodeToRelocate$ === n), i && !h.$slotRefNode$ && (h.$slotRefNode$ = i.$slotRefNode$));
        })) : w.some((h) => h.$nodeToRelocate$ === n) || w.push({
          $nodeToRelocate$: n
        }));
    t.nodeType === 1 && Ee(t);
  }
}, ue = (e, t) => e.nodeType === 1 ? e.getAttribute("slot") === null && t === "" || e.getAttribute("slot") === t : e["s-sn"] === t ? !0 : t === "", Re = (e) => {
  e.$attrs$ && e.$attrs$.ref && e.$attrs$.ref(null), e.$children$ && e.$children$.map(Re);
}, Ot = (e, t) => {
  const n = e.$hostElement$, s = e.$cmpMeta$, a = e.$vnode$ || H(null, null), i = Tt(t) ? t : u(null, null, t);
  q = n.tagName, s.$attrsToReflect$ && (i.$attrs$ = i.$attrs$ || {}, s.$attrsToReflect$.map(([r, o]) => i.$attrs$[o] = n[r])), i.$tag$ = null, i.$flags$ |= 4, e.$vnode$ = i, i.$elm$ = a.$elm$ = n.shadowRoot || n, L = n["s-sc"], we = n["s-cr"], _e = (s.$flags$ & 1) !== 0, Y = !1, E(a, i);
  {
    if ($.$flags$ |= 1, V) {
      Ee(i.$elm$);
      let r, o, l, d, h, c, f = 0;
      for (; f < w.length; f++)
        r = w[f], o = r.$nodeToRelocate$, o["s-ol"] || (l = _.createTextNode(""), l["s-nr"] = o, o.parentNode.insertBefore(o["s-ol"] = l, o));
      for (f = 0; f < w.length; f++)
        if (r = w[f], o = r.$nodeToRelocate$, r.$slotRefNode$) {
          for (d = r.$slotRefNode$.parentNode, h = r.$slotRefNode$.nextSibling, l = o["s-ol"]; l = l.previousSibling; )
            if (c = l["s-nr"], c && c["s-sn"] === o["s-sn"] && d === c.parentNode && (c = c.nextSibling, !c || !c["s-nr"])) {
              h = c;
              break;
            }
          (!h && d !== o.parentNode || o.nextSibling !== h) && o !== h && (!o["s-hn"] && o["s-ol"] && (o["s-hn"] = o["s-ol"].parentNode.nodeName), d.insertBefore(o, h));
        } else
          o.nodeType === 1 && (o.hidden = !0);
    }
    Y && Le(i.$elm$), $.$flags$ &= -2, w.length = 0;
  }
}, Bt = (e, t) => {
}, Ce = (e, t) => (e.$flags$ |= 16, Bt(e, e.$ancestorComponent$), un(() => Yt(e, t))), Yt = (e, t) => {
  const n = e.$hostElement$, s = T("scheduleUpdate", e.$cmpMeta$.$tagName$), a = n;
  let i;
  return t ? i = R(a, "componentWillLoad") : i = R(a, "componentWillUpdate"), i = he(i, () => R(a, "componentWillRender")), s(), he(i, () => Ht(e, a, t));
}, Ht = async (e, t, n) => {
  const s = e.$hostElement$, a = T("update", e.$cmpMeta$.$tagName$);
  s["s-rc"], n && It(e);
  const i = T("render", e.$cmpMeta$.$tagName$);
  jt(e, t), i(), a(), Ut(e);
}, jt = (e, t, n) => {
  try {
    ae = t, t = t.render && t.render(), e.$flags$ &= -17, e.$flags$ |= 2, (M.hasRenderFn || M.reflect) && (M.vdomRender || M.reflect) && (M.hydrateServerSide || Ot(e, t));
  } catch (o) {
    I(o, e.$hostElement$);
  }
  return ae = null, null;
}, Ut = (e) => {
  const t = e.$cmpMeta$.$tagName$, n = e.$hostElement$, s = T("postUpdate", t), a = n;
  e.$ancestorComponent$, R(a, "componentDidRender"), e.$flags$ & 64 ? (R(a, "componentDidUpdate"), s()) : (e.$flags$ |= 64, R(a, "componentDidLoad"), s());
}, R = (e, t, n) => {
  if (e && e[t])
    try {
      return e[t](n);
    } catch (s) {
      I(s);
    }
}, he = (e, t) => e && e.then ? e.then(t) : t(), Wt = (e, t) => G(e).$instanceValues$.get(t), qt = (e, t, n, s) => {
  const a = G(e), i = e, r = a.$instanceValues$.get(t), o = a.$flags$, l = i;
  n = Rt(n, s.$members$[t][0]);
  const d = Number.isNaN(r) && Number.isNaN(n);
  if (n !== r && !d) {
    a.$instanceValues$.set(t, n);
    {
      if (s.$watchers$ && o & 128) {
        const c = s.$watchers$[t];
        c && c.map((f) => {
          try {
            l[f](n, r, t);
          } catch (p) {
            I(p, i);
          }
        });
      }
      if ((o & 18) === 2) {
        if (l.componentShouldUpdate && l.componentShouldUpdate(n, r, t) === !1)
          return;
        Ce(a, !1);
      }
    }
  }
}, Gt = (e, t, n) => {
  if (t.$members$) {
    e.watchers && (t.$watchers$ = e.watchers);
    const s = Object.entries(t.$members$), a = e.prototype;
    s.map(([i, [r]]) => {
      (r & 31 || r & 32) && Object.defineProperty(a, i, {
        get() {
          return Wt(this, i);
        },
        set(o) {
          qt(this, i, o, t);
        },
        configurable: !0,
        enumerable: !0
      });
    });
    {
      const i = /* @__PURE__ */ new Map();
      a.attributeChangedCallback = function(r, o, l) {
        $.jmp(() => {
          const d = i.get(r);
          if (this.hasOwnProperty(d))
            l = this[d], delete this[d];
          else if (a.hasOwnProperty(d) && typeof this[d] == "number" && this[d] == l)
            return;
          this[d] = l === null && typeof this[d] == "boolean" ? !1 : l;
        });
      }, e.observedAttributes = s.filter(
        ([r, o]) => o[0] & 15
        /* MEMBER_FLAGS.HasAttribute */
      ).map(([r, o]) => {
        const l = o[1] || r;
        return i.set(l, r), o[0] & 512 && t.$attrsToReflect$.push([r, l]), l;
      });
    }
  }
  return e;
}, Xt = async (e, t, n, s, a) => {
  if ((t.$flags$ & 32) === 0 && (a = e.constructor, t.$flags$ |= 32, customElements.whenDefined(n.$tagName$).then(() => t.$flags$ |= 128), a.style)) {
    let r = a.style;
    typeof r != "string" && (r = r[t.$modeName$ = Et(e)]);
    const o = De(n, t.$modeName$);
    if (!U.has(o)) {
      const l = T("registerStyles", n.$tagName$);
      Pt(o, r, !!(n.$flags$ & 1)), l();
    }
  }
  t.$ancestorComponent$, Ce(t, !0);
}, Kt = (e) => {
}, Zt = (e) => {
  if (($.$flags$ & 1) === 0) {
    const t = G(e), n = t.$cmpMeta$, s = T("connectedCallback", n.$tagName$);
    t.$flags$ & 1 ? (Fe(e, t, n.$listeners$), Kt(t.$lazyInstance$)) : (t.$flags$ |= 1, n.$flags$ & 12 && Jt(e), n.$members$ && Object.entries(n.$members$).map(([a, [i]]) => {
      if (i & 31 && e.hasOwnProperty(a)) {
        const r = e[a];
        delete e[a], e[a] = r;
      }
    }), Xt(e, t, n)), s();
  }
}, Jt = (e) => {
  const t = e["s-cr"] = _.createComment("");
  t["s-cn"] = !0, e.insertBefore(t, e.firstChild);
}, Qt = (e) => {
  if (($.$flags$ & 1) === 0) {
    const t = G(e);
    t.$rmListeners$ && (t.$rmListeners$.map((n) => n()), t.$rmListeners$ = void 0);
  }
}, Vt = (e, t) => {
  const n = {
    $flags$: t[0],
    $tagName$: t[1]
  };
  n.$members$ = t[2], n.$listeners$ = t[3], n.$watchers$ = e.$watchers$, n.$attrsToReflect$ = [];
  const s = e.prototype.connectedCallback, a = e.prototype.disconnectedCallback;
  return Object.assign(e.prototype, {
    __registerHost() {
      sn(this, n);
    },
    connectedCallback() {
      Zt(this), s && s.call(this);
    },
    disconnectedCallback() {
      Qt(this), a && a.call(this);
    },
    __attachShadow() {
      this.attachShadow({
        mode: "open",
        delegatesFocus: !!(n.$flags$ & 16)
      });
    }
  }), e.is = n.$tagName$, Gt(e, n);
}, Fe = (e, t, n, s) => {
  n && n.map(([a, i, r]) => {
    const o = tn(e, a), l = en(t, r), d = nn(a);
    $.ael(o, i, l, d), (t.$rmListeners$ = t.$rmListeners$ || []).push(() => $.rel(o, i, l, d));
  });
}, en = (e, t) => (n) => {
  try {
    M.lazyLoad || e.$hostElement$[t](n);
  } catch (s) {
    I(s);
  }
}, tn = (e, t) => t & 4 ? _ : t & 8 ? X : t & 16 ? _.body : e, nn = (e) => rn ? {
  passive: (e & 1) !== 0,
  capture: (e & 2) !== 0
} : (e & 2) !== 0, Pe = /* @__PURE__ */ new WeakMap(), G = (e) => Pe.get(e), sn = (e, t) => {
  const n = {
    $flags$: 0,
    $hostElement$: e,
    $cmpMeta$: t,
    $instanceValues$: /* @__PURE__ */ new Map()
  };
  return Fe(e, n, t.$listeners$), Pe.set(e, n);
}, fe = (e, t) => t in e, I = (e, t) => (0, console.error)(e, t), U = /* @__PURE__ */ new Map(), an = [], X = typeof window < "u" ? window : {}, _ = X.document || { head: {} };
X.HTMLElement;
const $ = {
  $flags$: 0,
  $resourcesUrl$: "",
  jmp: (e) => e(),
  raf: (e) => requestAnimationFrame(e),
  ael: (e, t, n, s) => e.addEventListener(t, n, s),
  rel: (e, t, n, s) => e.removeEventListener(t, n, s),
  ce: (e, t) => new CustomEvent(e, t)
}, rn = /* @__PURE__ */ (() => {
  let e = !1;
  try {
    _.addEventListener("e", null, Object.defineProperty({}, "passive", {
      get() {
        e = !0;
      }
    }));
  } catch {
  }
  return e;
})(), on = (e) => Promise.resolve(e), ln = /* @__PURE__ */ (() => {
  try {
    return new CSSStyleSheet(), typeof new CSSStyleSheet().replaceSync == "function";
  } catch {
  }
  return !1;
})(), pe = [], Ae = [], dn = (e, t) => (n) => {
  e.push(n), Z || (Z = !0, $.$flags$ & 4 ? cn(J) : $.raf(J));
}, ge = (e) => {
  for (let t = 0; t < e.length; t++)
    try {
      e[t](performance.now());
    } catch (n) {
      I(n);
    }
  e.length = 0;
}, J = () => {
  ge(pe), ge(Ae), (Z = pe.length > 0) && $.raf(J);
}, cn = (e) => on().then(e), un = /* @__PURE__ */ dn(Ae), hn = /^(\d{4})-(\d{2})-(\d{2})$/;
var C;
(function(e) {
  e[e.Sunday = 0] = "Sunday", e[e.Monday = 1] = "Monday", e[e.Tuesday = 2] = "Tuesday", e[e.Wednesday = 3] = "Wednesday", e[e.Thursday = 4] = "Thursday", e[e.Friday = 5] = "Friday", e[e.Saturday = 6] = "Saturday";
})(C || (C = {}));
function Ie(e, t, n) {
  var s = parseInt(n, 10), a = parseInt(t, 10), i = parseInt(e, 10);
  if (Number.isInteger(i) && // all parts should be integers
  Number.isInteger(a) && Number.isInteger(s) && a > 0 && // month must be 1-12
  a <= 12 && s > 0 && // day must be 1-31
  s <= 31 && i > 0)
    return new Date(i, a - 1, s);
}
function D(e) {
  if (!e)
    return;
  const t = e.match(hn);
  if (t)
    return Ie(t[1], t[2], t[3]);
}
function ze(e) {
  if (!e)
    return "";
  var t = e.getDate().toString(10), n = (e.getMonth() + 1).toString(10), s = e.getFullYear().toString(10);
  return e.getDate() < 10 && (t = `0${t}`), e.getMonth() < 9 && (n = `0${n}`), `${s}-${n}-${t}`;
}
function W(e, t) {
  return e == null || t == null ? !1 : Ne(e, t) && e.getDate() === t.getDate();
}
function Ne(e, t) {
  return e == null || t == null ? !1 : e.getFullYear() === t.getFullYear() && e.getMonth() === t.getMonth();
}
function Oe(e, t) {
  var n = new Date(e);
  return n.setDate(n.getDate() + t), n;
}
function Be(e, t = C.Monday) {
  var n = new Date(e), s = n.getDay(), a = (s < t ? 7 : 0) + s - t;
  return n.setDate(n.getDate() - a), n;
}
function Ye(e, t = C.Monday) {
  var n = new Date(e), s = n.getDay(), a = (s < t ? -7 : 0) + 6 - (s - t);
  return n.setDate(n.getDate() + a), n;
}
function N(e) {
  return new Date(e.getFullYear(), e.getMonth(), 1);
}
function O(e) {
  return new Date(e.getFullYear(), e.getMonth() + 1, 0);
}
function me(e, t) {
  const n = new Date(e);
  return n.setMonth(t), n;
}
function $e(e, t) {
  const n = new Date(e);
  return n.setFullYear(t), n;
}
function Q(e, t, n) {
  return B(e, t, n) === e;
}
function B(e, t, n) {
  const s = e.getTime();
  return t && t instanceof Date && s < t.getTime() ? t : n && n instanceof Date && s > n.getTime() ? n : e;
}
function fn(e, t) {
  const n = [];
  let s = e;
  for (; !W(s, t); )
    n.push(s), s = Oe(s, 1);
  return n.push(s), n;
}
function pn(e, t = C.Monday) {
  const n = Be(N(e), t), s = Ye(O(e), t);
  return fn(n, s);
}
function k() {
  return Math.random().toString(16).slice(-4);
}
function K(e) {
  return `${e}-${k()}${k()}-${k()}-${k()}-${k()}-${k()}${k()}${k()}`;
}
const gn = ({ onClick: e, dateFormatter: t, localization: n, name: s, formattedValue: a, valueAsDate: i, value: r, identifier: o, disabled: l, required: d, role: h, buttonRef: c, inputRef: f, onInput: p, onBlur: g, onFocus: m }) => u(
  "div",
  { class: "duet-date__input-wrapper" },
  u("input", { class: "duet-date__input", value: a, placeholder: n.placeholder, id: o, disabled: l, role: h, required: d ? !0 : void 0, "aria-autocomplete": "none", onInput: p, onFocus: m, onBlur: g, autoComplete: "off", ref: f }),
  u("input", { type: "hidden", name: s, value: r }),
  u(
    "button",
    { class: "duet-date__toggle", onClick: e, disabled: l, ref: c, type: "button" },
    u(
      "span",
      { class: "duet-date__toggle-icon" },
      u(
        "svg",
        { "aria-hidden": "true", height: "24", viewBox: "0 0 21 21", width: "24", xmlns: "http://www.w3.org/2000/svg" },
        u(
          "g",
          { fill: "none", "fill-rule": "evenodd", transform: "translate(2 2)" },
          u("path", { d: "m2.5.5h12c1.1045695 0 2 .8954305 2 2v12c0 1.1045695-.8954305 2-2 2h-12c-1.1045695 0-2-.8954305-2-2v-12c0-1.1045695.8954305-2 2-2z", stroke: "currentColor", "stroke-linecap": "round", "stroke-linejoin": "round" }),
          u("path", { d: "m.5 4.5h16", stroke: "currentColor", "stroke-linecap": "round", "stroke-linejoin": "round" }),
          u(
            "g",
            { fill: "currentColor" },
            u("circle", { cx: "8.5", cy: "8.5", r: "1" }),
            u("circle", { cx: "4.5", cy: "8.5", r: "1" }),
            u("circle", { cx: "12.5", cy: "8.5", r: "1" }),
            u("circle", { cx: "8.5", cy: "12.5", r: "1" }),
            u("circle", { cx: "4.5", cy: "12.5", r: "1" }),
            u("circle", { cx: "12.5", cy: "12.5", r: "1" })
          )
        )
      )
    ),
    u(
      "span",
      { class: "duet-date__vhidden" },
      n.buttonLabel,
      i && u(
        "span",
        null,
        ", ",
        n.selectedDateMessage,
        " ",
        t.format(i)
      )
    )
  )
), mn = ({ focusedDay: e, today: t, day: n, onDaySelect: s, onKeyboardNavigation: a, focusedDayRef: i, disabled: r, inRange: o, isSelected: l, dateFormatter: d }) => {
  const h = W(n, t), c = Ne(n, e), f = W(n, e), p = !o;
  function g(m) {
    s(m, n);
  }
  return u(
    "button",
    { class: {
      "duet-date__day": !0,
      "is-outside": p,
      "is-today": h,
      "is-month": c,
      "is-disabled": r
    }, tabIndex: f ? 0 : -1, onClick: g, onKeyDown: a, "aria-disabled": r ? "true" : void 0, disabled: p, type: "button", "aria-pressed": l ? "true" : "false", ref: (m) => {
      f && m && i && i(m);
    } },
    u("span", { "aria-hidden": "true" }, n.getDate()),
    u("span", { class: "duet-date__vhidden" }, d.format(n))
  );
};
function $n(e, t) {
  const n = [];
  for (let s = 0; s < e.length; s += t)
    n.push(e.slice(s, s + t));
  return n;
}
function yn(e, t, n) {
  return e.map((s, a) => {
    const i = (a + t) % e.length;
    return n(e[i]);
  });
}
const vn = ({ selectedDate: e, focusedDate: t, labelledById: n, localization: s, firstDayOfWeek: a, min: i, max: r, dateFormatter: o, isDateDisabled: l, onDateSelect: d, onKeyboardNavigation: h, focusedDayRef: c }) => {
  const f = /* @__PURE__ */ new Date(), p = pn(t, a);
  return u(
    "table",
    { class: "duet-date__table", "aria-labelledby": n },
    u(
      "thead",
      null,
      u("tr", null, yn(s.dayNames, a, (g) => u(
        "th",
        { class: "duet-date__table-header", scope: "col" },
        u("span", { "aria-hidden": "true" }, g.substr(0, 2)),
        u("span", { class: "duet-date__vhidden" }, g)
      )))
    ),
    u("tbody", null, $n(p, 7).map((g) => u("tr", { class: "duet-date__row" }, g.map((m) => u(
      "td",
      { class: "duet-date__cell" },
      u(mn, { day: m, today: f, focusedDay: t, isSelected: W(m, e), disabled: l(m), inRange: Q(m, i, r), onDaySelect: d, dateFormatter: o, onKeyboardNavigation: h, focusedDayRef: c })
    )))))
  );
}, bn = {
  buttonLabel: "Choose date",
  placeholder: "YYYY-MM-DD",
  selectedDateMessage: "Selected date is",
  prevMonthLabel: "Previous month",
  nextMonthLabel: "Next month",
  monthSelectLabel: "Month",
  yearSelectLabel: "Year",
  closeLabel: "Close window",
  calendarHeading: "Choose a date",
  dayNames: ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"],
  monthNames: [
    "January",
    "February",
    "March",
    "April",
    "May",
    "June",
    "July",
    "August",
    "September",
    "October",
    "November",
    "December"
  ],
  monthNamesShort: ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"],
  locale: "en-GB"
}, wn = { parse: D, format: ze }, _n = '.duet-date *,.duet-date *::before,.duet-date *::after{box-sizing:border-box;margin:0;width:auto}.duet-date{box-sizing:border-box;color:var(--duet-color-text);display:block;font-family:var(--duet-font);margin:0;position:relative;text-align:left;width:100%}.duet-date__input{-webkit-appearance:none;appearance:none;background:var(--duet-color-surface);border:1px solid var(--duet-color-border, var(--duet-color-text));border-radius:var(--duet-radius);color:var(--duet-color-text);float:none;font-family:var(--duet-font);font-size:100%;line-height:normal;padding:14px 60px 14px 14px;width:100%}.duet-date__input:focus{border-color:var(--duet-color-primary);box-shadow:0 0 0 1px var(--duet-color-primary);outline:0}.duet-date__input::-webkit-input-placeholder{color:var(--duet-color-placeholder);opacity:1}.duet-date__input:-moz-placeholder{color:var(--duet-color-placeholder);opacity:1}.duet-date__input:-ms-input-placeholder{color:var(--duet-color-placeholder)}.duet-date__input-wrapper{position:relative;width:100%}.duet-date__toggle{-moz-appearance:none;-webkit-appearance:none;-webkit-user-select:none;align-items:center;appearance:none;background:var(--duet-color-button);border:0;border-radius:0;border-bottom-right-radius:var(--duet-radius);border-top-right-radius:var(--duet-radius);box-shadow:inset 1px 0 0 rgba(0, 0, 0, 0.1);color:var(--duet-color-text);cursor:pointer;display:flex;height:calc(100% - 2px);justify-content:center;padding:0;position:absolute;right:1px;top:1px;user-select:none;width:48px;z-index:2}.duet-date__toggle:focus{box-shadow:0 0 0 2px var(--duet-color-primary);outline:0}.duet-date__toggle-icon{display:flex;flex-basis:100%;justify-content:center;align-items:center}.duet-date__dialog{display:flex;left:0;min-width:320px;opacity:0;position:absolute;top:100%;transform:scale(0.96) translateZ(0) translateY(-20px);transform-origin:top right;transition:transform 300ms ease, opacity 300ms ease, visibility 300ms ease;visibility:hidden;width:100%;will-change:transform, opacity, visibility;z-index:var(--duet-z-index)}@media (max-width: 35.9375em){.duet-date__dialog{background:var(--duet-color-overlay);bottom:0;position:fixed;right:0;top:0;transform:translateZ(0);transform-origin:bottom center}}.duet-date__dialog.is-left{left:auto;right:0;width:auto}.duet-date__dialog.is-active{opacity:1;transform:scale(1.0001) translateZ(0) translateY(0);visibility:visible}.duet-date__dialog-content{background:var(--duet-color-surface);border:1px solid rgba(0, 0, 0, 0.1);border-radius:var(--duet-radius);box-shadow:0 4px 10px 0 rgba(0, 0, 0, 0.1);margin-left:auto;margin-top:8px;max-width:310px;min-width:290px;padding:16px 16px 20px;position:relative;transform:none;width:100%;z-index:var(--duet-z-index)}@media (max-width: 35.9375em){.duet-date__dialog-content{border:0;border-radius:0;border-top-left-radius:var(--duet-radius);border-top-right-radius:var(--duet-radius);bottom:0;left:0;margin:0;max-width:none;min-height:26em;opacity:0;padding:0 8% 20px;position:absolute;transform:translateZ(0) translateY(100%);transition:transform 400ms ease, opacity 400ms ease, visibility 400ms ease;visibility:hidden;will-change:transform, opacity, visibility}.is-active .duet-date__dialog-content{opacity:1;transform:translateZ(0) translateY(0);visibility:visible}}.duet-date__table{border-collapse:collapse;border-spacing:0;color:var(--duet-color-text);font-size:1rem;font-weight:var(--duet-font-normal);line-height:1.25;text-align:center;width:100%}.duet-date__table-header{font-size:0.75rem;font-weight:var(--duet-font-bold);letter-spacing:1px;line-height:1.25;padding-bottom:8px;text-decoration:none;text-transform:uppercase}.duet-date__cell{text-align:center}.duet-date__day{-moz-appearance:none;-webkit-appearance:none;appearance:none;background:transparent;border:0;border-radius:50%;color:var(--duet-color-text);cursor:pointer;display:inline-block;font-family:var(--duet-font);font-size:0.875rem;font-variant-numeric:tabular-nums;font-weight:var(--duet-font-normal);height:36px;line-height:1.25;padding:0 0 1px;position:relative;text-align:center;vertical-align:middle;width:36px;z-index:1}.duet-date__day.is-today{box-shadow:0 0 0 1px var(--duet-color-primary);position:relative;z-index:200}.duet-date__day:hover::before,.duet-date__day.is-today::before{background:var(--duet-color-primary);border-radius:50%;bottom:0;content:"";left:0;opacity:0.06;position:absolute;right:0;top:0}.duet-date__day[aria-pressed=true],.duet-date__day:focus{background:var(--duet-color-primary);box-shadow:none;color:var(--duet-color-text-active);outline:0}.duet-date__day:active{background:var(--duet-color-primary);box-shadow:0 0 5px var(--duet-color-primary);color:var(--duet-color-text-active);z-index:200}.duet-date__day:focus{box-shadow:0 0 5px var(--duet-color-primary);z-index:200}.duet-date__day:not(.is-month){box-shadow:none}.duet-date__day:not(.is-month),.duet-date__day[aria-disabled=true]{background:transparent;color:var(--duet-color-text);cursor:default;opacity:0.5}.duet-date__day[aria-disabled=true].is-today{box-shadow:0 0 0 1px var(--duet-color-primary)}.duet-date__day[aria-disabled=true].is-today:focus{box-shadow:0 0 5px var(--duet-color-primary);background:var(--duet-color-primary);color:var(--duet-color-text-active)}.duet-date__day[aria-disabled=true]:not(.is-today)::before{display:none}.duet-date__day.is-outside{background:var(--duet-color-button);box-shadow:none;color:var(--duet-color-text);cursor:default;opacity:0.6;pointer-events:none}.duet-date__day.is-outside::before{display:none}.duet-date__header{align-items:center;display:flex;justify-content:space-between;margin-bottom:16px;width:100%}.duet-date__nav{white-space:nowrap}.duet-date__prev,.duet-date__next{-moz-appearance:none;-webkit-appearance:none;align-items:center;appearance:none;background:var(--duet-color-button);border:0;border-radius:50%;color:var(--duet-color-text);cursor:pointer;display:inline-flex;height:32px;justify-content:center;margin-left:8px;padding:0;transition:background-color 300ms ease;width:32px}@media (max-width: 35.9375em){.duet-date__prev,.duet-date__next{height:40px;width:40px}}.duet-date__prev:focus,.duet-date__next:focus{box-shadow:0 0 0 2px var(--duet-color-primary);outline:0}.duet-date__prev:active:focus,.duet-date__next:active:focus{box-shadow:none}.duet-date__prev:disabled,.duet-date__next:disabled{cursor:default;opacity:0.5}.duet-date__prev svg,.duet-date__next svg{margin:0 auto}.duet-date__select{display:inline-flex;margin-top:4px;position:relative}.duet-date__select span{margin-right:4px}.duet-date__select select{cursor:pointer;font-size:1rem;height:100%;left:0;opacity:0;position:absolute;top:0;width:100%;z-index:2}.duet-date__select select:focus+.duet-date__select-label{box-shadow:0 0 0 2px var(--duet-color-primary)}.duet-date__select-label{align-items:center;border-radius:var(--duet-radius);color:var(--duet-color-text);display:flex;font-size:1.25rem;font-weight:var(--duet-font-bold);line-height:1.25;padding:0 4px 0 8px;pointer-events:none;position:relative;width:100%;z-index:1}.duet-date__select-label svg{width:16px;height:16px}.duet-date__mobile{align-items:center;border-bottom:1px solid rgba(0, 0, 0, 0.12);display:flex;justify-content:space-between;margin-bottom:20px;margin-left:-10%;overflow:hidden;padding:12px 20px;position:relative;text-overflow:ellipsis;white-space:nowrap;width:120%}@media (min-width: 36em){.duet-date__mobile{border:0;margin:0;overflow:visible;padding:0;position:absolute;right:-8px;top:-8px;width:auto}}.duet-date__mobile-heading{display:inline-block;font-weight:var(--duet-font-bold);max-width:84%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}@media (min-width: 36em){.duet-date__mobile-heading{display:none}}.duet-date__close{-webkit-appearance:none;align-items:center;appearance:none;background:var(--duet-color-button);border:0;border-radius:50%;color:var(--duet-color-text);cursor:pointer;display:flex;height:24px;justify-content:center;padding:0;width:24px}@media (min-width: 36em){.duet-date__close{opacity:0}}.duet-date__close:focus{box-shadow:0 0 0 2px var(--duet-color-primary);outline:none}@media (min-width: 36em){.duet-date__close:focus{opacity:1}}.duet-date__close svg{margin:0 auto}.duet-date__vhidden{border:0;clip:rect(1px, 1px, 1px, 1px);height:1px;overflow:hidden;padding:0;position:absolute;top:0;width:1px}';
function xn(e, t) {
  for (var n = [], s = e; s <= t; s++)
    n.push(s);
  return n;
}
const b = {
  TAB: 9,
  ESC: 27,
  PAGE_UP: 33,
  PAGE_DOWN: 34,
  END: 35,
  HOME: 36,
  LEFT: 37,
  UP: 38,
  RIGHT: 39,
  DOWN: 40
};
function Dn(e, t) {
  const n = e.value, s = e.selectionStart, a = n.slice(0, s), i = n.slice(s, n.length), r = a.replace(t, ""), o = i.replace(t, ""), l = r + o, d = r.length;
  return e.value = l, e.selectionStart = e.selectionEnd = d, l;
}
const kn = /[^0-9\.\/\-]+/g, ye = 300, Sn = class extends HTMLElement {
  constructor() {
    super(), this.__registerHost(), this.duetChange = F(this, "duetChange"), this.duetBlur = F(this, "duetBlur"), this.duetFocus = F(this, "duetFocus"), this.duetOpen = F(this, "duetOpen"), this.duetClose = F(this, "duetClose"), this.monthSelectId = K("DuetDateMonth"), this.yearSelectId = K("DuetDateYear"), this.dialogLabelId = K("DuetDateLabel"), this.initialTouchX = null, this.initialTouchY = null, this.activeFocus = !1, this.focusedDay = /* @__PURE__ */ new Date(), this.open = !1, this.name = "date", this.identifier = "", this.disabled = !1, this.direction = "right", this.required = !1, this.value = "", this.min = "", this.max = "", this.firstDayOfWeek = C.Monday, this.localization = bn, this.dateAdapter = wn, this.isDateDisabled = () => !1, this.enableActiveFocus = () => {
      this.activeFocus = !0;
    }, this.disableActiveFocus = () => {
      this.activeFocus = !1;
    }, this.toggleOpen = (e) => {
      e.preventDefault(), this.open ? this.hide(!1) : this.show();
    }, this.handleEscKey = (e) => {
      e.keyCode === b.ESC && this.hide();
    }, this.handleBlur = (e) => {
      e.stopPropagation(), this.duetBlur.emit({
        component: "duet-date-picker"
      });
    }, this.handleFocus = (e) => {
      e.stopPropagation(), this.duetFocus.emit({
        component: "duet-date-picker"
      });
    }, this.handleTouchStart = (e) => {
      const t = e.changedTouches[0];
      this.initialTouchX = t.pageX, this.initialTouchY = t.pageY;
    }, this.handleTouchMove = (e) => {
      e.preventDefault();
    }, this.handleTouchEnd = (e) => {
      const t = e.changedTouches[0], n = t.pageX - this.initialTouchX, s = t.pageY - this.initialTouchY, a = 70, i = Math.abs(n) >= a && Math.abs(s) <= a, r = Math.abs(s) >= a && Math.abs(n) <= a && s > 0;
      i ? this.addMonths(n < 0 ? 1 : -1) : r && (this.hide(!1), e.preventDefault()), this.initialTouchY = null, this.initialTouchX = null;
    }, this.handleNextMonthClick = (e) => {
      e.preventDefault(), this.addMonths(1);
    }, this.handlePreviousMonthClick = (e) => {
      e.preventDefault(), this.addMonths(-1);
    }, this.handleFirstFocusableKeydown = (e) => {
      e.keyCode === b.TAB && e.shiftKey && (this.focusedDayNode.focus(), e.preventDefault());
    }, this.handleKeyboardNavigation = (e) => {
      if (e.keyCode === b.TAB && !e.shiftKey) {
        e.preventDefault(), this.firstFocusableElement.focus();
        return;
      }
      var t = !0;
      switch (e.keyCode) {
        case b.RIGHT:
          this.addDays(1);
          break;
        case b.LEFT:
          this.addDays(-1);
          break;
        case b.DOWN:
          this.addDays(7);
          break;
        case b.UP:
          this.addDays(-7);
          break;
        case b.PAGE_UP:
          e.shiftKey ? this.addYears(-1) : this.addMonths(-1);
          break;
        case b.PAGE_DOWN:
          e.shiftKey ? this.addYears(1) : this.addMonths(1);
          break;
        case b.HOME:
          this.startOfWeek();
          break;
        case b.END:
          this.endOfWeek();
          break;
        default:
          t = !1;
      }
      t && (e.preventDefault(), this.enableActiveFocus());
    }, this.handleDaySelect = (e, t) => {
      const n = Q(t, D(this.min), D(this.max)), s = !this.isDateDisabled(t);
      n && s ? (this.setValue(t), this.hide()) : this.setFocusedDay(t);
    }, this.handleMonthSelect = (e) => {
      this.setMonth(parseInt(e.target.value, 10));
    }, this.handleYearSelect = (e) => {
      this.setYear(parseInt(e.target.value, 10));
    }, this.handleInputChange = () => {
      const e = this.datePickerInput;
      Dn(e, kn);
      const t = this.dateAdapter.parse(e.value, Ie);
      (t || e.value === "") && this.setValue(t);
    }, this.processFocusedDayNode = (e) => {
      this.focusedDayNode = e, this.activeFocus && this.open && setTimeout(() => e.focus(), 0);
    };
  }
  connectedCallback() {
    this.createDateFormatters();
  }
  createDateFormatters() {
    this.dateFormatShort = new Intl.DateTimeFormat(this.localization.locale, { day: "numeric", month: "long" }), this.dateFormatLong = new Intl.DateTimeFormat(this.localization.locale, {
      day: "numeric",
      month: "long",
      year: "numeric"
    });
  }
  /**
   * Component event handling.
   */
  handleDocumentClick(e) {
    if (!this.open)
      return;
    e.composedPath().every((n) => n !== this.dialogWrapperNode && n !== this.datePickerButton) && this.hide(!1);
  }
  /**
   * Public methods API
   */
  /**
   * Sets focus on the date picker's input. Use this method instead of the global `focus()`.
   */
  async setFocus() {
    return this.datePickerInput.focus();
  }
  /**
   * Show the calendar modal, moving focus to the calendar inside.
   */
  async show() {
    this.open = !0, this.duetOpen.emit({
      component: "duet-date-picker"
    }), this.setFocusedDay(D(this.value) || /* @__PURE__ */ new Date()), clearTimeout(this.focusTimeoutId), this.focusTimeoutId = setTimeout(() => this.monthSelectNode.focus(), ye);
  }
  /**
   * Hide the calendar modal. Set `moveFocusToButton` to false to prevent focus
   * returning to the date picker's button. Default is true.
   */
  async hide(e = !0) {
    this.open = !1, this.duetClose.emit({
      component: "duet-date-picker"
    }), clearTimeout(this.focusTimeoutId), e && setTimeout(() => this.datePickerButton.focus(), ye + 200);
  }
  addDays(e) {
    this.setFocusedDay(Oe(this.focusedDay, e));
  }
  addMonths(e) {
    this.setMonth(this.focusedDay.getMonth() + e);
  }
  addYears(e) {
    this.setYear(this.focusedDay.getFullYear() + e);
  }
  startOfWeek() {
    this.setFocusedDay(Be(this.focusedDay, this.firstDayOfWeek));
  }
  endOfWeek() {
    this.setFocusedDay(Ye(this.focusedDay, this.firstDayOfWeek));
  }
  setMonth(e) {
    const t = me(N(this.focusedDay), e), n = O(t), s = me(this.focusedDay, e);
    this.setFocusedDay(B(s, t, n));
  }
  setYear(e) {
    const t = $e(N(this.focusedDay), e), n = O(t), s = $e(this.focusedDay, e);
    this.setFocusedDay(B(s, t, n));
  }
  setFocusedDay(e) {
    this.focusedDay = B(e, D(this.min), D(this.max));
  }
  setValue(e) {
    this.value = ze(e), this.duetChange.emit({
      component: "duet-date-picker",
      value: this.value,
      valueAsDate: e
    });
  }
  /**
   * render() function
   * Always the last one in the class.
   */
  render() {
    const e = D(this.value), t = e && this.dateAdapter.format(e), n = (e || this.focusedDay).getFullYear(), s = this.focusedDay.getMonth(), a = this.focusedDay.getFullYear(), i = D(this.min), r = D(this.max), o = i != null && i.getMonth() === s && i.getFullYear() === a, l = r != null && r.getMonth() === s && r.getFullYear() === a, d = i ? i.getFullYear() : n - 10, h = r ? r.getFullYear() : n + 10;
    return u(xe, null, u("div", { class: "duet-date" }, u(gn, { dateFormatter: this.dateFormatLong, value: this.value, valueAsDate: e, formattedValue: t, onInput: this.handleInputChange, onBlur: this.handleBlur, onFocus: this.handleFocus, onClick: this.toggleOpen, name: this.name, disabled: this.disabled, role: this.role, required: this.required, identifier: this.identifier, localization: this.localization, buttonRef: (c) => this.datePickerButton = c, inputRef: (c) => this.datePickerInput = c }), u("div", { class: {
      "duet-date__dialog": !0,
      "is-left": this.direction === "left",
      "is-active": this.open
    }, role: "dialog", "aria-modal": "true", "aria-hidden": this.open ? "false" : "true", "aria-labelledby": this.dialogLabelId, onTouchMove: this.handleTouchMove, onTouchStart: this.handleTouchStart, onTouchEnd: this.handleTouchEnd }, u("div", { class: "duet-date__dialog-content", onKeyDown: this.handleEscKey, ref: (c) => this.dialogWrapperNode = c }, u("div", { class: "duet-date__mobile", onFocusin: this.disableActiveFocus }, u("label", { class: "duet-date__mobile-heading" }, this.localization.calendarHeading), u("button", { class: "duet-date__close", ref: (c) => this.firstFocusableElement = c, onKeyDown: this.handleFirstFocusableKeydown, onClick: () => this.hide(), type: "button" }, u("svg", { "aria-hidden": "true", fill: "currentColor", xmlns: "http://www.w3.org/2000/svg", width: "16", height: "16", viewBox: "0 0 24 24" }, u("path", { d: "M0 0h24v24H0V0z", fill: "none" }), u("path", { d: "M18.3 5.71c-.39-.39-1.02-.39-1.41 0L12 10.59 7.11 5.7c-.39-.39-1.02-.39-1.41 0-.39.39-.39 1.02 0 1.41L10.59 12 5.7 16.89c-.39.39-.39 1.02 0 1.41.39.39 1.02.39 1.41 0L12 13.41l4.89 4.89c.39.39 1.02.39 1.41 0 .39-.39.39-1.02 0-1.41L13.41 12l4.89-4.89c.38-.38.38-1.02 0-1.4z" })), u("span", { class: "duet-date__vhidden" }, this.localization.closeLabel))), u("div", { class: "duet-date__header", onFocusin: this.disableActiveFocus }, u("div", null, u("h2", { id: this.dialogLabelId, class: "duet-date__vhidden", "aria-live": "polite", "aria-atomic": "true" }, this.localization.monthNames[s], " ", this.focusedDay.getFullYear()), u("label", { htmlFor: this.monthSelectId, class: "duet-date__vhidden" }, this.localization.monthSelectLabel), u("div", { class: "duet-date__select" }, u("select", { id: this.monthSelectId, class: "duet-date__select--month", ref: (c) => this.monthSelectNode = c, onChange: this.handleMonthSelect }, this.localization.monthNames.map((c, f) => u("option", { key: c, value: f, selected: f === s, disabled: !Q(new Date(a, f, 1), i ? N(i) : null, r ? O(r) : null) }, c))), u("div", { class: "duet-date__select-label", "aria-hidden": "true" }, u("span", null, this.localization.monthNamesShort[s]), u("svg", { fill: "currentColor", xmlns: "http://www.w3.org/2000/svg", width: "16", height: "16", viewBox: "0 0 24 24" }, u("path", { d: "M8.12 9.29L12 13.17l3.88-3.88c.39-.39 1.02-.39 1.41 0 .39.39.39 1.02 0 1.41l-4.59 4.59c-.39.39-1.02.39-1.41 0L6.7 10.7c-.39-.39-.39-1.02 0-1.41.39-.38 1.03-.39 1.42 0z" })))), u("label", { htmlFor: this.yearSelectId, class: "duet-date__vhidden" }, this.localization.yearSelectLabel), u("div", { class: "duet-date__select" }, u("select", { id: this.yearSelectId, class: "duet-date__select--year", onChange: this.handleYearSelect }, xn(d, h).map((c) => u("option", { key: c, selected: c === a }, c))), u("div", { class: "duet-date__select-label", "aria-hidden": "true" }, u("span", null, this.focusedDay.getFullYear()), u("svg", { fill: "currentColor", xmlns: "http://www.w3.org/2000/svg", width: "16", height: "16", viewBox: "0 0 24 24" }, u("path", { d: "M8.12 9.29L12 13.17l3.88-3.88c.39-.39 1.02-.39 1.41 0 .39.39.39 1.02 0 1.41l-4.59 4.59c-.39.39-1.02.39-1.41 0L6.7 10.7c-.39-.39-.39-1.02 0-1.41.39-.38 1.03-.39 1.42 0z" }))))), u("div", { class: "duet-date__nav" }, u("button", { class: "duet-date__prev", onClick: this.handlePreviousMonthClick, disabled: o, type: "button" }, u("svg", { "aria-hidden": "true", fill: "currentColor", xmlns: "http://www.w3.org/2000/svg", width: "21", height: "21", viewBox: "0 0 24 24" }, u("path", { d: "M14.71 15.88L10.83 12l3.88-3.88c.39-.39.39-1.02 0-1.41-.39-.39-1.02-.39-1.41 0L8.71 11.3c-.39.39-.39 1.02 0 1.41l4.59 4.59c.39.39 1.02.39 1.41 0 .38-.39.39-1.03 0-1.42z" })), u("span", { class: "duet-date__vhidden" }, this.localization.prevMonthLabel)), u("button", { class: "duet-date__next", onClick: this.handleNextMonthClick, disabled: l, type: "button" }, u("svg", { "aria-hidden": "true", fill: "currentColor", xmlns: "http://www.w3.org/2000/svg", width: "21", height: "21", viewBox: "0 0 24 24" }, u("path", { d: "M9.29 15.88L13.17 12 9.29 8.12c-.39-.39-.39-1.02 0-1.41.39-.39 1.02-.39 1.41 0l4.59 4.59c.39.39.39 1.02 0 1.41L10.7 17.3c-.39.39-1.02.39-1.41 0-.38-.39-.39-1.03 0-1.42z" })), u("span", { class: "duet-date__vhidden" }, this.localization.nextMonthLabel)))), u(vn, { dateFormatter: this.dateFormatShort, selectedDate: e, focusedDate: this.focusedDay, onDateSelect: this.handleDaySelect, onKeyboardNavigation: this.handleKeyboardNavigation, labelledById: this.dialogLabelId, localization: this.localization, firstDayOfWeek: this.firstDayOfWeek, focusedDayRef: this.processFocusedDayNode, min: i, max: r, isDateDisabled: this.isDateDisabled })))));
  }
  get element() {
    return this;
  }
  static get watchers() {
    return {
      localization: ["createDateFormatters"]
    };
  }
  static get style() {
    return _n;
  }
}, Tn = /* @__PURE__ */ Vt(Sn, [0, "duet-date-picker", { name: [1], identifier: [1], disabled: [516], role: [1], direction: [1], required: [4], value: [1537], min: [1], max: [1], firstDayOfWeek: [2, "first-day-of-week"], localization: [16], dateAdapter: [16], isDateDisabled: [16], activeFocus: [32], focusedDay: [32], open: [32] }, [[6, "click", "handleDocumentClick"]]]), ve = (e) => {
  typeof customElements < "u" && [
    Tn
  ].forEach((t) => {
    customElements.get(t.is) || customElements.define(t.is, t, e);
  });
};
class He {
  constructor() {
    this.editor = _t, this.cellTemplate = bt, ve?.();
  }
}
typeof window < "u" && (window.RevoColumnType = He);
const Mn = [
  { prop: "name", name: "Task", size: 220, sortable: !0 },
  { prop: "startDate", name: "Start", size: 130, columnType: "date", sortable: !0 },
  { prop: "endDate", name: "End", size: 130, columnType: "date", sortable: !0 }
];
function Ln(e) {
  return e.map((t) => ({
    ...t,
    pin: t.pin ?? "colPinStart",
    sortable: t.sortable ?? !0,
    ...t.prop === "startDate" || t.prop === "endDate" ? { columnType: "date" } : {}
  }));
}
function En(e, t) {
  return [
    ...Ln(
      e.length ? e : Mn
    ),
    yt(t)
  ];
}
function Rn(e, t, n) {
  return {
    ...e ?? {},
    date: e?.date ?? new He(),
    gantt: $t(t, n)
  };
}
function Cn(e) {
  return {
    source: [...e.source ?? []],
    columns: [...e.columns ?? []],
    columnTypes: { ...e.columnTypes ?? {} },
    resize: e.resize,
    inlinePosition: e.style.position
  };
}
function Fn(e, t) {
  e.source = t.source, e.columns = t.columns, e.columnTypes = t.columnTypes, e.resize = t.resize, e.style.position = t.inlinePosition;
}
function Pn(e, t) {
  let n = e.gantt, s = e.ganttDependencies ?? [];
  return Object.defineProperty(e, "gantt", {
    configurable: !0,
    enumerable: !0,
    get: () => n,
    set: (a) => {
      n = a, t();
    }
  }), Object.defineProperty(e, "ganttDependencies", {
    configurable: !0,
    enumerable: !0,
    get: () => s,
    set: (a) => {
      s = a ?? [], t();
    }
  }), {
    getConfig: () => n,
    getDependencies: () => s,
    restore: () => {
      Object.defineProperty(e, "gantt", {
        configurable: !0,
        enumerable: !0,
        writable: !0,
        value: n
      }), Object.defineProperty(e, "ganttDependencies", {
        configurable: !0,
        enumerable: !0,
        writable: !0,
        value: s
      });
    }
  };
}
class Bn extends je {
  original;
  elementProperties;
  dependencyLayer;
  rawSource;
  scale = null;
  rows = [];
  applying = !1;
  frameRequest = 0;
  activeRangeEdit = null;
  boundPointerDown = (t) => this.startRangeEdit(t);
  boundPointerMove = (t) => this.handleRangePointerMove(t);
  boundPointerUp = (t) => this.endRangeEdit(t);
  /** Create the plugin and immediately project the current grid source. */
  constructor(t, n) {
    super(t, n), this.original = Cn(t), this.rawSource = this.original.source, t.style.position || (t.style.position = "relative"), this.dependencyLayer = new ht(t, n), this.elementProperties = Pn(t, () => this.requestRender()), this.watch("source", (s) => {
      this.applying || !Array.isArray(s) || (this.rawSource = s, this.requestRender());
    }), this.addEventListener("beforecellfocus", (s) => {
      s.detail.column?.prop === "__ganttTimeline" && s.preventDefault();
    }), this.addEventListener("aftergridrender", () => {
      this.renderDependencies();
    }), this.addEventListener("scrollviewport", () => {
      this.renderDependencies();
    }), this.addEventListener("aftersortingapply", () => {
      this.renderDependencies();
    }), this.addEventListener("afterfilterapply", () => {
      this.renderDependencies();
    }), this.addEventListener("aftertrimmed", () => {
      this.renderDependencies();
    }), this.addEventListener("afteredit", () => {
      this.syncRawSourceFromGrid();
    }), this.addEventListener("afteranysource", () => {
      this.applying || this.syncRawSourceFromGrid();
    }), t.addEventListener("pointerdown", this.boundPointerDown), this.render();
  }
  /** Restore host grid state and remove the dependency overlay. */
  destroy() {
    cancelAnimationFrame(this.frameRequest), this.removeRangeEditListeners(), this.revogrid.removeEventListener("pointerdown", this.boundPointerDown), this.dependencyLayer.destroy(), this.applying = !0, Fn(this.revogrid, this.original), this.elementProperties.restore(), this.applying = !1, super.destroy();
  }
  requestRender() {
    cancelAnimationFrame(this.frameRequest), this.frameRequest = requestAnimationFrame(() => this.render());
  }
  syncRawSourceFromGrid() {
    if (this.applying)
      return;
    const t = this.readRenderedSource().map(Nn);
    this.rawSource = t, this.requestRender();
  }
  readRenderedSource() {
    const t = this.providers.data.stores.rgRow?.store.get("source");
    return Array.isArray(t) ? [...t] : [...this.revogrid.source ?? []];
  }
  render() {
    const t = this.elementProperties.getConfig(), n = Qe(this.rawSource);
    this.scale = Ve({
      ...n,
      zoomPreset: t?.zoomPreset ?? "day-week"
    }), this.rows = st(this.rawSource, this.scale), this.applying = !0, this.revogrid.resize = !0, this.revogrid.columnTypes = Rn(
      this.revogrid.columnTypes,
      () => this.scale,
      () => this.elementProperties.getConfig()?.visuals
    ), this.revogrid.columns = En(this.original.columns, this.scale.totalWidth), this.revogrid.source = [...this.rows], this.applying = !1, this.renderDependencies();
  }
  renderDependencies() {
    this.dependencyLayer.render({
      scale: this.scale,
      dependencies: this.elementProperties.getDependencies(),
      rows: this.rows,
      showDependencies: this.elementProperties.getConfig()?.visuals?.showDependencies !== !1
    });
  }
  startRangeEdit(t) {
    const n = An(t);
    if (!n || !this.scale)
      return;
    const s = this.rawSource.find((a) => a.id === n.taskId);
    s && (t.preventDefault(), t.stopPropagation(), this.activeRangeEdit = {
      mode: n.mode,
      task: s,
      startClientX: t.clientX,
      lastDayDelta: 0,
      barRect: n.barElement.getBoundingClientRect(),
      lastProgressPercent: s.progressPercent ?? 0
    }, this.revogrid.classList.add("rg-gantt-range-editing"), document.addEventListener("pointermove", this.boundPointerMove), document.addEventListener("pointerup", this.boundPointerUp, { once: !0 }), document.addEventListener("pointercancel", this.boundPointerUp, { once: !0 }));
  }
  handleRangePointerMove(t) {
    if (!this.activeRangeEdit || !this.scale)
      return;
    if (this.activeRangeEdit.mode === "resize-progress") {
      const s = zn(t.clientX, this.activeRangeEdit.barRect);
      if (s === this.activeRangeEdit.lastProgressPercent)
        return;
      t.preventDefault(), this.activeRangeEdit = {
        ...this.activeRangeEdit,
        lastProgressPercent: s
      }, this.updateTaskRange(rt(this.activeRangeEdit.task, s));
      return;
    }
    const n = at(
      t.clientX - this.activeRangeEdit.startClientX,
      this.scale.tickWidth,
      this.scale.tickCountDays
    );
    n !== this.activeRangeEdit.lastDayDelta && (t.preventDefault(), this.activeRangeEdit = {
      ...this.activeRangeEdit,
      lastDayDelta: n
    }, this.updateTaskRange(
      it(
        this.activeRangeEdit.task,
        this.activeRangeEdit.mode,
        n
      )
    ));
  }
  endRangeEdit(t) {
    this.activeRangeEdit && t.preventDefault(), this.activeRangeEdit = null, this.revogrid.classList.remove("rg-gantt-range-editing"), this.removeRangeEditListeners();
  }
  removeRangeEditListeners() {
    document.removeEventListener("pointermove", this.boundPointerMove), document.removeEventListener("pointerup", this.boundPointerUp), document.removeEventListener("pointercancel", this.boundPointerUp);
  }
  updateTaskRange(t) {
    this.rawSource = this.rawSource.map((n) => n.id === t.id ? t : n), this.render();
  }
}
function An(e) {
  let t = null;
  for (const n of e.composedPath()) {
    if (!(n instanceof HTMLElement))
      continue;
    !t && n.classList.contains("rg-gantt-bar") && (t = n);
    const s = n.dataset.ganttTaskId, a = n.dataset.ganttInteraction;
    if (!(!s || !In(a)))
      return { taskId: s, mode: a, barElement: t ?? n.closest(".rg-gantt-bar") ?? n };
  }
  return null;
}
function In(e) {
  return e === "move" || e === "resize-start" || e === "resize-end" || e === "resize-progress";
}
function zn(e, t) {
  return t.width <= 0 ? 0 : Math.min(100, Math.max(0, Math.round((e - t.left) / t.width * 100)));
}
function Nn(e) {
  const {
    __gantt: t,
    __ganttRowIndex: n,
    __ganttTimeline: s,
    ...a
  } = e;
  return a;
}
export {
  Mn as DEFAULT_TASK_COLUMNS,
  ht as GanttDependencyLayer,
  Bn as GanttPlugin,
  it as applyTaskBarInteraction,
  rt as applyTaskProgressInteraction,
  Cn as captureOriginalGridState,
  ot as createDependencyLayouts,
  ft as createDimensionRowFrames,
  nt as createGanttBarLayout,
  $t as createGanttColumnType,
  Rn as createManagedColumnTypes,
  En as createManagedGanttColumns,
  yt as createTimelineColumn,
  Ve as createTimelineScale,
  Qe as getTaskTimelineRange,
  Je as getTimelinePreset,
  Pn as installGanttElementProperties,
  Ln as normalizeTaskColumns,
  at as pixelDeltaToDays,
  st as projectGanttRows,
  Fn as restoreOriginalGridState
};
