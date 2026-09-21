// QRLinks — links editor: the links list <smd-page> plus the single link
// add/edit <smd-page>. List rows are Sortable-draggable (sequence order).

let linkEditIndex = -1;
let linkEditBuffer = null;
let isNewLink = false;
var linksEditorSortable = null;
var linkEditCloseTimer = null;

function openLinksEditor() {
  hideMainPages("linksEditor");
  const page = document.getElementById("linksEditor");
  if (!page) return;
  page.classList.remove("d-none");
  injectEditorStyles(page);
  if (!page.__bound) {
    page.__bound = true;
    page.addEventListener("smd-page-action", handleLinksPageAction);
  }
  renderLinksEditor();
  page.show();
}

function handleLinksPageAction(e) {
  const action = e.detail && (typeof e.detail === "string" ? e.detail : e.detail.action);
  if (action === "add") addNewLink();
  else if (action === "done") closeLinksEditor();
}

function closeLinksEditor() {
  const page = document.getElementById("linksEditor");
  if (page) {
    page.hide();
    setTimeout(() => page.classList.add("d-none"), Math.max(0, (page.slideDuration || 0) + 50));
  }
  document.getElementById("countdownContainer").classList.remove("d-none");
  linkEditIndex = -1;
  linkEditBuffer = null;
  isNewLink = false;
  renderMain();
}

function renderLinksEditor() {
  const page = document.getElementById("linksEditor");
  if (!page) return;
  if (!$id("linkList")) {
    page.title = "Edit Links";
    page.content = '<div id="linkList"></div>';
    page.buttons = [
      { text: "Add Link", variant: "primary", action: "add", close: false },
      { text: "OK", variant: "success", action: "done" }
    ];
  }
  renderLinkList();
}

function renderLinkList() {
  const list = $id("linkList");
  if (!list) return;
  list.innerHTML = "";

  const links = loadLinks();
  const sorted = links
    .map((link, index) => ({ link, index }))
    .sort((a, b) => (a.link.sequence || 0) - (b.link.sequence || 0));

  if (sorted.length === 0) {
    const empty = document.createElement("div");
    empty.className = "text-secondary mb-3";
    empty.textContent = "No links yet. Use Add Link.";
    list.appendChild(empty);
  }

  sorted.forEach(({ link, index }) => {
    const card = document.createElement("div");
    card.className = "qrlink-list-card";
    card.setAttribute("data-index", index);
    card.innerHTML =
      '<smd-draghandle class="drag-handle" title="drag"></smd-draghandle>' +
      '<div class="link-thumb">' +
        `<smd-image key-prefix="${escAttr(smdImagePrefix())}"${link.image ? ` image="${escAttr(link.image)}"` : ""}></smd-image>` +
      '</div>' +
      '<div class="link-body">' +
        `<div class="link-title">${escapeHtml(link.title || "")}</div>` +
        (link.url ? `<div class="link-url">${escapeHtml(link.url)}</div>` : "") +
        (link.description ? `<div class="link-desc">${escapeHtml(link.description)}</div>` : "") +
      '</div>' +
      '<div class="link-actions">' +
        '<button type="button" class="btn btn-primary btn-sm" data-action="edit">Edit</button>' +
        '<button type="button" class="btn btn-danger btn-sm" data-action="delete">Delete</button>' +
      '</div>';
    card.querySelector('[data-action="edit"]').addEventListener("click", () => editLink(index));
    card.querySelector('[data-action="delete"]').addEventListener("click", () => confirmDeleteLink(index));
    list.appendChild(card);
  });

  initLinksSortable();
}

// Drag to reorder (Sortable; the draghandle is the only grab target).
function initLinksSortable() {
  if (linksEditorSortable) {
    linksEditorSortable.destroy();
    linksEditorSortable = null;
  }
  if (typeof Sortable === "undefined") return;
  const el = $id("linkList");
  if (!el || !el.querySelector(".qrlink-list-card")) return;
  linksEditorSortable = new Sortable(el, {
    handle: ".drag-handle",
    draggable: ".qrlink-list-card",
    animation: 150,
    forceFallback: true,
    fallbackOnBody: true,
    fallbackTolerance: 0,
    fallbackClass: "sortable-fallback",
    ghostClass: "sortable-ghost",
    chosenClass: "sortable-chosen",
    dragClass: "sortable-drag",
    onEnd: function () {
      const links = loadLinks();
      const order = Array.from(el.querySelectorAll(".qrlink-list-card"))
        .map(c => parseInt(c.getAttribute("data-index"), 10))
        .filter(i => !isNaN(i));
      if (order.length !== links.length) return;
      const reordered = order.map(i => links[i]);
      reordered.forEach((link, i) => { link.sequence = i + 1; });
      saveLinks(reordered);
      renderLinkList();
    }
  });
}

// ---- single link add/edit page ----

function addNewLink() {
  const links = loadLinks();
  const newLink = {
    title: "New Link",
    url: "",
    description: "",
    image: "",
    sequence: links.length + 1
  };
  links.push(newLink);
  saveLinks(links);
  linkEditIndex = links.length - 1;
  linkEditBuffer = JSON.parse(JSON.stringify(newLink));
  isNewLink = true;
  openLinkEditPage();
}

