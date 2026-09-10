// Generates PWA icons (192x192 + 512x512 PNG, "any" and "maskable") for each
// app folder from its `icon.svg`. Run from the repo root:
//   node regen_pwa_icons.js
// Scans immediate subdirectories (excluding `shared`, `tests`, `node_modules`)
// for an `icon.svg` and writes `icon-192.png` and `icon-512.png` beside it.
const fs = require("fs");
const path = require("path");
const sharp = require("sharp");

const ROOT = __dirname;
const SKIP = new Set(["shared", "tests", "node_modules", "screenshots",
  "coverage-report", "playwright-report", "test-results", ".git", ".idea", ".opencode"]);

async function main() {
  const apps = fs.readdirSync(ROOT, { withFileTypes: true })
    .filter((d) => d.isDirectory() && !SKIP.has(d.name))
    .map((d) => d.name)
    .filter((name) => fs.existsSync(path.join(ROOT, name, "icon.svg")));

  if (apps.length === 0) {
    console.log("No app folders with icon.svg found.");
    return;
  }

  for (const app of apps) {
    const src = path.join(ROOT, app, "icon.svg");
    for (const size of [192, 512]) {
      const out = path.join(ROOT, app, `icon-${size}.png`);
      await sharp(src, { density: Math.max(72, Math.round((size / 512) * 384)) })
        .resize(size, size, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
        .png()
        .toFile(out);
      console.log(`wrote ${app}/icon-${size}.png`);
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});