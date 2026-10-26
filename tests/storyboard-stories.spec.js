const { test, expect } = require("@playwright/test");

// Storyboard - Stories contain Scenes.
//
// A Story owns an ordered list of Scenes; each Scene is a full board (its own
// background, stickers, text, connectors, groups and zoom/pan). The rail's
// first tool is the Story tree: clicking a Story expands its Scenes, clicking a
// Scene edits it, and both Story and Scene names are renameable.

function sticker(id) {
  return {
    id,
    type: "sticker",
    sticker: "mermaid",
    x: 50,
    y: 50,
    scale: 1,
    rotation: 0,
    z: 1,
    flipX: false,
    flipY: false
  };
}

function scene(id, name, extra) {
  return Object.assign({
    id,
    name,
    background: "",
    items: [],
    connectors: [],
    groups: [],
    view: { zoom: 1, fx: 0.5, fy: 0.5 }
  }, extra || {});
}

function story(id, name, scenes, activeSceneId) {
  return { id, name, scenes, activeSceneId: activeSceneId || scenes[0].id };
}

async function seedStories(page, stories, activeStoryId) {
  await page.goto("/");
  await page.evaluate(({ list, active }) => {
    localStorage.setItem("storyboard_stories", JSON.stringify(list));
    localStorage.setItem("storyboard_activeStory", active);
    localStorage.setItem("storyboard_activeScene", list.find((s) => s.id === active).activeSceneId);
  }, { list: stories, active: activeStoryId || stories[0].id });
  await page.goto("/Storyboard/");
  await expect(page.locator("#sbCanvas")).toBeVisible();
}

async function openStories(page) {
  await page.locator('.sb-rail-btn[data-tool="boards"]').click();
  await expect(page.locator("#sbPanelTitle")).toHaveText("Stories");
}

async function stored(page) {
  return page.evaluate(() => ({
    stories: JSON.parse(localStorage.getItem("storyboard_stories") || "[]"),
    activeStory: localStorage.getItem("storyboard_activeStory"),
    activeScene: localStorage.getItem("storyboard_activeScene"),
    legacyBoards: localStorage.getItem("storyboard_boards")
  }));
}