function editLink(index) {
  const links = loadLinks();
  if (!links[index]) return;
  linkEditBuffer = JSON.parse(JSON.stringify(links[index]));
  linkEditIndex = index;
  isNewLink = false;
  openLinkEditPage();
}

function openLinkEditPage() {
  const page = document.getElementById("linkEditPage");
  if (!page) return;
  // A previous close may still have a pending d-none timer; cancel it so the
  // freshly opened page is not hidden again.
  if (linkEditCloseTimer) {
    clearTimeout(linkEditCloseTimer);
    linkEditCloseTimer = null;
  }
  page.classList.remove("d-none");
  injectEditorStyles(page);
  if (!page.__bound) {
    page.__bound = true;
    page.addEventListener("smd-page-action", handleLinkEditAction);
  }
  page.title = isNewLink ? "Add Link" : "Edit Link";
  page.buttons = [
    { text: "OK", variant: "success", action: "ok", close: false },
    { text: "Cancel", variant: "secondary", action: "cancel", close: false }
  ];
  renderLinkEditContent();
  page.show();
}

function handleLinkEditAction(e) {
  const action = e.detail && (typeof e.detail === "string" ? e.detail : e.detail.action);
  if (action === "ok") doneLinkEdit();
  else if (action === "cancel") cancelLinkEdit();
}

function renderLinkEditContent() {
  const page = document.getElementById("linkEditPage");
  if (!page || !linkEditBuffer) return;
  const data = linkEditBuffer;
  page.content =
    '<div class="d-flex gap-3 align-items-start flex-wrap">' +
      '<div class="flex-grow-1" style="min-width:220px">' +
        '<div class="mb-2">' +
          '<label class="form-label mb-1">Title</label>' +
          `<input class="form-control" id="linkTitleInput" value="${escAttr(data.title || "")}" oninput="linkField('title', this.value)">` +
        '</div>' +
        '<div class="mb-2">' +
          '<label class="form-label mb-1">URL</label>' +
          `<input class="form-control" id="linkUrlInput" value="${escAttr(data.url || "")}" oninput="linkField('url', this.value)">` +
        '</div>' +
        '<div class="mb-2">' +
          '<label class="form-label mb-1">Description</label>' +
          `<textarea class="form-control" id="linkDescriptionInput" rows="3" oninput="linkField('description', this.value)">${escapeHtml(data.description || "")}</textarea>` +
        '</div>' +
        '<div class="mb-1">' +
          '<label class="form-label mb-1">Image</label>' +
          `<smd-image-select id="linkImageSelect" key-prefix="${escAttr(smdImagePrefix())}" label-id="linkImageName" button-id="btnLinkImageChoose"></smd-image-select>` +
        '</div>' +
      '</div>' +
    '</div>';
  updateLinkImagePreview();
}

function linkField(field, value) {
  if (!linkEditBuffer) return;
  linkEditBuffer[field] = value;
}

function updateLinkImagePreview() {
  const sel = $id("linkImageSelect");
  if (!sel || !linkEditBuffer) return;
  if (linkEditBuffer.image) sel.setAttribute("image", linkEditBuffer.image);
  else sel.removeAttribute("image");
}

function doneLinkEdit() {
  if (linkEditIndex >= 0 && linkEditBuffer) {
    const links = loadLinks();
    const buffer = linkEditBuffer;
    buffer.title = (buffer.title || "").trim() || "Untitled Link";
    buffer.url = (buffer.url || "").trim();
    links[linkEditIndex] = buffer;
    saveLinks(links);
  }
  closeLinkEditPage();
  renderLinksEditor();
}

function cancelLinkEdit() {
  if (isNewLink && linkEditIndex >= 0) {
    const links = loadLinks();
    links.splice(linkEditIndex, 1);
    saveLinks(links);
  }
  closeLinkEditPage();
  renderLinksEditor();
}

function closeLinkEditPage() {
  const page = document.getElementById("linkEditPage");
  if (page) {
    page.hide();
    if (linkEditCloseTimer) clearTimeout(linkEditCloseTimer);
    linkEditCloseTimer = setTimeout(() => {
      page.classList.add("d-none");
      linkEditCloseTimer = null;
    }, Math.max(0, (page.slideDuration || 0) + 50));
  }
  linkEditIndex = -1;
  linkEditBuffer = null;
  isNewLink = false;
}

// ---- delete ----

function confirmDeleteLink(index) {
  const links = loadLinks();
  const title = links[index] ? links[index].title : "";
  showSmdModal({
    title: "Delete Link?",
    content: `Delete link "<strong>${escapeHtml(title)}</strong>"?`,
    buttons: [
      { text: "Cancel", variant: "secondary", action: "cancel" },
      { text: "Delete", variant: "danger", action: "delete" }
    ],
    onAction: function (detail) {
      if (detail.action !== "delete") return;
      deleteLink(index);
    }
  });
}

function deleteLink(index) {
  const links = loadLinks();
  links.splice(index, 1);
  links.forEach((link, i) => { link.sequence = i + 1; });
  saveLinks(links);
  renderLinkList();
}
