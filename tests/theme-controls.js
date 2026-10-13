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

module.exports = { pickOption, optionLabels };
