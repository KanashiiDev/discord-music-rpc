import { simpleBars } from "../../core/dom.js";
import { DataStore } from "../../core/dataStore.js";
import { ScrollManager } from "../../manager/scrollManager.js";
import { HistoryState } from "../history/history.js";
import { createHistoryItem } from "../history/historyItem.js";
import { updateSimpleBarPadding } from "../../utils.js";

export const HistoryRenderer = {
  isFetching: false,
  _isRendering: false,
  _sourceFilterInitialized: false,
  _tsInstance: null,

  async render({ reset = true, query = "" } = {}) {
    const scrollEl = simpleBars.history.getScrollElement();
    if (this._isRendering || !scrollEl || scrollEl.offsetParent === null) {
      return;
    }

    this._isRendering = true;

    try {
      const targetContainer = document.getElementById("historyContainer");
      if (!targetContainer) return;

      if (reset) {
        targetContainer.replaceChildren();
        HistoryState.currentOffset = 0;

        if (HistoryState.fullData.length === 0 && !this.isFetching) {
          this.isFetching = true;
          const spinner = document.createElement("div");
          spinner.className = "spinner";
          spinner.textContent = "Loading...";
          targetContainer.appendChild(spinner);

          try {
            const historyData = DataStore.get("history");
            if (historyData && Array.isArray(historyData)) {
              HistoryState.fullData = [...historyData].reverse();
            } else {
              HistoryState.fullData = [];
            }

            await ScrollManager.activate("history", simpleBars.history, HistoryRenderer, HistoryState, "historyWrapper", "songs");

            this.renderSourceFilter();
          } catch (err) {
            console.error("Failed to load history:", err);
            HistoryState.fullData = [];
          } finally {
            spinner.remove();
            this.isFetching = false;
          }
        }
      }

      const q = query.trim().toLowerCase();
      const hasActiveFilters = q || HistoryState.selectedSources.size > 0;

      if (hasActiveFilters) {
        HistoryState.filteredData = HistoryState.fullData.filter((e) => {
          const text = (e.title + " " + (e.artist || "")).toLowerCase();
          const matchesQuery = !q || text.includes(q);
          const matchesSource = !HistoryState.selectedSources.size || HistoryState.selectedSources.has(e.source);
          return matchesQuery && matchesSource;
        });
        HistoryState.isFiltering = true;
      } else {
        HistoryState.isFiltering = false;
      }

      const data = HistoryState.isFiltering ? HistoryState.filteredData : HistoryState.fullData;

      if (!this.isFetching && reset && data.length === 0) {
        const empty = document.createElement("i");
        empty.textContent = hasActiveFilters ? "No results found." : "History is empty.";
        empty.className = "empty-msg";
        targetContainer.appendChild(empty);
        return;
      }

      const end = Math.min(HistoryState.currentOffset + HistoryState.maxLoad, data.length);
      const items = data.slice(HistoryState.currentOffset, end);
      HistoryState.currentOffset = end;

      if (items.length > 0) {
        const frag = document.createDocumentFragment();
        items.forEach((entry) => frag.appendChild(createHistoryItem(entry)));
        targetContainer.appendChild(frag);
        simpleBars.history.recalculate();
      }

      if (HistoryState.currentOffset < data.length) {
        await new Promise((resolve) => requestAnimationFrame(resolve));

        const needsMore = scrollEl.scrollHeight <= scrollEl.clientHeight + 5;
        if (needsMore && scrollEl.offsetParent !== null) {
          this._isRendering = false;
          await this.render({ reset: false, query });
          return;
        }
      }

      updateSimpleBarPadding("historyWrapper");
    } finally {
      this._isRendering = false;
    }
  },

  async prependNewHistory(newHistoryRaw) {
    const targetContainer = document.getElementById("historyContainer");
    if (!targetContainer || !newHistoryRaw.length) return;

    const incomingData = [...newHistoryRaw].reverse();
    const lastKnownDate = HistoryState.fullData.length > 0 ? HistoryState.fullData[0].date : 0;

    const trulyNewItems = incomingData.filter((item) => item.date > lastKnownDate);
    if (trulyNewItems.length === 0) return;

    HistoryState.fullData = [...trulyNewItems, ...HistoryState.fullData];

    const itemsToDisplay = HistoryState.selectedSources.size === 0 ? trulyNewItems : trulyNewItems.filter((item) => HistoryState.selectedSources.has(item.source));

    if (itemsToDisplay.length > 0) {
      const frag = document.createDocumentFragment();
      itemsToDisplay.forEach((entry) => frag.appendChild(createHistoryItem(entry)));

      targetContainer.prepend(frag);
      simpleBars.history.recalculate();
      HistoryState.currentOffset += itemsToDisplay.length;
    }
  },

  renderSourceFilter() {
    const filterSelect = document.getElementById("historyFilter");
    if (!filterSelect) return;

    if (this._tsInstance) {
      this._tsInstance.destroy();
      this._tsInstance = null;
      this._sourceFilterInitialized = false;
    }

    while (filterSelect.options.length > 1) {
      filterSelect.remove(1);
    }

    const sources = [...new Set(HistoryState.fullData.map((e) => e.source))].filter(Boolean).sort();
    sources.forEach((source) => {
      const option = document.createElement("option");
      option.value = source;
      option.textContent = source;
      filterSelect.appendChild(option);
    });

    if (this._sourceFilterInitialized) return;

    this._tsInstance = new TomSelect(filterSelect, {
      controlInput: null,
      sortField: false,
      onDropdownOpen: (dropdown) => {
        const list = dropdown.querySelector(".ts-dropdown-content");
        if (!list) return;
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            requestAnimationFrame(() => {
              if (simpleBars.historyFilter) {
                simpleBars.historyFilter.unMount();
                simpleBars.historyFilter = null;
              }
              simpleBars.historyFilter = new SimpleBar(list);
            });
          });
        });
      },
      onDropdownClose: () => {
        if (simpleBars.historyFilter) {
          simpleBars.historyFilter.unMount();
          simpleBars.historyFilter = null;
        }
      },
      onChange: async (value) => {
        if (value !== "all") {
          HistoryState.selectedSources = new Set([value]);
        } else {
          HistoryState.selectedSources.clear();
        }
        await this.render({ reset: true });
        const scrollEl = simpleBars.history.getScrollElement();
        if (scrollEl) scrollEl.scrollTo({ top: 0, behavior: "smooth" });
      },
    });

    this._sourceFilterInitialized = true;
  },

  destroy() {
    if (this._tsInstance) {
      this._tsInstance.destroy();
      this._tsInstance = null;
    }
    this._sourceFilterInitialized = false;
    this.isFetching = false;
    this._isRendering = false;
  },
};