test.describe("Storyboard - stories and scenes", () => {
  test("a fresh app starts with Story 1 containing Scene 1", async ({ page }) => {
    await page.goto("/Storyboard/");
    await expect(page.locator("#sbCanvas")).toBeVisible();
    await expect(page.locator("#mainNav #appNavTitle")).toHaveText("Storyboard - Story 1/Scene 1");
    await expect(page.locator('.sb-rail-btn[data-tool="boards"]')).toContainText("Stories");

    const state = await stored(page);
    expect(state.stories).toHaveLength(1);
    expect(state.stories[0].name).toBe("Story 1");
    expect(state.stories[0].scenes.map((s) => s.name)).toEqual(["Scene 1"]);
    expect(state.activeStory).toBe(state.stories[0].id);
    expect(state.activeScene).toBe(state.stories[0].scenes[0].id);
    // Everything lives under the story; there is no legacy board store.
    expect(state.legacyBoards).toBeNull();
  });

  test("New story creates Story N with Scene 1 and New scene adds to the active story", async ({ page }) => {
    await page.goto("/Storyboard/");
    await openStories(page);
    await expect(page.locator(".sb-story-row")).toHaveCount(1);
    await expect(page.locator(".sb-story-row.active + .sb-story-scenes .sb-board-row")).toHaveCount(1);

    await page.locator("#sbAddStory").click();
    await expect(page.locator(".sb-story-row")).toHaveCount(2);
    await expect(page.locator("#mainNav #appNavTitle")).toHaveText("Storyboard - Story 2/Scene 1");

    await page.locator(".sb-story-scenes .sb-add-scene").click();
    await expect(page.locator("#mainNav #appNavTitle")).toHaveText("Storyboard - Story 2/Scene 2");
    await expect(page.locator(".sb-story-row.active + .sb-story-scenes .sb-board-row")).toHaveCount(2);

    let state = await stored(page);
    expect(state.stories.map((s) => s.name)).toEqual(["Story 1", "Story 2"]);
    expect(state.stories[1].scenes.map((s) => s.name)).toEqual(["Scene 1", "Scene 2"]);
    expect(state.stories[0].scenes).toHaveLength(1);
    expect(state.activeStory).toBe(state.stories[1].id);
    expect(state.activeScene).toBe(state.stories[1].scenes[1].id);
  });

  test("each scene keeps its own content and clicking a story opens its scenes", async ({ page }) => {
    const a1 = scene("a1", "Scene 1", { background: "space", items: [sticker("a-item")] });
    const b1 = scene("b1", "Scene 1", { background: "underwater", items: [sticker("b1-item")] });
    const b2 = scene("b2", "Opening", { background: "", items: [sticker("b2-item")] });
    await seedStories(page, [
      story("story-a", "Story A", [a1]),
      story("story-b", "Story B", [b1, b2], "b2")
    ], "story-a");
    await expect(page.locator('.sb-object[data-id="a-item"]')).toBeVisible();

    await openStories(page);
    // Only the active story is expanded.
    await expect(page.locator(".sb-story-row.active")).toContainText("Story A");
    await expect(page.locator(".sb-story-row.active + .sb-story-scenes .sb-board-row")).toHaveCount(1);
    await expect(page.locator(".sb-board-row")).toHaveCount(1);

    // Clicking Story B selects it and opens its two scenes.
    await page.locator('.sb-story-pick:has-text("Story B")').click();
    await expect(page.locator(".sb-story-row.active")).toContainText("Story B");
    await expect(page.locator(".sb-story-row.active + .sb-story-scenes .sb-board-row")).toHaveCount(2);
    await expect(page.locator("#mainNav #appNavTitle")).toHaveText("Storyboard - Story B/Opening");
    await expect(page.locator('.sb-object[data-id="b2-item"]')).toBeVisible();

    // Selecting Scene 1 edits that scene.
    await page.locator('.sb-board-pick:has-text("Scene 1")').click();
    await expect(page.locator("#mainNav #appNavTitle")).toHaveText("Storyboard - Story B/Scene 1");
    await expect(page.locator('.sb-object[data-id="b1-item"]')).toBeVisible();
    await expect(page.locator('.sb-object[data-id="b2-item"]')).toHaveCount(0);
    await expect(page.locator("#sbBackground")).toHaveAttribute("data-background", "underwater");

    // Back to Story A's scene: its own background and sticker are intact.
    await page.locator('.sb-story-pick:has-text("Story A")').click();
    await expect(page.locator('.sb-object[data-id="a-item"]')).toBeVisible();
    await expect(page.locator("#sbBackground")).toHaveAttribute("data-background", "space");
    const state = await stored(page);
    expect(state.activeStory).toBe("story-a");
    expect(state.activeScene).toBe("a1");
  });

  test("story names must be unique (case and surrounding spaces ignored)", async ({ page }) => {
    await seedStories(page, [
      story("uniq-a", "Alpha", [scene("uniq-a-scene", "Scene 1")]),
      story("uniq-b", "Beta", [scene("uniq-b-scene", "Scene 1")])
    ], "uniq-a");
    await openStories(page);

    const row = page.locator('.sb-story-row[data-story-id="uniq-b"]');
    await row.locator('.sb-story-act[data-act="rename-story"]').click();
    const input = row.locator(".sb-story-pick input");
    await expect(input).toBeVisible();

    // Beta -> Alpha is rejected: the editor stays open with an explanation and
    // nothing is saved.
    await input.fill("Alpha");
    await input.press("Enter");
    await expect(page.locator(".sb-rename-error")).toContainText("already called");
    await expect(input).toBeVisible();
    expect((await stored(page)).stories.map((s) => s.name)).toEqual(["Alpha", "Beta"]);

    // Case and surrounding spaces do not make it unique either: the name also
    // becomes the OneDrive folder, which is case-insensitive.
    await input.fill("  aLpHa  ");
    await input.press("Enter");
    await expect(page.locator(".sb-rename-error")).toBeVisible();
    expect((await stored(page)).stories.map((s) => s.name)).toEqual(["Alpha", "Beta"]);

    // An empty name is refused too.
    await input.fill("   ");
    await input.press("Enter");
    await expect(page.locator(".sb-rename-error")).toContainText("needs a name");
    expect((await stored(page)).stories.map((s) => s.name)).toEqual(["Alpha", "Beta"]);

    // A name nobody else uses is accepted and persisted.
    await input.fill("Gamma");
    await input.press("Enter");
    await expect(page.locator(".sb-rename-error")).toHaveCount(0);
    await expect(page.locator('.sb-story-row[data-story-id="uniq-b"]')).toContainText("Gamma");
    expect((await stored(page)).stories.map((s) => s.name)).toEqual(["Alpha", "Gamma"]);
  });

  test("a story may keep its own name (and change only its case)", async ({ page }) => {
    await seedStories(page, [
      story("own-a", "Alpha", [scene("own-a-scene", "Scene 1")]),
      story("own-b", "Beta", [scene("own-b-scene", "Scene 1")])
    ], "own-a");
    await openStories(page);

    // Re-entering the same name is a no-op, not a clash with itself.
    let row = page.locator('.sb-story-row[data-story-id="own-a"]');
    await row.locator('.sb-story-act[data-act="rename-story"]').click();
    let input = row.locator(".sb-story-pick input");
    await input.fill("Alpha");
    await input.press("Enter");
    await expect(page.locator(".sb-rename-error")).toHaveCount(0);
    expect((await stored(page)).stories.map((s) => s.name)).toEqual(["Alpha", "Beta"]);

    // Changing only the case of its OWN name is allowed.
    row = page.locator('.sb-story-row[data-story-id="own-a"]');
    await row.locator('.sb-story-act[data-act="rename-story"]').click();
    input = row.locator(".sb-story-pick input");
    await input.fill("ALPHA");
    await input.press("Enter");
    await expect(page.locator(".sb-rename-error")).toHaveCount(0);
    expect((await stored(page)).stories.map((s) => s.name)).toEqual(["ALPHA", "Beta"]);
  });

  test("story and scene names can be renamed and persist", async ({ page }) => {
    await page.goto("/Storyboard/");
    await openStories(page);

    await page.locator('.sb-story-row .sb-story-act[data-act="rename-story"]').click();
    const storyInput = page.locator(".sb-story-pick input");
    await expect(storyInput).toBeVisible();
    await storyInput.fill("My Story");
    await storyInput.press("Enter");
    await expect(page.locator("#mainNav #appNavTitle")).toHaveText("Storyboard - My Story/Scene 1");
    await expect(page.locator(".sb-story-row.active")).toContainText("My Story");

    await page.locator('.sb-story-scenes .sb-board-act[data-act="rename"]').click();
    const sceneInput = page.locator(".sb-board-pick input");
    await expect(sceneInput).toBeVisible();
    await sceneInput.fill("Opening");
    await sceneInput.press("Enter");
    await expect(page.locator("#mainNav #appNavTitle")).toHaveText("Storyboard - My Story/Opening");

    await page.reload();
    await expect(page.locator("#sbCanvas")).toBeVisible();
    await expect(page.locator("#mainNav #appNavTitle")).toHaveText("Storyboard - My Story/Opening");
    const state = await stored(page);
    expect(state.stories[0].name).toBe("My Story");
    expect(state.stories[0].scenes[0].name).toBe("Opening");
  });

  test("scenes can be deleted, but the last scene and last story cannot", async ({ page }) => {
    await page.goto("/Storyboard/");
    await openStories(page);

    // The only scene of the only story: Delete is disabled.
    await expect(page.locator('.sb-board-act[data-act="delete"] button')).toBeDisabled();
    await expect(page.locator('.sb-story-act[data-act="delete-story"] button')).toBeDisabled();

    // Two scenes -> the active one can be deleted and the other becomes active.
    await page.locator(".sb-add-scene").click();
    await expect(page.locator(".sb-story-row.active + .sb-story-scenes .sb-board-row")).toHaveCount(2);
    await page.locator('.sb-story-row.active + .sb-story-scenes .sb-board-row.active .sb-board-act[data-act="delete"]').click();
    await expect(page.locator("#smdConfirmModal")).toContainText("Delete scene?");
    await page.locator("#smdConfirmModal").getByRole("button", { name: "Delete" }).click();
    await expect(page.locator(".sb-story-row.active + .sb-story-scenes .sb-board-row")).toHaveCount(1);
    await expect(page.locator('.sb-board-act[data-act="delete"] button')).toBeDisabled();

    // A second story lets the active story be deleted; Story 1 remains.
    await page.locator("#sbAddStory").click();
    await page.locator('.sb-story-row.active .sb-story-act[data-act="delete-story"]').click();
    await expect(page.locator("#smdConfirmModal")).toContainText("Delete story?");
    await page.locator("#smdConfirmModal").getByRole("button", { name: "Delete" }).click();
    await expect(page.locator(".sb-story-row")).toHaveCount(1);
    await expect(page.locator(".sb-story-row.active")).toContainText("Story 1");
    await expect(page.locator("#mainNav #appNavTitle")).toHaveText("Storyboard - Story 1/Scene 1");

    const state = await stored(page);
    expect(state.stories).toHaveLength(1);
    expect(state.activeStory).toBe(state.stories[0].id);
  });

  test("a delete confirmation keeps the Stories panel open after the outside-click grace", async ({ page }) => {
    // Regression: the panel's document outside-click handler used to treat a
    // click inside #smdConfirmModal as "outside" once 150ms had passed, so a
    // slow confirmation closed the panel before the delete re-rendered it.
    await page.goto("/Storyboard/");
    await openStories(page);
    await page.locator("#sbAddStory").click();
    await page.locator('.sb-story-row.active .sb-story-act[data-act="delete-story"]').click();
    await expect(page.locator("#smdConfirmModal")).toContainText("Delete story?");
    await page.waitForTimeout(300); // exceed the panel's 150ms grace period
    await page.locator("#smdConfirmModal").getByRole("button", { name: "Delete" }).click();
    await expect(page.locator("#sbToolbar")).toHaveAttribute("data-open", "boards");
    await expect(page.locator(".sb-story-row")).toHaveCount(1);
    await expect(page.locator(".sb-story-row.active")).toContainText("Story 1");
  });

  test("a scene can be duplicated directly below itself, with fresh ids", async ({ page }) => {
    const textItem = (id, text, z) => ({
      id, type: "text", text, bg: "transparent", color: "auto", border: "none", font: "theme",
      x: 30, y: 40, scale: 1, rotation: 0, z
    });
    const source = scene("dup-a", "Scene 1", {
      background: "space",
      items: [textItem("ta", "A", 1), textItem("tb", "B", 2), sticker("sa")],
      connectors: [{ id: "c1", from: "ta", to: "tb" }],
      groups: [{ id: "g1", children: ["ta", "tb"] }]
    });
    await seedStories(page, [story("dup-story", "Dup", [source, scene("dup-b", "Scene 2")])]);
    await openStories(page);
    await expect(page.locator(".sb-board-row")).toHaveCount(2);

    // The duplicate button sits BEFORE the rename (edit) action.
    const acts = await page.locator('.sb-board-row[data-board-id="dup-a"] .sb-board-act').evaluateAll((els) => els.map((e) => e.getAttribute("data-act")));
    expect(acts).toEqual(["duplicate", "rename", "delete"]);

    await page.locator('.sb-board-row[data-board-id="dup-a"] .sb-board-act[data-act="duplicate"]').click();
    await expect(page.locator(".sb-board-row")).toHaveCount(3);
    // Rendered directly under its source.
    expect(await page.evaluate(() => Array.prototype.map.call(
      document.querySelectorAll(".sb-board-row .sb-board-pick span"), (n) => n.textContent
    ))).toEqual(["Scene 1", "Scene 1 copy", "Scene 2"]);

    const scenes = (await stored(page)).stories[0].scenes;
    expect(scenes.map((s) => s.name)).toEqual(["Scene 1", "Scene 1 copy", "Scene 2"]);
    const copy = scenes[1];
    expect(copy.id).not.toBe("dup-a");
    expect(copy.background).toBe("space");
    expect(copy.items).toHaveLength(3);

    // Fresh ids, and the copy's connector/group point at the COPY's items.
    const copyIds = copy.items.map((i) => i.id);
    expect(copyIds.some((id) => ["ta", "tb", "sa"].includes(id))).toBe(false);
    expect(new Set(copyIds).size).toBe(3);
    const copyA = copy.items.find((i) => i.text === "A");
    const copyB = copy.items.find((i) => i.text === "B");
    expect(copy.connectors).toHaveLength(1);
    expect(copy.connectors[0].from).toBe(copyA.id);
    expect(copy.connectors[0].to).toBe(copyB.id);
    expect(copy.groups).toHaveLength(1);
    expect(copy.groups[0].children.slice().sort()).toEqual([copyA.id, copyB.id].sort());

    // The source is untouched and stays the active scene.
    expect(scenes[0].items.map((i) => i.id)).toEqual(["ta", "tb", "sa"]);
    expect(await page.evaluate(() => sbActiveBoard().id)).toBe("dup-a");

    await page.reload();
    await expect(page.locator("#sbCanvas")).toBeVisible();
    expect((await stored(page)).stories[0].scenes.map((s) => s.name)).toEqual(["Scene 1", "Scene 1 copy", "Scene 2"]);
  });

  test("the Stories panel is wide enough to show the story and scene names, and New story has a gap above it", async ({ page }) => {
    const wide = story("wide-story", "A Rather Long Story Name", [
      scene("w1", "The Opening Scene Of It All"),
      scene("w2", "Scene 2")
    ]);
    await seedStories(page, [wide]);
    await openStories(page);

    const geom = await page.evaluate(() => {
      const panel = document.querySelector(".sb-panel");
      const storySpan = document.querySelector(".sb-story-row .sb-story-pick span");
      const sceneSpan = document.querySelector(".sb-board-row .sb-board-pick span");
      const add = document.getElementById("sbAddStory");
      const list = document.querySelector(".sb-board-list");
      const truncated = (el) => el.scrollWidth - el.clientWidth > 1;
      return {
        panelWidth: Math.round(panel.getBoundingClientRect().width),
        storyText: storySpan.textContent,
        sceneText: sceneSpan.textContent,
        storyTruncated: truncated(storySpan),
        sceneTruncated: truncated(sceneSpan),
        gapAbove: Math.round(add.getBoundingClientRect().top - list.getBoundingClientRect().bottom)
      };
    });

    expect(geom.storyText).toBe("A Rather Long Story Name");
    expect(geom.sceneText).toBe("The Opening Scene Of It All");
    expect(geom.panelWidth).toBeGreaterThanOrEqual(380);
    expect(geom.storyTruncated).toBe(false);
    expect(geom.sceneTruncated).toBe(false);
    // The New story button is separated from the story list.
    expect(geom.gapAbove).toBeGreaterThan(8);
  });

  test("the drag ghost of a scene row is a single, correctly built copy", async ({ page }) => {
    const make = (id, name) => scene(id, name, { background: "space" });
    await seedStories(page, [story("ghost-story", "Ghost", [make("g1", "Scene 1"), make("g2", "Scene 2"), make("g3", "Scene 3")])]);
    await openStories(page);

    const handle = await page.locator('.sb-board-row[data-board-id="g3"] .drag-handle').boundingBox();
    await page.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2);
    await page.mouse.down();
    await page.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2 - 6, { steps: 3 });
    await page.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2 - 70, { steps: 8 });
    await page.waitForTimeout(250);

    const ghost = await page.evaluate(() => {
      const el = document.querySelector(".sortable-fallback");
      if (!el) return null;
      const btn = el.querySelector(".sb-board-pick > button");
      const cs = btn ? getComputedStyle(btn) : null;
      return {
        buttons: el.querySelectorAll("button").length,
        nested: el.querySelectorAll("button button").length,
        smdButtons: el.querySelectorAll("smd-button").length,
        glyphs: el.querySelectorAll("smd-draghandle .glyph").length,
        name: el.querySelector(".sb-board-pick span") ? el.querySelector(".sb-board-pick span").textContent : "",
        // The real row's pick button is a flat, transparent text control; the
        // nested-button bug made the OUTER one a filled Bootstrap `.btn`.
        pickBackground: cs ? cs.backgroundColor : "",
        pickFontSize: cs ? parseFloat(cs.fontSize) : 0
      };
    });
    await page.mouse.up();

    expect(ghost).not.toBeNull();
    expect(ghost.name).toBe("Scene 3");
    expect(ghost.nested).toBe(0);
    // One inner button per smd-button (handle + 3 actions + the pick row).
    expect(ghost.buttons).toBe(ghost.smdButtons);
    expect(ghost.smdButtons).toBe(4);
    expect(ghost.glyphs).toBe(1);
    expect(ghost.pickBackground).toBe("rgba(0, 0, 0, 0)");
  });

  test("scenes can be reordered by dragging their handle", async ({ page }) => {
    const make = (id, name) => scene(id, name, { background: "space" });
    await seedStories(page, [story("ord-story", "Order", [make("o1", "Scene 1"), make("o2", "Scene 2"), make("o3", "Scene 3")])]);
    await openStories(page);
    await expect(page.locator(".sb-board-row")).toHaveCount(3);

    // Drag Scene 3's handle to the TOP of Scene 1's row.
    const handle = await page.locator('.sb-board-row[data-board-id="o3"] .drag-handle').boundingBox();
    const first = await page.locator('.sb-board-row[data-board-id="o1"]').boundingBox();
    await page.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2);
    await page.mouse.down();
    await page.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2 - 4);
    await page.mouse.move(first.x + 20, first.y + 2, { steps: 14 });
    await page.mouse.up();

    await expect.poll(async () => (await stored(page)).stories[0].scenes.map((s) => s.id)).toEqual(["o3", "o1", "o2"]);
    expect(await page.evaluate(() => Array.prototype.map.call(
      document.querySelectorAll(".sb-board-row .sb-board-pick span"), (n) => n.textContent
    ))).toEqual(["Scene 3", "Scene 1", "Scene 2"]);
    // The scene being edited does not change.
    expect(await page.evaluate(() => sbActiveBoard().id)).toBe("o1");

    await page.reload();
    await expect(page.locator("#sbCanvas")).toBeVisible();
    expect((await stored(page)).stories[0].scenes.map((s) => s.id)).toEqual(["o3", "o1", "o2"]);
  });
});
