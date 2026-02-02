// STATE
const HistoryState = {
  isFiltering: false,
  fullHistory: [],
  filteredHistory: [],
  currentOffset: 0,
  maxLoad: 20,
  selectedSources: new Set(),
  lastRenderedHeader: null,
  activeScrollCleanup: null,
};

// UTILS
const HistoryUtils = {
  findParserBySource(source) {
    if (!source) return null;
    const s = source.toLowerCase().trim();

    const strategies = [
      (p) => (p.title || "").toLowerCase() === s || (p.domain || "").toLowerCase() === s,
      (p) => (p.domain || "").split(".")[0].toLowerCase() === s,
      (p) => {
        const t = (p.title || "").toLowerCase();
        const d = (p.domain || "").toLowerCase();
        return t.includes(s) || s.includes(t) || d.includes(s) || s.includes(d);
      },
      (p) => {
        const clean = (str) => (str || "").toLowerCase().replace(/[\s\-_.]/g, "");
        return clean(p.title) === clean(s) || clean(p.domain) === clean(s);
      },
    ];

    for (const fn of strategies) {
      const parser = FilterState.parserList.find(fn);
      if (parser) return parser;
    }
    return null;
  },

  checkIfBlocked(entry) {
    const artist = (entry.a || "").toLowerCase().trim();
    const title = (entry.t || "").toLowerCase().trim();
    const parser = this.findParserBySource(entry.s);
    if (!parser) return false;

    for (const filter of FilterState.parserFilters) {
      if (FilterUtils.isReplaceFilter(filter)) continue;
      if (!filter.parsers.includes("*") && !filter.parsers.includes(parser.id)) continue;

      for (const e of filter.entries) {
        const fa = (e.artist || "").toLowerCase().trim();
        const ft = (e.title || "").toLowerCase().trim();

        if ((!fa || fa === artist) && (!ft || ft === title)) {
          return { isBlocked: true, filterId: filter.id, entry: e };
        }
      }
    }
    return false;
  },

  findExistingReplace(entry) {
    const artist = (entry.a || "").toLowerCase().trim();
    const title = (entry.t || "").toLowerCase().trim();
    const parser = this.findParserBySource(entry.s);
    if (!parser) return null;

    for (const filter of FilterState.parserFilters) {
      if (!FilterUtils.isReplaceFilter(filter)) continue;
      if (!filter.parsers.includes("*") && !filter.parsers.includes(parser.id)) continue;

      for (let i = 0; i < filter.entries.length; i++) {
        const e = filter.entries[i];

        const replaceA = (e.replaceArtist || "").toLowerCase().trim();
        const replaceT = (e.replaceTitle || "").toLowerCase().trim();

        const artistMatch = !replaceA || replaceA === "*" || replaceA === artist;

        const titleMatch = !replaceT || replaceT === "*" || replaceT === title;

        if (artistMatch && titleMatch) {
          return { filter, entryIndex: i, entry: e };
        }
      }
    }

    return null;
  },

  createHistoryEntry(entry, historyIndex) {
    const div = document.createElement("div");
    div.className = "history-entry";
    div.dataset.historyIndex = historyIndex;
    div.dataset.entryKey = HistoryUtils.createEntryKey(entry);

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

    const title = document.createElement("strong");
    title.className = "history-title";
    title.textContent = entry.t;

    const artist = document.createElement("div");
    artist.className = "history-artist";
    artist.textContent = entry.a;

    const source = document.createElement("small");
    source.className = "history-source";
    const time = new Date(entry.p);
    source.textContent = `${entry.s} • ${dateHourMinute(time)}`;

    info.append(title, artist, source);

    // Actions
    const actionsContainer = document.createElement("div");
    actionsContainer.className = "history-entry-actions";

    // Block button
    const blockBtn = document.createElement("button");
    blockBtn.className = "history-action-btn block-btn";

    const isBlocked = this.checkIfBlocked(entry);
    blockBtn.textContent = isBlocked ? "Unblock" : "Block";
    if (isBlocked) blockBtn.classList.add("unblock-mode");

    blockBtn.addEventListener("click", async (e) => {
      e.stopPropagation();
      await HistoryActions.toggleBlock(entry, blockBtn);
    });

    // Replace button
    const replaceBtn = document.createElement("button");
    replaceBtn.className = "history-action-btn replace-btn";

    const existingReplace = this.findExistingReplace(entry);
    replaceBtn.textContent = existingReplace ? "Edit Replace" : "Replace";
    if (existingReplace) replaceBtn.classList.add("edit-mode");

    replaceBtn.addEventListener("click", async (e) => {
      e.stopPropagation();
      await HistoryActions.handleReplace(entry);
    });

    actionsContainer.append(blockBtn, replaceBtn);
    div.append(img, info, actionsContainer);

    return div;
  },
  createEntryKey(entry) {
    const artist = (entry.a || "").toLowerCase().trim();
    const title = (entry.t || "").toLowerCase().trim();
    const source = (entry.s || "").toLowerCase().trim();

    return `${source}|||${artist}|||${title}`;
  },
};
