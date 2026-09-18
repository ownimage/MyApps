const { test, expect } = require("@playwright/test");

const SEED_LINKS = [
  { title: "Example Site", url: "https://example.com", description: "A description", image: "", sequence: 1 },
  { title: "No URL Link", url: "", description: "", image: "", sequence: 2 }
];

const SEED_IMAGES = [
  { name: "sharedimg", data: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg'%3E%3C/svg%3E" }
];

async function seed(page, overrides = {}) {
  const data = {
    links: SEED_LINKS,
    images: SEED_IMAGES,
    settings: {},
    ...overrides
  };
  await page.goto("/QRLinks/");
  await page.evaluate(({ links, images, settings }) => {
    localStorage.clear();
    if (links) localStorage.setItem("qrlinks_links", JSON.stringify(links));
    if (images) localStorage.setItem("shared-images", JSON.stringify(images));
    Object.entries(settings).forEach(([key, value]) => localStorage.setItem("qrlinks_" + key, value));
  }, data);
  await page.reload();
  await page.waitForLoadState("domcontentloaded");
}

test.describe("QRLinks - Regression", () => {

  test("boots with no console errors and renders link cards in sequence order", async ({ page }) => {
    const consoleErrors = [];
    const pageErrors = [];
    page.on("console", (msg) => { if (msg.type() === "error") consoleErrors.push(msg.text()); });
    page.on("pageerror", (err) => pageErrors.push(String(err)));

    await seed(page, {
      links: [
        { title: "Second", url: "https://second.example", sequence: 2 },
        { title: "First", url: "https://first.example", sequence: 1 }
      ]
    });

    await expect(page.locator("qrlink-card")).toHaveCount(2);
    await expect(page.locator("qrlink-card").first()).toHaveAttribute("title", "First");
    expect(consoleErrors).toEqual([]);
    expect(pageErrors).toEqual([]);
  });

  test("shows the empty state when there are no links", async ({ page }) => {
    await seed(page, { links: [] });
    await expect(page.locator("#countdownContainer")).toContainText("No links yet");
    await expect(page.locator("qrlink-card")).toHaveCount(0);
  });

  test("QR button opens the shared modal with a QR code and an Open action", async ({ page }) => {
    await seed(page);
    const card = page.locator("qrlink-card").filter({ hasText: "Example Site" });
    await card.locator("button.qr-btn").click();
    await expect(page.locator("#smdConfirmModal")).toBeVisible();
    await expect(page.locator("#smdConfirmModal h3")).toHaveText("Example Site");
    await expect(page.locator("#smdConfirmModal smd-qrcode")).toHaveAttribute("value", "https://example.com");
    await expect(page.locator("#smdConfirmModal")).toContainText("https://example.com");
    await page.locator("#smdConfirmModal").getByRole("button", { name: "Close" }).click();
    await expect(page.locator("#smdConfirmModal")).not.toBeVisible();

    // The QR button is hidden for links without a URL.
    await expect(page.locator("qrlink-card").filter({ hasText: "No URL Link" }).locator("button.qr-btn")).toBeHidden();
  });

  test("adds, edits and deletes a link", async ({ page }) => {
    await seed(page);
    await page.evaluate(() => openLinksEditor());
    await expect(page.locator("#linksEditor")).toHaveAttribute("open", "");
    await expect(page.locator("#linksEditor .qrlink-list-card")).toHaveCount(2);

    // Add
    await page.locator("#linksEditor").getByRole("button", { name: "Add Link" }).click();
    await page.locator("#linkTitleInput").fill("Added Link");
    await page.locator("#linkUrlInput").fill("https://added.example");
    await page.locator("#linkDescriptionInput").fill("Added description");
    await page.locator("#linkEditPage").getByRole("button", { name: "OK" }).click();
    await expect(page.locator("#linksEditor .qrlink-list-card")).toHaveCount(3);
    expect(await page.evaluate(() => loadLinks().some(l => l.url === "https://added.example"))).toBe(true);

    // Edit
    await page.locator("#linksEditor .qrlink-list-card").filter({ hasText: "Added Link" }).getByRole("button", { name: "Edit" }).click();
    await page.locator("#linkTitleInput").fill("Renamed Link");
    await page.locator("#linkEditPage").getByRole("button", { name: "OK" }).click();
    await expect(page.locator("#linksEditor .qrlink-list-card").filter({ hasText: "Renamed Link" })).toHaveCount(1);

    // Delete
    await page.locator("#linksEditor .qrlink-list-card").filter({ hasText: "Renamed Link" }).getByRole("button", { name: "Delete" }).click();
    await expect(page.locator("#smdConfirmModal")).toBeVisible();
    await page.locator("#smdConfirmModal").getByRole("button", { name: "Delete" }).click();
    await expect(page.locator("#linksEditor .qrlink-list-card")).toHaveCount(2);
    expect(await page.evaluate(() => loadLinks().some(l => l.title === "Renamed Link"))).toBe(false);

    await page.locator("#linksEditor").getByRole("button", { name: "OK" }).click();
    await expect(page.locator("#countdownContainer")).not.toHaveClass(/d-none/);
  });

  test("settings has General/Danger tabs, theme, share QR and the sample actions", async ({ page }) => {
    await seed(page);
    await page.evaluate(() => openSettings());
    await expect(page.locator("#settingsPage")).toHaveAttribute("open", "");
    await expect(page.locator("#settingsPage smd-tabs .smd-tab-btn")).toHaveText(["General", "Danger"]);
    expect(await page.locator("#themeSelector select option").count()).toBe(26);
    await expect(page.locator("#shareQrCode img").first()).toBeVisible({ timeout: 30000 });

    // Danger rows are hidden until Show danger; the sample actions live there.
    await page.locator("#danger-tab").click();
    await expect(page.locator("#loadSampleLinksRow")).toBeHidden();
    await page.locator("#showDanger").check();
    await expect(page.locator("#loadSampleLinksRow")).toBeVisible();
    await expect(page.locator("#settingsPage").getByRole("button", { name: "Load Sample Links" })).toBeVisible();
    await expect(page.locator("#settingsPage").getByRole("button", { name: "Load Sample Images" })).toBeVisible();

    // Load Sample Links replaces the links with the bundled sample set.
    await page.locator("#settingsPage").getByRole("button", { name: "Load Sample Links" }).click();
    await expect(page.locator("#smdConfirmModal")).toContainText("Sample links loaded");
    await page.locator("#smdConfirmModal").getByRole("button", { name: "OK" }).click();
    expect(await page.evaluate(() => loadLinks().length)).toBe(7);
    await expect(page.locator("qrlink-card")).toHaveCount(7);
  });

  test("images editor uses the shared image library", async ({ page }) => {
    await seed(page);
    await page.evaluate(() => openImagesEditor());
    await expect(page.locator("#imagesEditor")).toHaveAttribute("open", "");
    const card = page.locator("#imagesEditor smd-image-card").filter({ hasText: "sharedimg" });
    await expect(card).toHaveCount(1);

    // The thumbnail must read the SHARED library (key-prefix shared-) and
    // actually render an image, not just the card title.
    const thumb = card.locator("smd-image");
    await expect(thumb).toHaveAttribute("key-prefix", "shared-");
    await expect(thumb).toHaveAttribute("image", "sharedimg");
    await expect.poll(async () => thumb.locator("img").getAttribute("src")).toBeTruthy();

    await page.evaluate(() => closeImagesEditor());
    await expect(page.locator("#imagesEditor")).not.toHaveAttribute("open", "");
  });

  test("legacy qr_ keys are left untouched (no migration runs)", async ({ page }) => {
    await seed(page);
    await page.evaluate(() => {
      localStorage.setItem("qr_links", JSON.stringify([{ title: "Legacy Link", url: "https://legacy.example", sequence: 1 }]));
      localStorage.setItem("qr_images", JSON.stringify([{ name: "LegacyImg", data: "data:image/svg+xml,%3Csvg/%3E" }]));
      localStorage.setItem("qr_theme", "brite");
    });
    await page.reload();
    await page.waitForLoadState("domcontentloaded");
    const state = await page.evaluate(() => ({
      legacyLinks: JSON.parse(localStorage.getItem("qr_links") || "null"),
      legacyImages: localStorage.getItem("qr_images"),
      links: loadLinks().length,
      theme: localStorage.getItem("qrlinks_theme")
    }));
    // The legacy data stays exactly as written — no migration runs.
    expect(state.legacyLinks).toEqual([{ title: "Legacy Link", url: "https://legacy.example", sequence: 1 }]);
    expect(state.legacyImages).toBe(JSON.stringify([{ name: "LegacyImg", data: "data:image/svg+xml,%3Csvg/%3E" }]));
    // The app only reads its namespaced keys (default theme = "superhero"),
    // so the legacy qr_theme="brite" is not applied.
    expect(state.links).toBe(2);
    expect(state.theme).toBe("superhero");
  });

  test("image rename and delete follow through to link references", async ({ page }) => {
    await seed(page, {
      links: [{ title: "With Image", url: "https://img.example", image: "sharedimg", sequence: 1 }],
      images: [{ name: "sharedimg", data: "data:image/svg+xml,%3Csvg/%3E" }]
    });
    await page.evaluate(() => startEditImage(0));
    await page.waitForTimeout(300);
    const nameInput = page.locator("#imageEditModalBody input.form-control").first();
    await nameInput.fill("renamedimg");
    await nameInput.press("Tab");
    await expect.poll(async () => page.evaluate(() => loadLinks()[0].image)).toBe("renamedimg");
    // Commit the rename (Cancel would restore the original image name).
    await page.locator("#imageEditModal").getByRole("button", { name: "OK" }).click();
    await page.waitForTimeout(300);

    // The image is in use, so the card's Delete is disabled; delete via the API
    // to verify the reference-clearing hook.
    await page.evaluate(() => deleteImage(0));
    expect(await page.evaluate(() => loadLinks()[0].image)).toBe("");
  });
});
