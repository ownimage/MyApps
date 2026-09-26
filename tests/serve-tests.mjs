// Dual static dev servers for the Playwright suite, built on Vite.
//
// Why two origins: the SAME path means different things to the two deployments
// the suite exercises.
//   8080  repo root              -> /PlanMyDay/ is the PlanMyDay app folder
//   8081  repo mounted at /PlanMyDay/ -> /PlanMyDay/PlanMyDay/ is the app,
//         /PlanMyDay/shared/ is shared/, and every origin-root path (/, /css,
//         /js, /vendor, /sw.js) 404s — a faithful GitHub Pages sub-path mount.
//
// Why Vite: one Node process starts both servers, so a full run needs a single
// `npm run dev:test` (or Playwright's own managed start) instead of two Python
// processes plus manual port checks. Vite runs with appType:"custom" so it does
// NOT transform modules, rewrite HTML, or inject the HMR client; a sirv static
// middleware serves the files verbatim.
//
// Caching: sirv runs in its production mode, so it walks the tree ONCE at
// startup and then serves from an in-memory file map (no per-request fs stat).
// Build-stamped assets get `immutable` (no revalidation); sw.js and every HTML
// page get `no-cache`, so a service-worker update is still detected by sw.js
// bytes changing and a deploy is never pinned in the browser.

import { createServer } from "vite";
import sirv from "sirv";
import { fileURLToPath } from "node:url";
import path from "node:path";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

// sw.js: the stable-url worker is updated by its BYTES changing, so it must
// never be served stale from the browser cache. index.html (and directory
// requests): navigations must be able to pick up a new deploy.
const NO_CACHE = /(^|\/)(sw\.js|index\.html)$/;

function setCacheHeaders(res, pathname) {
  if (NO_CACHE.test(pathname) || pathname.endsWith("/")) {
    res.setHeader("Cache-Control", "no-cache");
  } else {
    res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
  }
}

// mount === null -> serve the whole repo root; mount === "/PlanMyDay" -> serve
// the repo only under that prefix (connect strips it before sirv sees the URL).
function staticPlugin(mount) {
  const handler = sirv(repoRoot, {
    etag: true,
    maxAge: 31536000,
    immutable: true,
    setHeaders: setCacheHeaders,
  });
  return {
    name: "smd-test-static",
    configureServer(server) {
      if (mount) server.middlewares.use(mount, handler);
      else server.middlewares.use(handler);
      // No SPA fallback: anything not served above is a real 404 (the sub-path
      // test relies on origin-root paths 404ing).
      server.middlewares.use((req, res) => {
        res.statusCode = 404;
        res.end("Not found");
      });
    },
  };
}

function makeServer(port, mount) {
  return createServer({
    configFile: false,
    root: repoRoot,
    appType: "custom",
    clearScreen: false,
    logLevel: "warn",
    server: {
      host: "127.0.0.1",
      port,
      strictPort: true,
      hmr: false,
      open: false,
    },
    plugins: [staticPlugin(mount)],
  });
}

const rootServer = await makeServer(8080, null);
const subServer = await makeServer(8081, "/PlanMyDay");

try {
  await rootServer.listen();
} catch (error) {
  console.error("[serve-tests] port 8080 is unavailable (is another server already running?):", error.message);
  process.exit(1);
}
try {
  await subServer.listen();
} catch (error) {
  console.error("[serve-tests] port 8081 is unavailable (is another server already running?):", error.message);
  await rootServer.close();
  process.exit(1);
}

console.log("[serve-tests] root   http://localhost:8080/");
console.log("[serve-tests] subpath http://localhost:8081/PlanMyDay/");

let closing = false;
async function shutdown() {
  if (closing) return;
  closing = true;
  await Promise.allSettled([rootServer.close(), subServer.close()]);
  process.exit(0);
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
