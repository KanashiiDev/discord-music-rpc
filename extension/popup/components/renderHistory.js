let cleaningMode = false;
let isFiltering = false;
let fullHistory = [];
let filteredHistory = [];
let currentOffset = 0;
const maxHistoryItemLoad = 20;
const selectedSources = new Set();
const panel = document.getElementById("historyPanel");
const filterBtn = document.getElementById("historyFilterBtn");
const filterMenu = document.getElementById("historyFilterMenu");
const filterMenuContent = document.getElementById("historyFilterMenuContent");
let lastRenderedHeader = null;
const scrollListenerRef = null;
const draggingIntervalRef = null;
let scrollElementGlobal = null;

// Render
async function renderHistory({ reset = true, query = "" } = {}) {
  const panel = document.getElementById("historyPanel");
  const spinner = document.createElement("div");
  spinner.className = "spinner";

  if (cleaningMode) {
    if (panel._cleanupCheckboxListener) panel._cleanupCheckboxListener();
    if (panel._cleanupTrashListener) panel._cleanupTrashListener();
  }

  // If simplebar exists, use its content element
  const sbInstance = simpleBarInstances.get(panel);
  const target = sbInstance ? sbInstance.getContentElement() : panel;

  if (reset) {
    target.innerHTML = "";
    panel.style.paddingRight = "";
    lastRenderedHeader = null;
    currentOffset = 0;
    target.appendChild(spinner);
    const res = await sendAction("loadHistory");
    fullHistory = res.data;
  }

  renderSourceFilterMenu();
  target.querySelector(".spinner")?.remove();

  const searchQuery = query.trim();
  if (searchQuery || selectedSources.size > 0) {
    filteredHistory = fullHistory.filter((entry) => {
      const searchFields = entry.t + " " + entry.a;
      const matchesText = !searchQuery || searchFields.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesSource = selectedSources.size === 0 || selectedSources.has(entry.s);
      return matchesText && matchesSource;
    });
    isFiltering = true;
  } else {
    filteredHistory = [];
    isFiltering = false;
  }

  const dataSource = isFiltering ? filteredHistory : fullHistory;
  const end = Math.min(currentOffset + maxHistoryItemLoad, dataSource.length);
  const pagedHistory = dataSource.slice(currentOffset, end);
  currentOffset = end;

  if (reset && !pagedHistory.length) {
    const emptyMsg = document.createElement("i");
    emptyMsg.textContent = query || selectedSources.size ? "No results." : "Empty.";
    target.appendChild(emptyMsg);
    return;
  }

  const fragment = document.createDocumentFragment();

  pagedHistory.forEach((entry, i) => {
    const time = new Date(entry.p);
    const header = isSameDay(time, dateToday) ? "Today" : isSameDay(time, dateYesterday) ? "Yesterday" : dateFull(time);

    if (header !== lastRenderedHeader) {
      const h3 = document.createElement("h3");
      h3.textContent = header;
      h3.style.marginTop = "10px";
      fragment.appendChild(h3);
      lastRenderedHeader = header;
    }

    const historyIndex = fullHistory.indexOf(entry);
    fragment.appendChild(createHistoryEntry(entry, historyIndex, "history"));
  });

  target.appendChild(fragment);

  if (cleaningMode) attachCheckboxListeners();

  // Recalculate simplebar after adding content
  await activateSimpleBar("historyPanel");
}

// History Scroll
let activeScrollCleanup = null;

