// Native <input type="checkbox"> is not allowed in app UI: everything must use
// the shared <smd-checkbox> (themed, touch-sized, one consistent look). The only
// legitimate native checkbox is the component's OWN inner input.
//
// Radios stay native on purpose: smd-checkbox is checkbox-only, and the apps'
// `input[type="radio"].form-check-input` groups (schedule, import/export wizards)
// keep their native radio behaviour.
//
// storybook/ is excluded: its checkboxes are demo CONTROLS for the component
// gallery, not app UI.
const { test, expect } = require("@playwright/test");
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const APP_DIRS = [
  "PlanMyDay/js",
  "CountMyDays/js",
  "QRLinks/js",
  "ListOfLists/js",
  "SolarControlar/js",
  "FreeFormOX/js",
  "PhoneButtons/js",
  "Launch/js",
  "shared/js"
];
const APP_HTML = [
  "index.html",
  "PlanMyDay/index.html",
  "CountMyDays/index.html",
  "QRLinks/index.html",
  "ListOfLists/index.html",
  "SolarControlar/index.html",
  "FreeFormOX/index.html",
  "PhoneButtons/index.html",
  "Launch/index.html"
];
const ALLOWED = new Set([
  path.join(ROOT, "shared", "js", "components", "smd-checkbox.js")
]);
const NATIVE_CHECKBOX = /\btype\s*=\s*["']?checkbox["']?/i;

function walk(dir, out) {
  if (!fs.existsSync(dir)) return;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "vendor" || entry.name === "node_modules") continue;
      walk(full, out);
    } else if (/\.(js|mjs|html)$/.test(entry.name)) {
      out.push(full);
    }
  }
}

test("app UI uses <smd-checkbox>, never a native checkbox", () => {
  const files = [];
  APP_DIRS.forEach((dir) => walk(path.join(ROOT, dir), files));
  APP_HTML.forEach((rel) => {
    const file = path.join(ROOT, rel);
    if (fs.existsSync(file)) files.push(file);
  });

  const hits = [];
  files.forEach((file) => {
    if (ALLOWED.has(file)) return;
    const text = fs.readFileSync(file, "utf8");
    text.split(/\r?\n/).forEach((line, index) => {
      if (NATIVE_CHECKBOX.test(line)) {
        hits.push(path.relative(ROOT, file) + ":" + (index + 1) + "  " + line.trim());
      }
    });
  });

  expect(
    hits.join("\n"),
    "Use <smd-checkbox> instead of a native <input type=\"checkbox\">:\n"
  ).toBe("");
});
