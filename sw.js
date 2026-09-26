// Site-wide service worker for the MyApps repo. ONE worker at the repo root
// backs every PWA under this origin: a service worker can only intercept
// requests whose URL falls inside its scope, and each app's assets live in a
// sibling folder (e.g. PlanMyDay/) alongside the shared library (shared/), so
// the worker must sit at the root to cover both.
//
// To add an app: add an entry to APPS below (folder prefix -> its shell files).
//
// BUILD NUMBER: the worker's own mirror of shared/js/build-number.js. DO NOT
// hand-edit the two apart — use `npm run bump:build`.
//
// This literal is load-bearing. The worker is registered at a STABLE url
// (`../sw.js`, no ?v=): a versioned script url makes the user agent install a
// SECOND worker for the same bump, i.e. "the app updates twice" — the
// focus-triggered reg.update() installs the new bytes under the OLD url
// (`?v=old`), then the reloaded page registers the new url (`?v=new`) and
// installs again, prompting a second time for one build. With a stable url the
// only update signal is a BYTE change in this file, so the number has to sit
// inline and change with every bump; importScripts files are NOT part of that
// comparison. If the two ever DO drift, the page notices at runtime
// (GET_BUILD) and re-registers, so the drift self-heals instead of pinning
// users to a build the worker will never replace.
const BUILD_NUMBER = "202609261550";

const CACHE = "myapps-" + BUILD_NUMBER;

// Cached user-image files. Deliberately NOT build-tagged: the immutable
// /smd-img/<hash> URLs written by shared/js/smd-images.js (Cache Storage) must
// survive app rebuilds, or every read would re-download the bytes.
const IMAGE_CACHE = "myapps-images";

// Transparent 1x1 GIF returned when a /smd-img/ request misses the cache (the
// page writes the entry just before it renders the same URL, but a stale DOM
// src could race it, or the browser loaded before the SW took control).
const TRANSPARENT_GIF = Uint8Array.from(
  atob("R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7"),
  c => c.charCodeAt(0)
);
const TRANSPARENT_GIF_RESPONSE = new Response(TRANSPARENT_GIF, {
  headers: { "Content-Type": "image/gif", "Cache-Control": "no-store" }
});

