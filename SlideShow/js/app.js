// SlideShow uses the existing shared OneDrive authentication and Graph helpers.
SmdConfig.storagePrefix = "slideshow_";
SmdConfig.imagePrefix = "shared-";
// Playback owns menu visibility; discard the obsolete optional auto-hide flag.
localStorage.removeItem(smdKey("autoHideMenu"));

var ss = { files: [], index: -1, timer: null, playing: true, busy: false,
  loadSeq: 0, folderSeq: 0, browseSeq: 0, browsing: false, settings: false,
  folder: "", path: "", url: "", transition: null, pickerPlay: false, pickerSource: "onedrive",
  urlSelection: null, urlRoot: null, urlCurrent: null, urlTrail: [] };

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
  if (ss.playing && ssMode() === "auto" && ss.files.length > 1 &&
      !ss.busy && !ss.settings && !ss.browsing && !document.hidden) {
    ss.timer = setTimeout(function () { ssMove(1); }, ssSeconds() * 1000);
  }
  ssControls();
}
function ssControls() {
  var play = $id("playSlides");
  var source = ssSourceProvider();
  var selection = source.selection();
  if (play) play.toggleAttribute("disabled", (!source.usesFolder && !selection.trim()) || ss.busy);
  var connection = $id("slideOneDriveConnection");
  if (connection) connection.hidden = !source.requiresOneDrive;
  var folderRow = $id("slideFolderRow");
  if (folderRow) folderRow.classList.toggle("d-none", !source.usesFolder);
  var label = $id("slideFolderLabel");
  if (label) {
    var folder = localStorage.getItem(smdKey("folder"));
    label.textContent = folder === null ? "Choose folder" : (folder || "OneDrive");
  }
}
function ssTogglePlay() { ss.playing = !ss.playing; ssSetMenu(!ss.playing); ssSchedule(); }
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
  ss.urlSelection = null;
  ss.busy = false; ss.playing = false; ss.files = []; ss.index = -1; ss.folder = ""; ssSetMenu(true);
  ssRelease();
  $id("slideEmpty").hidden = false; ssControls();
}
function ssError(err) {
  if (err && (err.status === 401 || err.code === "sign_in_required")) {
    return "OneDrive sign-in has expired. Open Settings > Source and sign in again.";
  }
  if (err && err.status === 404) return "That OneDrive source or image no longer exists. Choose another folder or sharing URL.";
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
    var blob = await ssSourceProvider().download(file);
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
  var play = ss.pickerPlay;
  var urlSelection = null;
  if (ss.pickerSource === "url") {
    if (!ss.urlCurrent || !ss.urlRoot) return;
    urlSelection = { url: ss.urlRoot.url, shareBase: ss.urlRoot.shareBase, item: ss.urlCurrent.item };
  } else {
    if (!ssWithinRoot(ss.path)) return;
    localStorage.setItem(smdKey("folder"), ss.path);
  }
  ssReset(); ss.urlSelection = urlSelection; ssControls(); ssCloseFolders();
  ss.pickerPlay = false;
  if (play) ssStartPlayback(); else ssStatus("Ready to play.");
}
function ssPlay() { ssOpenFolders({ play: true }); }
async function ssStartPlayback() {
  var source = ssSourceProvider();
  var path = source.selection();
  var connection = getOneDriveConfig();
  if (source.requiresOneDrive && (!connection.clientId || !connection.account)) {
    openSettings(); $id("source-tab").click(); ssStatus("Sign in to OneDrive to play this source."); return;
  }
  if (source.usesFolder && (path === null || !ssWithinRoot(path))) { ssOpenFolders(); return; }
  var token = ++ss.folderSeq;
  ss.loadSeq++; ss.busy = true; ssStopTimer(); ssControls();
  ssStatus("Finding images...");
  try {
    var recursive = ssSetting("recursive", "false") === "true";
    var images = await source.collect(path, recursive, token);
    if (token !== ss.folderSeq) return;
    images.sort(function (a, b) { return a.key.localeCompare(b.key, undefined, { numeric: true, sensitivity: "base" }); });
    ss.files = images; ss.folder = path; ss.index = -1; ss.busy = false;
    if (images.length) {
      ss.playing = true; closeSettings(); ssSetMenu(false); await ssShow(0, 1);
    } else {
      ssRelease(); $id("slideEmpty").hidden = false;
      ssStatus("No supported images in this source" + (recursive ? " or its subfolders." : ". Try Include subfolders."));
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
function ssOpenFolders(options) {
  var config = getOneDriveConfig();
  if (!config.clientId || !config.account) { openSettings(); $id("source-tab").click(); return; }
  ssStopTimer(); ss.browsing = true;
  ss.pickerPlay = !!(options && options.play); ss.pickerSource = ssSource();
  var page = $id("slideFolderPage");
  page.title = ss.pickerPlay ? "Select a folder to play" : "Choose an image folder";
  page.content = '<div class="d-flex flex-column gap-3"><p id="slideFolderPath" class="text-break mb-0"></p>' +
    '<smd-button id="parentSlideFolder" variant="secondary" onclick="ssParentFolder()">Up one folder</smd-button>' +
    '<p id="slideFolderMessage" role="status" class="mb-0"></p><div id="slideFolderList" class="d-flex flex-column gap-2"></div></div>';
  page.buttons = [{ text: "Cancel", action: "cancel", variant: "secondary", close: false },
    { text: ss.pickerPlay ? "Play this folder" : "Use this folder", action: "use", variant: "success", id: "useSlideFolder", disabled: true, close: false }];
  page.classList.remove("d-none");
  page.show();
  if (ss.pickerSource === "url") ssInitUrlBrowser();
  else ssBrowse(ssSetting("folder", ssRoot()));
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
  ss.settings = true; ssStopTimer(); ssSetMenu(true);
  smdSetupSettingsPage({ dangerIds: ['noCacheRow','refreshAppRow','clearAllDataRow'], restore: function () {
    $id("slideMode").value = ssMode();
    ssBuildSourceTabs();
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
    if (!ss.files.length || ss.settings || ss.browsing) return;
    var bounds = this.getBoundingClientRect();
    var position = (e.clientX - bounds.left) / bounds.width;
    if (position >= 1 / 3 && position <= 2 / 3) { ssRevealMenu(); return; }
    if (ssMode() !== "manual") return;
    ss.playing = true; ssSetMenu(false); ssMove(position < 1 / 3 ? -1 : 1);
  });
  document.addEventListener("keydown", function (e) {
    if (ss.settings || ss.browsing || e.target.closest("input,select,textarea,button,smd-select,smd-button,[contenteditable]")) return;
    if (e.key === "ArrowLeft" || e.key === "ArrowRight") { e.preventDefault(); ssMove(e.key === "ArrowLeft" ? -1 : 1); }
    if (e.code === "Space" && ssMode() === "auto") { e.preventDefault(); ssTogglePlay(); }
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

// Each source supplies its settings panel, selection, image listing and download.
// New link types can add a provider without changing the playback controller.
var SS_SOURCES = [
  { id: "onedrive", title: "OneDrive", tabId: "source-onedrive-tab", templateId: "sourceFolderTemplate",
    usesFolder: true, requiresOneDrive: true,
    selection: function () { return localStorage.getItem(smdKey("folder")); },
    collect: ssFolderImages, download: ssOneDriveBlob },
  { id: "url", title: "OneDrive URL", tabId: "source-url-tab", templateId: "sourceUrlTemplate",
    usesFolder: false, requiresOneDrive: true,
    selection: function () { return ssSetting("sourceUrl", ""); },
    collect: ssUrlImages, download: ssOneDriveBlob }
];
function ssSourceProvider() {
  var id = ssSetting("source", "onedrive");
  return SS_SOURCES.find(function (source) { return source.id === id; }) || SS_SOURCES[0];
}
function ssSource() { return ssSourceProvider().id; }
function ssOneDriveBlob(file) {
  return file.graphPath
    ? oneDriveGraphRequest(file.graphPath, { cache: "no-store" }, "blob")
    : oneDriveDownloadBlob(file.key);
}
async function ssFolderImages(path, recursive, token) {
  var queue = [path], visited = new Set(), images = [];
  while (queue.length) {
    var current = queue.shift();
    if (visited.has(current)) continue;
    visited.add(current);
    var listing = await oneDriveListFolder(current);
    if (token !== ss.folderSeq) return [];
    listing.files.filter(ssIsImage).forEach(function (file) { images.push(file); });
    if (recursive) listing.folders.forEach(function (folder) {
      if (ssWithinRoot(folder.path)) queue.push(folder.path);
    });
  }
  return images;
}
function ssMode() { return ssSetting("mode", "manual") === "auto" ? "auto" : "manual"; }
function ssSetMenu(visible) {
  $id("mainNav").hidden = !visible;
  ssFitViewer();
}
function ssRevealMenu() { ss.playing = false; ssStopTimer(); ssSetMenu(true); }
function ssBuildSourceTabs() {
  var tabs = $id("slideSourceTabs");
  tabs.tabs = SS_SOURCES.map(function (source) {
    return { id: source.tabId, title: source.title, content: $id(source.templateId).innerHTML };
  });
  tabs.activeIndex = SS_SOURCES.indexOf(ssSourceProvider());
  $id("oneDriveUrl").value = ssSetting("sourceUrl", "");
  tabs.addEventListener("smd-tabs-change", function (event) {
    if (event.target !== tabs) return;
    event.stopPropagation();
    var source = SS_SOURCES[event.detail.index];
    if (!source) return;
    localStorage.setItem(smdKey("source"), source.id);
    ssReset(); ssStatus("Choose your source, then press Play.");
  });
}
function ssChangeUrl(value) {
  localStorage.setItem(smdKey("sourceUrl"), String(value || "").trim());
  ssReset(); ssStatus("Ready to play from the OneDrive URL.");
}
function ssSharedItemBase(item, fallbackDrive) {
  var drive = (item.parentReference && item.parentReference.driveId) || fallbackDrive;
  if (!drive || !item.id) throw new Error("OneDrive did not return the shared item's location. Check the sharing link.");
  return "/drives/" + encodeURIComponent(drive) + "/items/" + encodeURIComponent(item.id);
}
function ssSharedNext(link) {
  var next = new URL(link, ONE_DRIVE_GRAPH + "/");
  var base = new URL(ONE_DRIVE_GRAPH);
  if (next.origin !== base.origin || next.pathname.indexOf(base.pathname + "/") !== 0) {
    throw new Error("OneDrive returned an invalid next page.");
  }
  return next.pathname.slice(base.pathname.length) + next.search;
}
// Microsoft Graph resolves sharing links; image bytes still use authenticated
// Graph /content requests, rather than treating a sharing web page as an image.
async function ssResolveUrl(rawUrl) {
  var url;
  try { url = new URL(rawUrl); } catch (err) { throw new Error("Enter a valid OneDrive sharing URL in Settings > Source."); }
  if (url.protocol !== "https:") throw new Error("Use an https OneDrive sharing URL.");
  var bytes = new TextEncoder().encode(url.href);
  var encoded = "u!" + btoa(Array.from(bytes, function (byte) { return String.fromCharCode(byte); }).join(""))
    .replace(/=/g, "").replace(/\//g, "_").replace(/\+/g, "-");
  var shareBase = "/shares/" + encoded + "/driveItem";
  // Accept the sharing link as an opening gesture so later ID-based reads work.
  var item = await oneDriveGraphJson(shareBase, { headers: { Prefer: "redeemSharingLink" } });
  return { url: rawUrl, shareBase: shareBase, item: item.remoteItem || item };
}
async function ssUrlImages(rawUrl, recursive, token) {
  var selection = ss.urlSelection && ss.urlSelection.url === rawUrl ? ss.urlSelection : await ssResolveUrl(rawUrl);
  if (token !== ss.folderSeq) return [];
  var root = selection.item, shareBase = selection.shareBase;
  if (root.file) {
    return ssIsImage(root) ? [{ name: root.name, key: root.name, graphPath: shareBase + "/content" }] : [];
  }
  if (!root.folder) throw new Error("The OneDrive URL must point to an image or image folder.");
  var drive = root.parentReference && root.parentReference.driveId;
  var queue = [{ base: ssSharedItemBase(root), drive: drive, prefix: "" }], visited = new Set(), files = [];
  while (queue.length) {
    var current = queue.shift();
    if (visited.has(current.base)) continue;
    visited.add(current.base);
    var page = current.base + "/children?$select=id,name,file,folder,parentReference&$top=200";
    while (page) {
      var data = await oneDriveGraphJson(page);
      if (token !== ss.folderSeq) return [];
      (data.value || []).forEach(function (entry) {
        var item = entry.remoteItem || entry;
        var path = current.prefix + item.name;
        if (item.file && ssIsImage(item)) files.push({ name: item.name, key: path, graphPath: ssSharedItemBase(item, current.drive) + "/content" });
        if (item.folder && recursive) queue.push({ base: ssSharedItemBase(item, current.drive), drive: (item.parentReference && item.parentReference.driveId) || current.drive, prefix: path + "/" });
      });
      page = data["@odata.nextLink"] ? ssSharedNext(data["@odata.nextLink"]) : "";
    }
  }
  return files;
}

function ssParentFolder() {
  if (ss.pickerSource === "url") {
    if (ss.urlTrail.length) ssBrowseUrl(ss.urlTrail.pop());
    return;
  }
  ssBrowse(ss.path.split("/").slice(0, -1).join("/"));
}
async function ssInitUrlBrowser() {
  var token = ++ss.browseSeq;
  ss.urlSelection = null; ss.urlCurrent = null; ss.urlTrail = [];
  $id("slideFolderMessage").textContent = "Opening shared folder...";
  try {
    var resolved = await ssResolveUrl(ssSetting("sourceUrl", ""));
    if (token !== ss.browseSeq || !ss.browsing) return;
    ss.urlRoot = resolved;
    ssBrowseUrl({ item: resolved.item, path: resolved.item.name || "Shared folder" });
  } catch (err) {
    if (token === ss.browseSeq && ss.browsing) $id("slideFolderMessage").textContent = ssError(err);
  }
}
async function ssBrowseUrl(node) {
  var token = ++ss.browseSeq;
  ss.urlCurrent = node;
  $id("slideFolderPath").textContent = node.path;
  $id("slideFolderList").replaceChildren();
  $id("slideFolderMessage").textContent = "Loading folders...";
  $id("useSlideFolder").toggleAttribute("disabled", true);
  $id("parentSlideFolder").toggleAttribute("disabled", ss.urlTrail.length === 0);
  try {
    var folders = [], count = 0;
    if (node.item.folder) {
      var drive = node.item.parentReference && node.item.parentReference.driveId;
      var page = ssSharedItemBase(node.item) + "/children?$select=id,name,file,folder,parentReference&$top=200";
      while (page) {
        var data = await oneDriveGraphJson(page);
        if (token !== ss.browseSeq || !ss.browsing) return;
        (data.value || []).forEach(function (entry) {
          var item = entry.remoteItem || entry;
          if (item.folder) {
            // Child metadata can omit the drive reference; retain it for navigation.
            item = Object.assign({}, item, { parentReference: Object.assign({ driveId: drive }, item.parentReference || {}) });
            folders.push({ item: item, path: node.path + "/" + (item.name || entry.name) });
          } else if (item.file && ssIsImage(item)) count++;
        });
        page = data["@odata.nextLink"] ? ssSharedNext(data["@odata.nextLink"]) : "";
      }
    } else if (node.item.file && ssIsImage(node.item)) count = 1;
    else throw new Error("This sharing link does not point to an image or image folder.");
    if (token !== ss.browseSeq || !ss.browsing) return;
    folders.sort(function (a, b) { return a.item.name.localeCompare(b.item.name, undefined, { numeric: true }); });
    folders.forEach(function (folder) {
      var button = document.createElement("smd-button");
      button.setAttribute("block", ""); button.setAttribute("variant", "secondary");
      button.setAttribute("icon", "fa-solid fa-folder"); button.textContent = folder.item.name;
      button.addEventListener("click", function () { ss.urlTrail.push(node); ssBrowseUrl(folder); });
      $id("slideFolderList").appendChild(button);
    });
    $id("slideFolderMessage").textContent = count + " image" + (count === 1 ? "" : "s") + " in this folder" +
      (ssSetting("recursive", "false") === "true" ? ". Subfolders will also be included." : ".");
    $id("useSlideFolder").querySelector("button").textContent = node.item.file ? "Play this image" : (ss.pickerPlay ? "Play this folder" : "Use this folder");
    $id("useSlideFolder").toggleAttribute("disabled", false);
  } catch (err) {
    if (token === ss.browseSeq && ss.browsing) $id("slideFolderMessage").textContent = ssError(err);
  }
}
