// ListOfLists — the main view (date heading, cards).

// MAIN PAGE RENDER
function addScheduleListsToOrder(order) {
  const categories = loadCategories();
  const existing = new Set(order);
  const listMap = {};
  categories.forEach(t => {
    (t.lists || []).forEach(j => {
      listMap[j.id] = j;
      if (j.active !== false && shouldShowListToday(j) && !existing.has(j.id)) {
        order.push(j.id);
        existing.add(j.id);
      }
    });
  });
  order.sort((a, b) => {
    const ta = listMap[a]?.time;
    const tb = listMap[b]?.time;
    if (!ta && !tb) return 0;
    if (!ta) return 1;
    if (!tb) return -1;
    return ta.localeCompare(tb);
  });
  return order;
}

function ensureMainList() {
  const today = getTodayStr();
  const lastGen = getStoredLastGen();
  const existingOrder = loadMainOrder();
  if (lastGen === today && existingOrder) return;

  if (!existingOrder) {
    const order = addScheduleListsToOrder([]);
    saveMainOrder(order);
    saveCompletedLists([]);
    localStorage.setItem(smdKey("last_gen"), today);
    return;
  }

  // date changed: carry over uncompleted + add new schedule-matching lists
  const completed = loadCompletedLists();
  const carried = existingOrder.filter(id => !completed.includes(id));
  const merged = addScheduleListsToOrder(carried);
  saveMainOrder(merged);
  saveCompletedLists([]);
  localStorage.setItem(smdKey("last_gen"), today);
}

function renderMain() {
  const container = document.getElementById("mainContainer");
  if (!container) return;
  container.innerHTML = "";

  const now = getTodayDate();
  const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const dateStr = `${days[now.getDay()]} ${now.getDate()} ${months[now.getMonth()]}, ${now.getFullYear()}`;

  const headingRow = document.createElement("div");
  headingRow.className = "d-flex align-items-center gap-2 mb-3 flex-shrink-0";
  const dateHeading = document.createElement("smd-h1");
  dateHeading.className = "mb-0";
  dateHeading.textContent = dateStr;
  headingRow.appendChild(dateHeading);
  container.appendChild(headingRow);

  ensureMainList();

  const categories = loadCategories();
  const completed = loadCompletedLists();
  const mainOrder = loadMainOrder() || [];
  const mainSet = new Set(mainOrder);

  const allLists = [];
  categories.forEach((t, categoryIdx) => {
    (t.lists || []).forEach((j, listIdx) => {
      if (j.active !== false && mainSet.has(j.id) && shouldShowListToday(j)) {
        allLists.push({ list: j, categoryTitle: t.title, categoryIdx, listIdx });
      }
    });
  });

  const orderMap = {};
  mainOrder.forEach((id, i) => { orderMap[id] = i; });
  allLists.sort((a, b) => (orderMap[a.list.id] !== undefined ? orderMap[a.list.id] : 999) - (orderMap[b.list.id] !== undefined ? orderMap[b.list.id] : 999));

  const scrollBody = document.createElement("div");
  scrollBody.id = "mainScrollBody";
  scrollBody.className = "flex-grow-1 overflow-auto";
  container.appendChild(scrollBody);

  const cardContainer = document.createElement("div");
  cardContainer.id = "mainCardList";
  cardContainer.className = "d-block";

  if (allLists.length === 0) {
    const msg = document.createElement("p");
    msg.className = "text-secondary";
    msg.textContent = "No active lists yet. Add categories with active lists to get started.";
    scrollBody.appendChild(msg);
    updateNavState();
    return;
  }

  allLists.forEach(({ list, categoryTitle, categoryIdx, listIdx }) => {
    const isDone = completed.includes(list.id);
    const category = categories[categoryIdx] || {};
    const categoryImageName = category.image || "";
    const listImageName = list.image || "";
    const card = document.createElement("lol-list-main-card");
    card.className = "d-block mb-1";
    card.dataset.listId = list.id;
    card.dataset.categoryIdx = categoryIdx;
    card.setAttribute("list-id", list.id);
    card.setAttribute("category-idx", categoryIdx);
    card.setAttribute("list-idx", listIdx);
    card.setAttribute("title", list.title || "");
    if (isDone) card.setAttribute("done", "");
    if (categoryImageName) card.setAttribute("category-image", categoryImageName);
    if (listImageName) card.setAttribute("list-image", listImageName);
    card.setAttribute("category-title", categoryTitle || "");
    if (list.description) card.setAttribute("description", list.description);
    card.setAttribute("key-prefix", smdImagePrefix());
    cardContainer.appendChild(card);
  });

  scrollBody.appendChild(cardContainer);

  // view handler (composed event emitted by lol-list-main-card)
  cardContainer.addEventListener("lol-list-main-view", (e) => {
    viewListReadOnly(e.detail.categoryIdx, e.detail.listIdx);
  });

  // swipe LEFT -> the card has animated off; open the standard delete confirm.
  // cancel snaps the card back, delete removes the list everywhere.
  cardContainer.addEventListener("lol-list-main-delete", (e) => {
    const card = e.target;
    const categoryIdx = e.detail && e.detail.categoryIdx >= 0
      ? e.detail.categoryIdx
      : (card ? parseInt(card.dataset.categoryIdx, 10) : -1);
    const listIdx = e.detail && e.detail.listIdx >= 0 ? e.detail.listIdx : -1;
    const categories = loadCategories();
    const category = categories[categoryIdx] || {};
    const list = ((category.lists) || [])[listIdx] || {};
    showSmdModal({
      title: "Delete List?",
      content: 'Delete "<strong>' + escapeHtml(list.title || "") + '</strong>" from "' + escapeHtml(category.title || "") + '"?',
      buttons: [
        { text: "Cancel", variant: "secondary", action: "cancel" },
        { text: "Delete", variant: "danger", action: "delete" }
      ],
      onAction: (detail) => {
        if (detail.action === "delete") {
          deleteListFromCategory(categoryIdx, listIdx);
          renderMain();
        } else if (card && typeof card.snapBackSwipe === "function") {
          card.snapBackSwipe();
        }
      }
    });
  });

  updateNavState();
}

function addMainCardWithModal() {
  const categories = loadCategories();
  let category = categories.find(t => t.title === "Ad Hoc");
  if (!category) {
    category = { title: "Ad Hoc", sequence: categories.length + 1, lists: [] };
    categories.push(category);
    saveCategories(categories);
  }
  const lists = category.lists || [];
  const categoryIdx = categories.indexOf(category);
  listsCategoryIndex = categoryIdx;
  const seq = lists.length + 1;
  const newList = { id: "list_" + Date.now(), title: "", sequence: seq, description: "", active: true };
  lists.push(newList);
  category.lists = lists;
  saveCategories(categories);
  listsBuffer = JSON.parse(JSON.stringify(newList));
  listsEditingIdx = lists.length - 1; isNewList = true;
  buildListEditPage(false);
}
