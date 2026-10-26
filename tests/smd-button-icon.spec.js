const { test, expect } = require("@playwright/test");

// <smd-button> gained an additive `icon` attribute (2026-10-26) so icon+label and
// icon-only actions can use the shared component: the inner native button renders
// `<i class="...">` before the label. `aria-label` is mirrored onto the inner
// button too, because that (not the host) is the focusable control - an
// icon-only button has no text to name it.
//
// Everything here is BACKWARDS COMPATIBLE: a plain `<smd-button>Delete</smd-button>`
// still renders exactly the label, no wrapper elements.

async function makeButton(page, attributes, label) {
  return page.evaluate(({ attributes, label }) => {
    const host = document.createElement("smd-button");
    Object.keys(attributes).forEach((key) => host.setAttribute(key, attributes[key]));
    if (label != null) host.textContent = label;
    document.body.appendChild(host);
    const btn = host.querySelector("button");
    const icon = btn.querySelector("i");
    const span = btn.querySelector(".smd-button-label");
    return {
      html: btn.innerHTML,
      classes: btn.className,
      text: btn.textContent.trim(),
      label: span ? span.textContent : null,
      iconClass: icon ? icon.className : null,
      iconHidden: icon ? icon.getAttribute("aria-hidden") : null,
      ariaLabel: btn.getAttribute("aria-label"),
      title: btn.getAttribute("title")
    };
  }, { attributes, label });
}

test.describe("<smd-button> icon support", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/Storyboard/");
    await expect(page.locator("#sbCanvas")).toBeVisible();
  });

  test("renders an icon before the label and mirrors aria-label", async ({ page }) => {
    const result = await makeButton(page, {
      variant: "secondary",
      icon: "fa-solid fa-cog",
      "aria-label": "Story settings"
    }, "Settings");

    expect(result.classes).toContain("btn-secondary");
    expect(result.iconClass).toContain("fa-solid");
    expect(result.iconClass).toContain("fa-cog");
    expect(result.iconHidden).toBe("true");
    expect(result.label).toBe("Settings");
    expect(result.text).toBe("Settings");
    expect(result.ariaLabel).toBe("Story settings");
  });

  test("an icon-only button has no \"Button\" fallback text", async ({ page }) => {
    const result = await makeButton(page, {
      variant: "secondary",
      size: "small",
      icon: "fa-solid fa-xmark",
      "aria-label": "Close"
    }, null);

    expect(result.iconClass).toContain("fa-xmark");
    expect(result.text).toBe("");
    expect(result.html).not.toContain("Button");
    expect(result.ariaLabel).toBe("Close");
  });

  test("a plain button without an icon is unchanged", async ({ page }) => {
    const result = await makeButton(page, { variant: "danger" }, "Delete");
    expect(result.classes).toContain("btn-danger");
    expect(result.text).toBe("Delete");
    expect(result.html).toBe("Delete");
    expect(result.label).toBeNull();
  });
});
