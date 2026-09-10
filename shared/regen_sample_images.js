// regen_sample_images.js
//
// Round-trips the sample image set between sampleImages.json (the data-URL
// based store the app seeds from) and native image files in ./sampleImages/.
//
//   node regen_sample_images.js extract     sampleImages.json       -> sampleImages/
//   node regen_sample_images.js             (default) = regen
//   node regen_sample_images.js regen       sampleImages/           -> sampleImages.json
//
// Rules:
//   - Filenames use the image name with every space (and any other character
//     invalid on Windows) replaced by "_" plus a mime-derived extension
//     (.svg/.gif/.ico/.png/.jpg/.webp).
//   - SVG data URLs are "data:image/svg+xml," + encodeURIComponent(svg).
//   - For NON-SVG files (png/gif/ico/jpg/webp) the JSON entry gets NO `data`;
//     instead it carries `data64` / `data80` / `data100` PNG data URLs scaled
//     to 64x64 / 80x80 / 100x100 (via `sharp`, crop-to-fill). The full-size
//     originals stay in sampleImages/.
//   - `regen` is NON-DESTRUCTIVE about metadata: for every image already in
//     sampleImages.json it keeps ALL fields as-is (lineColor, fillColor,
//     themes, strokeWidth, _prevFill, _prevStroke, …) and only replaces the
//     image payload when a matching file exists. Images with no matching file
//     keep their original entry untouched. New files (not in the json) are
//     appended.
//   - File <-> name matching is FUZZY: names are canonicalised (lowercase, any
//     run of non-alphanumerics collapses to "_"), so "DIY b/w" matches
//     DIY_b_w.svg, "Noughts & Crosses" matches Noughts_&_Crosses.svg, etc.

const fs = require("fs");
const path = require("path");

let sharp = null;
try { sharp = require("sharp"); } catch (e) { sharp = null; }

const ROOT = __dirname;
const JSON_FILE = path.join(ROOT, "sampleImages.json");
const IMG_DIR = path.join(ROOT, "sampleImages");

const THUMB_SIZES = [64, 80, 100]; // -> data64, data80, data100
const SVG_EXTS = new Set(["svg"]);

const EXT_BY_MIME = [
  [/svg\+?xml/, "svg"],
  [/^image\/png/, "png"],
  [/^image\/gif/, "gif"],
  [/^image\/x-icon/, "ico"],
  [/^image\/jpeg/, "jpg"],
  [/^image\/webp/, "webp"]
];

const DATA_URL_PREFIX = {
  png: "image/png",
  gif: "image/gif",
  ico: "image/x-icon",
  jpg: "image/jpeg",
  webp: "image/webp"
};

// --- name <-> filename helpers ----------------------------------------------

function extOf(file) {
  const i = file.lastIndexOf(".");
  return i >= 0 ? file.slice(i + 1).toLowerCase() : "";
}