// ---- Shared library assets (used by every app) ----
const SHARED_ASSETS = [
  "shared/sampleImages.json",
  "shared/css/styles.css",
  "shared/css/themes/brite/bootstrap.min.css",
  "shared/css/themes/cerulean/bootstrap.min.css",
  "shared/css/themes/cosmo/bootstrap.min.css",
  "shared/css/themes/cyborg/bootstrap.min.css",
  "shared/css/themes/darkly/bootstrap.min.css",
  "shared/css/themes/flatly/bootstrap.min.css",
  "shared/css/themes/journal/bootstrap.min.css",
  "shared/css/themes/litera/bootstrap.min.css",
  "shared/css/themes/lumen/bootstrap.min.css",
  "shared/css/themes/lux/bootstrap.min.css",
  "shared/css/themes/materia/bootstrap.min.css",
  "shared/css/themes/minty/bootstrap.min.css",
  "shared/css/themes/morph/bootstrap.min.css",
  "shared/css/themes/pulse/bootstrap.min.css",
  "shared/css/themes/quartz/bootstrap.min.css",
  "shared/css/themes/sandstone/bootstrap.min.css",
  "shared/css/themes/simplex/bootstrap.min.css",
  "shared/css/themes/sketchy/bootstrap.min.css",
  "shared/css/themes/slate/bootstrap.min.css",
  "shared/css/themes/solar/bootstrap.min.css",
  "shared/css/themes/spacelab/bootstrap.min.css",
  "shared/css/themes/superhero/bootstrap.min.css",
  "shared/css/themes/united/bootstrap.min.css",
  "shared/css/themes/vapor/bootstrap.min.css",
  "shared/css/themes/yeti/bootstrap.min.css",
  "shared/css/themes/zephyr/bootstrap.min.css",
  "shared/css/themes/brite/brite.css",
  "shared/css/themes/cerulean/cerulean.css",
  "shared/css/themes/cosmo/cosmo.css",
  "shared/css/themes/cyborg/cyborg.css",
  "shared/css/themes/darkly/darkly.css",
  "shared/css/themes/flatly/flatly.css",
  "shared/css/themes/journal/journal.css",
  "shared/css/themes/litera/litera.css",
  "shared/css/themes/lumen/lumen.css",
  "shared/css/themes/lux/lux.css",
  "shared/css/themes/materia/materia.css",
  "shared/css/themes/minty/minty.css",
  "shared/css/themes/morph/morph.css",
  "shared/css/themes/pulse/pulse.css",
  "shared/css/themes/quartz/quartz.css",
  "shared/css/themes/sandstone/sandstone.css",
  "shared/css/themes/simplex/simplex.css",
  "shared/css/themes/sketchy/sketchy.css",
  "shared/css/themes/slate/slate.css",
  "shared/css/themes/solar/solar.css",
  "shared/css/themes/spacelab/spacelab.css",
  "shared/css/themes/superhero/superhero.css",
  "shared/css/themes/united/united.css",
  "shared/css/themes/vapor/vapor.css",
  "shared/css/themes/yeti/yeti.css",
  "shared/css/themes/zephyr/zephyr.css",
  "shared/vendor/bootstrap.bundle.min.js",
  "shared/vendor/flatpickr.min.js",
  "shared/vendor/flatpickr.min.css",
  "shared/vendor/qrcode.min.js",
  "shared/vendor/lz-string.min.js",
  "shared/vendor/jsQR.js",
  "shared/vendor/sortable.min.js",
  "shared/vendor/bmc-default-yellow.png",
  "shared/vendor/bootstrap-icons.css",
  "shared/vendor/fonts/bootstrap-icons.woff",
  "shared/vendor/fonts/bootstrap-icons.woff2",
  "shared/vendor/fontawesome/css/fontawesome.min.css",
  "shared/vendor/fontawesome/css/solid.min.css",
  "shared/vendor/fontawesome/css/regular.min.css",
  "shared/vendor/fontawesome/css/brands.min.css",
  "shared/vendor/fontawesome/webfonts/fa-solid-900.woff2",
  "shared/vendor/fontawesome/webfonts/fa-regular-400.woff2",
  "shared/vendor/fontawesome/webfonts/fa-brands-400.woff2",
  "shared/vendor/fontawesome-icons.json",
  "shared/css/fonts/fonts.css",
  "shared/css/fonts/4iCs6KVjbNBYlgoKcg72j00.woff2",
  "shared/css/fonts/4iCs6KVjbNBYlgoKcQ72j00.woff2",
  "shared/css/fonts/4iCs6KVjbNBYlgoKcw72j00.woff2",
  "shared/css/fonts/4iCs6KVjbNBYlgoKew72j00.woff2",
  "shared/css/fonts/4iCs6KVjbNBYlgoKfA72j00.woff2",
  "shared/css/fonts/4iCs6KVjbNBYlgoKfw72.woff2",
  "shared/css/fonts/4iCv6KVjbNBYlgoCxCvjs2yNL4U.woff2",
  "shared/css/fonts/4iCv6KVjbNBYlgoCxCvjsGyN.woff2",
  "shared/css/fonts/4iCv6KVjbNBYlgoCxCvjtGyNL4U.woff2",
  "shared/css/fonts/4iCv6KVjbNBYlgoCxCvjvGyNL4U.woff2",
  "shared/css/fonts/4iCv6KVjbNBYlgoCxCvjvmyNL4U.woff2",
  "shared/css/fonts/4iCv6KVjbNBYlgoCxCvjvWyNL4U.woff2",
  "shared/css/fonts/6xK1dSBYKcSV-LCoeQqfX1RYOo3qPZ7jsDJT9g.woff2",
  "shared/css/fonts/6xK1dSBYKcSV-LCoeQqfX1RYOo3qPZ7ksDJT9g.woff2",
  "shared/css/fonts/6xK1dSBYKcSV-LCoeQqfX1RYOo3qPZ7nsDI.woff2",
  "shared/css/fonts/6xK1dSBYKcSV-LCoeQqfX1RYOo3qPZ7osDJT9g.woff2",
  "shared/css/fonts/6xK1dSBYKcSV-LCoeQqfX1RYOo3qPZ7psDJT9g.woff2",
  "shared/css/fonts/6xK1dSBYKcSV-LCoeQqfX1RYOo3qPZ7qsDJT9g.woff2",
  "shared/css/fonts/6xK1dSBYKcSV-LCoeQqfX1RYOo3qPZ7rsDJT9g.woff2",
  "shared/css/fonts/6xK3dSBYKcSV-LCoeQqfX1RYOo3qN67lqDY.woff2",
  "shared/css/fonts/6xK3dSBYKcSV-LCoeQqfX1RYOo3qNa7lqDY.woff2",
  "shared/css/fonts/6xK3dSBYKcSV-LCoeQqfX1RYOo3qNK7lqDY.woff2",
  "shared/css/fonts/6xK3dSBYKcSV-LCoeQqfX1RYOo3qNq7lqDY.woff2",
  "shared/css/fonts/6xK3dSBYKcSV-LCoeQqfX1RYOo3qO67lqDY.woff2",
  "shared/css/fonts/6xK3dSBYKcSV-LCoeQqfX1RYOo3qOK7l.woff2",
  "shared/css/fonts/6xK3dSBYKcSV-LCoeQqfX1RYOo3qPK7lqDY.woff2",
  "shared/css/fonts/6xKydSBYKcSV-LCoeQqfX1RYOo3i54rwkxduz8A.woff2",
  "shared/css/fonts/6xKydSBYKcSV-LCoeQqfX1RYOo3i54rwlBduz8A.woff2",
  "shared/css/fonts/6xKydSBYKcSV-LCoeQqfX1RYOo3i54rwlxdu.woff2",
  "shared/css/fonts/6xKydSBYKcSV-LCoeQqfX1RYOo3i54rwmBduz8A.woff2",
  "shared/css/fonts/6xKydSBYKcSV-LCoeQqfX1RYOo3i54rwmhduz8A.woff2",
  "shared/css/fonts/6xKydSBYKcSV-LCoeQqfX1RYOo3i54rwmRduz8A.woff2",
  "shared/css/fonts/6xKydSBYKcSV-LCoeQqfX1RYOo3i54rwmxduz8A.woff2",
  "shared/css/fonts/6xKydSBYKcSV-LCoeQqfX1RYOo3ig4vwkxduz8A.woff2",
  "shared/css/fonts/6xKydSBYKcSV-LCoeQqfX1RYOo3ig4vwlBduz8A.woff2",
  "shared/css/fonts/6xKydSBYKcSV-LCoeQqfX1RYOo3ig4vwlxdu.woff2",
  "shared/css/fonts/6xKydSBYKcSV-LCoeQqfX1RYOo3ig4vwmBduz8A.woff2",
  "shared/css/fonts/6xKydSBYKcSV-LCoeQqfX1RYOo3ig4vwmhduz8A.woff2",
  "shared/css/fonts/6xKydSBYKcSV-LCoeQqfX1RYOo3ig4vwmRduz8A.woff2",
  "shared/css/fonts/6xKydSBYKcSV-LCoeQqfX1RYOo3ig4vwmxduz8A.woff2",
  "shared/css/fonts/6xKydSBYKcSV-LCoeQqfX1RYOo3ik4zwkxduz8A.woff2",
  "shared/css/fonts/6xKydSBYKcSV-LCoeQqfX1RYOo3ik4zwlBduz8A.woff2",
  "shared/css/fonts/6xKydSBYKcSV-LCoeQqfX1RYOo3ik4zwlxdu.woff2",
  "shared/css/fonts/6xKydSBYKcSV-LCoeQqfX1RYOo3ik4zwmBduz8A.woff2",
  "shared/css/fonts/6xKydSBYKcSV-LCoeQqfX1RYOo3ik4zwmhduz8A.woff2",
  "shared/css/fonts/6xKydSBYKcSV-LCoeQqfX1RYOo3ik4zwmRduz8A.woff2",
  "shared/css/fonts/6xKydSBYKcSV-LCoeQqfX1RYOo3ik4zwmxduz8A.woff2",
  "shared/css/fonts/CSR54z1Qlv-GDxkbKVQ_dFsvWNBeudwk.woff2",
  "shared/css/fonts/CSR54z1Qlv-GDxkbKVQ_dFsvWNdeudwk.woff2",
  "shared/css/fonts/CSR54z1Qlv-GDxkbKVQ_dFsvWNheudwk.woff2",
  "shared/css/fonts/CSR54z1Qlv-GDxkbKVQ_dFsvWNleudwk.woff2",
  "shared/css/fonts/CSR54z1Qlv-GDxkbKVQ_dFsvWNpeudwk.woff2",
  "shared/css/fonts/CSR54z1Qlv-GDxkbKVQ_dFsvWNReuQ.woff2",
  "shared/css/fonts/CSR54z1Qlv-GDxkbKVQ_dFsvWNteudwk.woff2",
  "shared/css/fonts/CSR64z1Qlv-GDxkbKVQ_fO0KTet_.woff2",
  "shared/css/fonts/CSR64z1Qlv-GDxkbKVQ_fO4KTet_.woff2",
  "shared/css/fonts/CSR64z1Qlv-GDxkbKVQ_fO8KTet_.woff2",
  "shared/css/fonts/CSR64z1Qlv-GDxkbKVQ_fOAKTQ.woff2",
  "shared/css/fonts/CSR64z1Qlv-GDxkbKVQ_fOMKTet_.woff2",
  "shared/css/fonts/CSR64z1Qlv-GDxkbKVQ_fOQKTet_.woff2",
  "shared/css/fonts/CSR64z1Qlv-GDxkbKVQ_fOwKTet_.woff2",
  "shared/css/fonts/JTUSjIg1_i6t8kCHKm459W1hyzbi.woff2",
  "shared/css/fonts/JTUSjIg1_i6t8kCHKm459Wdhyzbi.woff2",
  "shared/css/fonts/JTUSjIg1_i6t8kCHKm459Wlhyw.woff2",
  "shared/css/fonts/JTUSjIg1_i6t8kCHKm459WRhyzbi.woff2",
  "shared/css/fonts/JTUSjIg1_i6t8kCHKm459WZhyzbi.woff2",
  "shared/css/fonts/KFO7CnqEu92Fr1ME7kSn66aGLdTylUAMa3-UBGEe.woff2",
  "shared/css/fonts/KFO7CnqEu92Fr1ME7kSn66aGLdTylUAMa3CUBGEe.woff2",
  "shared/css/fonts/KFO7CnqEu92Fr1ME7kSn66aGLdTylUAMa3GUBGEe.woff2",
  "shared/css/fonts/KFO7CnqEu92Fr1ME7kSn66aGLdTylUAMa3iUBGEe.woff2",
  "shared/css/fonts/KFO7CnqEu92Fr1ME7kSn66aGLdTylUAMa3KUBGEe.woff2",
  "shared/css/fonts/KFO7CnqEu92Fr1ME7kSn66aGLdTylUAMa3OUBGEe.woff2",
  "shared/css/fonts/KFO7CnqEu92Fr1ME7kSn66aGLdTylUAMa3yUBA.woff2",
  "shared/css/fonts/KFO7CnqEu92Fr1ME7kSn66aGLdTylUAMawCUBGEe.woff2",
  "shared/css/fonts/KFO7CnqEu92Fr1ME7kSn66aGLdTylUAMaxKUBGEe.woff2",
  "shared/css/fonts/memtYaGs126MiZpBA-UFUIcVXSCEkx2cmqvXlWqW106F15M.woff2",
  "shared/css/fonts/memtYaGs126MiZpBA-UFUIcVXSCEkx2cmqvXlWqWt06F15M.woff2",
  "shared/css/fonts/memtYaGs126MiZpBA-UFUIcVXSCEkx2cmqvXlWqWtE6F15M.woff2",
  "shared/css/fonts/memtYaGs126MiZpBA-UFUIcVXSCEkx2cmqvXlWqWtk6F15M.woff2",
  "shared/css/fonts/memtYaGs126MiZpBA-UFUIcVXSCEkx2cmqvXlWqWtU6F15M.woff2",
  "shared/css/fonts/memtYaGs126MiZpBA-UFUIcVXSCEkx2cmqvXlWqWu06F15M.woff2",
  "shared/css/fonts/memtYaGs126MiZpBA-UFUIcVXSCEkx2cmqvXlWqWuk6F15M.woff2",
  "shared/css/fonts/memtYaGs126MiZpBA-UFUIcVXSCEkx2cmqvXlWqWuU6F.woff2",
  "shared/css/fonts/memtYaGs126MiZpBA-UFUIcVXSCEkx2cmqvXlWqWvU6F15M.woff2",
  "shared/css/fonts/memtYaGs126MiZpBA-UFUIcVXSCEkx2cmqvXlWqWxU6F15M.woff2",
  "shared/css/fonts/memvYaGs126MiZpBA-UvWbX2vVnXBbObj2OVTS-muw.woff2",
  "shared/css/fonts/memvYaGs126MiZpBA-UvWbX2vVnXBbObj2OVTS2mu1aB.woff2",
  "shared/css/fonts/memvYaGs126MiZpBA-UvWbX2vVnXBbObj2OVTSCmu1aB.woff2",
  "shared/css/fonts/memvYaGs126MiZpBA-UvWbX2vVnXBbObj2OVTSGmu1aB.woff2",
  "shared/css/fonts/memvYaGs126MiZpBA-UvWbX2vVnXBbObj2OVTSKmu1aB.woff2",
  "shared/css/fonts/memvYaGs126MiZpBA-UvWbX2vVnXBbObj2OVTSOmu1aB.woff2",
  "shared/css/fonts/memvYaGs126MiZpBA-UvWbX2vVnXBbObj2OVTSumu1aB.woff2",
  "shared/css/fonts/memvYaGs126MiZpBA-UvWbX2vVnXBbObj2OVTSymu1aB.woff2",
  "shared/css/fonts/memvYaGs126MiZpBA-UvWbX2vVnXBbObj2OVTUGmu1aB.woff2",
  "shared/css/fonts/memvYaGs126MiZpBA-UvWbX2vVnXBbObj2OVTVOmu1aB.woff2",
  "shared/css/fonts/pe0TMImSLYBIv1o4X1M8ce2xCx3yop4tQpF_MeTm0lfGWVpNn64CL7U8upHZIbMV51Q42ptCp7t1R-s.woff2",
  "shared/css/fonts/pe0TMImSLYBIv1o4X1M8ce2xCx3yop4tQpF_MeTm0lfGWVpNn64CL7U8upHZIbMV51Q42ptCp7t4R-tCKQ.woff2",
  "shared/css/fonts/pe0TMImSLYBIv1o4X1M8ce2xCx3yop4tQpF_MeTm0lfGWVpNn64CL7U8upHZIbMV51Q42ptCp7t6R-tCKQ.woff2",
  "shared/css/fonts/pe0TMImSLYBIv1o4X1M8ce2xCx3yop4tQpF_MeTm0lfGWVpNn64CL7U8upHZIbMV51Q42ptCp7t7R-tCKQ.woff2",
  "shared/css/fonts/pe0TMImSLYBIv1o4X1M8ce2xCx3yop4tQpF_MeTm0lfGWVpNn64CL7U8upHZIbMV51Q42ptCp7txR-tCKQ.woff2",
  "shared/css/fonts/q5uGsou0JOdh94bfuQltOxU.woff2",
  "shared/css/fonts/q5uGsou0JOdh94bfvQlt.woff2",
  "shared/css/fonts/QGYpz_kZZAGCONcK2A4bGOj8mNhN.woff2",
  "shared/css/fonts/S6u8w4BMUTPHjxsAUi-qJCY.woff2",
  "shared/css/fonts/S6u8w4BMUTPHjxsAXC-q.woff2",
  "shared/css/fonts/S6u9w4BMUTPHh6UVSwaPGR_p.woff2",
  "shared/css/fonts/S6u9w4BMUTPHh6UVSwiPGQ.woff2",
  "shared/css/fonts/S6u9w4BMUTPHh7USSwaPGR_p.woff2",
  "shared/css/fonts/S6u9w4BMUTPHh7USSwiPGQ.woff2",
  "shared/css/fonts/S6uyw4BMUTPHjx4wXg.woff2",
  "shared/css/fonts/S6uyw4BMUTPHjxAwXjeu.woff2",
  "shared/css/fonts/UcC73FwrK3iLTeHuS_nVMrMxCp50SjIa0ZL7SUc.woff2",
  "shared/css/fonts/UcC73FwrK3iLTeHuS_nVMrMxCp50SjIa1pL7SUc.woff2",
  "shared/css/fonts/UcC73FwrK3iLTeHuS_nVMrMxCp50SjIa1ZL7.woff2",
  "shared/css/fonts/UcC73FwrK3iLTeHuS_nVMrMxCp50SjIa25L7SUc.woff2",
  "shared/css/fonts/UcC73FwrK3iLTeHuS_nVMrMxCp50SjIa2JL7SUc.woff2",
  "shared/css/fonts/UcC73FwrK3iLTeHuS_nVMrMxCp50SjIa2pL7SUc.woff2",
  "shared/css/fonts/UcC73FwrK3iLTeHuS_nVMrMxCp50SjIa2ZL7SUc.woff2",
  "shared/css/fonts/XRXV3I6Li01BKofIMeaBXso.woff2",
  "shared/css/fonts/XRXV3I6Li01BKofINeaB.woff2",
  "shared/css/fonts/XRXV3I6Li01BKofIO-aBXso.woff2",
  "shared/css/fonts/XRXV3I6Li01BKofIOOaBXso.woff2",
  "shared/css/fonts/XRXV3I6Li01BKofIOuaBXso.woff2",
  "shared/js/build-number.js",
  "shared/js/components/smd-button.js",
  "shared/js/components/smd-h1.js",
  "shared/js/components/smd-h2.js",
  "shared/js/components/smd-image.js",
  "shared/js/components/smd-modal.js",
  "shared/js/components/smd-image-card.js",
  "shared/js/components/smd-image-select.js",
  "shared/js/components/smd-image-editor.js",
  "shared/js/components/smd-image-picker.js",
  "shared/js/components/smd-theme.js",
    "shared/js/components/smd-checkbox.js",
  "shared/js/components/smd-draghandle.js",
  "shared/js/components/smd-badge.js",
  "shared/js/components/smd-image-dropdown.js",
"shared/js/components/smd-search.js",
  "shared/js/components/smd-date-picker.js",
  "shared/js/components/smd-buymeacoffee.js",
  "shared/js/components/smd-fontawesome-credit.js",
  "shared/js/components/smd-page.js",
  "shared/js/components/smd-tabs.js",
  "shared/js/components/smd-qrcode.js",
  "shared/js/components/smd-qr-export.js",
  "shared/js/components/smd-qr-import.js",
  "shared/js/smd-app.js",
  "shared/js/smd-minio.js",
  "shared/js/smd-settings.js",
  "shared/js/smd-images.js",
  "shared/vendor/chart.umd.min.js",
  "shared/vendor/chartjs-adapter-date-fns.bundle.min.js",
  "shared/sampleImages/Noughts_&_Crosses.svg"
];

