const { test, expect } = require("@playwright/test");
const { startCoverage, stopCoverage } = require("./coverage");

test.beforeEach(async ({ page }) => { await startCoverage(page); });
test.afterEach(async ({ page }) => { await stopCoverage(page); });

// Storyboard - the left rail and the fly-out panels use the shared <smd-button>
// for their ACTION buttons (rail tools, Save/zoom/Fit/Pin, the panel close X,
// story/scene row actions, New story/scene, the properties Done, Place text /
// Done and the sticker-library Sign in / Retry).
//
// NOT converted (deliberate): the picture/colour PICKERS - background thumbnails
// (`.sb-bg-option`), colour swatches (`.sb-swatch`), text border previews
// (`.sb-border-option`) and the sticker tiles inside `<sb-sticker>` - because they
// are tiles with images/colours, not Bootstrap buttons.

const SCENE = {
  id: "btn-scene", name: "Scene 1", background: "", items: [], connectors: [], groups: [],
  view: { zoom: 1, fx: 0.5, fy: 0.5 }
};
const STORY = { id: "btn-story", name: "Buttons", scenes: [SCENE], activeSceneId: SCENE.id };

async function seed(page) {
  await page.goto("/");
  await page.evaluate((story) => {
    localStorage.setItem("storyboard_stories", JSON.stringify([story]));
    localStorage.setItem("storyboard_activeStory", story.id);
    localStorage.setItem("storyboard_activeScene", story.activeSceneId);
  }, STORY);
  await page.goto("/Storyboard/");
  await expect(page.locator("#sbCanvas")).toBeVisible();
}

async function isSmdButton(locator) {
  expect(await locator.evaluate((el) => el.tagName)).toBe("SMD-BUTTON");
  await expect(locator.locator(":scope > button")).toHaveCount(1);
}

test.describe("Storyboard - smd-button conversion", () => {
  test("every rail action is an smd-button with its icon and label intact", async ({ page }) => {
    await seed(page);

    const railButtons = page.locator("#sbToolbar .sb-rail smd-button.sb-rail-btn");
    await expect(railButtons).toHaveCount(8); // 4 tools + zoom out/in + Fit + Pin (Save moved to the board)
    for (const button of await railButtons.all()) {
      await isSmdButton(button);
      await expect(button.locator(":scope > button > i")).toHaveCount(1);
    }

    // Tools keep their icon + visible label; the icons still render.
    const stories = page.locator('#sbToolbar .sb-rail-btn[data-tool="boards"]');
    await expect(stories.locator("button i")).toHaveClass(/fa-book-open/);
    await expect(stories.locator("button .smd-button-label")).toHaveText("Stories");
    // Save moved off the rail onto the board chip row (see storyboard-save.spec).
    await expect(page.locator("#sbSaveSceneBtn button i")).toHaveClass(/fa-download/);
    await expect(page.locator("#sbZoomOut button i")).toHaveClass(/fa-magnifying-glass-minus/);
    await expect(page.locator("#sbPinBtn button i")).toHaveClass(/fa-thumbtack/);

    // Icon-only controls got an accessible name on the real (inner) button.
    await expect(page.locator("#sbZoomIn button")).toHaveAttribute("aria-label", "Zoom in");
    await expect(page.locator("#sbPinBtn button")).toHaveAttribute("aria-label", "Pin toolbar open");
  });

  test("the fly-out panel's header, row actions and add buttons are smd-buttons", async ({ page }) => {
    await seed(page);
    await page.locator('.sb-rail-btn[data-tool="boards"]').click();
    await expect(page.locator("#sbPanelTitle")).toHaveText("Stories");

    await isSmdButton(page.locator("#sbPanelClose"));
    await expect(page.locator("#sbPanelClose button i")).toHaveClass(/fa-xmark/);
    await expect(page.locator("#sbPanelClose button")).toHaveAttribute("aria-label", "Close");

    const storyRow = page.locator('.sb-story-row[data-story-id="btn-story"]');
    await isSmdButton(storyRow.locator('.sb-story-pick'));
    await isSmdButton(storyRow.locator('.sb-story-act[data-act="story-props"]'));
    await isSmdButton(storyRow.locator('.sb-story-act[data-act="rename-story"]'));
    await isSmdButton(storyRow.locator('.sb-story-act[data-act="delete-story"]'));
    await expect(storyRow.locator('.sb-story-act[data-act="story-props"] button i')).toHaveClass(/fa-cog/);
    await expect(storyRow.locator('.sb-story-act[data-act="rename-story"] button')).toHaveAttribute("aria-label", "Rename story");

    // The delete action on the ONLY story is disabled on the inner button (the
    // host keeps the attribute; the real control is the inner <button>).
    await expect(storyRow.locator('.sb-story-act[data-act="delete-story"]')).toHaveAttribute("disabled", "");
    await expect(storyRow.locator('.sb-story-act[data-act="delete-story"] button')).toBeDisabled();

    const sceneRow = page.locator('.sb-board-row[data-board-id="btn-scene"]');
    await isSmdButton(sceneRow.locator(".sb-board-pick"));
    await isSmdButton(sceneRow.locator('.sb-board-act[data-act="rename"]'));
    await isSmdButton(sceneRow.locator('.sb-board-act[data-act="delete"]'));

    await isSmdButton(page.locator(".sb-add-scene"));
    await expect(page.locator(".sb-add-scene button")).toHaveClass(/btn-primary/);
    await isSmdButton(page.locator("#sbAddStory"));
    await expect(page.locator("#sbAddStory button")).toHaveClass(/btn-primary/);
    // The shared component's block mode keeps "New story" full width.
    await expect(page.locator("#sbAddStory")).toHaveAttribute("block", "");
  });

  test("story properties and the text panel use smd-buttons", async ({ page }) => {
    await seed(page);
    await page.locator('.sb-rail-btn[data-tool="boards"]').click();
    await page.locator('.sb-story-row[data-story-id="btn-story"] .sb-story-act[data-act="story-props"]').click();

    await isSmdButton(page.locator('.sb-story-props [data-act="story-props-close"]'));
    await expect(page.locator('.sb-story-props [data-act="story-props-close"] button')).toHaveClass(/btn-success/);

    await page.locator('.sb-rail-btn[data-tool="text"]').click();
    const place = page.locator("#sbPlaceText");
    await isSmdButton(place);
    await expect(place.locator("button")).toHaveClass(/btn-primary/);
    // Empty text: the real button is disabled (not just the host attribute).
    await expect(place.locator("button")).toBeDisabled();
    await page.locator("#sbTextInput").fill("Hello");
    await expect(place.locator("button")).toBeEnabled();
    await place.click();
    await isSmdButton(page.locator("#sbDoneText"));
    await expect(page.locator("#sbDoneText button")).toHaveClass(/btn-primary/);
  });

  test("the picture and colour pickers stay bespoke tiles", async ({ page }) => {
    await seed(page);
    await page.locator('.sb-rail-btn[data-tool="background"]').click();
    await expect(page.locator("#sbPanelBody .sb-bg-option").first()).toHaveJSProperty("tagName", "BUTTON");

    await page.locator('.sb-rail-btn[data-tool="text"]').click();
    await expect(page.locator("#sbPanelBody .sb-swatch").first()).toHaveJSProperty("tagName", "BUTTON");
    await expect(page.locator("#sbPanelBody .sb-border-option").first()).toHaveJSProperty("tagName", "BUTTON");
  });
});
