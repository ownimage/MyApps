// OneDrive OAuth redirect page (loaded by /onedrive-callback.html).
//
// MSAL v5 does NOT process the redirect on the redirect page with its own
// handleRedirectPromise (the token request cache lives in the page that started
// the flow, so that fails with "no_token_request_cache_error"). Instead the
// redirect page loads @azure/msal-browser/redirect-bridge and calls
// broadcastResponseToMainFrame():
//   - popup flow: broadcasts the response on the flow's BroadcastChannel and
//     closes; the opener's loginPopup() promise resolves with it.
//   - redirect/iOS/standalone flow: navigates back to the page that started the
//     flow, where handleRedirectPromise() picks up the cached response.
// The bridge does not need the Client ID or a full MSAL instance.
(function () {
  "use strict";

  var msg = document.getElementById("msg");

  function show(text) {
    if (msg) msg.textContent = text;
  }

  if (!window.msalRedirectBridge ||
      typeof window.msalRedirectBridge.broadcastResponseToMainFrame !== "function") {
    show("The OneDrive sign-in bridge did not load. Close this window and try again.");
    return;
  }

  window.msalRedirectBridge.broadcastResponseToMainFrame().catch(function (e) {
    var text = (e && (e.errorMessage || e.message)) || String(e);
    if (/hash_empty_error|no auth response|empty/i.test(text)) {
      show("No OneDrive sign-in response was found. Close this window and start the sign-in again from MyApps.");
      return;
    }
    show("OneDrive sign-in failed: " + text + ". You can close this window and try again.");
  });
})();
