import { dom } from "../../core/dom.js";
import { LogRenderer } from "./logsRenderer.js";

export const LogState = {
  fullData: [],
  filteredData: [],
  currentOffset: 0,
  maxLoad: 40,
  previousHash: "",
  isFiltering: false,
  _tsInstance: null,
};

export async function initializeLogs() {
  try {
    await LogRenderer.render({ reset: true });

    LogState._tsInstance = new TomSelect(dom.errorFilter, {
      controlInput: null,
      sortField: false,
      plugins: {
        auto_width: { sb: false },
      },
      onChange: () => {
        LogRenderer.render({ reset: true });
      },
    });
  } catch (error) {
    console.error("Failed to initialize logs:", error);
  }
}
