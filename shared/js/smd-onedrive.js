// OneDrive (Microsoft Graph) integration, shared by PlanMyDay, CountMyDays,
// ListOfLists and Storyboard.
//
// AUTH
//   Vendored MSAL (shared/vendor/msal-browser.min.js), lazily loaded so a user
//   who never opens OneDrive pays nothing at boot. The ONE registered redirect
//   URI is /onedrive-callback.html (shared/js/onedrive-callback.js), which is
//   used by both the popup and redirect flows and shared by every app on the
//   origin. The token cache is MSAL's localStorage cache, so one sign-in covers
//   all apps; the Client ID + tenant are origin-wide too.
//
//   Per app: smdKey("onedrive_enabled") / smdKey("onedrive_directory").
//   Origin:  smd_onedrive_clientId / smd_onedrive_tenant / smd_onedrive_account.
//
// GRAPH
//   oneDriveEnsureFolder / oneDriveListFolder / oneDriveLatestJson /
//   oneDriveGetFile / oneDrivePutFile. Paths are relative to the signed-in
//   user's OneDrive root (/me/drive/root); the Directory setting is the root the
//   app may browse, and saves create nested folders as needed.
//
// The hamburger entries call saveToOneDrive() / openOneDrivePage(); the app's
// data ends go through SmdConfig.onFileSyncExport / fileSyncExportData /
// fileSyncExportPrefix / onFileSyncImport (see smd-filesync.js).

var ONE_DRIVE_SCOPE = "Files.ReadWrite";
var ONE_DRIVE_DEFAULT_TENANT = "common";
var ONE_DRIVE_GRAPH = "https://graph.microsoft.com/v1.0";

// Capture the shared-script URL at parse time: document.currentScript is null
// once any handler runs.
var ONE_DRIVE_VENDOR_ROOT = (function () {
  var src = document.currentScript && document.currentScript.src;
  if (src) {
    try { return new URL("../vendor/", src).href; } catch (e) { /* ignore */ }
  }
  return "vendor/";
})();

var ONE_DRIVE_CALLBACK_URL = (function () {
  var src = document.currentScript && document.currentScript.src;
  if (src) {
    try { return new URL("../../onedrive-callback.html", src).href; } catch (e) { /* ignore */ }
  }
  return "onedrive-callback.html";
})();

function oneDriveGlobalKey(name) {
  return "smd_onedrive_" + name;
}

// Same shape as minioNormalizeDirectory(): forward slashes, no leading or
// trailing slash, no empty/"."/".." segments, so the field, the save path and
// the folder browser always agree.
function oneDriveNormalizeDirectory(value) {
  return String(value == null ? "" : value)
    .replace(/\\/g, "/")
    .split("/")
    .map(function (part) { return part.trim(); })
    .filter(function (part) { return part && part !== "." && part !== ".."; })
    .join("/");
}

// Join any number of path pieces into one OneDrive-relative path.
function oneDriveJoinPath() {
  var parts = [];
  for (var i = 0; i < arguments.length; i++) {
    var value = oneDriveNormalizeDirectory(arguments[i]);
    if (value) parts.push(value);
  }
  return parts.join("/");
}

// Each app starts in its own folder so a backup never lands loose in the
// OneDrive root. An empty stored value means "the OneDrive root" (the user can
// clear the field), so only the ABSENT key falls back to the default.
function oneDriveDefaultDirectory() {
  if (typeof SmdConfig !== "undefined" && SmdConfig.oneDriveDefaultDirectory) {
    return oneDriveNormalizeDirectory(SmdConfig.oneDriveDefaultDirectory);
  }
  return "MyApps";
}

function getOneDriveConfig() {
  var storedDirectory = localStorage.getItem(smdKey("onedrive_directory"));
  return {
    enabled: localStorage.getItem(smdKey("onedrive_enabled")) === "true",
    directory: storedDirectory === null
      ? oneDriveDefaultDirectory()
      : oneDriveNormalizeDirectory(storedDirectory),
    clientId: localStorage.getItem(oneDriveGlobalKey("clientId")) || "",
    tenant: localStorage.getItem(oneDriveGlobalKey("tenant")) || ONE_DRIVE_DEFAULT_TENANT,
    account: localStorage.getItem(oneDriveGlobalKey("account")) || ""
  };
}

function oneDriveIsConfigured() {
  return !!getOneDriveConfig().clientId;
}

// ---- Settings fields -------------------------------------------------------

function changeOneDriveEnabled(enabled) {
  localStorage.setItem(smdKey("onedrive_enabled"), String(enabled));
  updateFileSyncMenu();
  refreshOneDriveSettingsUi();
}

function changeOneDriveDirectory(value) {
  localStorage.setItem(smdKey("onedrive_directory"), oneDriveNormalizeDirectory(value));
}

function changeOneDriveClientId(value) {
  localStorage.setItem(oneDriveGlobalKey("clientId"), String(value == null ? "" : value).trim());
  _oneDriveMsal = null;
  _oneDriveMsalKey = "";
  _oneDriveMsalReady = false;
  _oneDriveToken = { token: "", expires: 0 };
  refreshOneDriveSettingsUi();
  // Warm MSAL so the next Sign in click can open its popup synchronously.
  if (getOneDriveConfig().clientId) oneDriveInit().catch(function () { /* shown when used */ });
}

function changeOneDriveTenant(value) {
  var tenant = String(value == null ? "" : value).trim() || ONE_DRIVE_DEFAULT_TENANT;
  localStorage.setItem(oneDriveGlobalKey("tenant"), tenant);
  _oneDriveMsal = null;
  _oneDriveMsalKey = "";
  _oneDriveMsalReady = false;
  _oneDriveToken = { token: "", expires: 0 };
  refreshOneDriveSettingsUi();
  if (getOneDriveConfig().clientId) oneDriveInit().catch(function () { /* shown when used */ });
}

function loadOneDriveSettings() {
  var config = getOneDriveConfig();
  var cb = $id("oneDriveEnabled");
  if (cb) cb.checked = config.enabled;
  var dir = $id("oneDriveDirectory");
  if (dir) dir.value = config.directory;
  var clientId = $id("oneDriveClientId");
  if (clientId) clientId.value = config.clientId;
  var tenant = $id("oneDriveTenant");
  if (tenant) tenant.value = config.tenant;
  refreshOneDriveSettingsUi();
}

