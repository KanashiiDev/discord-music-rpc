let cleaningMode = false;
let isFiltering = false;
let fullHistory = [];
let filteredHistory = [];
let currentOffset = 0;
const maxHistoryItemLoad = 20;
let selectedSources = new Set();
const panel = document.getElementById("historyPanel");
const filterBtn = document.getElementById("historyFilterBtn");
const filterMenu = document.getElementById("historyFilterMenu");
const filterMenuContent = document.getElementById("historyFilterMenuContent");
let lastRenderedHeader = null;

// Render
async function renderHistory({ reset = true, query = "" } = {}) {
  const panel = document.getElementById("historyPanel");
  const spinner = document.createElement("div");
  spinner.className = "spinner";

  // If simplebar exists, use its content element
  const sbInstance = SimpleBar.instances?.get(panel);
  const target = sbInstance ? sbInstance.getContentElement() : panel;

  if (reset) {
    target.innerHTML = "";
    panel.style.paddingRight = "";
    lastRenderedHeader = null;
    currentOffset = 0;
    target.appendChild(spinner);
    fullHistory = await loadHistory();
  }

  renderSourceFilterMenu();
  target.querySelector(".spinner")?.remove();
  if (query || selectedSources.size > 0) {
    filteredHistory = fullHistory.filter((entry) => {
      const matchesText = (entry.t + " " + entry.a + " " + entry.s).toLowerCase().includes(query.toLowerCase());
      const matchesSource = selectedSources.size === 0 || selectedSources.has(entry.s);
      return matchesText && matchesSource;
    });
    isFiltering = true;
  } else {
    filteredHistory = [];
    isFiltering = false;
  }

  const dataSource = isFiltering ? filteredHistory : fullHistory;
  const pagedHistory = dataSource.slice(currentOffset, currentOffset + maxHistoryItemLoad);
  currentOffset += maxHistoryItemLoad;

  if (reset && !pagedHistory.length) {
    const emptyMsg = document.createElement("i");
    emptyMsg.textContent = query || selectedSources.size ? "No results." : "Empty.";
    target.appendChild(emptyMsg);
    return;
  }

  const fragment = document.createDocumentFragment();

  pagedHistory.forEach((entry) => {
    const time = new Date(entry.p);
    const header = isSameDay(time, dateToday) ? "Today" : isSameDay(time, dateYesterday) ? "Yesterday" : dateFull(time);

    if (header !== lastRenderedHeader) {
      const h3 = document.createElement("h3");
      h3.textContent = header;
      h3.style.marginTop = "10px";
      fragment.appendChild(h3);
      lastRenderedHeader = header;
    }

    fragment.appendChild(createHistoryEntry(entry));
  });

  target.appendChild(fragment);

  if (cleaningMode) attachCheckboxListeners();

  // Recalculate simplebar after adding content
  sbInstance?.recalculate();
}

// History Scroll
async function activateHistoryScroll() {
  const panel = document.getElementById("historyPanel");
  const sbInstance = SimpleBar.instances.get(panel);
  if (!sbInstance) return;

  const scrollElement = sbInstance.getScrollElement();
  let isLoading = false;
  let draggingInterval = null;
  let lastScrollTop = scrollElement.scrollTop;
  let throttleTimeout = null;
  let isDragging = false;

  // Check Dragging
  draggingInterval = setInterval(() => {
    isDragging = panel.classList.contains("simplebar-dragging");
    if (!isDragging) {
      tryLoad();
    }
  }, 100);

  // Load Next History Entries
  async function tryLoad() {
    const nearBottom = scrollElement.scrollTop + scrollElement.clientHeight >= scrollElement.scrollHeight - 50;
    const dataSource = isFiltering ? filteredHistory : fullHistory;

    if (currentOffset >= dataSource.length) {
      if (draggingInterval) {
        clearInterval(draggingInterval);
        draggingInterval = null;
      }
      return;
    }

    if (!nearBottom || isLoading || isDragging) return;

    isLoading = true;
    await renderHistory({
      reset: false,
      query: document.getElementById("historySearchBox").value || "",
    });
    isLoading = false;
  }

  // Scroll Listener
  scrollElement.addEventListener("scroll", () => {
    isDragging = panel.classList.contains("simplebar-dragging");
    if (scrollElement.scrollTop === lastScrollTop || isDragging) return;
    lastScrollTop = scrollElement.scrollTop;

    if (throttleTimeout) return;

    throttleTimeout = setTimeout(async () => {
      throttleTimeout = null;
      await tryLoad();
    }, 100);
  });
}

