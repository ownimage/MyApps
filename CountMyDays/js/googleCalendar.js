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
const CMD_PAYLOAD_MARKER = "count_my_days";

// Prefix-aware key helpers (evaluated at call time, after SmdConfig is set).
function gcalKey(name) {
  return smdKey("gcal_" + name);
}
function googleCalCacheKey() {
  return smdKey("google_cal");
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

function gcalEventToDate(evt) {
  const start = evt.start || {};
  let y, m, d;
  if (start.date) {
    const parts = String(start.date).split("-");
    y = parseInt(parts[0], 10);
    m = parseInt(parts[1], 10);
    d = parseInt(parts[2], 10);
  } else if (start.dateTime) {
    const dt = new Date(start.dateTime);
    y = dt.getFullYear();
    m = dt.getMonth() + 1;
    d = dt.getDate();
  } else {
    return null;
  }
  if (!y || !m || !d) return null;

  let category = "";
  let image = "";
  let show = true;
  if (evt._cmd) {
    category = evt._cmd.category || "";
    image = evt._cmd.image || "";
    show = evt._cmd.show !== false;
  } else if (typeof parseCmdPayloadFromDescription === "function") {
    const cmd = parseCmdPayloadFromDescription(evt.description);
    if (cmd) {
      category = cmd.category || "";
      image = cmd.image || "";
      show = cmd.show !== false;
    }
  }

  return {
    name: evt.summary || "(Untitled event)",
    category: category,
    image: image,
    show: show,
    recurring: !!(evt.recurringEventId || (evt.recurrence && evt.recurrence.length)),
    gcal: true,
    type: "once",
    year: y,
    month: m,
    day: d
  };
}

function loadGoogleCalendarEntries() {
  const feed = loadGoogleCalFeed();
  if (!feed || !Array.isArray(feed.items)) return [];
  return feed.items.map(gcalEventToDate).filter(d => d && d.show !== false);
}

// Extract {count_my_days{...}} block (brace-balanced), keeping text before and after.
// Shape: {count_my_days{'name': {category: "...", image: "...", show: true}, ...}}
function extractCmdPayloadBlock(description) {
  const text = String(description || "");
  const marker = "{count_my_days";
  const idx = text.lastIndexOf(marker);
  if (idx === -1) return { base: text, suffix: "", block: null, users: {} };

  // Brace-balance from the opening '{' of the marker
  let depth = 0;
  let endIdx = -1;
  for (let i = idx; i < text.length; i++) {
    if (text[i] === "{") depth++;
    else if (text[i] === "}") {
      depth--;
      if (depth === 0) {
        endIdx = i + 1;
        break;
      }
    }
  }
  if (endIdx === -1) endIdx = text.length;

  const block = text.slice(idx, endIdx);
  // Inner users object starts at first '{' after marker text
  const afterMarker = idx + marker.length;
  let usersOpen = afterMarker;
  while (usersOpen < endIdx && text[usersOpen] !== "{") usersOpen++;
  let usersInner = "";
  if (text[usersOpen] === "{") {
    let d = 0;
    let start = -1;
    for (let i = usersOpen; i < endIdx; i++) {
      if (text[i] === "{") {
        d++;
        if (d === 1) start = i + 1;
      } else if (text[i] === "}") {
        d--;
        if (d === 0 && start !== -1) {
          usersInner = text.slice(start, i);
          break;
        }
      }
    }
  }

  return {
    base: text.slice(0, idx),
    suffix: text.slice(endIdx),
    block: block,
    users: parseCmdUsersObject(usersInner)
  };
}

function parseCmdUsersObject(body) {
  const users = {};
  const unescape = s => String(s || "").replace(/\\"/g, '"').replace(/\\\\/g, "\\");
  // Match 'name': { ... } or "name": { ... }
  const entryRe = /['"]([^'"]+)['"]\s*:\s*\{([^}]*)\}/g;
  let m;
  while ((m = entryRe.exec(body)) !== null) {
    const name = m[1];
    const inner = m[2];
    const catMatch = inner.match(/category\s*:\s*"((?:\\.|[^"\\])*)"/);
    const imgMatch = inner.match(/image\s*:\s*"((?:\\.|[^"\\])*)"/);
    const showMatch = inner.match(/show\s*:\s*(true|false)/i);
    users[name] = {
      category: catMatch ? unescape(catMatch[1]) : "",
      image: imgMatch ? unescape(imgMatch[1]) : "",
      show: showMatch ? showMatch[1].toLowerCase() === "true" : true
    };
  }
  return users;
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
  const userName = getGCalUserName();
  if (!userName) return null;
  const extracted = extractCmdPayloadBlock(description);
  if (!extracted.users || !extracted.users[userName]) return null;
  const u = extracted.users[userName];
  return {
    category: u.category || "",
    image: u.image || "",
    show: u.show !== false
  };
}

function isGcalSequenceEvent(evt) {
  if (!evt) return false;
  if (evt.recurringEventId) return true;
  if (evt.recurrence && evt.recurrence.length) return true;
  return false;
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

function closeAppInfoModal() {
  const modal = document.getElementById("smdConfirmModal");
  if (modal && typeof modal.hide === "function") modal.hide();
}

// -------------------------------
// Menu handler: Google -> Refresh. Fetch, store, report
// -------------------------------

function refreshGoogleCalendar() {
  showSpinner();
  fetchEvents()
    .then(json => {
      storeGoogleCalFeed(json);
      hideSpinner();
      refreshMainDisplay();
      const count = (json.items && json.items.length) || 0;
      showAppInfoModal("Google Calendar", "Refreshed: " + count + " events cached.");
    })
    .catch(err => {
      hideSpinner();
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

  showSpinner();
  fetch("js/googleCalendarSample.json?v=" + cacheBuster)
    .then(res => {
      if (!res.ok) throw new Error("HTTP " + res.status);
      return res.json();
    })
    .then(json => {
      hideSpinner();
      if (!json.items) {
        showAppInfoModal("Sample Data", "Sample Google Calendar data is invalid.");
        return;
      }
      storeGoogleCalFeed(json);
      refreshMainDisplay();
      showAppInfoModal("Sample Data", json.items.length + " events cached.");
    })
    .catch(err => {
      hideSpinner();
      showAppInfoModal("Sample Data", "Failed to load: " + err.message);
    });
}