// Account row: label + Sign in / Sign out state. Uses the cached display name
// synchronously; oneDriveInit() refreshes it from MSAL when the tab is opened.
function refreshOneDriveSettingsUi() {
  var config = getOneDriveConfig();
  var account = $id("oneDriveAccount");
  if (account) {
    account.textContent = config.account
      ? config.account
      : (config.clientId ? "Not signed in" : "No Client ID configured");
  }
  var signIn = $id("btnOneDriveSignIn");
  if (signIn) signIn.toggleAttribute("disabled", !!config.account || !config.clientId);
  var signOut = $id("btnOneDriveSignOut");
  if (signOut) signOut.toggleAttribute("disabled", !config.account);
}

function showOneDriveAlert(message, type) {
  type = type || "info";
  var text = String(message).replace(/</g, "&lt;").replace(/>/g, "&gt;");
  showSmdModal({
    title: type === "error" ? "OneDrive Error" : "OneDrive",
    content: '<p style="margin:0">' + text + '</p>',
    buttons: [
      { text: "OK", variant: type === "error" ? "danger" : "primary", action: "ok" }
    ]
  });
}

// ---- MSAL -----------------------------------------------------------------

var _oneDriveMsalPromise = null;

function oneDriveLoadMsal() {
  if (window.msal && window.msal.PublicClientApplication) return Promise.resolve(window.msal);
  if (_oneDriveMsalPromise) return _oneDriveMsalPromise;
  _oneDriveMsalPromise = new Promise(function (resolve, reject) {
    var script = document.createElement("script");
    var version = typeof BUILD_NUMBER !== "undefined" ? "?v=" + BUILD_NUMBER : "";
    script.src = ONE_DRIVE_VENDOR_ROOT + "msal-browser.min.js" + version;
    script.onload = function () {
      if (window.msal && window.msal.PublicClientApplication) {
        resolve(window.msal);
      } else {
        reject(new Error("The MSAL library loaded without the msal global."));
      }
    };
    script.onerror = function () {
      _oneDriveMsalPromise = null;
      reject(new Error("Could not load the MSAL library."));
    };
    document.head.appendChild(script);
  });
  return _oneDriveMsalPromise;
}

var _oneDriveMsal = null;
var _oneDriveMsalKey = "";
var _oneDriveMsalReady = false;

function oneDriveAuthority(config) {
  return "https://login.microsoftonline.com/" + (config.tenant || ONE_DRIVE_DEFAULT_TENANT);
}

function oneDriveMsalKey(config) {
  return config.clientId + "|" + config.tenant + "|" + ONE_DRIVE_CALLBACK_URL;
}

// The ready instance, or null when MSAL still has to load/initialize. Sign-in
// must call loginPopup() synchronously from the click to avoid the popup
// blocker, so the caller checks this first.
function oneDriveReadyInstance(config) {
  return (_oneDriveMsal && _oneDriveMsalReady && _oneDriveMsalKey === oneDriveMsalKey(config))
    ? _oneDriveMsal
    : null;
}

function oneDriveAuthReady() {
  return !!(_oneDriveMsal && _oneDriveMsalReady);
}

function oneDriveMsalInstance(config) {
  var key = oneDriveMsalKey(config);
  if (_oneDriveMsal && _oneDriveMsalKey === key) return Promise.resolve(_oneDriveMsal);
  return oneDriveLoadMsal().then(function (msal) {
    _oneDriveMsal = new msal.PublicClientApplication({
      auth: {
        clientId: config.clientId,
        authority: oneDriveAuthority(config),
        redirectUri: ONE_DRIVE_CALLBACK_URL,
        postLogoutRedirectUri: ONE_DRIVE_CALLBACK_URL
      },
      cache: {
        cacheLocation: "localStorage",
        storeAuthStateInCookie: false
      }
    });
    _oneDriveMsalKey = key;
    _oneDriveMsalReady = false;
    // MSAL v3+ requires initialize() before any interaction. Older builds do
    // not expose it, hence the guard.
    var init = typeof _oneDriveMsal.initialize === "function"
      ? _oneDriveMsal.initialize()
      : Promise.resolve();
    // handleRedirectPromise is harmless on app pages (resolves null); it
    // completes the response when this page itself is the redirect target.
    return init
      .then(function () { return _oneDriveMsal.handleRedirectPromise(); })
      .catch(function () { return null; })
      .then(function () {
        _oneDriveMsalReady = true;
        return _oneDriveMsal;
      });
  });
}

function oneDriveAccountName(account) {
  if (!account) return "";
  return account.username || account.name || account.homeAccountId || "";
}

// Load MSAL, read the cached account and mirror it into localStorage so the
// settings UI can render synchronously.
function oneDriveInit() {
  var config = getOneDriveConfig();
  if (!config.clientId) return Promise.resolve(null);
  return oneDriveMsalInstance(config).then(function (instance) {
    var accounts = instance.getAllAccounts ? instance.getAllAccounts() : [];
    var account = accounts && accounts.length ? accounts[0] : null;
    if (account) {
      localStorage.setItem(oneDriveGlobalKey("account"), oneDriveAccountName(account));
    } else {
      localStorage.removeItem(oneDriveGlobalKey("account"));
      _oneDriveToken = { token: "", expires: 0 };
    }
    refreshOneDriveSettingsUi();
    return account;
  });
}

function oneDrivePrefersRedirect() {
  var ua = navigator.userAgent || "";
  if (/iPad|iPhone|iPod/.test(ua)) return true;
  if (navigator.standalone === true) return true;
  if (window.matchMedia && window.matchMedia("(display-mode: standalone)").matches) return true;
  return false;
}

function oneDriveStartRedirect(instance, request) {
  localStorage.setItem(oneDriveGlobalKey("returnTo"), location.href);
  localStorage.setItem(oneDriveGlobalKey("pendingRedirect"), "1");
  try {
    instance.loginRedirect(request);
  } catch (e) { /* the page is navigating away */ }
}

function oneDrivePopupBlocked(err) {
  var code = (err && (err.errorCode || err.name || err.message)) || "";
  if (/user_cancelled|access_denied/i.test(code)) return false;
  return /popup|blocked|window_error/i.test(code);
}

