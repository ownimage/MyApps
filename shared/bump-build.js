// bump-build.js
//
// Bumps the build number in BOTH files that embed it:
//   shared/js/build-number.js   (pages' cache-busting BUILD_NUMBER)
//   sw.js                        (worker's inline mirror)
//
// The worker mirror MUST change too. The worker is registered at a STABLE url
// (`../sw.js`, no ?v=) on purpose — a versioned url makes the browser install a
// second worker for the same bump, so the app "updates twice" — which leaves a
// byte change in sw.js as the only update signal. Browsers never compare
// importScripts files, so the number has to be inline in sw.js. If the two ever
// drift anyway, the page detects it at runtime (GET_BUILD) and re-registers.
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

// Both files carry the same shape: const BUILD_NUMBER = "202609252253";
function currentNumber(file, label) {
  const src = fs.readFileSync(file, "utf8");
  const m = src.match(/const BUILD_NUMBER = "(\d+)"/);
  if (!m) throw new Error(`No "const BUILD_NUMBER" found in ${label}`);
  return m[1];
}

function setNumber(file, value) {
  const src = fs.readFileSync(file, "utf8");
  const out = src.replace(/(const BUILD_NUMBER = ")\d+(")/, "$1" + value + "$2");
  if (out === src) throw new Error(`"const BUILD_NUMBER" not replaced in ${file}`);
  fs.writeFileSync(file, out);
  return out;
}

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
  setNumber(SW_FILE, oldNumber);
  console.log(`Repaired sw.js mirror ${swNumber} -> ${oldNumber} (it had not been bumped with the rest).`);
}

if (value === oldNumber) {
  if (swNumber !== oldNumber) console.log(`Build number stays ${oldNumber} in ${jv}.`);
  else console.error(`Build number is already ${oldNumber} in ${jv} (and sw.js matches) — nothing to do.`);
  process.exit(0);
}

setNumber(BUILD_NUMBER_FILE, value);
setNumber(SW_FILE, value);
const prev = oldNumber !== value ? oldNumber : swNumber;
console.log(`Build number bumped ${prev} -> ${value}`);
console.log(`   updated ${jv}`);
console.log("Deploy the changed files, then re-test that a second visit shows the \"Update available\" prompt.");
