// ACTIONS
const HistoryActions = {
  async updateFilter(action, entry, buttonElement = null) {
    const artist = (entry.a || "").trim();
    const title = (entry.t || "").trim();
    const source = entry.s || "";

    const parser = HistoryUtils.findParserBySource(source);
    const parserId = parser?.id;

    if (!parserId) {
      showPopupMessage(`Parser not found for "${source}"`, "error", 3000);
      return false;
    }

    if (action === "block") {
      const checkEntry = { artist, title, replaceArtist: "", replaceTitle: "" };
      const duplicate = FilterUtils.findDuplicate(checkEntry, false);

      if (duplicate.isDuplicate) {
        showPopupMessage("This song is already in filters", "warning", 3000);
        return false;
      }

      let filter = FilterState.parserFilters.find((f) => !FilterUtils.isReplaceFilter(f) && f.parsers.includes(parserId));

      if (!filter) {
        filter = {
          id: FilterUtils.generateId(),
          createdAt: new Date().toISOString(),
          entries: [],
          parsers: [parserId],
        };
        FilterState.parserFilters.push(filter);
      }

      filter.entries.push({ artist, title });
      filter.updatedAt = new Date().toISOString();
    } else if (action === "unblock") {
      const blocked = HistoryUtils.checkIfBlocked(entry);
      if (!blocked?.isBlocked) return false;

      const filterIndex = FilterState.parserFilters.findIndex((f) => f.id === blocked.filterId);
      if (filterIndex === -1) return false;

      const filter = FilterState.parserFilters[filterIndex];
      const idx = filter.entries.findIndex((e) => (e.artist || "").toLowerCase().trim() === artist.toLowerCase() && (e.title || "").toLowerCase().trim() === title.toLowerCase());

      if (idx === -1) return false;

      filter.entries.splice(idx, 1);
      filter.updatedAt = new Date().toISOString();

      if (!filter.entries.length) {
        FilterState.parserFilters.splice(filterIndex, 1);
      }
    }

    await FilterStorage.saveFilters();
    FilterTabsController.render();
    FilterListController.render();

    showPopupMessage(`Song ${action}ed successfully!`, "success", 3000);
    this.syncBlockUI(entry, action);
    return true;
  },

  syncBlockUI(entry, action) {
  const key = HistoryUtils.createEntryKey(entry);
  const isBlocked = action === "block";

  document.querySelectorAll(
    `.history-entry[data-entry-key="${key}"]`
  ).forEach((el) => {
    const btn = el.querySelector(".block-btn");
    if (!btn) return;

    btn.textContent = isBlocked ? "Unblock" : "Block";
    btn.classList.toggle("unblock-mode", isBlocked);
  });
},

  async toggleBlock(entry, buttonElement) {
    const blocked = HistoryUtils.checkIfBlocked(entry);
    const action = blocked?.isBlocked ? "unblock" : "block";
    await this.updateFilter(action, entry, buttonElement);
  },

  async handleReplace(entry) {
    const parser = HistoryUtils.findParserBySource(entry.s);
    if (!parser) {
      showPopupMessage(`Parser not found for "${entry.s}"`, "error", 3000);
      return;
    }

    const existingReplace = HistoryUtils.findExistingReplace(entry);

    // Close history modal
    HistoryModal.close();

    // If existing replace, open in edit mode
    if (existingReplace) {
      if (FilterState.form.isOpen) {
        FormController.close();
        await delay(100);
      }

      await FormController.startEdit(existingReplace.filter, existingReplace.entryIndex);
      return;
    }

    // Create new replace filter
    if (FilterState.form.isOpen) {
      FormController.close();
      await delay(100);
    }

    const form = document.getElementById("formContainer");
    const btn = document.getElementById("toggleFormBtn");
    const container = document.querySelector(".filter-actions-header");

    if (container?.parentNode) {
      container.parentNode.insertBefore(form, container.nextSibling);
    }

    form.classList.add("active");
    document.querySelectorAll(".filter-item").forEach((i) => i.classList.add("dimmed"));
    btn.textContent = "Hide Filter Menu";

    // Set form state
    FilterState.form.isOpen = true;
    FilterState.form.mode = "replace";
    FilterState.form.entries = [
      {
        artist: entry.a || "",
        title: entry.t || "",
        replaceArtist: "",
        replaceTitle: "",
      },
    ];

    // Set parser selection
    FilterState.parsers.selectedIds = [parser.id];
    FilterState.parsers.allSelected = false;

    FormController.renderMode();
    FormController.renderEntries();
    ParserController.render();
  },
};