function oneDriveAuthError(err) {
  var code = (err && (err.errorCode || err.name)) || "";
  var detail = (err && (err.errorMessage || err.message)) || String(err);
  var text = code + " " + detail;
  if (err && err.code === "sign_in_required") {
    return "OneDrive sign-in has expired. Open Settings > FileSync > OneDrive and sign in again.";
  }
  if (/user_cancelled|access_denied/i.test(text)) return "OneDrive sign-in was cancelled.";
  if (/popup_window_error|empty_window_error/i.test(text)) {
    return "The Microsoft sign-in window was blocked. Allow pop-ups for this site and try again.";
  }
  if (/AADSTS65001|consent_required/i.test(text)) {
    return "Microsoft needs an administrator to consent to the Files.ReadWrite permission for this app.";
  }
  if (/AADSTS70011|invalid_scope/i.test(text)) {
    return "The Azure app registration is missing the delegated Files.ReadWrite permission.";
  }
  if (/AADSTS50011|redirect_uri/i.test(text)) {
    return "The Azure app registration does not list " + ONE_DRIVE_CALLBACK_URL + " as a redirect URI.";
  }
  if (/Failed to fetch|NetworkError|ERR_/i.test(text)) {
    return "Cannot reach Microsoft sign-in. Check your internet connection.";
  }
  return detail;
}

function oneDriveLoginWith(instance) {
  var request = { scopes: [ONE_DRIVE_SCOPE] };
  if (oneDrivePrefersRedirect()) {
    oneDriveStartRedirect(instance, request);
    return new Promise(function () {});
  }
  return instance.loginPopup(request).catch(function (err) {
    if (oneDrivePopupBlocked(err)) {
      oneDriveStartRedirect(instance, request);
      return new Promise(function () {});
    }
    throw err;
  });
}

// `options.silent` skips the success alert (the Stickers panel re-lists and shows
// the result itself). Returns a promise for the account name (or null), so a
// caller can chain a retry after an interactive re-sign-in.
function signInToOneDrive(options) {
  var silent = !!(options && options.silent);
  var config = getOneDriveConfig();
  if (!config.clientId) {
    showOneDriveAlert("Add the Azure app registration Client ID in Settings > FileSync > OneDrive first.", "error");
    return;
  }
  // Call loginPopup() in the same task as the click (a popup blocker otherwise
  // rejects it) when MSAL is already ready. The OneDrive settings sub-tab and
  // the Open page both warm MSAL up, so that is the normal path.
  var ready = oneDriveReadyInstance(config);
  var attempt = ready
    ? oneDriveLoginWith(ready)
    : oneDriveMsalInstance(config).then(function (instance) {
        // MSAL was still loading, so the browser may treat this as not a user
        // gesture. Surface a clear "click again" instead of a silent no-op.
        return oneDriveLoginWith(instance).catch(function (err) {
          if (oneDrivePopupBlocked(err)) {
            throw new Error("OneDrive is preparing sign-in. Click Sign in again.");
          }
          throw err;
        });
      });
  return attempt.then(function (result) {
    if (!result || !result.account) return null;
    var name = oneDriveAccountName(result.account);
    localStorage.setItem(oneDriveGlobalKey("account"), name);
    _oneDriveToken = { token: "", expires: 0 };
    refreshOneDriveSettingsUi();
    if (!silent) showOneDriveAlert("Signed in to OneDrive as " + name + ".", "info");
    var page = document.getElementById("oneDriveImportPage");
    if (page && page.hasAttribute("open")) oneDriveRefresh();
    return name;
  }).catch(function (err) {
    showOneDriveAlert("OneDrive sign-in failed: " + oneDriveAuthError(err), "error");
    return null;
  });
}

function signOutOfOneDrive() {
  var config = getOneDriveConfig();
  if (!config.clientId) return;

  function finish() {
    localStorage.removeItem(oneDriveGlobalKey("account"));
    _oneDriveToken = { token: "", expires: 0 };
    refreshOneDriveSettingsUi();
  }

  function run(instance) {
    var accounts = instance.getAllAccounts ? instance.getAllAccounts() : [];
    var account = accounts && accounts.length ? accounts[0] : null;
    if (!account) return Promise.resolve();
    localStorage.setItem(oneDriveGlobalKey("returnTo"), location.href);
    if (oneDrivePrefersRedirect()) {
      return instance.logoutRedirect({ account: account, postLogoutRedirectUri: ONE_DRIVE_CALLBACK_URL });
    }
    return instance.logoutPopup({ account: account, postLogoutRedirectUri: ONE_DRIVE_CALLBACK_URL })
      .catch(function (err) {
        if (!/user_cancelled|access_denied/i.test((err && err.errorCode) || "")) throw err;
      });
  }

  var ready = oneDriveReadyInstance(config);
  var attempt = ready ? run(ready) : oneDriveMsalInstance(config).then(run);
  finish(); // optimistic: the local display no longer claims a session
  attempt.then(finish).catch(function (err) {
    showOneDriveAlert("OneDrive sign-out failed: " + oneDriveAuthError(err), "error");
    finish();
  });
}

// ---- Graph helpers --------------------------------------------------------

var _oneDriveToken = { token: "", expires: 0 };

function oneDriveGetToken(config) {
  config = config || getOneDriveConfig();
  var now = Date.now();
  if (_oneDriveToken.token && _oneDriveToken.expires > now + 60000) {
    return Promise.resolve(_oneDriveToken.token);
  }
  return oneDriveMsalInstance(config).then(function (instance) {
    var accounts = instance.getAllAccounts ? instance.getAllAccounts() : [];
    var account = accounts && accounts.length ? accounts[0] : null;
    if (!account) {
      var signIn = new Error("Sign in to OneDrive first.");
      signIn.code = "sign_in_required";
      throw signIn;
    }
    return instance.acquireTokenSilent({ account: account, scopes: [ONE_DRIVE_SCOPE] }).then(function (result) {
      _oneDriveToken = {
        token: result.accessToken,
        expires: result.expiresOn ? result.expiresOn.getTime() : now + 3000000
      };
      return result.accessToken;
    }).catch(function (authErr) {
      _oneDriveToken = { token: "", expires: 0 };
      var signIn = new Error("OneDrive sign-in expired. Sign in again from Settings > FileSync > OneDrive.");
      signIn.code = "sign_in_required";
      signIn.authError = authErr;
      throw signIn;
    });
  });
}

function oneDriveEncodePath(path) {
  return String(path == null ? "" : path)
    .replace(/^\/+|\/+$/g, "")
    .split("/")
    .filter(function (part) { return part; })
    .map(function (part) { return encodeURIComponent(part); })
    .join("/");
}

