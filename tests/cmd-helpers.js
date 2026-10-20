// Shared CountMyDays test helpers.
const { expect } = require("@playwright/test");

// CountMyDays deliberately shows the temporary "Category ID Migration" reminder
// on EVERY open. It occludes the toolbar/pages, so tests that click must dismiss
// it after a goto/reload. No-op for other apps (no modal).
async function dismissCategoryIdMigration(page) {
  const modal = page.locator("#smdConfirmModal[open]");
  if (await modal.count()) {
    await expect(modal).toContainText("Category ID Migration");
    await modal.getByRole("button", { name: "OK" }).click();
    await expect(modal).not.toBeVisible();
  }
}

module.exports = { dismissCategoryIdMigration };