// ---- Per-app shells ----
// Key = folder prefix (as it appears in URLs, relative to the repo root).
const APPS = {
  "PlanMyDay/": [
    "PlanMyDay/",
    "PlanMyDay/index.html",
    "PlanMyDay/manifest.json",
    "PlanMyDay/icon.svg",
    "PlanMyDay/icon-192.png",
    "PlanMyDay/icon-512.png",
    "PlanMyDay/js/app.js",
    "PlanMyDay/js/storage.js",
    "PlanMyDay/js/utils.js",
    "PlanMyDay/js/editor-styles.js",
    "PlanMyDay/js/editor-common.js",
    "PlanMyDay/js/job-editor.js",
    "PlanMyDay/js/streams-editor.js",
    "PlanMyDay/js/job-search.js",
    "PlanMyDay/js/main-view.js",
    "PlanMyDay/js/app-settings.js",
    "PlanMyDay/js/display.js",
     "PlanMyDay/js/image-picker.js",
     "PlanMyDay/js/components/pmd-stream-header.js",
    "PlanMyDay/js/components/pmd-job-stream-card.js",
    "PlanMyDay/js/components/pmd-job-search-card.js",
    "PlanMyDay/js/components/pmd-job-today-card.js"
  ],
  "CountMyDays/": [
    "CountMyDays/",
    "CountMyDays/index.html",
    "CountMyDays/manifest.json",
    "CountMyDays/icon.svg",
    "CountMyDays/icon-192.png",
    "CountMyDays/icon-512.png",
    "CountMyDays/js/sampleData.json",
    "CountMyDays/js/googleCalendarSample.json",
    "CountMyDays/js/app.js",
    "CountMyDays/js/storage.js",
    "CountMyDays/js/utils.js",
    "CountMyDays/js/editor-styles.js",
    "CountMyDays/js/main-view.js",
    "CountMyDays/js/dates-editor.js",
    "CountMyDays/js/categories-editor.js",
    "CountMyDays/js/app-settings.js",
    "CountMyDays/js/export.js",
    "CountMyDays/js/import-wizard.js",
    "CountMyDays/js/googleCalendar.js",
    "CountMyDays/js/googleCalendarEditor.js",
    "CountMyDays/js/components/cmd-countdown-card.js",
    "CountMyDays/js/components/cmd-date-card.js",
    "CountMyDays/js/components/cmd-category-card.js"
  ],
  "QRLinks/": [
    "QRLinks/",
    "QRLinks/index.html",
    "QRLinks/manifest.json",
    "QRLinks/icon.svg",
    "QRLinks/icon-192.png",
    "QRLinks/icon-512.png",
    "QRLinks/sampleLinks.json",
    "QRLinks/js/app.js",
    "QRLinks/js/storage.js",
    "QRLinks/js/editor-styles.js",
    "QRLinks/js/main-view.js",
    "QRLinks/js/links-editor.js",
    "QRLinks/js/app-settings.js",
    "QRLinks/js/export.js",
    "QRLinks/js/components/qrlink-card.js"
  ],
  "SolarControlar/": [
    "SolarControlar/",
    "SolarControlar/index.html",
    "SolarControlar/manifest.json",
    "SolarControlar/icon.svg",
    "SolarControlar/icon-192.png",
    "SolarControlar/icon-512.png",
    "SolarControlar/js/app.js",
    "SolarControlar/js/storage.js",
    "SolarControlar/js/api.js",
    "SolarControlar/js/editor-styles.js",
    "SolarControlar/js/main-view.js",
    "SolarControlar/js/power-tab.js",
    "SolarControlar/js/settings-tab.js",
    "SolarControlar/js/solar-settings-view.js",
    "SolarControlar/js/files-tab.js",
    "SolarControlar/js/config-tab.js",
    "SolarControlar/js/forecast-tab.js",
    "SolarControlar/js/graph-tab.js",
    "SolarControlar/js/components/solar-top-tiles.js"
  ],
  // The Launch app entry lives at the repo root (index.html); its other files
  // live in Launch/ (manifest, icons, css, js).
  "Launch/": [
    "index.html",
    "Launch/manifest.json",
    "Launch/icon.svg",
    "Launch/icon-192.png",
    "Launch/icon-512.png",
    "Launch/js/app.js"
  ],
  "FreeFormOX/": [
     "FreeFormOX/",
     "FreeFormOX/index.html",
     "FreeFormOX/manifest.json",
     "FreeFormOX/img/icon.svg",
     "FreeFormOX/js/app.js",
     "FreeFormOX/js/settings.js"
   ],
};