// "/me/drive/root" for the root, "/me/drive/root:/a/b:" for an item, plus an
// optional suffix (e.g. "/children" or "/content").
function oneDriveItemPath(path, suffix) {
  var encoded = oneDriveEncodePath(path);
  return encoded
    ? "/me/drive/root:/" + encoded + ":" + (suffix || "")
    : "/me/drive/root" + (suffix || "");
}

function oneDriveGraphError(status, text, path) {
  var message = text || ("HTTP " + status);
  try {
    var parsed = JSON.parse(text);
    if (parsed && parsed.error && parsed.error.message) message = parsed.error.message;
  } catch (e) { /* not JSON */ }
  var err = new Error(message);
  err.status = status;
  err.path = path || "";
  return err;
}

function oneDriveGraphRequest(path, options, responseType) {
  var config = getOneDriveConfig();
  return oneDriveGetToken(config).then(function (token) {
    function run(accessToken) {
      var headers = Object.assign({}, (options && options.headers) || {}, {
        Authorization: "Bearer " + accessToken
      });
      return fetch(ONE_DRIVE_GRAPH + path, Object.assign({}, options || {}, { headers: headers }))
        .then(function (response) {
          if (response.status !== 401) return response;
          // The cached token was rejected: renew once, then retry.
          _oneDriveToken = { token: "", expires: 0 };
          return oneDriveGetToken(config).then(function (fresh) {
            headers.Authorization = "Bearer " + fresh;
            return fetch(ONE_DRIVE_GRAPH + path, Object.assign({}, options || {}, { headers: headers }));
          });
        });
    }
    return run(token);
  }).then(function (response) {
    if (!response.ok) {
      return response.text().then(function (text) {
        throw oneDriveGraphError(response.status, text, path);
      });
    }
    // "blob" is used for sticker images; `true` is the legacy text flag.
    if (responseType === "blob") return response.blob();
    return responseType === true || responseType === "text" ? response.text() : response.json();
  });
}

function oneDriveGraphJson(path, options) {
  return oneDriveGraphRequest(path, options, false);
}

function oneDriveGraphText(path, options) {
  return oneDriveGraphRequest(path, options, true);
}

function oneDriveListFolder(path) {
  var folders = [];
  var files = [];
  function fetchPage(url) {
    return oneDriveGraphJson(url).then(function (data) {
      (data.value || []).forEach(function (item) {
        if (item.folder) {
          folders.push({ name: item.name, path: oneDriveJoinPath(path, item.name) });
        } else if (item.file) {
          files.push({
            name: item.name,
            key: oneDriveJoinPath(path, item.name),
            id: item.id || "",
            eTag: item.eTag || "",
            lastModified: item.lastModifiedDateTime || "",
            size: item.size || 0
          });
        }
      });
      var next = data["@odata.nextLink"];
      if (next) {
        var relative = next.indexOf(ONE_DRIVE_GRAPH) === 0 ? next.slice(ONE_DRIVE_GRAPH.length) : next;
        return fetchPage(relative);
      }
      return { folders: folders, files: files };
    });
  }
  var url = oneDriveItemPath(path, "/children") +
    "?$select=id,name,folder,file,eTag,lastModifiedDateTime,size&$top=200";
  return fetchPage(url);
}

// The app's own date-stamped backup names ("<prefix>-YYYYMMDDHHMM.json", or a
// custom SmdConfig.fileSyncLatestPattern for apps that save differently, e.g.
// Storyboard's story-YYYYMMDDHHMM.json). Used by every ":latest" shortcut.
function oneDriveAppPrefix() {
  if (typeof SmdConfig !== "undefined") {
    return SmdConfig.fileSyncExportPrefix || SmdConfig.minioExportPrefix || "planmydays";
  }
  return "planmydays";
}

function oneDriveIsAppBackupName(name) {
  var value = String(name == null ? "" : name);
  var pattern = (typeof SmdConfig !== "undefined" && SmdConfig.fileSyncLatestPattern) || null;
  if (pattern) {
    if (pattern instanceof RegExp) return pattern.test(value);
    if (typeof pattern === "string") {
      try { return new RegExp(pattern, "i").test(value); } catch (e) { return false; }
    }
  }
  var prefix = oneDriveAppPrefix();
  return value.indexOf(prefix + "-") === 0 && /-\d{12}\.json$/i.test(value);
}

// Newest matching file by NAME (the backup names carry YYYYMMDDHHMM).
function oneDrivePickLatestAppFile(files) {
  var matches = (files || []).filter(function (file) {
    return oneDriveIsAppBackupName(file.name);
  });
  if (!matches.length) return null;
  matches.sort(function (a, b) {
    return a.name < b.name ? 1 : (a.name > b.name ? -1 : 0);
  });
  return matches[0];
}

function oneDriveDirectoryLabel(path) {
  var parts = oneDriveNormalizeDirectory(path).split("/").filter(Boolean);
  return parts.length ? parts[parts.length - 1] : "OneDrive";
}

// Font Awesome file glyph via the shared <smd-image> (size fixed so it does not
// follow the app's Icon size setting, which would be far too large in a row).
function oneDriveFileIcon(extraClass) {
  return '<smd-image image="fa:file" size="18" class="' + (extraClass || "") +
    ' flex-shrink-0" aria-hidden="true"></smd-image>';
}

// The top-of-directory ":latest" shortcut uses Bootstrap's clock-history glyph.
function oneDriveLatestIcon(extraClass) {
  return '<smd-image image="bi:clock-history" size="18" class="' + (extraClass || "") +
    ' flex-shrink-0" aria-hidden="true"></smd-image>';
}

// Newest JSON in a folder (subfolder ":latest" rows).
function oneDriveLatestJson(folderPath) {
  return oneDriveListFolder(folderPath).then(function (list) {
    return oneDrivePickLatestAppFile(list.files);
  });
}

function oneDriveEnsureFolder(path) {
  var dir = oneDriveNormalizeDirectory(path);
  if (!dir) return Promise.resolve("");
  var parts = dir.split("/");
  var current = "";

  function step(index) {
    if (index >= parts.length) return Promise.resolve(dir);
    var part = parts[index];
    var next = oneDriveJoinPath(current, part);
    return oneDriveGraphJson(oneDriveItemPath(next)).then(function () {
      current = next;
      return step(index + 1);
    }).catch(function (err) {
      if (err.status !== 404) throw err;
      var body = {
        name: part,
        folder: {},
        "@microsoft.graph.conflictBehavior": "fail"
      };
      return oneDriveGraphJson(oneDriveItemPath(current, "/children"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
      }).catch(function (createErr) {
        if (createErr.status !== 409) throw createErr;
      }).then(function () {
        current = next;
        return step(index + 1);
      });
    });
  }

  return step(0);
}

