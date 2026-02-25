import { dom } from "../../core/dom.js";
import { LogRenderer } from "./logsRenderer.js";

export const LogState = {
  fullData: [],
  filteredData: [],
  currentOffset: 0,
  maxLoad: 40,
  previousHash: "",
  isFiltering: false,
};

export async function initializeLogs() {
  try {
    await LogRenderer.render({ reset: true });
    dom.errorFilter.addEventListener("change", () => {
      LogRenderer.render({ reset: true });
    });
  } catch (error) {
    console.error("Failed to initialize logs:", error);
  }
}