async function activateHistoryScroll() {
  // clear the existing instance
  if (activeScrollCleanup) {
    activeScrollCleanup();
    activeScrollCleanup = null;
  }

  const panel = document.getElementById("historyPanel");
  const sbInstance = simpleBarInstances.get(panel);
  if (!sbInstance) return;

  const scrollElement = sbInstance.getScrollElement?.() || panel.querySelector(".simplebar-content-wrapper") || panel.querySelector(".simplebar-content") || panel;
  scrollElementGlobal = scrollElement;

  // State
  let isLoading = false;
  let lastScrollTop = scrollElement.scrollTop;
  let rafId = null;
  let isDragging = false;
  let dragStartTime = 0;
  let popupShown = false;
  let observer = null;
  let scrollListenerRef = null;
  let draggingIntervalRef = null;

  const BOTTOM_TOLERANCE = 100;
  const POPUP_DELAY = 700;

  cleanup();

  function checkNearBottom(tolerance = BOTTOM_TOLERANCE) {
    return scrollElement.scrollTop + scrollElement.clientHeight >= scrollElement.scrollHeight - tolerance;
  }

  function waitForStableScroll(timeout = 400) {
    return new Promise((resolve) => {
      let lastPos = scrollElement.scrollTop;
      let stableCount = 0;

      const checkStability = setInterval(() => {
        if (scrollElement.scrollTop === lastPos) {
          if (++stableCount >= 3) {
            clearInterval(checkStability);
            resolve();
          }
        } else {
          lastPos = scrollElement.scrollTop;
          stableCount = 0;
        }
      }, 40);

      setTimeout(() => {
        clearInterval(checkStability);
        resolve();
      }, timeout);
    });
  }

  // Loading Logic
  function isFullyLoaded() {
    const dataSource = isFiltering ? filteredHistory : fullHistory;
    return currentOffset >= dataSource.length;
  }

  async function tryLoad() {
    if (isFullyLoaded() || !(scrollElement.scrollHeight > scrollElement.clientHeight + 1) || !checkNearBottom() || isLoading || isDragging) {
      return;
    }

    isLoading = true;
    try {
      await renderHistory({
        reset: false,
        query: document.getElementById("historySearchBox")?.value || "",
      });
    } catch (e) {
      console.error("renderHistory error:", e);
    } finally {
      isLoading = false;
    }
  }

  //Drag Handling
  function updateDraggingState() {
    const wasDragging = isDragging;
    isDragging = panel.classList.contains("simplebar-dragging") || sbInstance.el?.classList?.contains("simplebar-dragging");

    if (isDragging && !wasDragging) {
      // Drag started
      dragStartTime = Date.now();
      popupShown = false;

      // If all data is loaded, do not show the popup
      if (isFullyLoaded()) return;

      // Start interval for popup control
      draggingIntervalRef = setInterval(() => {
        if (!isDragging || isFullyLoaded()) {
          clearInterval(draggingIntervalRef);
          draggingIntervalRef = null;
          return;
        }

        if (checkNearBottom()) {
          const elapsed = Date.now() - dragStartTime;
          if (elapsed >= POPUP_DELAY && !popupShown) {
            showPopupMessage("Release to load the history!", "warning");
            popupShown = true;
          }
        } else {
          dragStartTime = Date.now(); // Reset timer
          if (popupShown) {
            hidePopupMessage();
            popupShown = false;
          }
        }
      }, 100);
    } else if (!isDragging && wasDragging) {
      // Drag is over
      if (draggingIntervalRef) {
        clearInterval(draggingIntervalRef);
        draggingIntervalRef = null;
      }

      if (popupShown) {
        hidePopupMessage();
        popupShown = false;
      }

      // Only load if it hasn't been fully loaded
      if (!isFullyLoaded()) {
        handleDragEnd();
      }
    }
  }

  async function handleDragEnd() {
    await waitForStableScroll(400);

    // try load only if it's very close (50px)
    if (checkNearBottom(50)) {
      await tryLoad();
    }
  }

  // Scroll Handling
  scrollListenerRef = () => {
    updateDraggingState();

    if (isDragging || scrollElement.scrollTop === lastScrollTop) return;
    lastScrollTop = scrollElement.scrollTop;

    if (rafId) return;

    rafId = requestAnimationFrame(async () => {
      rafId = null;
      await tryLoad();
    });
  };

  scrollElement.addEventListener("scroll", scrollListenerRef, { passive: true });

  // MutationObserver for drag detection
  observer = new MutationObserver(updateDraggingState);
  observer.observe(panel, {
    attributes: true,
    attributeFilter: ["class"],
  });

  // Cleanup
  function cleanup() {
    if (scrollListenerRef && scrollElement) {
      scrollElement.removeEventListener("scroll", scrollListenerRef);
      scrollListenerRef = null;
    }
    if (draggingIntervalRef) {
      clearInterval(draggingIntervalRef);
      draggingIntervalRef = null;
    }
    if (rafId) {
      cancelAnimationFrame(rafId);
      rafId = null;
    }
    if (observer) {
      observer.disconnect();
      observer = null;
    }
    if (popupShown) {
      hidePopupMessage();
      popupShown = false;
    }
  }

  activeScrollCleanup = cleanup;
  return cleanup;
}

