// Shared Google Calendar feed helpers (window.SmdGcal).
//
// PURE mapping only: given a cached Google Calendar feed (and the user's
// configured name), map each item to a CountMyDays-style date entry, and read
// the `{count_my_days{...}}` description payload that stores per-user category
// / image / visibility. Nothing here touches storage or the network.
//
// Extracted from CountMyDays/js/googleCalendar.js so PlanMyDay can read the
// SAME cached feed and keep exactly the events CountMyDays would show, without
// duplicating the payload parser. CountMyDays keeps thin global wrappers so its
// existing callers/tests are unaffected.

(function (global) {
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

  // Returns category/image/show for ONE user name (null when absent).
  function parseCmdPayloadFromDescription(description, userName) {
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

  // Map one Google Calendar feed item to a CountMyDays-style date entry. A
  // locally-stamped `_cmd` (written by the CountMyDays editor) wins; otherwise
  // the `{count_my_days{...}}` description payload for `userName` supplies the
  // category / image / visibility.
  function gcalEventToDate(evt, userName) {
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
    } else {
      const cmd = parseCmdPayloadFromDescription(evt.description, userName);
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

  // The feed's visible entries (hidden ones are editor-only in CountMyDays).
  function visibleGoogleEntries(feed, userName) {
    if (!feed || !Array.isArray(feed.items)) return [];
    return feed.items
      .map(function (evt) { return gcalEventToDate(evt, userName); })
      .filter(function (d) { return d && d.show !== false; });
  }

  global.SmdGcal = {
    extractCmdPayloadBlock: extractCmdPayloadBlock,
    parseCmdUsersObject: parseCmdUsersObject,
    parseCmdPayloadFromDescription: parseCmdPayloadFromDescription,
    gcalEventToDate: gcalEventToDate,
    visibleGoogleEntries: visibleGoogleEntries
  };
})(window);
