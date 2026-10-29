// Generates compact icon metadata for the vendored OpenMoji emoji library:
//   - vendor/openmoji-icons.json   { om: { "<name>": { h: "<HEXCODE>" } } }
//
// The GLYPHS come from the vendored colour font
// (vendor/openmoji/OpenMoji-color-glyf_colr_0.woff2); this script only resolves
// each emoji to a stable, readable NAME and its Unicode hexcode. A multi-codepoint
// emoji (flag, skin-tone variant, ZWJ sequence) keeps its hyphens, e.g.
// "1F1E6-1F1E8"; the renderers split on "-" and emit one code point per part, and
// the font's `ccmp` ligature lookup joins them into the single emoji glyph.
//
// Names are the kebab-case `annotation` ("grinning face" -> "grinning-face").
// Annotations are not unique (the ~12 collisions are OpenMoji extras that reuse a
// Unicode emoji's name), so a duplicate name gets its lowercase hexcode appended:
// "donkey-1f4a9" style. Entries are emitted GROUP by group in OpenMoji's own
// category order (faces -> people -> animals -> ... -> extras), then by the
// `order` field, so the picker reads like openmoji.org instead of putting the
// ASCII/regional-indicator extras first (upstream `order` interleaves them).
//
// Usage: node shared/regen_openmoji_data.js   (or: npm run regen:openmoji)
const fs = require("fs");
const path = require("path");
const https = require("https");

const VERSION = "17.0.0";
const SOURCE = "https://cdn.jsdelivr.net/gh/hfg-gmuend/openmoji@" + VERSION + "/data/openmoji.json";

// openmoji.org's category order. Anything unlisted sorts last (stable by order).
const GROUP_ORDER = [
  "smileys-emotion",
  "people-body",
  "component",
  "animals-nature",
  "food-drink",
  "travel-places",
  "activities",
  "objects",
  "symbols",
  "flags",
  "extras-openmoji",
  "extras-unicode"
];

function get(url) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, (res) => {
      if (res.statusCode !== 200) {
        reject(new Error("HTTP " + res.statusCode + " " + url));
        res.resume();
        return;
      }
      const chunks = [];
      res.on("data", (c) => chunks.push(c));
      res.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    });
    req.on("error", reject);
  });
}

function slug(text) {
  return String(text || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function groupRank(group) {
  const i = GROUP_ORDER.indexOf(group);
  return i === -1 ? GROUP_ORDER.length : i;
}

async function main() {
  const entries = JSON.parse(await get(SOURCE));
  entries.sort((a, b) =>
    (groupRank(a.group) - groupRank(b.group)) ||
    (a.order - b.order) ||
    String(a.hexcode).localeCompare(String(b.hexcode)));

  const used = Object.create(null);
  const om = {};
  const renamed = [];
  let skipped = 0;

  for (const entry of entries) {
    const hex = String(entry.hexcode || "").trim();
    if (!hex || !/^[0-9a-f]{4,6}(-[0-9a-f]{4,6})*$/i.test(hex)) { skipped++; continue; }
    let name = slug(entry.annotation);
    if (!name) { skipped++; continue; }
    if (used[name]) {
      name = name + "-" + hex.toLowerCase();
      renamed.push(hex + " -> " + name);
    }
    used[name] = true;
    om[name] = { h: hex.toUpperCase() };
  }

  fs.writeFileSync(
    path.join(__dirname, "vendor/openmoji-icons.json"),
    JSON.stringify({ om }) + "\n"
  );
  console.log("openmoji entries:", entries.length, " emitted:", Object.keys(om).length, " skipped:", skipped);
  console.log("duplicate names disambiguated:", renamed.length, renamed.slice(0, 6));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