function attachCheckboxListeners() {
  if (panel._cleanupCheckboxListener) panel._cleanupCheckboxListener();
  if (panel._cleanupTrashListener) panel._cleanupTrashListener();
  if (!panel._checkboxListenerAttached) {
    const handlePanelChange = (e) => {
      if (!cleaningMode) return;
      if (e.target.matches(".history-checkbox")) {
        const cb = e.target;
        const entry = cb.closest(".history-entry");
        if (entry) entry.classList.toggle("selected", cb.checked);
        updateClearBtnText();
      }
    };

    panel.addEventListener("change", handlePanelChange);
    panel._checkboxListenerAttached = true;

    panel._cleanupCheckboxListener = () => {
      panel.removeEventListener("change", handlePanelChange);
      panel._checkboxListenerAttached = false;
    };
  }

  // Trash icon
  panel.querySelectorAll(".history-entry").forEach((entry) => {
    const cb = entry.querySelector(".history-checkbox");

    // Add trash icon if not present
    if (!entry.querySelector(".history-trash")) {
      const trashIcon = document.createElement("span");
      trashIcon.className = "history-trash";
      trashIcon.appendChild(createSVG(svg_paths.trashIconPaths));
      trashIcon.dataset.checkboxFor = cb.id || `cb-${Date.now()}-${Math.random()}`;
      if (!cb.id) cb.id = trashIcon.dataset.checkboxFor;

      cb.insertAdjacentElement("afterend", trashIcon);
    }
  });

  // Trash icon click handler
  if (!panel._trashClickListenerAttached) {
    const handleTrashClick = (e) => {
      if (e.target.closest(".history-trash")) {
        const trashIcon = e.target.closest(".history-trash");
        const cbId = trashIcon.dataset.checkboxFor;
        const cb = document.getElementById(cbId);
        if (cb) {
          cb.checked = !cb.checked;
          const entry = cb.closest(".history-entry");
          if (entry) entry.classList.toggle("selected", cb.checked);
          updateClearBtnText();
        }
      }
    };

    panel.addEventListener("click", handleTrashClick);
    panel._trashClickListenerAttached = true;

    // Cleanup function
    panel._cleanupTrashListener = () => {
      panel.removeEventListener("click", handleTrashClick);
      panel._trashClickListenerAttached = false;
    };
  }
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

// Clear button handler
const handleClearButtonClick = async () => {
  if (!cleaningMode && fullHistory.length) {
    // Start the cleaning mode
    cleaningMode = true;
    document.body.classList.add("cleaning-mode");
    cancelCleanBtn.style.display = "inline-block";
    updateClearBtnText();
    attachCheckboxListeners();
    await activateSimpleBar("historyPanel");
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
  await sendAction("saveHistory", { data: fullHistory });

  if (panel._cleanupCheckboxListener) panel._cleanupCheckboxListener();
  if (panel._cleanupTrashListener) panel._cleanupTrashListener();

  await renderHistory();
  exitCleaningMode();
};

clearBtn.addEventListener("click", handleClearButtonClick);

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
  panel._cleanupCheckboxListener?.();
  panel._cleanupTrashListener?.();
  activateSimpleBar("historyPanel");
}

// Filter menu
function renderSourceFilterMenu() {
  filterMenuContent.innerHTML = "";
  const allSources = [...new Set(fullHistory.map((e) => e.s))];

  // Sort the sources so that the selected ones come first, the rest alphabetically
  const sources = allSources.sort((a, b) => {
    const aSelected = selectedSources.has(a) ? 0 : 1;
    const bSelected = selectedSources.has(b) ? 0 : 1;
    if (aSelected !== bSelected) return aSelected - bSelected;
    return a.localeCompare(b);
  });

  if (!document.querySelector(".history-filter")) {
    filterBtn.className = "history-filter";
    filterBtn.appendChild(createSVG(svg_paths.filterIconPaths));
  }

  // Checkbox handler
  const handleSourceCheckboxChange = async (e) => {
    if (e.target.type === "checkbox") {
      if (e.target.checked) selectedSources.add(e.target.value);
      else selectedSources.delete(e.target.value);
      if (activeScrollCleanup) {
        activeScrollCleanup();
        activeScrollCleanup = null;
      }
      await renderHistory({
        reset: true,
        query: document.getElementById("historySearchBox").value,
      });
      await destroyOtherSimpleBars();
      await activateSimpleBar(["historyPanel", "historyFilterMenuContent"]);
      await activateHistoryScroll();
    }
  };

  if (filterMenuContent._sourceChangeListener) {
    filterMenuContent.removeEventListener("change", filterMenuContent._sourceChangeListener);
    filterMenuContent._sourceChangeListener = null;
  }
  filterMenuContent._sourceChangeListener = handleSourceCheckboxChange;
  filterMenuContent.addEventListener("change", handleSourceCheckboxChange);

  sources.forEach((src) => {
    const label = document.createElement("label");
    const cb = document.createElement("input");
    const span = document.createElement("span");
    span.textContent = src;
    cb.type = "checkbox";
    cb.value = src;
    cb.checked = selectedSources.has(src);
    label.append(cb, " ", span);
    filterMenuContent.appendChild(label);
  });
}

// Filter button handler
const handleFilterButtonClick = async (e) => {
  e.stopPropagation();
  filterMenu.classList.toggle("open");
  if (filterMenu.classList.contains("open")) {
    const contentHeight = filterMenuContent.scrollHeight;
    const finalHeight = Math.min(contentHeight, 160);
    filterMenu.style.height = finalHeight + "px";
  } else {
    filterMenu.style.height = "0";
  }
  await activateSimpleBar("historyFilterMenuContent");
};

filterBtn.addEventListener("click", handleFilterButtonClick);

// Create History Entry
function createHistoryEntry(entry, historyIndex, type, filteredHistory = []) {
  const div = document.createElement("div");
  div.className = "history-entry";
  div.dataset.historyIndex = historyIndex;

  // Checkbox
  const checkbox = document.createElement("input");
  checkbox.type = "checkbox";
  checkbox.className = "history-checkbox";
  checkbox.dataset.index = historyIndex;

  // Image
  const img = document.createElement("img");
  img.width = 46;
  img.height = 46;
  img.className = "history-image lazyload";
  img.dataset.src = entry.i || browser.runtime.getURL("icons/48x48.png");
  img.alt = "";

  img.addEventListener(
    "error",
    () => {
      img.src = browser.runtime.getURL("icons/48x48.png");
    },
    { once: true },
  );

  // Info
  const info = document.createElement("div");
  info.className = "history-info";

  const strong = document.createElement("strong");
  strong.textContent = entry.t;
  strong.className = "history-title";

  const small = document.createElement("small");
  small.className = "history-source";
  const time = new Date(entry.p);

  let extraText = "";

  if (type === "stats") {
    const totalPlays = filteredHistory.filter((e) => e.t === entry.t).length;
    if (totalPlays) {
      extraText = ` • ${totalPlays} plays`;
    }
  } else {
    const formattedTime = dateHourMinute(time);
    if (formattedTime) {
      extraText = ` • ${formattedTime}`;
    }
  }

  small.textContent = `${entry.s}${extraText}`;

  info.append(strong);

  if (entry.a !== "Radio") {
    const artist = document.createElement("span");
    artist.className = "history-artist";
    artist.textContent = entry.a;
    const br = document.createElement("br");
    info.append(artist, br);
  }
  info.appendChild(small);

  // Link
  const link = document.createElement("a");
  link.className = "song-link";
  link.title = "Go to The Song";
  link.target = "_blank";
  link.rel = "noopener noreferrer";
  if (entry.u) {
    link.href = entry.u;
  }
  // Get from SVG cache
  link.appendChild(createSVG(svg_paths.redirectIconPaths));

  // Combine them all
  div.append(checkbox, img, info, link);
  return div;
}