function oneDriveGetFile(key) {
  return oneDriveGraphText(oneDriveItemPath(key, "/content"));
}

// Binary download (sticker images). Follows Graph's /content redirect to the
// pre-authenticated download URL; the same 401-once retry as every Graph call.
function oneDriveDownloadBlob(key) {
  return oneDriveGraphRequest(oneDriveItemPath(key, "/content"), { cache: "no-store" }, "blob");
}

function oneDrivePutFile(key, text) {
  var parts = oneDriveNormalizeDirectory(key).split("/");
  var dir = parts.slice(0, -1).join("/");
  return oneDriveEnsureFolder(dir).then(function () {
    return oneDriveGraphJson(oneDriveItemPath(key, "/content"), {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: text
    });
  });
}

function oneDriveFriendlyError(err) {
  var status = err && err.status;
  if (err && err.code === "sign_in_required") {
    return "OneDrive sign-in has expired. Open Settings > FileSync > OneDrive and sign in again.";
  }
  if (status === 401) {
    return "OneDrive sign-in has expired. Open Settings > FileSync > OneDrive and sign in again.";
  }
  if (status === 403) {
    return "OneDrive refused access. The Azure app needs the delegated Files.ReadWrite permission (an administrator may need to grant consent).";
  }
  if (status === 404) {
    return "That OneDrive item was not found. Check the Directory in Settings > FileSync > OneDrive.";
  }
  if (status === 429) return "OneDrive is throttling requests right now. Try again in a moment.";
  if (status === 507) return "OneDrive is out of space.";
  var message = (err && err.message) || String(err);
  if (/Failed to fetch|NetworkError|ERR_/i.test(message)) {
    return "Cannot reach OneDrive. Check your internet connection.";
  }
  return message;
}

// ---- Hamburger menu --------------------------------------------------------

function updateOneDriveMenu() {
  var enabled = getOneDriveConfig().enabled;
  var items = document.querySelectorAll(".onedrive-menu-item");
  for (var i = 0; i < items.length; i++) {
    items[i].style.display = enabled ? "" : "none";
  }
}

// ---- Open from OneDrive page ----------------------------------------------

var _oneDriveCloseTimer = null;
var oneDriveCurrentPath = "";
var _oneDriveListSeq = 0;

var ONEDRIVE_PAGE_STYLES = `
  #oneDriveBody .od-toolbar {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    flex-wrap: wrap;
    margin-bottom: 0.75rem;
  }
  #oneDriveBody .od-crumbs {
    color: var(--bs-secondary-color, #6c757d);
    word-break: break-word;
  }
  #oneDriveBody .od-status {
    text-align: center;
    padding: 2.5rem 1rem;
  }
  #oneDriveBody .od-status p { margin: 0.5rem 0 0; }
  #oneDriveBody .od-status smd-button { margin-top: 1rem; }
  #oneDriveBody .od-meta {
    margin-left: auto;
    max-width: 100%;
    padding-left: 0.5rem;
    color: var(--bs-secondary-color, #6c757d);
    font-size: var(--smd-type-badge, 0.8em);
    /* The name + timestamp is longer than a phone row, so the meta wraps onto
       its own line(s) rather than running past the right edge. On a wide row it
       still sits right-aligned on one line. */
    overflow-wrap: anywhere;
  }
  /* A phone cannot fit the file name and its right-aligned timestamp on one
     line: without wrap the name + meta run past the right edge and the stamp is
     clipped. With wrap the meta drops to its own (still right-aligned) line. */
  #oneDriveBody .list-group-item {
    flex-wrap: wrap;
  }
  /* Storyboard's split folder row: left half navigates, right half opens the
     latest backup (or is disabled). One row per directory. */
  #oneDriveImportPage #oneDriveBody .od-folder-split {
    display: flex;
    align-items: stretch;
    padding: 0;
  }
  #oneDriveImportPage #oneDriveBody .od-split-half {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    min-width: 0;
    padding: 0.75rem 1rem;
    border: 0;
    background: transparent;
    color: inherit;
    text-align: left;
    cursor: pointer;
  }
  #oneDriveImportPage #oneDriveBody .od-split-nav {
    flex: 0 0 40%;
  }
  #oneDriveImportPage #oneDriveBody .od-split-latest {
    flex: 1 1 60%;
  }
  #oneDriveImportPage #oneDriveBody .od-split-half + .od-split-half {
    border-left: 1px solid var(--bs-border-color, rgba(255, 255, 255, 0.15));
  }
  #oneDriveImportPage #oneDriveBody .od-split-half:hover:not(:disabled) {
    background-color: rgba(var(--bs-body-color-rgb, 33, 37, 41), 0.06);
  }
  #oneDriveImportPage #oneDriveBody .od-split-half:disabled {
    cursor: default;
    opacity: 0.6;
  }
  #oneDriveImportPage #oneDriveBody .od-split-label {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  /* MINIO_IMPORT_STYLES' hover uses --bs-secondary-bg, which is a LIGHT surface
     on the always-dark themes (superhero light) while the text stays light.
     The doubled page id outranks the :is(...)-scoped MinIO rule. */
  #oneDriveImportPage #oneDriveBody .list-group-item {
    color: var(--bs-body-color, #212529);
  }
  #oneDriveImportPage #oneDriveBody .list-group-item:hover,
  #oneDriveImportPage #oneDriveBody .list-group-item:focus,
  #oneDriveImportPage #oneDriveBody .list-group-item:focus-visible {
    background-color: rgba(var(--bs-body-color-rgb, 33, 37, 41), 0.14);
    color: var(--bs-body-color, #212529);
  }
  /* MINIO_IMPORT_STYLES (shared by both file pages) makes every .btn
     transparent - it is written for the outline buttons on the MinIO page.
     These pages use filled <smd-button>s, so restore the real theme surfaces.
     The doubled #oneDriveImportPage id outranks the :is(...) scoped MinIO rule. */
  #oneDriveImportPage #oneDriveBody .btn-primary {
    background-color: var(--bs-primary);
    border-color: var(--bs-primary);
  }
  #oneDriveImportPage #oneDriveBody .btn-secondary {
    background-color: var(--bs-secondary);
    border-color: var(--bs-secondary);
  }
`;