const APP_ROOTS = Object.keys(APPS);

const PRECACHE_URLS = SHARED_ASSETS.concat(
  ...APP_ROOTS.map(function (root) { return APPS[root]; })
);

// For an offline navigation to an app URL, fall back to THAT app's index.html.
function appIndexFor(pathname) {
  for (var i = 0; i < APP_ROOTS.length; i++) {
    if (pathname.indexOf("/" + APP_ROOTS[i]) !== -1) {
      // The Launch app's entry is the repo-root index.html.
      return APP_ROOTS[i] === "Launch/" ? "index.html" : APP_ROOTS[i] + "index.html";
    }
  }
  // Repo root (or unknown path): the Launch app's index.html lives at the root.
  return "index.html";
}

self.addEventListener("install", event => {
  event.waitUntil(
    caches.open(CACHE).then(cache => cache.addAll(PRECACHE_URLS))
  );
  // Do NOT skipWaiting() here: activation is user-driven via the SKIP_WAITING
  // message from the page's "Update available" prompt.
});

self.addEventListener("message", event => {
  if (!event.data) return;
  if (event.data.type === "SKIP_WAITING") {
    self.skipWaiting();
  } else if (event.data.type === "GET_BUILD") {
    // Lets a page compare the build it is running against the build this worker
    // was registered for, so a stale worker is visible instead of silent.
    const reply = { type: "BUILD", build: BUILD_NUMBER, cache: CACHE };
    if (event.ports && event.ports[0]) event.ports[0].postMessage(reply);
    else if (event.source) event.source.postMessage(reply);
  }
});

