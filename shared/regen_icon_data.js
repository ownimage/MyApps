// Generates compact icon metadata for the vendored icon libraries:
//   - vendor/fontawesome-icons.json   { fa: {name:{h,w}}, fab: {name:{h,w}} }
// The codepoints themselves come from the already-vendored
// vendor/fontawesome/css/fontawesome.min.css (single-colon :before content rules).
const fs = require("fs");
const path = require("path");
const https = require("https");

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

function parseFaCss(cssPath) {
  const css = fs.readFileSync(cssPath, "utf8");
  const ruleRe = /([^{}]+)\{content\s*:\s*"\\([0-9a-fA-F]+)"\}/g;
  const out = [];
  let m;
  while ((m = ruleRe.exec(css))) {
    const hex = m[2].toLowerCase();
    m[1].split(",").forEach((sel) => {
      sel = sel.trim();
      if (!sel.startsWith(".fa-")) return;
      let name = sel.slice(4).replace(/:before$/, "").trim();
      if (!/^[a-z0-9][a-z0-9-]*$/.test(name)) return;
      out.push({ name, hex });
    });
  }
  return out;
}

async function loadIconFamilies() {
  const raw = await get(
    "https://cdn.jsdelivr.net/npm/@fortawesome/fontawesome-free@6.5.2/metadata/icon-families.json"
  );
  const j = JSON.parse(raw);
  const hexIndex = {};
  for (const name of Object.keys(j)) {
    const e = j[name];
    const svgs = e.svgs || {};
    const classic = svgs.classic || {};
    const styles = [];
    if (classic.solid) styles.push("solid");
    if (classic.regular) styles.push("regular");
    if (classic.brands) styles.push("brands");
    const u = String(e.unicode).toLowerCase();
    hexIndex[u] = hexIndex[u] || [];
    hexIndex[u].push({ name, styles });
  }
  return hexIndex;
}

function sorted(obj) {
  const out = {};
  Object.keys(obj)
    .sort((a, b) => a.localeCompare(b))
    .forEach((k) => (out[k] = obj[k]));
  return out;
}

async function main() {
  const fa = {};
  const fab = {};
  const cssNames = parseFaCss(path.join(__dirname, "vendor/fontawesome/css/fontawesome.min.css"));
  const cssBrands = parseFaCss(path.join(__dirname, "vendor/fontawesome/css/brands.min.css"));
  const hexIndex = await loadIconFamilies();
  console.log("hexIndex entries:", Object.keys(hexIndex).length, " css names:", cssNames.length, " brands:", cssBrands.length);
  for (const { name, hex } of cssNames) {
    const styles = (hexIndex[hex] || [])
      .map((e) => e.styles)
      .reduce((a, b) => a.concat(b), []);
    const hasSolid = styles.indexOf("solid") !== -1;
    const hasReg = styles.indexOf("regular") !== -1;
    const hasBrand = styles.indexOf("brands") !== -1;
    if (hasBrand && !hasSolid && !hasReg) {
      if (!fab[name]) fab[name] = { h: hex, w: 400 };
    } else {
      if (!fa[name]) fa[name] = { h: hex, w: hasSolid ? 900 : 400 };
    }
  }
  for (const { name, hex } of cssBrands) {
    if (!fab[name]) fab[name] = { h: hex, w: 400 };
  }
  fs.writeFileSync(
    path.join(__dirname, "vendor/fontawesome-icons.json"),
    JSON.stringify({ fa: sorted(fa), fab: sorted(fab) }) + "\n"
  );
  console.log("fa names:", Object.keys(fa).length, " fab names:", Object.keys(fab).length);
  const w400 = Object.keys(fa).filter((n) => fa[n].w === 400);
  console.log("fa regular-only (w:400):", w400.length, w400.slice(0, 12));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});