// Listen checkbox changes
function attachCheckboxListeners() {
  if (!panel._checkboxListenerAttached) {
    panel.addEventListener("change", (e) => {
      if (!cleaningMode) return;
      if (e.target.matches(".history-checkbox")) {
        const cb = e.target;
        const entry = cb.closest(".history-entry");
        if (entry) entry.classList.toggle("selected", cb.checked);
        updateClearBtnText();
      }
    });
    panel._checkboxListenerAttached = true;
  }

  // Add the missing trash icons and checkbox listeners
  panel.querySelectorAll(".history-entry").forEach((entry) => {
    const cb = entry.querySelector(".history-checkbox");
    if (!cb._listenerAttached) {
      cb._listenerAttached = true;
    }

    // Add trash icon if not present
    if (!entry.querySelector(".history-trash")) {
      const trashIcon = document.createElement("span");
      trashIcon.className = "history-trash";
      trashIcon.appendChild(createSVG(svg_paths.trashIconPaths));
      trashIcon.addEventListener("click", () => {
        cb.checked = !cb.checked;
        entry.classList.toggle("selected", cb.checked);
        updateClearBtnText();
      });
      cb.insertAdjacentElement("afterend", trashIcon);
    }
  });
}

// Clear Button
const clearBtn = document.getElementById("clearHistoryBtn");
const cancelCleanBtn = document.getElementById("cancelCleanBtn");

// Update Clear Button
function updateClearBtnText() {
  if (!cleaningMode) return;
  const selectedItems = Array.from(document.querySelectorAll(".history-checkbox")).filter((cb) => cb.checked && cb.closest(".history-entry").style.display !== "none");
  const selectedCount = selectedItems.length;
  clearBtn.textContent = selectedCount > 0 ? `Delete Selected (${selectedCount})` : "Delete All";
}

// Clear Button Click Event
clearBtn.addEventListener("click", async () => {
  if (!cleaningMode && fullHistory.length) {
    // Start the cleaning mode
    cleaningMode = true;
    document.body.classList.add("cleaning-mode");
    cancelCleanBtn.style.display = "inline-block";
    updateClearBtnText();
    attachCheckboxListeners();
    return;
  } else if (!fullHistory.length) {
    alert("History is already empty.");
    exitCleaningMode();
    return;
  }

  // Get selected items
  const selectedIndexes = Array.from(document.querySelectorAll(".history-checkbox:checked"))
    .filter((cb) => cb.closest(".history-entry").style.display !== "none")
    .map((cb) => parseInt(cb.dataset.index));

  if (selectedIndexes.length === 0) {
    // If a filter has been applied, only delete the filtered history
    if (isFiltering) {
      const filteredSet = new Set(filteredHistory.map((e) => fullHistory.indexOf(e)));
      if (!confirm(`Are you sure you want to delete ${filteredSet.size} entries from the current filtered list?`)) return;
      fullHistory = fullHistory.filter((_, i) => !filteredSet.has(i));
    } else {
      //If no items were selected, ask for user confirmation to delete all history.
      if (!confirm(`Are you sure you want to delete all ${fullHistory.length} history entries?`)) return;
      fullHistory = [];
    }
  }
  // If there are selected items, delete only them.
  else {
    if (!confirm(`Are you sure you want to delete ${selectedIndexes.length} history ${selectedIndexes.length > 1 ? "entries" : "entry"}?`)) return;
    fullHistory = fullHistory.filter((_, i) => !selectedIndexes.includes(i));
  }

  // Reset filtering and re-render
  isFiltering = false;
  selectedSources.clear();
  filteredHistory = [];
  document.querySelector("#historySearchBox").value = "";
  await saveHistory(fullHistory);
  await renderHistory();
  exitCleaningMode();
});

// Cancel Button Event
cancelCleanBtn.addEventListener("click", exitCleaningMode);

// Exit cleaning mode
function exitCleaningMode() {
  cleaningMode = false;
  document.body.classList.remove("cleaning-mode");
  clearBtn.textContent = "Clear History";
  cancelCleanBtn.style.display = "none";
  document.querySelectorAll(".history-checkbox").forEach((cb) => {
    cb.parentElement?.classList.remove("selected");
    cb.checked = false;
  });
}

// Filter menu rendering
function renderSourceFilterMenu() {
  filterMenuContent.innerHTML = "";
  const sources = [...new Set(fullHistory.map((e) => e.s))].sort();
  if (!document.querySelector(".history-filter")) {
    filterBtn.className = "history-filter";
    filterBtn.appendChild(createSVG(svg_paths.filterIconPaths));
  }

  sources.forEach((src) => {
    const label = document.createElement("label");
    const cb = document.createElement("input");
    const span = document.createElement("span");
    span.textContent = src;
    cb.type = "checkbox";
    cb.value = src;
    cb.checked = selectedSources.has(src);
    cb.addEventListener("change", async () => {
      if (cb.checked) selectedSources.add(src);
      else selectedSources.delete(src);
      await renderHistory({ query: document.getElementById("historySearchBox").value });
      await activateSimpleBar("historyPanel");
    });
    label.append(cb, " ", span);
    filterMenuContent.appendChild(label);
  });
}

// Filter Dropdown Toggle
filterBtn.addEventListener("click", async (e) => {
  e.stopPropagation();
  filterMenu.classList.toggle("open");
  filterMenu.style.height = filterMenu.classList.contains("open") ? Math.min(200, filterMenuContent.scrollHeight) + "px" : "0";
  await activateSimpleBar("historyFilterMenuContent");
});
