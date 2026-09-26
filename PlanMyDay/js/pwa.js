// PlanMyDay — PWA pull-to-refresh (self-contained; no app globals).

(function () {
  if (!("serviceWorker" in navigator)) return;
  const THRESHOLD = 80;
  let startY = 0, pulling = false, pullDist = 0;
  const indicator = document.createElement("div");
  indicator.id = "pwa-pull-indicator";
  indicator.className = "fixed-top start-0 end-0 d-flex align-items-center justify-content-center overflow-hidden bg-body text-body h-0";
  indicator.textContent = "\u21E9 Pull to refresh";
  document.body.appendChild(indicator);
  const spinner = document.createElement("div");
  spinner.id = "pwa-pull-spinner";
  spinner.className = "position-fixed top-50 start-50 translate-middle d-none border border-primary rounded-circle";
  document.body.appendChild(spinner);
  const style = document.createElement("style");
  style.textContent = "#pwa-pull-indicator{z-index:9999;transition:height .1s}#pwa-pull-spinner{z-index:10000;width:40px;height:40px;border-width:4px;border-top-color:var(--bs-primary);animation:pwa-spin .6s linear infinite}@keyframes pwa-spin{to{transform:translate(-50%,-50%) rotate(360deg)}}";
  document.head.appendChild(style);
  function adjustIcon(dist) {
    indicator.innerHTML = dist >= THRESHOLD ? "\u21E9 Release to refresh" : "\u21E9 Pull to refresh";
    indicator.style.height = Math.min(dist, 50) + "px";
  }
  document.addEventListener("touchstart", e => {
    if (window.scrollY !== 0) return;
    if (e.target.closest(".modal")) return;
    startY = e.touches[0].clientY; pulling = true; pullDist = 0;
  }, { passive: true });
  document.addEventListener("touchmove", e => {
    if (!pulling) return;
    if (e.defaultPrevented) { pulling = false; pullDist = 0; indicator.style.height = "0"; return; }
    const dy = e.touches[0].clientY - startY;
    if (dy <= 0) { pullDist = 0; return; }
    pullDist = dy; adjustIcon(dy);
  }, { passive: true });
  document.addEventListener("touchend", () => {
    if (!pulling) return;
    pulling = false; indicator.style.height = "0";
    if (pullDist >= THRESHOLD) { spinner.classList.remove("d-none"); setTimeout(() => { location.reload(); }, 400); }
    pullDist = 0;
  }, { passive: true });
})();