var ONEDRIVE_ICON_UP = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" class="me-2 flex-shrink-0" viewBox="0 0 16 16"><path fill-rule="evenodd" d="M11.354 1.646a.5.5 0 0 1 0 .708L5.707 8l5.647 5.646a.5.5 0 0 1-.708.708l-6-6a.5.5 0 0 1 0-.708l6-6a.5.5 0 0 1 .708 0z"/></svg>';
var ONEDRIVE_ICON_FOLDER = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" class="me-2 flex-shrink-0" viewBox="0 0 16 16"><path d="M.54 3.87.5 3a2 2 0 0 1 2-2h3.672a2 2 0 0 1 1.414.586l.828.828A2 2 0 0 0 9.828 3h3.982a2 2 0 0 1 1.992 2.181l-.637 7A2 2 0 0 1 13.174 14H2.826a2 2 0 0 1-1.991-1.819l-.637-7a1.984 1.984 0 0 1 .342-1.31z"/></svg>';
var ONEDRIVE_ICON_LATEST = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" class="me-2 flex-shrink-0" viewBox="0 0 16 16"><path d="M8 3.5a.5.5 0 0 0-1 0V9a.5.5 0 0 0 .252.434l3.5 2a.5.5 0 0 0 .496-.868L8 8.71V3.5z"/><path d="M8 16A8 8 0 1 0 8 0a8 8 0 0 0 0 16zm7-8A7 7 0 1 1 1 8a7 7 0 0 1 14 0z"/></svg>';

function oneDriveTimestamp() {
  var d = new Date();
  return String(d.getFullYear()) +
    String(d.getMonth() + 1).padStart(2, "0") +
    String(d.getDate()).padStart(2, "0") +
    String(d.getHours()).padStart(2, "0") +
    String(d.getMinutes()).padStart(2, "0");
}

function oneDriveBreadcrumb(path) {
  var parts = ["OneDrive"].concat(oneDriveNormalizeDirectory(path).split("/").filter(Boolean));
  return parts.map(function (part) { return escapeHtml(part); }).join(" / ");
}

