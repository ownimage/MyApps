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

  // A Sortable fallback ghost is `cloneNode(true)`: attributes are copied but the
  // `_label`/`_rich` JS fields are NOT, so a clone used to rebuild itself around
  // the ALREADY-BUILT inner button - a `<button>` inside a `<button>` that painted
  // as a grey Bootstrap button (the reported "drag ghost is not right").
  test("a clone is not rebuilt (no button nested inside a button)", async ({ page }) => {
    const result = await page.evaluate(() => {
      const host = document.createElement("smd-button");
      host.className = "sb-board-act";
      host.setAttribute("variant", "secondary");
      host.setAttribute("size", "small");
      host.setAttribute("icon", "fa-solid fa-copy");
      document.body.appendChild(host);

      const clone = host.cloneNode(true);
      document.body.appendChild(clone);

      const snap = (el) => ({
        buttons: el.querySelectorAll("button").length,
        nested: el.querySelectorAll("button button").length,
        directButton: el.querySelectorAll(":scope > button").length,
        html: el.innerHTML
      });
      const real = snap(host);
      const copy = snap(clone);
      host.remove();
      clone.remove();
      return { real, copy };
    });

    expect(result.real.buttons).toBe(1);
    expect(result.real.nested).toBe(0);
    // The clone keeps exactly the one inner button it was cloned with.
    expect(result.copy.buttons).toBe(1);
    expect(result.copy.nested).toBe(0);
    expect(result.copy.directButton).toBe(1);
    expect(result.copy.html).not.toContain("Button");
  });
});
