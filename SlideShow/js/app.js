// SlideShow uses the existing shared OneDrive authentication and Graph helpers.
SmdConfig.storagePrefix = "slideshow_";
SmdConfig.imagePrefix = "shared-";

var ss = { files: [], index: -1, timer: null, playing: true, busy: false,
  loadSeq: 0, folderSeq: 0, browseSeq: 0, browsing: false, settings: false,
  folder: "", path: "", url: "", transition: null };

function ssSetting(name, fallback) {
  var value = localStorage.getItem(smdKey(name));
  return value === null ? fallback : value;
}
function ssRoot() { return oneDriveNormalizeDirectory(ssSetting("onedrive_directory", "")); }
function ssWithinRoot(path) {
  var root = ssRoot().toLowerCase();
  var candidate = path.toLowerCase();
  return !root || candidate === root || candidate.indexOf(root + "/") === 0;
}
function ssSeconds() {
  var value = Number(ssSetting("seconds", "5"));
  return Number.isFinite(value) && value >= 1 && value <= 86400 ? value : 5;
}
function ssStatus(text) {
  $id("slideStatus").textContent = text;
  var settingsStatus = $id("slideSettingsStatus");
  if (settingsStatus) settingsStatus.textContent = text;
}
function ssStopTimer() { clearTimeout(ss.timer); ss.timer = null; }
function ssSchedule() {
  ssStopTimer();
  if (ss.playing && ssSetting("mode", "touch") === "auto" && ss.files.length > 1 &&
      !ss.busy && !ss.settings && !ss.browsing && !document.hidden) {
    ss.timer = setTimeout(function () { ssMove(1); }, ssSeconds() * 1000);
  }
  ssControls();
}
function ssControls() {
  var play = $id("playSlides");
  if (play) play.toggleAttribute("disabled", localStorage.getItem(smdKey("folder")) === null || ss.busy);
  var label = $id("slideFolderLabel");
  if (label) {
    var folder = localStorage.getItem(smdKey("folder"));
    label.textContent = folder === null ? "Choose folder" : (folder || "OneDrive");
  }
}
function ssTogglePlay() { ss.playing = !ss.playing; ssSchedule(); }
function ssRelease() {
  if (ss.transition) { ss.transition.cancel(); ss.transition = null; }
  if (ss.url) URL.revokeObjectURL(ss.url);
  ss.url = "";
  $id("slideImage").removeAttribute("src");
  $id("slideImage").alt = "";
  $id("slideImage").hidden = true;
}
function ssReset() {
  ssStopTimer(); ss.loadSeq++; ss.folderSeq++;
  ss.busy = false; ss.files = []; ss.index = -1; ss.folder = "";
  ssRelease();
  $id("slideEmpty").hidden = false; ssControls();
}
function ssError(err) {
  if (err && (err.status === 401 || err.code === "sign_in_required")) {
    return "OneDrive sign-in has expired. Open Settings > OneDrive and sign in again.";
  }
  if (err && err.status === 404) return "That OneDrive folder or image no longer exists. Choose another folder.";
  return oneDriveFriendlyError(err);
}
// Download only the displayed image, and revoke its object URL on replacement.
// A token invalidates an old image request after navigation, sign-out or a root change.
async function ssShow(index, direction) {
  if (!ss.files.length) return;
  ssStopTimer();
  var token = ++ss.loadSeq;
  var file = ss.files[index];
  ss.index = index; ss.busy = true; ssControls();
  ssStatus("Loading image...");
  var url = "";
  try {
    var blob = await oneDriveDownloadBlob(file.key);
    if (token !== ss.loadSeq) return;
    url = URL.createObjectURL(blob);
    var probe = new Image();
    probe.src = url;
    await probe.decode();
    if (token !== ss.loadSeq) { URL.revokeObjectURL(url); return; }
    ssRelease(); ss.url = url;
    var image = $id("slideImage");
    image.src = url; image.alt = file.name; image.hidden = false;
    $id("slideEmpty").hidden = true;
    ssStatus("");
    var transition = ssSetting("transition", "fade");
    if (!matchMedia("(prefers-reduced-motion: reduce)").matches && transition !== "none") {
      var frames = transition === "slide"
        ? [{ transform: "translateX(" + (direction < 0 ? "-100%" : "100%") + ")" }, { transform: "translateX(0)" }]
        : [{ opacity: 0 }, { opacity: 1 }];
      ss.transition = image.animate(frames, { duration: 450, easing: "ease-out" });
    }
  } catch (err) {
    if (url && url !== ss.url) URL.revokeObjectURL(url);
    if (token !== ss.loadSeq) return;
    ssRelease();
    $id("slideEmpty").hidden = false;
    ssStatus("Cannot display this image. " + ssError(err));
  } finally {
    if (token === ss.loadSeq) { ss.busy = false; ssSchedule(); }
  }
}
function ssMove(direction) {
  if (ss.files.length < 2 || ss.settings || ss.browsing) return;
  ssShow((ss.index + direction + ss.files.length) % ss.files.length, direction);
}
function ssIsImage(file) { return /\.(avif|bmp|gif|jpe?g|png|svg|webp)$/i.test(file.name); }
function ssChooseFolder() {
  if (!ssWithinRoot(ss.path)) return;
  localStorage.setItem(smdKey("folder"), ss.path);
  ssReset(); ssControls(); ssCloseFolders();
  ssStatus("Ready to play.");
}
async function ssPlay() {
  var path = localStorage.getItem(smdKey("folder"));
  if (path === null || !ssWithinRoot(path)) { ssOpenFolders(); return; }
  var token = ++ss.folderSeq;
  ss.loadSeq++; ss.busy = true; ssStopTimer(); ssControls();
  ssStatus("Finding images...");
  try {
    var queue = [path], visited = new Set(), images = [];
    var recursive = ssSetting("recursive", "false") === "true";
    while (queue.length) {
      var current = queue.shift();
      if (visited.has(current)) continue;
      visited.add(current);
      var listing = await oneDriveListFolder(current);
      if (token !== ss.folderSeq) return;
      listing.files.filter(ssIsImage).forEach(function (file) { images.push(file); });
      if (recursive) listing.folders.forEach(function (folder) {
        if (ssWithinRoot(folder.path)) queue.push(folder.path);
      });
    }
    images.sort(function (a, b) { return a.key.localeCompare(b.key, undefined, { numeric: true, sensitivity: "base" }); });
    ss.files = images; ss.folder = path; ss.index = -1; ss.busy = false;
    if (images.length) {
      ss.playing = true; closeSettings(); await ssShow(0, 1);
    } else {
      ssRelease(); $id("slideEmpty").hidden = false;
      ssStatus("No supported images in this folder" + (recursive ? " or its subfolders." : ". Try Include subfolders."));
    }
  } catch (err) {
    if (token === ss.folderSeq) ssStatus(ssError(err));
  } finally {
    if (token === ss.folderSeq) { ss.busy = false; ssControls(); ssSchedule(); }
  }
}
async function ssBrowse(path) {
  path = oneDriveNormalizeDirectory(path);
  if (!ssWithinRoot(path)) path = ssRoot();
  ss.path = path;
  ss.folderSeq++; ss.busy = false;
  var token = ++ss.browseSeq;
  $id("slideFolderPath").textContent = path || "OneDrive";
  $id("slideFolderList").replaceChildren();
  $id("slideFolderMessage").textContent = "Loading folders...";
  $id("useSlideFolder").toggleAttribute("disabled", true);
  $id("parentSlideFolder").toggleAttribute("disabled", path.toLowerCase() === ssRoot().toLowerCase());
  try {
    var listing = await oneDriveListFolder(path);
    if (token !== ss.browseSeq || !ss.browsing) return;
    listing.folders.sort(function (a, b) { return a.name.localeCompare(b.name, undefined, { numeric: true }); })
      .forEach(function (folder) {
        var button = document.createElement("smd-button");
        button.setAttribute("block", ""); button.setAttribute("variant", "secondary");
        button.setAttribute("icon", "fa-solid fa-folder");
        button.textContent = folder.name;
        button.addEventListener("click", function () { ssBrowse(folder.path); });
        $id("slideFolderList").appendChild(button);
      });
    var count = listing.files.filter(ssIsImage).length;
    $id("slideFolderMessage").textContent = count + " image" + (count === 1 ? "" : "s") + " in this folder" +
      (ssSetting("recursive", "false") === "true" ? ". Subfolders will also be included." : ".");
    $id("useSlideFolder").toggleAttribute("disabled", false);
  } catch (err) {
    if (token === ss.browseSeq && ss.browsing) $id("slideFolderMessage").textContent = ssError(err);
  }
}
function ssOpenFolders() {
  var config = getOneDriveConfig();
  if (!config.clientId || !config.account) { openSettings(); $id("onedrive-tab").click(); return; }
  ssStopTimer(); ss.browsing = true;
  var page = $id("slideFolderPage");
  page.title = "Choose an image folder";
  page.content = '<div class="d-flex flex-column gap-3"><p id="slideFolderPath" class="text-break mb-0"></p>' +
    '<smd-button id="parentSlideFolder" variant="secondary" onclick="ssBrowse(ss.path.split(\'/\').slice(0,-1).join(\'/\'))">Up one folder</smd-button>' +
    '<p id="slideFolderMessage" role="status" class="mb-0"></p><div id="slideFolderList" class="d-flex flex-column gap-2"></div></div>';
  page.buttons = [{ text: "Cancel", action: "cancel", variant: "secondary", close: false },
    { text: "Use this folder", action: "use", variant: "success", id: "useSlideFolder", disabled: true, close: false }];
  page.classList.remove("d-none");
  page.show();
  ssBrowse(ssSetting("folder", ssRoot()));
}
function ssCloseFolders() {
  ss.browseSeq++; ss.folderSeq++; ss.browsing = false; ss.busy = false;
  $id("slideFolderPage").hide();
  var closingToken = ss.browseSeq;
  setTimeout(function () {
    if (closingToken === ss.browseSeq && !ss.browsing) $id("slideFolderPage").classList.add("d-none");
  }, 60);
  ssSchedule();
}
function ssChange(name, value) {
  if (name === "seconds") {
    var seconds = Number(value);
    if (!Number.isFinite(seconds) || seconds < 1 || seconds > 86400) {
      $id("slideSeconds").value = ssSeconds(); return;
    }
    value = String(seconds);
  }
  localStorage.setItem(smdKey(name), String(value));
  ssSchedule();
}
function ssChangeRoot(value) {
  var root = oneDriveNormalizeDirectory(value);
  localStorage.setItem(smdKey("onedrive_directory"), root);
  $id("oneDriveDirectory").value = root;
  localStorage.removeItem(smdKey("folder"));
  ssReset(); ssStatus("Choose an image folder to begin.");
}
function getSettingsSections() { return smdGetSettingsSections(); }
function buildSettingsContent() { smdBuildSettingsPage(); }
function openSettings() {
  ss.settings = true; ssStopTimer();
  smdSetupSettingsPage({ dangerIds: ['noCacheRow','refreshAppRow','clearAllDataRow'], restore: function () {
    $id("slideMode").value = ssSetting("mode", "touch");
    $id("slideTransition").value = ssSetting("transition", "fade");
    $id("slideSeconds").value = ssSeconds();
    $id("slideRecursive").checked = ssSetting("recursive", "false") === "true";
    $id("oneDriveDirectory").value = ssRoot();
    loadOneDriveSettings();
    $id("oneDriveDirectory").value = ssRoot();
    ssControls();
    if (oneDriveIsConfigured()) oneDriveInit().catch(function () {});
  }});
}
function closeSettings() { ss.settings = false; smdHideSettingsPage(); ssSchedule(); }
function ssSignOut() {
  ssReset(); ssStatus("Sign in to OneDrive to choose an image folder."); signOutOfOneDrive();
}
// Shared auth can change in another MyApps tab. Clear displayed private media.
function ssAccountChanged(event) {
  if (event.key === oneDriveGlobalKey("account") || event.key === oneDriveGlobalKey("clientId") || event.key === null) {
    ssReset(); ssStatus("OneDrive connection changed. Choose an image folder again.");
    if (ss.browsing) ssCloseFolders();
    refreshOneDriveSettingsUi();
  }
}
function ssFitViewer() {
  var nav = $id("mainNav");
  var top = nav.classList.contains("nav-hidden") ? 0 : nav.getBoundingClientRect().bottom;
  $id("slideMain").style.top = Math.max(0, top) + "px";
}
document.addEventListener("DOMContentLoaded", function () {
  new ResizeObserver(ssFitViewer).observe($id("mainNav"));
  new MutationObserver(ssFitViewer).observe($id("mainNav"), {attributes:true, attributeFilter:["class"]});
  window.addEventListener("resize", ssFitViewer);
  ssFitViewer();
  applyTheme(getStoredTheme());
  // Complete the Microsoft redirect flow on iOS and installed PWAs too.
  if (oneDriveIsConfigured()) oneDriveInit().then(function (account) {
    if (!account) ssStatus("Sign in to OneDrive in Settings to choose an image folder.");
  }).catch(function (err) { ssStatus(ssError(err)); });
  $id("slideFolderPage").addEventListener("smd-page-action", function (e) {
    if (e.detail.action === "use") ssChooseFolder(); else ssCloseFolders();
  });
  $id("slideStage").addEventListener("click", function (e) {
    if (ssSetting("mode", "touch") !== "touch" || !ss.files.length) return;
    var bounds = this.getBoundingClientRect();
    ssMove(e.clientX < bounds.left + bounds.width / 2 ? -1 : 1);
  });
  document.addEventListener("keydown", function (e) {
    if (ss.settings || ss.browsing || e.target.closest("input,select,textarea,button,smd-select,smd-button,[contenteditable]")) return;
    if (e.key === "ArrowLeft" || e.key === "ArrowRight") { e.preventDefault(); ssMove(e.key === "ArrowLeft" ? -1 : 1); }
    if (e.code === "Space" && ssSetting("mode", "touch") === "auto") { e.preventDefault(); ssTogglePlay(); }
  });
  document.addEventListener("visibilitychange", ssSchedule);
  window.addEventListener("storage", ssAccountChanged);
  window.addEventListener("pagehide", function () { ssReset(); });
  document.addEventListener("smd-theme-change", function (e) {
    if (e.detail.source === "mode") changeThemeMode(e.detail.mode);
    else if (e.detail.theme) changeTheme(e.detail.theme);
  });
  ssControls();
});

function changeShowDanger(enabled) { smdChangeShowDanger(enabled, ['noCacheRow','refreshAppRow','clearAllDataRow']); }
function confirmClearAllData() { smdConfirmClearAllData({ content: 'Clear ALL SlideShow data? This cannot be undone.' }); }
