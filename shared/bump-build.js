// bump-build.js
//
// Bumps the build number in BOTH files that embed it:
//   shared/js/build-number.js   (pages' cache-busting BUILD_NUMBER)
//   sw.js                        (worker's FALLBACK literal)
//
// Every shell registers the worker as `../sw.js?v=<BUILD_NUMBER>`, and the spec
// installs a new worker whenever that script url changes, so a bump is what
// ships a build and what makes the "Update available" prompt fire. The worker
// reads its own number from that query (so page and worker can never drift); the
// literal in sw.js is only the fallback for a bare `/sw.js` registration and is
// kept in sync here so its precache name still matches.
//
//   node shared/bump-build.js           use the current local time
//   node shared/bump-build.js 202609252200   use an explicit timestamp
//
// The value is a local-time timestamp in YYYYMMDDHHMM form (matches the
// Get-Date -Format "yyyyMMddHHmm" rule in AGENTS.md).
//
// If the two files have drifted (only one was hand-edited), it first REPAIRS
// the mirror so sw.js matches build-number.js, then applies the bump.

const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const BUILD_NUMBER_FILE = path.join(ROOT, "shared", "js", "build-number.js");
const SW_FILE = path.join(ROOT, "sw.js");

function pad2(n) {
  return String(n).padStart(2, "0");
}

function nowTimestamp() {
  const d = new Date();
  return (
    "" + d.getFullYear() +
    pad2(d.getMonth() + 1) +
    pad2(d.getDate()) +
    pad2(d.getHours()) +
    pad2(d.getMinutes())
  );
}

// shared/js/build-number.js: const BUILD_NUMBER = "202609252253"
// sw.js:                     const BUILD_NUMBER = <url query> || "202609252253";
function currentNumber(file, label) {
  const src = fs.readFileSync(file, "utf8");
  const m = src.match(/const BUILD_NUMBER = "(\d+)"/) || src.match(/\|\| "(\d+)"/);
  if (!m) throw new Error(`No "const BUILD_NUMBER" found in ${label}`);
  return m[1];
}

// shared/js/build-number.js rewrites the assignment, sw.js rewrites the
// trailing fallback literal that follows the self.location.search lookup.
function setNumber(file, value, pattern) {
  const src = fs.readFileSync(file, "utf8");
  if (!pattern.test(src)) throw new Error(`"${pattern}" not found in ${file}`);
  const out = src.replace(pattern, "$1" + value + "$2");
  fs.writeFileSync(file, out);
  return out;
}

const PAGE_PATTERN = /(const BUILD_NUMBER = ")\d+(")/;
const SW_PATTERN = /(\|\| ")\d+(")/;

const explicit = process.argv[2];
const value = explicit || nowTimestamp();
if (!/^\d{12}$/.test(value)) {
  console.error(`Invalid build number "${value}" — expected YYYYMMDDHHMM (12 digits)`);
  process.exit(1);
}

const oldNumber = currentNumber(BUILD_NUMBER_FILE, "shared/js/build-number.js");
const swNumber = currentNumber(SW_FILE, "sw.js");
const jv = path.relative(ROOT, BUILD_NUMBER_FILE);

if (swNumber !== oldNumber) {
  setNumber(SW_FILE, oldNumber, SW_PATTERN);
  console.log(`Repaired sw.js fallback ${swNumber} -> ${oldNumber} (it had not been bumped with the rest).`);
}

if (value === oldNumber) {
  if (swNumber !== oldNumber) console.log(`Build number stays ${oldNumber} in ${jv}.`);
  else console.error(`Build number is already ${oldNumber} in ${jv} (and sw.js matches) — nothing to do.`);
  process.exit(0);
}

setNumber(BUILD_NUMBER_FILE, value, PAGE_PATTERN);
setNumber(SW_FILE, value, SW_PATTERN);
const prev = oldNumber !== value ? oldNumber : swNumber;
console.log(`Build number bumped ${prev} -> ${value}`);
console.log(`   updated ${jv}`);
console.log("Deploy the changed files, then re-test that a second visit shows the \"Update available\" prompt.");
