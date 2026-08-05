import { HistoryRenderer } from "./historyRenderer.js";

function createHistoryState() {
  return {
    fullData: [],
    filteredData: [],
    previousHash: "",
    currentOffset: 0,
    maxLoad: 8,
    selectedSources: new Set(),
    isFiltering: false,
  };
}

export const HistoryState = {
  listen: createHistoryState(),
  watch: createHistoryState(),
};

export async function initializeHistory(mode = "listen") {
  try {
    const renderer = HistoryRenderer[mode];
    const state = HistoryState[mode];
    if (!renderer || !state) {
      console.error(`[history]: unknown mode "${mode}"`);
      return;
    }
    await renderer.render({ reset: true });
    if (state.fullData.length > 0) {
      renderer.renderSourceFilter();
    }
  } catch (error) {
    console.error(`[history]: Failed to initialize history (${mode}):`, error);
  }
}
