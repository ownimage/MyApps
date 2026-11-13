// Helpers for driving the shared <smd-select> controls that replaced the native
// <select>s for Theme / Theme Mode. There is no `.selectOption()` any more, so a
// pick = open the menu and click the option by VALUE (its label is the value with
// a capitalised first letter, e.g. "brite" -> "Brite").
async function pickOption(page, control, value) {
  await page.locator(control + " .smd-select-btn").click();
  // Options carry their value as `data-value` (labels are not always the value).
  await page.locator(control + ' .smd-select-item[data-value="' + value + '"]').click();
}

// The option labels (the old `<select> option` texts).
async function optionLabels(page, control) {
  return page.locator(control + " .smd-select-item").allTextContents();
}

// A changed data-theme attribute precedes the stylesheet loads. Register the
// listeners before changing theme and only skip links whose URL is unchanged.
async function applyThemeAndWait(page, name, mode) {
  await page.evaluate(async ({name, mode}) => {
    const ids = ["bootstrap-theme-css", "theme-override-mode", "theme-override-specific"];
    const entries = ids.map(id => {
      const link = document.getElementById(id);
      let done;
      const ready = new Promise((resolve, reject) => {
        const cleanup = () => { link.removeEventListener("load", loaded); link.removeEventListener("error", failed); };
        const loaded = () => { cleanup(); resolve(); };
        const failed = () => { cleanup(); reject(new Error("Theme stylesheet failed: " + link.href)); };
        done = loaded;
        link.addEventListener("load", loaded);
        link.addEventListener("error", failed);
      });
      return {link, href: link.href, done, ready};
    });
    applyTheme(name, mode);
    entries.forEach(entry => {
      if (entry.href === entry.link.href && entry.link.sheet) entry.done();
    });
    await Promise.all(entries.map(entry => entry.ready));
    await document.fonts.ready;
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  }, {name, mode});
}

module.exports = { pickOption, optionLabels, applyThemeAndWait };
