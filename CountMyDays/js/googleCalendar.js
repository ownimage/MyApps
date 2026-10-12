// -------------------------------
// googleCalendar.js - Google Calendar OAuth + event feed
// Ported from the newer standalone CountMyDays (temp/CountMyDays) and adapted
// to the shared multi-app library:
//   - storage keys are namespaced through smdKey() (countmydays_gcal_*,
//     countmydays_google_cal).
//   - the app-info dialog uses the shared showSmdModal (no custom overlay).
// Loads Google Identity Services (GSI) on demand, exchanges an OAuth token and
// fetches the calendar event feed. The event feed is cached by app.js.
// -------------------------------

const GSI_SCRIPT_URL = "https://accounts.google.com/gsi/client";
const GOOGLE_CAL_SCOPE = "https://www.googleapis.com/auth/calendar.events";

// Prefix-aware key helpers (evaluated at call time, after SmdConfig is set).
// They live in shared/js/smd-gcal.js so PlanMyDay can reuse this module against
// the SAME (CountMyDays) namespace via SmdGcal.setGcalPrefix("countmydays_").
function gcalKey(name) {
  return SmdGcal.gcalKey(name);
}
function googleCalCacheKey() {
  return SmdGcal.googleCalCacheKey();
}

function getGCalClientId() {
  return localStorage.getItem(gcalKey("client_id")) || "";
}

function getGCalCalendarId() {
  return localStorage.getItem(gcalKey("calendar_id")) || "primary";
}

function getGCalUserName() {
  return (localStorage.getItem(gcalKey("name")) || "").trim();
}

function isGCalEnabled() {
  return localStorage.getItem(gcalKey("enabled")) === "true";
}

function getCachedGoogleAccessToken() {
  const token = localStorage.getItem(gcalKey("access_token"));
  const exp = parseInt(localStorage.getItem(gcalKey("access_token_exp")) || "0", 10);
  // Refresh 60s before expiry
  if (token && exp > Date.now() + 60000) return token;
  return null;
}

function storeGoogleAccessToken(tokenResponse) {
  if (!tokenResponse || !tokenResponse.access_token) return;
  localStorage.setItem(gcalKey("access_token"), tokenResponse.access_token);
  const expiresInSec = parseInt(tokenResponse.expires_in, 10) || 3600;
  localStorage.setItem(gcalKey("access_token_exp"), String(Date.now() + expiresInSec * 1000));
}

function clearGoogleAccessToken() {
  localStorage.removeItem(gcalKey("access_token"));
  localStorage.removeItem(gcalKey("access_token_exp"));
}

function loadGoogleIdentityScript() {
  return new Promise((resolve, reject) => {
    if (window.google && google.accounts && google.accounts.oauth2) {
      resolve();
      return;
    }

    const script = document.createElement("script");
    script.src = GSI_SCRIPT_URL;
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Failed to load Google Identity Services."));
    document.head.appendChild(script);
  });
}

function requestGoogleAccessToken(forcePrompt) {
  if (!isGCalEnabled()) {
    return Promise.reject(new Error("Google Calendar is not enabled. Turn it on in Settings -> G Cal."));
  }

  const clientId = getGCalClientId();
  if (!clientId) {
    return Promise.reject(new Error("Google Calendar is not configured. Add your OAuth Client ID in Settings -> G Cal."));
  }

  if (!forcePrompt) {
    const cached = getCachedGoogleAccessToken();
    if (cached) return Promise.resolve(cached);
  }

  return loadGoogleIdentityScript().then(() => {
    return new Promise((resolve, reject) => {
      let triedSilent = !forcePrompt;

      function handleTokenResponse(tokenResponse) {
        if (tokenResponse.error) {
          // Silent re-auth failed — fall back to interactive once
          if (triedSilent) {
            triedSilent = false;
            tokenClient.requestAccessToken({ prompt: "consent" });
            return;
          }
          reject(new Error("OAuth failed: " + (tokenResponse.error_description || tokenResponse.error)));
          return;
        }
        storeGoogleAccessToken(tokenResponse);
        resolve(tokenResponse.access_token);
      }

      const tokenClient = google.accounts.oauth2.initTokenClient({
        client_id: clientId,
        scope: GOOGLE_CAL_SCOPE,
        callback: handleTokenResponse
      });

      // prompt: "" tries to reuse prior consent without UI
      tokenClient.requestAccessToken(forcePrompt ? { prompt: "consent" } : { prompt: "" });
    });
  });
}

function googleApiFetch(url, options) {
  options = options || {};
  return requestGoogleAccessToken(false)
    .then(accessToken => {
      const headers = Object.assign({}, options.headers || {}, {
        Authorization: "Bearer " + accessToken
      });
      return fetch(url, Object.assign({}, options, { headers: headers }));
    })
    .then(res => {
      if (res.status !== 401) return res;
      // Token rejected — clear and retry once with interactive auth
      clearGoogleAccessToken();
      return requestGoogleAccessToken(true).then(accessToken => {
        const headers = Object.assign({}, options.headers || {}, {
          Authorization: "Bearer " + accessToken
        });
        return fetch(url, Object.assign({}, options, { headers: headers }));
      });
    });
}

// -------------------------------
// Fetch the Google Calendar event feed (JSON) with the OAuth exchange
// -------------------------------

function fetchEvents() {
  const calendarId = getGCalCalendarId();
  const url = "https://www.googleapis.com/calendar/v3/calendars/" +
    encodeURIComponent(calendarId) +
    "/events?maxResults=250&orderBy=startTime&singleEvents=true&timeMin=" +
    encodeURIComponent(new Date().toISOString());

  return googleApiFetch(url)
    .then(res => {
      if (!res.ok) throw new Error("Calendar API " + res.status + " " + res.statusText);
      return res.json();
    });
}