function oneDriveInlineArg(value) {
  return String(value == null ? "" : value)
    .replace(/\\/g, "\\\\")
    .replace(/'/g, "\\'")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function oneDriveRootPath() {
  return oneDriveNormalizeDirectory(getOneDriveConfig().directory);
}

// Browsing never leaves the configured Directory (empty = the drive root).
function oneDriveClampPath(path) {
  var root = oneDriveRootPath();
  var value = oneDriveNormalizeDirectory(path);
  if (!root) return value;
  if (!value || value === root) return root;
  if (value.indexOf(root + "/") !== 0) return root;
  return value;
}

function oneDriveParentPath(path) {
  var root = oneDriveRootPath();
  var value = oneDriveNormalizeDirectory(path);
  if (!value || value === root) return root;
  var index = value.lastIndexOf("/");
  var parent = index >= 0 ? value.slice(0, index) : "";
  if (root && parent.indexOf(root) !== 0) return root;
  return parent;
}

function oneDriveToolbarHtml(path) {
  // No Up control here: the directory LIST already carries an "< Up" row when
  // the current folder has a parent (the apps only save inside the configured
  // Directory, and the list row is the one navigation affordance).
  return '<div class="od-toolbar">' +
    '<smd-button id="btnOneDriveRefresh" size="small" variant="secondary" onclick="oneDriveRefresh()">Refresh</smd-button>' +
    '<span class="od-crumbs">' + oneDriveBreadcrumb(path) + '</span>' +
    '</div>';
}

function oneDriveStatusHtml(config) {
  if (!config.clientId) {
    return '<div class="od-status">' +
      '<p><strong>OneDrive is not configured.</strong></p>' +
      '<p>Add the Azure app registration Client ID in Settings &gt; FileSync &gt; OneDrive.</p>' +
      '<smd-button variant="primary" onclick="openOneDriveSettings()">Open Settings</smd-button>' +
      '</div>';
  }
  return '<div class="od-status">' +
    '<p><strong>Not signed in to OneDrive.</strong></p>' +
    '<p>Sign in with your Microsoft 365 account to browse your backups.</p>' +
    '<smd-button variant="primary" onclick="signInToOneDrive()">Sign in</smd-button>' +
    '</div>';
}

function oneDriveFormatDate(value) {
  if (!value) return "";
  var date = new Date(value);
  if (isNaN(date.getTime())) return "";
  return date.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

var ONEDRIVE_MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

// DD MON YYYY. HH24:MI (local time) for the ":latest" file names.
function oneDriveFormatStamp(value) {
  if (!value) return "";
  var date = new Date(value);
  if (isNaN(date.getTime())) return "";
  return String(date.getDate()).padStart(2, "0") + " " +
    ONEDRIVE_MONTHS[date.getMonth()] + " " + date.getFullYear() + ". " +
    String(date.getHours()).padStart(2, "0") + ":" +
    String(date.getMinutes()).padStart(2, "0");
}

function oneDriveLatestMeta(latest) {
  if (!latest) return "";
  var stamp = oneDriveFormatStamp(latest.lastModified);
  return escapeHtml(latest.name) + (stamp ? " / " + escapeHtml(stamp) : "");
}

function oneDriveSplitFolderRows() {
  return typeof SmdConfig !== "undefined" && SmdConfig.oneDriveSplitFolderRows === true;
}

function oneDriveRenderList(path, list, latests) {
  var body = $id("oneDriveBody");
  if (!body) return;
  var folders = list.folders.slice().sort(function (a, b) { return a.name.localeCompare(b.name); });
  var files = list.files.filter(function (file) {
    return /\.json$/i.test(file.name);
  }).sort(function (a, b) {
    var am = a.lastModified || "";
    var bm = b.lastModified || "";
    if (am !== bm) return am < bm ? 1 : -1;
    return a.name < b.name ? 1 : (a.name > b.name ? -1 : 0);
  });

  var rows = [];
  if (oneDriveNormalizeDirectory(path) !== oneDriveRootPath()) {
    rows.push('<li class="list-group-item list-group-item-action d-flex align-items-center od-up" style="cursor:pointer" onclick="oneDriveNavigate(oneDriveParentPath(oneDriveCurrentPath))">' +
      ONEDRIVE_ICON_UP + 'Up</li>');
  }

  // A ":latest" shortcut for the DIRECTORY BEING VIEWED (above its folders and
  // files), when it already holds this app's date-stamped backups. The
  // per-subfolder ":latest" rows below cover the child folders.
  var currentLatest = oneDrivePickLatestAppFile(list.files);
  if (currentLatest) {
    rows.push('<li class="list-group-item list-group-item-action d-flex align-items-center od-latest-current" style="cursor:pointer" onclick="oneDrivePickFile(\'' +
      oneDriveInlineArg(currentLatest.key) + '\')">' + oneDriveLatestIcon("me-2") +
      escapeHtml(oneDriveDirectoryLabel(path)) +
      ':latest<span class="od-meta">' + oneDriveLatestMeta(currentLatest) + '</span></li>');
  }

  folders.forEach(function (folder) {
    var latest = latests[folder.path];
    if (oneDriveSplitFolderRows()) {
      // Storyboard: ONE row per directory. Left half navigates; right half opens
      // the newest backup (or is disabled when the folder has none).
      rows.push('<li class="list-group-item od-folder-split">' +
        '<button type="button" class="od-split-half od-split-nav" onclick="oneDriveNavigate(\'' +
          oneDriveInlineArg(folder.path) + '\')">' + ONEDRIVE_ICON_FOLDER +
          '<span class="od-split-label">' + escapeHtml(folder.name) + '</span></button>' +
        (latest
          ? '<button type="button" class="od-split-half od-split-latest" onclick="oneDrivePickFile(\'' +
              oneDriveInlineArg(latest.key) + '\')">' + oneDriveFileIcon("") +
              '<span class="od-split-label">:latest ' + oneDriveLatestMeta(latest) + '</span></button>'
          : '<button type="button" class="od-split-half od-split-latest" disabled>' +
              '<span class="od-split-label">No backups</span></button>') +
        '</li>');
      return;
    }
    rows.push('<li class="list-group-item list-group-item-action d-flex align-items-center od-folder" style="cursor:pointer" onclick="oneDriveNavigate(\'' +
      oneDriveInlineArg(folder.path) + '\')">' + ONEDRIVE_ICON_FOLDER + escapeHtml(folder.name) + '</li>');
    if (latest) {
      rows.push('<li class="list-group-item list-group-item-action d-flex align-items-center od-latest" style="cursor:pointer" onclick="oneDrivePickFile(\'' +
        oneDriveInlineArg(latest.key) + '\')">' + ONEDRIVE_ICON_LATEST + escapeHtml(folder.name) +
        ':latest<span class="od-meta">' + oneDriveLatestMeta(latest) + '</span></li>');
    }
  });

  files.forEach(function (file) {
    rows.push('<li class="list-group-item list-group-item-action d-flex align-items-center od-file" style="cursor:pointer" onclick="oneDrivePickFile(\'' +
      oneDriveInlineArg(file.key) + '\')">' + oneDriveFileIcon("me-2") + escapeHtml(file.name) +
      '<span class="od-meta">' + escapeHtml(oneDriveFormatDate(file.lastModified)) + '</span></li>');
  });

  body.innerHTML = oneDriveToolbarHtml(path) +
    (rows.length
      ? '<ul class="list-group">' + rows.join("") + '</ul>'
      : '<div class="od-status"><p>No JSON files or subfolders here.</p></div>');
}

function oneDriveRenderShellError(path, err) {
  var body = $id("oneDriveBody");
  if (!body) return;
  var config = getOneDriveConfig();
  if (err && err.code === "sign_in_required") {
    localStorage.removeItem(oneDriveGlobalKey("account"));
    refreshOneDriveSettingsUi();
    body.innerHTML = oneDriveToolbarHtml(path) + oneDriveStatusHtml(config);
    return;
  }
  body.innerHTML = oneDriveToolbarHtml(path) +
    '<div class="od-status">' +
      '<p><strong>Could not open this OneDrive folder.</strong></p>' +
      '<p>' + escapeHtml(oneDriveFriendlyError(err)) + '</p>' +
      '<smd-button variant="primary" onclick="oneDriveRefresh()">Try again</smd-button>' +
    '</div>';
}

function oneDriveLoadFolder(path) {
  var body = $id("oneDriveBody");
  if (!body) return;
  var config = getOneDriveConfig();
  if (!config.clientId || !config.account) {
    oneDriveCurrentPath = oneDriveClampPath(path || oneDriveRootPath());
    body.innerHTML = oneDriveToolbarHtml(oneDriveCurrentPath) + oneDriveStatusHtml(config);
    return;
  }
  var target = oneDriveClampPath(path || oneDriveRootPath());
  oneDriveCurrentPath = target;
  var seq = ++_oneDriveListSeq;
  body.innerHTML = oneDriveToolbarHtml(target) +
    '<div class="od-status"><div class="spinner-border"></div><p class="mt-2">Loading OneDrive…</p></div>';

  oneDriveListFolder(target).then(function (list) {
    var latestPromises = list.folders.map(function (folder) {
      return oneDriveLatestJson(folder.path).then(function (latest) {
        return { path: folder.path, latest: latest };
      }).catch(function () {
        return { path: folder.path, latest: null };
      });
    });
    return Promise.all(latestPromises).then(function (results) {
      // Key by PATH: the renderer sorts folders by name, so an index-aligned
      // array would attach a folder's :latest to the wrong row.
      var latests = {};
      results.forEach(function (result) {
        latests[result.path] = result.latest;
      });
      return { list: list, latests: latests };
    });
  }).then(function (result) {
    if (seq !== _oneDriveListSeq) return;
    oneDriveRenderList(target, result.list, result.latests);
  }).catch(function (err) {
    if (seq !== _oneDriveListSeq) return;
    oneDriveRenderShellError(target, err);
  });
}

function renderOneDrivePage() {
  var body = $id("oneDriveBody");
  if (!body) return;
  var config = getOneDriveConfig();
  if (!oneDriveCurrentPath) oneDriveCurrentPath = oneDriveRootPath();
  oneDriveCurrentPath = oneDriveClampPath(oneDriveCurrentPath);
  if (!config.clientId || !config.account) {
    body.innerHTML = oneDriveToolbarHtml(oneDriveCurrentPath) + oneDriveStatusHtml(config);
    return;
  }
  oneDriveLoadFolder(oneDriveCurrentPath);
}

function oneDriveRefresh() {
  oneDriveInit().then(function (account) {
    if (!account) {
      renderOneDrivePage();
      return;
    }
    oneDriveLoadFolder(oneDriveCurrentPath || oneDriveRootPath());
  }).catch(function (err) {
    oneDriveRenderShellError(oneDriveCurrentPath || oneDriveRootPath(), err);
  });
}

function oneDriveNavigate(path) {
  oneDriveLoadFolder(path);
}

function oneDrivePickFile(key) {
  var body = $id("oneDriveBody");
  if (!body) return;
  body.innerHTML = oneDriveToolbarHtml(oneDriveCurrentPath) +
    '<div class="od-status"><div class="spinner-border"></div><p class="mt-2">Downloading ' +
    escapeHtml(key) + '…</p></div>';

  oneDriveGetFile(key).then(function (content) {
    var data;
    try {
      data = JSON.parse(content);
    } catch (e) {
      throw new Error("Invalid JSON file: " + e.message);
    }
    if (!data || typeof data !== "object") {
      throw new Error("Invalid JSON file: expected an object.");
    }
    if (typeof SmdConfig !== "undefined" && typeof SmdConfig.onFileSyncImport === "function") {
      if (!SmdConfig.onFileSyncImport("onedrive", data, key)) {
        showOneDriveAlert("Invalid backup file: missing data for this app.", "error");
        oneDriveLoadFolder(oneDriveCurrentPath);
      }
      return;
    }
    if (!data.streams && !data.images) {
      showOneDriveAlert("Invalid backup file: missing streams or images data.", "error");
      oneDriveLoadFolder(oneDriveCurrentPath);
      return;
    }
    if (data.streams) localStorage.setItem(smdKey("streams"), JSON.stringify(data.streams));
    if (data.images) saveImages(data.images);
    closeOneDrivePage();
    showOneDriveAlert("Imported " + key + " successfully.", "info");
    if (typeof regenerateTiles === "function") regenerateTiles();
  }).catch(function (err) {
    showOneDriveAlert("OneDrive import failed: " + oneDriveFriendlyError(err), "error");
    oneDriveLoadFolder(oneDriveCurrentPath);
  });
}

function openOneDrivePage() {
  var page = document.getElementById("oneDriveImportPage");
  if (!page) return;
  clearTimeout(_oneDriveCloseTimer);
  if (!page.__oneDriveBound) {
    page.__oneDriveBound = true;
    page.addEventListener("smd-page-action", function () { closeOneDrivePage(); });
  }
  oneDriveCurrentPath = oneDriveRootPath();
  page.classList.remove("d-none");
  page.title = "Open from OneDrive";
  page.headerHtml = "";
  page.content = '<div id="oneDriveBody"></div>';
  page.buttons = [{ text: "Close", variant: "secondary", action: "cancel" }];
  if (typeof MINIO_IMPORT_STYLES === "string") injectStyleInto(MINIO_IMPORT_STYLES);
  injectStyleInto(ONEDRIVE_PAGE_STYLES);
  page.show();
  oneDriveInit().then(function () {
    renderOneDrivePage();
  }).catch(function (err) {
    oneDriveRenderShellError(oneDriveCurrentPath, err);
  });
}

function closeOneDrivePage() {
  var page = document.getElementById("oneDriveImportPage");
  if (!page) return;
  page.hide();
  clearTimeout(_oneDriveCloseTimer);
  _oneDriveCloseTimer = setTimeout(function () {
    page.classList.add("d-none");
  }, Math.max(0, (page.slideDuration || 0) + 50));
}

// Shortcut from the page's "not configured" state: close the page, open
// Settings and land on FileSync > OneDrive.
function openOneDriveSettings() {
  closeOneDrivePage();
  if (typeof openSettings !== "function") return;
  openSettings();
  if (typeof focusFileSyncSettingsTab === "function") focusFileSyncSettingsTab("onedrive");
}

// ---- Save to OneDrive -----------------------------------------------------

function saveToOneDrive() {
  var config = getOneDriveConfig();
  if (!config.enabled) return;
  if (!config.clientId) {
    showOneDriveAlert("Add the Azure app registration Client ID in Settings > FileSync > OneDrive first.", "error");
    return;
  }
  oneDriveInit().then(function (account) {
    if (!account) {
      showOneDriveAlert("Sign in to OneDrive from Settings > FileSync > OneDrive first.", "error");
      return;
    }
    // App-owned export (CountMyDays' wizard, Storyboard's story save). The hook
    // owns the upload and its success/error alerts.
    if (typeof SmdConfig !== "undefined" && typeof SmdConfig.onFileSyncExport === "function") {
      SmdConfig.onFileSyncExport("onedrive", config);
      return;
    }
    var data;
    if (typeof SmdConfig !== "undefined" && typeof SmdConfig.fileSyncExportData === "function") {
      data = SmdConfig.fileSyncExportData("onedrive");
    } else if (typeof SmdConfig !== "undefined" && typeof SmdConfig.minioExportData === "function") {
      data = SmdConfig.minioExportData();
    } else {
      data = {
        version: 1,
        exportedAt: new Date().toISOString(),
        streams: JSON.parse(localStorage.getItem(smdKey("streams")) || "[]"),
        images: loadImages()
      };
    }
    var prefix = (typeof SmdConfig !== "undefined" &&
      (SmdConfig.fileSyncExportPrefix || SmdConfig.minioExportPrefix)) || "planmydays";
    var filename = prefix + "-" + oneDriveTimestamp() + ".json";
    var key = oneDriveJoinPath(config.directory, filename);
    oneDrivePutFile(key, JSON.stringify(data, null, 2)).then(function () {
      showOneDriveAlert("Exported " + key + " to OneDrive.", "info");
    }).catch(function (err) {
      showOneDriveAlert("OneDrive export failed: " + oneDriveFriendlyError(err), "error");
    });
  }).catch(function (err) {
    showOneDriveAlert("OneDrive is not ready: " + oneDriveAuthError(err), "error");
  });
}

// A redirect-flow sign-in leaves the app for Microsoft and returns via the
// redirect bridge. That bridge caches the response and navigates back to this
// page, where handleRedirectPromise() must run once to store the account - even
// if the user lands on the main screen. Only do this when the flow actually
// started a redirect (no MSAL load at boot otherwise).
document.addEventListener("DOMContentLoaded", function () {
  if (localStorage.getItem(oneDriveGlobalKey("pendingRedirect")) !== "1") return;
  oneDriveInit().then(function () {
    localStorage.removeItem(oneDriveGlobalKey("pendingRedirect"));
  }).catch(function () {
    localStorage.removeItem(oneDriveGlobalKey("pendingRedirect"));
  });
});
