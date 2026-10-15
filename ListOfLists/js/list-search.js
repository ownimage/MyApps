// ListOfLists — the list search page.

// LIST SEARCH
var listSearchQuery = "";
var _listSearchCloseTimer = null;

function openSearchLists() {
  document.getElementById("mainContainer").classList.add("d-none");
  document.getElementById("categoriesEditor").classList.add("d-none");
  document.getElementById("settingsPage").classList.add("d-none");
  document.getElementById("imagesEditor").classList.add("d-none");
  const page = document.getElementById("listSearchEditor");
  page.classList.remove("d-none");
  listSearchQuery = "";
  if (!page.__listSearchBound) {
    page.__listSearchBound = true;
    page.addEventListener("smd-search-input", e => {
      listSearchQuery = (e.detail.value || "").trim();
      renderSearchLists();
    });
    page.addEventListener("smd-search-clear", () => clearListSearchFilter());
  }
  buildSearchListsContent();
  page.show();
  const input = $id("listSearchInput");
  if (input) input.value = "";
  renderSearchLists();
  updateNavState();
}

function closeSearchLists() {
  const page = document.getElementById("listSearchEditor");
  if (page) {
    page.hide();
    clearTimeout(_listSearchCloseTimer);
    _listSearchCloseTimer = setTimeout(function() {
      page.classList.add("d-none");
    }, Math.max(0, (page.slideDuration || 0) + 50));
  }
  document.getElementById("mainContainer").classList.remove("d-none");
  renderMain();
}

function buildSearchListsContent() {
  const page = document.getElementById("listSearchEditor");
  if (!page) return;
  page.title = "Search Lists";
  page.headerHtml = '<smd-badge id="listSearchTotalBadge" variant="info" class="small align-middle"></smd-badge>';
  page.content =
    '<div id="listSearchHeader">' +
      '<div id="listSearchFilters" class="mt-1 mb-3 mx-2">' +
        '<smd-search id="listSearch" input-id="listSearchInput" button-id="btnListSearchClear" placeholder="Search list titles..." value="' + escAttr(listSearchQuery || "") + '"></smd-search>' +
      '</div>' +
    '</div>' +
    '<div id="listSearchList"></div>';
  page.buttons = [
    { text: "Add List", variant: "secondary", action: "add", id: "btnListSearchAdd", close: false },
    { text: "OK", variant: "success", action: "done", id: "btnListSearchDone" }
  ];
}

function clearListSearchFilter() {
  listSearchQuery = "";
  const input = $id("listSearchInput");
  if (input) input.value = "";
  renderSearchLists();
}

function addNewListFromSearch() {
  addMainCardWithModal();
}

function renderSearchLists() {
  const list = $id("listSearchList");
  if (!list) return;
  const categories = loadCategories();
  updateEditorListCountBadges();
  const query = listSearchQuery.toLowerCase();
  const matches = [];
  categories.forEach(function(category, categoryIdx) {
    (category.lists || []).forEach(function(list, listIdx) {
      if (query && !(list.title || "").toLowerCase().includes(query)) return;
      matches.push({ category, categoryIdx, list, listIdx });
    });
  });
  list.innerHTML = "";
  if (matches.length === 0) {
    list.innerHTML = '<div class="text-secondary small p-2">' + (query ? 'No lists match "' + escapeHtml(listSearchQuery) + '".' : "No lists found.") + '</div>';
    updateNavState();
    return;
  }
  matches.forEach(function(m) {
    list.appendChild(buildListSearchCard(m.category, m.categoryIdx, m.list, m.listIdx));
  });
  list.addEventListener("lol-list-edit", handleListSearchCardEdit);
  list.addEventListener("lol-list-toggle-active", handleListSearchCardToggle);
  updateNavState();
}

function buildListSearchCard(category, categoryIdx, list, listIdx) {
  const card = document.createElement("lol-list-summary-card");
  card.className = "d-block mb-2";
  card.dataset.listId = list.id;
  card.setAttribute("variant", "search");
  card.setAttribute("key-prefix", smdImagePrefix());
  const set = (name, value) => {
    if (value !== undefined && value !== null && value !== "") card.setAttribute(name, value);
  };
  set("category-idx", categoryIdx);
  set("list-idx", listIdx);
  set("title", list.title || "");
  set("category-title", category.title || "");
  set("active", list.active !== false ? "true" : "false");
  set("category-image", category.image ? category.image : "");
  set("image", list.image ? list.image : "");
  return card;
}

function handleListSearchCardEdit(e) {
  editListInAccordion(e.detail.categoryIdx, e.detail.listIdx);
}

function handleListSearchCardToggle(e) {
  handleAccordionListActiveToggle(e.detail.categoryIdx, e.detail.listIdx, e.detail.checked);
}

function handleAccordionListActiveToggle(categoryIdx, listIdx, checked) {
  var categories = loadCategories();
  var lists = categories[categoryIdx].lists || [];
  if (lists[listIdx]) lists[listIdx].active = checked;
  saveCategories(categories);
  var listId = lists[listIdx] ? lists[listIdx].id : null;
  if (listId) {
    var order = loadMainOrder() || [];
    if (checked && shouldShowListToday(lists[listIdx])) {
      if (!order.includes(listId)) order.push(listId);
    } else {
      order = order.filter(function(id) { return id !== listId; });
    }
    saveMainOrder(order);
  }
  updateEditorListCountBadges();
}
