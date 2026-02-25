import { HistoryRenderer } from "./historyRenderer.js";

export const HistoryState = {
  fullData: [],
  filteredData: [],
  previousHash: "",
  currentOffset: 0,
  maxLoad: 20,
  selectedSources: new Set(),
  isFiltering: false,
};

export async function initializeHistory() {
  try {
    await HistoryRenderer.render({ reset: true });
    if (HistoryState.fullData && HistoryState.fullData.length > 0) {
      HistoryRenderer.renderSourceFilter();
    }
  } catch (error) {
    console.error("Failed to initialize history:", error);
  }
}
