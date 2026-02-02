
const FilterState = {
  // Data
  parserList: [],
  parserFilters: [],

  // Form state
  form: {
    isOpen: false,
    editingFilterId: null,
    mode: "filter", // 'filter' | 'replace'
    entries: [{ artist: "", title: "", replaceArtist: "", replaceTitle: "" }],
    replaceAction: "update", // 'update' | 'revert'
  },

  // Parser selection
  parsers: {
    allSelected: false,
    selectedIds: [], // Order matters for display
    searchQuery: "",
  },

  // UI state
  ui: {
    activeTab: "all", // 'all' | 'block' | 'replace'
  },
};

// STORAGE - Browser storage operations
const FilterStorage = {
  async loadParsers() {
    try {
      const { parserList } = await browser.storage.local.get("parserList");
      FilterState.parserList = parserList || [];
    } catch (error) {
      console.error("Failed to load parsers:", error);
      FilterState.parserList = [];
    }
  },

  async loadFilters() {
    try {
      const { parserFilters } = await browser.storage.local.get("parserFilters");
      FilterState.parserFilters = parserFilters || [];
    } catch (error) {
      console.error("Failed to load filters:", error);
      FilterState.parserFilters = [];
    }
  },

  async saveFilters() {
    try {
      await browser.storage.local.set({ parserFilters: FilterState.parserFilters });
    } catch (error) {
      console.error("Failed to save filters:", error);
      alert("Failed to save filters. Please try again.");
      throw error;
    }
  },
};
