// The single build number for the whole app + shared library: it cache-busts
// every asset (components, services, themes, vendor, app scripts). One file,
// one number — consumers load THIS file (not their own build-number) and use
// the BUILD_NUMBER global. It lives in the shared library folder so it travels
// with the library when synced to a consumer app.
const BUILD_NUMBER = "202609101000";
if (typeof window !== "undefined") window.BUILD_NUMBER = BUILD_NUMBER;