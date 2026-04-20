// PARSER CONTROLLER - Manages parser selection UI
const ParserController = {
  // Toggle all parsers
  toggleAll(checked) {
    FilterState.parsers.allSelected = checked;
    if (checked) {
      FilterState.parsers.selectedIds = [];
    }
  },

  // Toggle single parser
  toggle(parserId, checked) {
    const { selectedIds } = FilterState.parsers;
    if (checked) {
      if (!selectedIds.includes(parserId)) {
        selectedIds.push(parserId);
      }
    } else {
      FilterState.parsers.selectedIds = selectedIds.filter((id) => id !== parserId);
    }
  },

  // Get parsers for current search
  getFiltered() {
    const { searchQuery } = FilterState.parsers;
    if (!searchQuery) return FilterState.parserList;

    return FilterState.parserList.filter((parser) => {
      const text = FilterUtils.normalize(parser.title || parser.domain);
      return text.includes(searchQuery);
    });
  },

  // Get selected/unselected parsers
  getSeparated() {
    const filtered = this.getFiltered();
    const selected = [];
    const unselected = [];
    const { allSelected, selectedIds } = FilterState.parsers;

    filtered.forEach((parser) => {
      (allSelected || selectedIds.includes(parser.id) ? selected : unselected).push(parser);
    });

    selected.sort((a, b) => selectedIds.indexOf(a.id) - selectedIds.indexOf(b.id));

    return { selected, unselected };
  },

  // Returns ["*"] for all-selected, or the ordered selectedIds array
  getSelection() {
    return FilterState.parsers.allSelected ? ["*"] : [...FilterState.parsers.selectedIds];
  },

  // LIFECYCLE
  // Load parser state from a saved filter (used when opening edit mode).
  // Returns orphanedIds - IDs that are selected but no longer in parserList.
  loadFromFilter(filter) {
    const allParsers = filter.parsers.includes("*");
    FilterState.parsers.allSelected = allParsers;

    if (allParsers) {
      FilterState.parsers.selectedIds = [];
      return [];
    }

    FilterState.parsers.selectedIds = [...filter.parsers];

    const orphanedIds = filter.parsers.filter((id) => !FilterState.parserList.find((p) => p.id === id));
    return orphanedIds;
  },

  reset() {
    FilterState.parsers.allSelected = false;
    FilterState.parsers.selectedIds = [];
  },

  // Validate parser selection before saving.
  // Blocks save if all selected IDs are orphaned (not in parserList).
  // Warns and asks confirmation if some are orphaned.
  validate() {
    const selection = this.getSelection();

    if (selection.length === 0) {
      showAlert(i18n.t("parserManager.selectOne"), "", "warn");
      return false;
    }

    // "*" means all current parsers - always valid
    if (selection[0] === "*") return true;

    const orphanedIds = selection.filter((id) => !FilterState.parserList.find((p) => p.id === id));

    if (orphanedIds.length === 0) return true;

    // All selected are orphaned - hard block
    if (orphanedIds.length === selection.length) {
      showAlert(i18n.t("filter.warn.noneSelectedSites"), "", "warn");
      return false;
    }

    // Some orphaned - warn and ask
    const orphanedCount = orphanedIds.length;
    const confirmed = showConfirm("", {
      heading: i18n.t("filter.warn.noneSelectedSites", { count: orphanedCount }),
      body: "",
    });

    if (confirmed) {
      // Strip orphaned IDs before save proceeds
      FilterState.parsers.selectedIds = FilterState.parsers.selectedIds.filter((id) => FilterState.parserList.find((p) => p.id === id));
    }

    return confirmed;
  },

  // Stub - previously triggered DOM re-renders that no longer exist.
  // Kept so any call site that hasn't been updated yet doesn't throw.
  render() {},
  renderAllSwitch() {},
};
