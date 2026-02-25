import { dom, simpleBars } from "../../core/dom.js";
import { DataStore } from "../../core/dataStore.js";
import { ScrollManager } from "../../manager/scrollManager.js";
import { LogState } from "./logs.js";
import { fullDateTime, relativeTime, updateSimpleBarPadding } from "../../utils.js";

export const LogRenderer = {
  isFetching: false,
  _isRendering: false,
  _scrollManagerActivated: false,

  createLogElement(log) {
    const div = document.createElement("div");
    div.className = `logEntry ${log.type}`;

    const header = document.createElement("div");
    header.className = "header";

    const time = document.createElement("span");
    time.className = "time";
    const date = new Date(log.timestamp);
    const dateLong = fullDateTime(date);
    const dateAgo = relativeTime(date.getTime());
    time.textContent = `${dateAgo} (${dateLong})`;

    const type = document.createElement("span");
    type.className = `type ${log.type}`;
    type.textContent = log.type;

    const message = document.createElement("div");
    message.className = "message";
    message.textContent = log.message;

    const stack = document.createElement("div");
    stack.className = "stack";
    stack.textContent = log.stack || "";

    header.append(time, type);
    div.append(header, message, stack);
    return div;
  },

  async render({ reset = true } = {}) {
    const scrollEl = simpleBars.logs.getScrollElement();
    if (this._isRendering || !scrollEl || scrollEl.offsetParent === null) return;

    this._isRendering = true;

    try {
      const targetContainer = dom.logsContainer;
      const filter = dom.errorFilter.value;

      if (reset) {
        targetContainer.replaceChildren();
        LogState.currentOffset = 0;

        if (LogState.fullData.length === 0 && !this.isFetching) {
          this.isFetching = true;
          try {
            const logsData = DataStore.get("logs");
            if (logsData && Array.isArray(logsData)) {
              LogState.fullData = [...logsData].reverse();
            } else {
              LogState.fullData = [];
            }

            if (!this._scrollManagerActivated) {
              await ScrollManager.activate("logs", simpleBars.logs, LogRenderer, LogState, "logsWrapper", "logs");
              this._scrollManagerActivated = true;
            }
          } catch (err) {
            console.error("Logs fetch error:", err);
          } finally {
            this.isFetching = false;
          }
        }
      }

      LogState.isFiltering = filter !== "all";
      if (LogState.isFiltering) {
        LogState.filteredData = LogState.fullData.filter((l) => l.type === filter);
      }

      const data = LogState.isFiltering ? LogState.filteredData : LogState.fullData;

      if (!this.isFetching && reset && data.length === 0) {
        const emptyDiv = document.createElement("div");
        emptyDiv.className = "no-logs";
        emptyDiv.textContent = "No logs found for this filter.";
        targetContainer.replaceChildren(emptyDiv);
        return;
      }

      const end = Math.min(LogState.currentOffset + LogState.maxLoad, data.length);
      const items = data.slice(LogState.currentOffset, end);
      LogState.currentOffset = end;

      if (items.length > 0) {
        const frag = document.createDocumentFragment();
        items.forEach((log) => frag.appendChild(this.createLogElement(log)));
        targetContainer.appendChild(frag);
        simpleBars.logs.recalculate();
      }

      if (LogState.currentOffset < data.length) {
        await new Promise((resolve) => requestAnimationFrame(resolve));

        const needsMore = scrollEl.scrollHeight <= scrollEl.clientHeight + 5;
        if (needsMore && scrollEl.offsetParent !== null) {
          this._isRendering = false;
          await this.render({ reset: false });
          return;
        }
      }

      updateSimpleBarPadding("logsWrapper");
    } finally {
      this._isRendering = false;
    }
  },

  async prependNewLogs(newLogsRaw) {
    const targetContainer = dom.logsContainer;
    const filter = dom.errorFilter.value;
    if (!targetContainer || !newLogsRaw.length) return;

    const incomingLogs = [...newLogsRaw].reverse();
    const lastKnownTimestamp = LogState.fullData.length > 0 ? LogState.fullData[0].timestamp : 0;
    const trulyNewLogs = incomingLogs.filter((log) => log.timestamp > lastKnownTimestamp);

    if (trulyNewLogs.length === 0) return;

    LogState.fullData = [...trulyNewLogs, ...LogState.fullData];

    const logsToDisplay = filter === "all" ? trulyNewLogs : trulyNewLogs.filter((l) => l.type === filter);

    if (logsToDisplay.length > 0) {
      const frag = document.createDocumentFragment();
      logsToDisplay.forEach((log) => frag.appendChild(this.createLogElement(log)));

      targetContainer.prepend(frag);
      simpleBars.logs.recalculate();

      LogState.currentOffset += logsToDisplay.length;
    }
  },

  destroy() {
    this._scrollManagerActivated = false;
    this.isFetching = false;
    this._isRendering = false;
  },
};