self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys().then(keys => {
      const activePrefixes = [CACHE, IMAGE_CACHE];
      return Promise.all(
        keys.filter(k => !activePrefixes.some(p => k === p || k.startsWith(p)))
              .map(k => caches.delete(k))
      );
    }).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", event => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) {
    // MinIO S3 server or other external host — handled directly by the browser
    return;
  }
  // User-image files: the page stores payloads under immutable /smd-img/ URLs
  // and points <img src> at them (shared/js/smd-images.js). Serve the entry;
  // never fall through to the network, which has no file at that path.
  if (url.pathname.indexOf("/smd-img/") !== -1) {
    event.respondWith(
      caches.open(IMAGE_CACHE).then(cache =>
        cache.match(url).then(hit => hit || TRANSPARENT_GIF_RESPONSE.clone())
      ).catch(() => TRANSPARENT_GIF_RESPONSE.clone())
    );
    return;
  }
  // Cache by PATHNAME so versioned requests (js/app.js?v=...) hit the same
  // precached entries as their unversioned forms.
  event.respondWith(
    caches.open(CACHE).then(cache => cache.match(url.pathname, { ignoreSearch: true }).then(cached => {
      const network = fetch(req).then(response => {
        if (response && response.status === 200) {
          cache.put(url.pathname, response.clone());
        }
        return response;
      }).catch(() => {
        if (req.mode === "navigate") return cache.match(appIndexFor(url.pathname));
        return cached;
      });
      // Because matching ignores the search string, a `?v=` stamp this worker
      // does not recognise is a NEWER build's asset. Serve it from the network
      // (refreshing the pathname entry on the way) instead of pinning the old
      // bytes, so a freshly deployed build is never held back by a stale worker.
      const stamp = url.searchParams.get("v");
      if (stamp && stamp !== BUILD_NUMBER) return network;
      return cached || network;
    }))
  );
});