function nameToFile(name, ext) {
  return name.replace(/[\\/:*?"<>|]/g, "_").replace(/ /g, "_") + "." + ext;
}

function fileToName(file) {
  const i = file.lastIndexOf(".");
  return (i >= 0 ? file.slice(0, i) : file).replace(/_/g, " ");
}

// Canonical key used for fuzzy matching. Lowercases and collapses every run of
// non-alphanumeric characters to a single "_", so input "DIY b/w", "DIY_b_w"
// and "DIY b w" all canonicalise to the same key.
function canonical(name) {
  return String(name)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "");
}

// --- data URL helpers -------------------------------------------------------

function extFromDataUrl(dataUrl) {
  if (typeof dataUrl !== "string") return null;
  const comma = dataUrl.indexOf(",");
  const meta = dataUrl.slice(0, comma).toLowerCase();
  const mime = meta.replace(/^data:/, "").replace(/;.*$/, "");
  for (const [re, ext] of EXT_BY_MIME) {
    if (re.test(mime)) return ext;
  }
  return /;base64/i.test(meta) ? "bin" : "svg";
}

function decodeDataUrl(dataUrl) {
  if (typeof dataUrl !== "string") return null;
  const comma = dataUrl.indexOf(",");
  const meta = dataUrl.slice(0, comma);
  const payload = dataUrl.slice(comma + 1);
  if (/;base64/i.test(meta)) return Buffer.from(payload, "base64");
  return Buffer.from(decodeURIComponent(payload), "utf8");
}

function encodeSvgDataUrl(svgText) {
  return "data:image/svg+xml," + encodeURIComponent(svgText);
}

// --- extract: json -> files -------------------------------------------------

function extract() {
  if (!fs.existsSync(JSON_FILE)) {
    console.error("sampleImages.json not found");
    process.exit(1);
  }
  fs.mkdirSync(IMG_DIR, { recursive: true });
  const images = JSON.parse(fs.readFileSync(JSON_FILE, "utf8")).images || [];
  let written = 0;
  let skipped = 0;
  for (const img of images) {
    if (!img || !img.name) continue;
    // Only entries with a full-size `data` are extracted to native files.
    // Entries that carry ONLY scaled thumbnails (data64 / data80 / data100)
    // are skipped — their original binaries already live in sampleImages/ and
    // cannot be reconstructed from the thumbnails.
    if (typeof img.data !== "string" || img.data === "") {
      skipped++;
      continue;
    }
    const file = nameToFile(img.name, extFromDataUrl(img.data));
    fs.writeFileSync(path.join(IMG_DIR, file), decodeDataUrl(img.data));
    written++;
  }
  console.log(`Extracted ${written} images (skipped ${skipped} data-less entries) to ${path.relative(ROOT, IMG_DIR)}/`);
}

// --- regen: files -> json ---------------------------------------------------

// --- ICO -> raw RGBA (sharp's libvips build on this box lacks ICO/BMP loaders)

// ICO files are a container of 32bpp bitmap (DIB) sub-images. We extract the
// largest one and decode it to raw RGBA so `sharp` can consume it as raw input.
// ICO DIBs follow BMP convention: a positive height means the stored rows are
// bottom-up, so we reverse the rows (set ICO_TOP_DOWN if a source is stored
// top-down instead).
const ICO_TOP_DOWN = false;

function icoToRawRgba(buffer) {
  if (buffer.length < 6 || buffer.readUInt16LE(2) !== 1) return null;
  const count = buffer.readUInt16LE(4);
  let best = null;
  for (let i = 0; i < count; i++) {
    const o = 6 + 16 * i;
    const w = buffer[o] || 256;
    const h = buffer[o + 1] || 256;
    const size = buffer.readUInt32LE(o + 8);
    const off = buffer.readUInt32LE(o + 12);
    if (!best || w * h > best.w * best.h) best = { w, h, size, off };
  }
  if (!best || best.off + best.size > buffer.length) return null;
  const dib = buffer.slice(best.off, best.off + best.size);
  const biSize = dib.readUInt32LE(0);
  if (biSize < 40) return null;
  const bpp = dib.readUInt16LE(14);
  const comp = dib.readUInt32LE(16);
  if (comp !== 0 || bpp !== 32) return null; // plain BGRA icons only
  const w = Math.max(1, Math.min(best.w, 256));
  const h = Math.max(1, Math.min(best.h, 256));
  const rowSize = Math.floor((w * 32 + 31) / 32) * 4; // = w * 4
  const pixelBytes = rowSize * h;
  const start = best.off + biSize;
  if (start + pixelBytes > buffer.length) return null;

  const rgba = Buffer.alloc(w * h * 4);
  for (let row = 0; row < h; row++) {
    const srcRow = ICO_TOP_DOWN ? row : h - 1 - row; // bottom-up -> reverse
    const src = start + srcRow * rowSize;
    for (let x = 0; x < w; x++) {
      const sp = src + x * 4;
      const dp = (row * w + x) * 4;
      rgba[dp] = buffer[sp + 2]; // B -> R
      rgba[dp + 1] = buffer[sp + 1]; // G
      rgba[dp + 2] = buffer[sp]; // R -> B
      rgba[dp + 3] = buffer[sp + 3]; // A
    }
  }
  return { width: w, height: h, data: rgba };
}

async function encodeThumb(file, px) {
  const ext = extOf(file);
  if (ext === "ico") {
    const raw = icoToRawRgba(fs.readFileSync(path.join(IMG_DIR, file)));
    if (!raw) throw new Error("Could not parse ICO file " + file);
    const buf = await sharp(raw.data, { raw: { width: raw.width, height: raw.height, channels: 4 } }).resize(px, px, { fit: "cover" }).png().toBuffer();
    return "data:image/png;base64," + buf.toString("base64");
  }
  const buf = await sharp(path.join(IMG_DIR, file)).resize(px, px, { fit: "cover" }).png().toBuffer();
  return "data:image/png;base64," + buf.toString("base64");
}

async function payloadFor(file) {
  const ext = extOf(file);
  if (SVG_EXTS.has(ext)) {
    return { data: encodeSvgDataUrl(fs.readFileSync(path.join(IMG_DIR, file), "utf8")) };
  }
  if (!sharp) {
    throw new Error("sharp is required to resize non-SVG images — run `npm install`");
  }
  const thumbs = {};
  for (const px of THUMB_SIZES) {
    thumbs["data" + px] = await encodeThumb(file, px);
  }
  return thumbs;
}

async function regen() {
  if (!fs.existsSync(IMG_DIR)) {
    console.error("sampleImages/ folder not found — run `node regen_sample_images.js extract` first");
    process.exit(1);
  }
  let prev = { images: [] };
  if (fs.existsSync(JSON_FILE)) {
    try { prev = JSON.parse(fs.readFileSync(JSON_FILE, "utf8")); } catch (e) {}
  }

  const files = fs.readdirSync(IMG_DIR).filter((f) => fs.statSync(path.join(IMG_DIR, f)).isFile());
  const byCanonical = new Map();
  for (const file of files) {
    const key = canonical(fileToName(file));
    if (!byCanonical.has(key)) byCanonical.set(key, []);
    byCanonical.get(key).push(file);
  }

  const usedFiles = new Set();
  const images = [];
  let thumbsMade = 0;

  for (const prevImg of Array.isArray(prev.images) ? prev.images : []) {
    if (!prevImg || !prevImg.name) continue;
    const candidates = byCanonical.get(canonical(prevImg.name)) || [];
    const origExt = prevImg.data ? extFromDataUrl(prevImg.data) : null;
    const hit = candidates.find((f) => origExt && extOf(f) === origExt) || candidates[0];

    if (!hit) {
      images.push(prevImg); // keep original entry untouched
      continue;
    }
    usedFiles.add(hit);
    const entry = Object.assign({}, prevImg); // clone to preserve key order + all fields
    const payload = await payloadFor(hit);
    if ("data" in entry) {
      if ("data" in payload) entry.data = payload.data; // svg: replace value in place
      else delete entry.data; // non-svg: drop the old full-size data
    }
    for (const k of Object.keys(payload)) {
      if (k !== "data") entry[k] = payload[k];
    }
    if (Object.keys(payload).filter((k) => k !== "data").length > 0) thumbsMade++;
    images.push(entry);
  }

  for (const file of files.filter((f) => !usedFiles.has(f)).sort((a, b) => a.localeCompare(b))) {
    const entry = { name: fileToName(file) };
    const payload = await payloadFor(file);
    for (const k of Object.keys(payload)) entry[k] = payload[k];
    images.push(entry);
  }

  fs.writeFileSync(JSON_FILE, JSON.stringify({ images }, null, 2));
  console.log(`Regenerated sampleImages.json with ${images.length} images (${thumbsMade} with scaled thumbnails).`);
}

const mode = process.argv[2] || "regen";
if (mode === "extract") {
  extract();
} else if (mode === "regen") {
  regen().catch((e) => { console.error(e); process.exit(1); });
} else {
  console.error('Unknown mode "' + mode + '" — use "extract" or "regen"');
  process.exit(1);
}