function refreshMainDisplay() {
  if (typeof renderCountdowns === "function") renderCountdowns();
}

// -------------------------------
// Feed -> CountMyDays date tiles
// -------------------------------

// The pure feed mapping lives in shared/js/smd-gcal.js (SmdGcal) so PlanMyDay
// can keep exactly the events CountMyDays shows; these globals stay for the
// app's own callers with the CountMyDays-configured name bound in.
function gcalEventToDate(evt) {
  return SmdGcal.gcalEventToDate(evt, getGCalUserName());
}

function loadGoogleCalendarEntries() {
  return SmdGcal.visibleGoogleEntries(SmdGcal.loadFeed(), getGCalUserName());
}

function extractCmdPayloadBlock(description) {
  return SmdGcal.extractCmdPayloadBlock(description);
}

function parseCmdUsersObject(body) {
  return SmdGcal.parseCmdUsersObject(body);
}

function serializeCmdUsersObject(users) {
  const escape = s => String(s || "").replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  const parts = Object.keys(users).map(name => {
    const u = users[name] || {};
    const safeName = String(name).replace(/'/g, "");
    const showVal = u.show === false ? "false" : "true";
    return "'" + safeName + "': {category: \"" + escape(u.category) + "\", image: \"" + escape(u.image) + "\", show: " + showVal + "}";
  });
  return parts.join(", ");
}

// Shape: {count_my_days{'keith': {category: "...", image: "...", show: true}, ...}}
// Amends the named user entry; leaves other names intact.
function buildDescriptionWithCmdPayload(existingDescription, category, image, show) {
  const userName = getGCalUserName();
  if (!userName) {
    throw new Error("Set your Name in Settings -> G Cal before saving event icons.");
  }

  const extracted = extractCmdPayloadBlock(existingDescription);
  const users = Object.assign({}, extracted.users);
  users[userName] = {
    category: category || "",
    image: image || "",
    show: show !== false
  };

  const payloadText = "{count_my_days{" + serializeCmdUsersObject(users) + "}}";
  const before = extracted.base || "";
  const after = extracted.suffix || "";
  // Preserve surrounding description text; only replace the payload block.
  if (!before && !after) return payloadText;
  if (!before) return payloadText + after;
  if (!after) {
    // Keep a single newline between body text and payload when needed
    const sep = /\s$/.test(before) ? "" : (before.endsWith("\n") ? "" : "\n");
    return before + sep + payloadText;
  }
  return before + payloadText + after;
}

// Returns category/image/show for the configured Name only.
function parseCmdPayloadFromDescription(description) {
  return SmdGcal.parseCmdPayloadFromDescription(description, getGCalUserName());
}

// PATCH event description on Google Calendar (single event or series master id).
function updateGoogleEventDescription(eventId, description) {
  const calendarId = getGCalCalendarId();
  const url = "https://www.googleapis.com/calendar/v3/calendars/" +
    encodeURIComponent(calendarId) +
    "/events/" + encodeURIComponent(eventId);

  return googleApiFetch(url, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ description: description })
  })
    .then(res => {
      if (!res.ok) throw new Error("Calendar API " + res.status + " " + res.statusText);
      return res.json();
    });
}

// -------------------------------
// App info modal (shared smd-modal; replaces system alert dialogs)
// -------------------------------

function showAppInfoModal(title, message) {
  if (typeof showSmdModal !== "function") {
    alert(message);
    return;
  }
  showSmdModal({
    title: title,
    content: escapeHtml(message).replace(/\n/g, "<br>"),
    buttons: [{ text: "OK", variant: "primary", action: "ok" }]
  });
}

// -------------------------------
// Menu handler: Google -> Refresh. Fetch, store, report
// -------------------------------

// The spinner is optional: CountMyDays defines showSpinner/hideSpinner
// (import-wizard.js), but PlanMyDay reuses this module without them.
function gcalShowSpinner() { if (typeof showSpinner === "function") showSpinner(); }
function gcalHideSpinner() { if (typeof hideSpinner === "function") hideSpinner(); }

function refreshGoogleCalendar() {
  gcalShowSpinner();
  return fetchEvents()
    .then(json => {
      SmdGcal.storeFeed(json);
      gcalHideSpinner();
      refreshMainDisplay();
      const count = (json.items && json.items.length) || 0;
      showAppInfoModal("Google Calendar", "Refreshed: " + count + " events cached.");
    })
    .catch(err => {
      gcalHideSpinner();
      showAppInfoModal("Google Calendar", "Failed to refresh: " + err.message);
    });
}

function clearGoogleCalCache() {
  localStorage.removeItem(googleCalCacheKey());
  refreshMainDisplay();
  showAppInfoModal("Google Calendar", "Cached feed cleared.");
}

// -------------------------------
// Load sample data from js/googleCalendarSample.json
// -------------------------------

function loadGCalSampleData() {
  const cacheBuster = typeof BUILD_NUMBER !== "undefined" ? BUILD_NUMBER : Date.now();

  gcalShowSpinner();
  return fetch("js/googleCalendarSample.json?v=" + cacheBuster)
    .then(res => {
      if (!res.ok) throw new Error("HTTP " + res.status);
      return res.json();
    })
    .then(json => {
      gcalHideSpinner();
      if (!json.items) {
        showAppInfoModal("Sample Data", "Sample Google Calendar data is invalid.");
        return;
      }
      SmdGcal.storeFeed(json);
      refreshMainDisplay();
      showAppInfoModal("Sample Data", json.items.length + " events cached.");
    })
    .catch(err => {
      gcalHideSpinner();
      showAppInfoModal("Sample Data", "Failed to load: " + err.message);
    });
}