// SCROLL HANDLER
const HistoryScroll = {
  async activate() {
    // Clear existing
    if (HistoryState.activeScrollCleanup) {
      HistoryState.activeScrollCleanup();
      HistoryState.activeScrollCleanup = null;
    }

    const panel = HistoryDOM.panel;
    const sbInstance = simpleBarInstances.get(panel);
    if (!sbInstance) return;

    const scrollElement = sbInstance.getScrollElement?.() || panel.querySelector(".simplebar-content-wrapper") || panel.querySelector(".simplebar-content") || panel;

    // State
    let isLoading = false;
    let lastScrollTop = scrollElement.scrollTop;
    let rafId = null;
    let isDragging = false;
    let dragStartTime = 0;
    let popupShown = false;
    let observer = null;
    let scrollListener = null;
    let draggingInterval = null;

    const BOTTOM_TOLERANCE = 100;
    const POPUP_DELAY = 700;

    const checkNearBottom = (tolerance = BOTTOM_TOLERANCE) => {
      return scrollElement.scrollTop + scrollElement.clientHeight >= scrollElement.scrollHeight - tolerance;
    };

    const waitForStableScroll = (timeout = 400) => {
      return new Promise((resolve) => {
        let lastPos = scrollElement.scrollTop;
        let stableCount = 0;

        const check = setInterval(() => {
          if (scrollElement.scrollTop === lastPos) {
            if (++stableCount >= 3) {
              clearInterval(check);
              resolve();
            }
          } else {
            lastPos = scrollElement.scrollTop;
            stableCount = 0;
          }
        }, 40);

        setTimeout(() => {
          clearInterval(check);
          resolve();
        }, timeout);
      });
    };

    const isFullyLoaded = () => {
      const data = HistoryState.isFiltering ? HistoryState.filteredHistory : HistoryState.fullHistory;
      return HistoryState.currentOffset >= data.length;
    };

    const tryLoad = async () => {
      if (isFullyLoaded() || !(scrollElement.scrollHeight > scrollElement.clientHeight + 1) || !checkNearBottom() || isLoading || isDragging) {
        return;
      }

      isLoading = true;
      try {
        await HistoryRenderer.render({
          reset: false,
          query: HistoryDOM.searchBox?.value || "",
        });
      } catch (e) {
        console.error("renderHistory error:", e);
      } finally {
        isLoading = false;
      }
    };

    const updateDraggingState = () => {
      const wasDragging = isDragging;
      isDragging = panel.classList.contains("simplebar-dragging") || sbInstance.el?.classList?.contains("simplebar-dragging");

      if (isDragging && !wasDragging) {
        // Drag started
        dragStartTime = Date.now();
        popupShown = false;

        if (isFullyLoaded()) return;

        draggingInterval = setInterval(() => {
          if (!isDragging || isFullyLoaded()) {
            clearInterval(draggingInterval);
            draggingInterval = null;
            return;
          }

          if (checkNearBottom()) {
            const elapsed = Date.now() - dragStartTime;
            if (elapsed >= POPUP_DELAY && !popupShown) {
              showPopupMessage("Release to load the history!", "warning");
              popupShown = true;
            }
          } else {
            dragStartTime = Date.now();
            if (popupShown) {
              hidePopupMessage();
              popupShown = false;
            }
          }
        }, 100);
      } else if (!isDragging && wasDragging) {
        // Drag ended
        if (draggingInterval) {
          clearInterval(draggingInterval);
          draggingInterval = null;
        }

        if (popupShown) {
          hidePopupMessage();
          popupShown = false;
        }

        if (!isFullyLoaded()) {
          handleDragEnd();
        }
      }
    };

    const handleDragEnd = async () => {
      await waitForStableScroll(400);
      if (checkNearBottom(50)) {
        await tryLoad();
      }
    };

    scrollListener = () => {
      updateDraggingState();

      if (isDragging || scrollElement.scrollTop === lastScrollTop) return;
      lastScrollTop = scrollElement.scrollTop;

      if (rafId) return;

      rafId = requestAnimationFrame(async () => {
        rafId = null;
        await tryLoad();
      });
    };

    scrollElement.addEventListener("scroll", scrollListener, { passive: true });

    observer = new MutationObserver(updateDraggingState);
    observer.observe(panel, {
      attributes: true,
      attributeFilter: ["class"],
    });

    const cleanup = () => {
      if (scrollListener && scrollElement) {
        scrollElement.removeEventListener("scroll", scrollListener);
        scrollListener = null;
      }
      if (draggingInterval) {
        clearInterval(draggingInterval);
        draggingInterval = null;
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
    };

    HistoryState.activeScrollCleanup = cleanup;
    return cleanup;
  },
};

// MODAL CONTROLLER
const HistoryModal = {
  async open() {
    FormController.close();
    document.body.style.overflow = "hidden";
    this.reset();
    HistoryDOM.modal.style.display = "flex";

    await destroySimplebar("historyPanel");
    await HistoryRenderer.render({ reset: true, query: "" });
    await activateSimpleBar("historyPanel");
    await HistoryScroll.activate();

    HistoryRenderer.renderSourceFilter();
  },

  close() {
    document.body.style.overflow = "";
    HistoryDOM.modal.style.display = "none";
  },

  reset() {
    HistoryDOM.searchBox.value = "";
    HistoryState.selectedSources.clear();
    HistoryState.currentOffset = 0;
    HistoryState.isFiltering = false;
    HistoryState.filteredHistory = [];
    HistoryState.lastRenderedHeader = null;

    HistoryDOM.filterMenu.classList.remove("open");
    HistoryDOM.filterMenu.style.height = "0";
    HistoryDOM.panel.innerHTML = "";
  },
};
