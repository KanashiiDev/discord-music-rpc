// UTILS
const FilterUtils = {
  generateId() {
    return Date.now().toString(36).slice(-6) + Math.random().toString(36).slice(2, 8);
  },

  // Normalize string for comparison
  normalize(str) {
    return (str || "").toLowerCase().trim();
  },

  // Check if filter is replace mode
  isReplaceFilter(filter) {
    return filter.entries.some((e) => e.replaceArtist || e.replaceTitle);
  },

  // Create entry key for duplicate checking
  createEntryKey(entry, includeReplace = false) {
    const artist = this.normalize(entry.artist);
    const title = this.normalize(entry.title);

    if (!includeReplace) {
      return `${artist}|||${title}`;
    }

    const replaceArtist = this.normalize(entry.replaceArtist);
    const replaceTitle = this.normalize(entry.replaceTitle);
    return `${artist}|||${title}|||${replaceArtist}|||${replaceTitle}`;
  },

  // Check for duplicate entry across all filters
  findDuplicate(entry, includeReplace = false) {
    const key = this.createEntryKey(entry, includeReplace);

    for (const filter of FilterState.parserFilters) {
      const filterIsReplace = this.isReplaceFilter(filter);

      for (const existing of filter.entries) {
        const existingKey = this.createEntryKey(existing, filterIsReplace);
        if (existingKey === key) {
          return { isDuplicate: true, filterId: filter.id };
        }
      }
    }

    return { isDuplicate: false };
  },

  // Filter duplicates from array
  removeDuplicates(entries, includeReplace = false) {
    const seen = new Set();
    return entries.filter((entry) => {
      const key = this.createEntryKey(entry, includeReplace);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  },
};

// EVENT MANAGER - Event listener tracking
const FilterEvents = {
  listeners: new Map(),

  add(element, event, handler) {
    element.addEventListener(event, handler);
    if (!this.listeners.has(element)) {
      this.listeners.set(element, []);
    }
    this.listeners.get(element).push({ event, handler });
  },

  removeFrom(element) {
    const handlers = this.listeners.get(element);
    if (handlers) {
      handlers.forEach(({ event, handler }) => {
        element.removeEventListener(event, handler);
      });
      this.listeners.delete(element);
    }
  },

  clearAll() {
    this.listeners.forEach((handlers, element) => {
      handlers.forEach(({ event, handler }) => {
        element.removeEventListener(event, handler);
      });
    });
    this.listeners.clear();
  },
};

// SONG FETCHER - Fetch current playing song
const SongFetcher = {
  async fetch(buttonElement, buttonText) {
    buttonElement.disabled = true;
    const originalText = buttonElement.textContent || buttonText;
    buttonElement.textContent = "Fetching...";

    const maxAttempts = 4;
    let songData = null;

    for (let i = 0; i < maxAttempts; i++) {
      const response = await sendAction("getSongInfo");

      if (!response.ok || !response.data?.title || !response.data?.artist) {
        if (i === maxAttempts - 1) break;
        await new Promise((r) => setTimeout(r, 300));
        continue;
      }

      if (!songData) songData = response.data;
      if (response.data.parserId) {
        songData = response.data;
        break;
      }

      if (i < maxAttempts - 1) {
        await new Promise((r) => setTimeout(r, 400 * (i + 1)));
      }
    }

    return {
      songData,
      resetButton: () => {
        buttonElement.textContent = originalText;
        buttonElement.style.color = "";
        buttonElement.disabled = false;
      },
    };
  },
};

// QUICK ACTIONS - Fill current song, block current song
const QuickActions = {
  fillTimeout: null,
  blockTimeout: null,

  async fillCurrent() {
    const btn = document.querySelector(".btn-fill-current");
    if (!btn) return;

    const originalText = btn.textContent;
    const isReplace = FilterState.form.mode === "replace";
    clearTimeout(this.fillTimeout);

    const { songData, resetButton } = await SongFetcher.fetch(btn, originalText);

    if (!songData) {
      btn.textContent = "No song found";
      btn.style.color = "var(--red-color)";
      this.fillTimeout = setTimeout(resetButton, 2000);
      return;
    }

    const { title, artist, parserId } = songData;

    // Check if should add new entry
    const lastIndex = FilterState.form.entries.length - 1;
    const lastEntry = FilterState.form.entries[lastIndex];
    const isLastFilled = lastEntry.artist.trim() || lastEntry.title.trim();
    const isSame = FilterUtils.normalize(lastEntry.artist) === FilterUtils.normalize(artist) && FilterUtils.normalize(lastEntry.title) === FilterUtils.normalize(title);

    if (isLastFilled && !isSame) {
      FormController.addEntry();
      await new Promise((r) => setTimeout(r, 50));
    }

    // Fill entry
    const newIndex = FilterState.form.entries.length - 1;
    FilterState.form.entries[newIndex].artist = artist;
    FilterState.form.entries[newIndex].title = title;

    // Update DOM
    const entryItems = document.querySelectorAll("#entriesList .entry-item");
    const lastItem = entryItems[entryItems.length - 1];

    if (lastItem) {
      const titleSelector = isReplace ? 'input[placeholder="Original Title"]' : 'input[placeholder="Title"]';
      const artistSelector = isReplace ? 'input[placeholder="Original Artist"]' : 'input[placeholder="Artist"]';

      const titleInput = lastItem.querySelector(titleSelector);
      const artistInput = lastItem.querySelector(artistSelector);

      if (titleInput) titleInput.value = title;
      if (artistInput) artistInput.value = artist;

      titleInput?.dispatchEvent(new Event("input", { bubbles: true }));
      artistInput?.dispatchEvent(new Event("input", { bubbles: true }));
    }

    // Check duplicate
    const entry = { artist, title, replaceArtist: "", replaceTitle: "" };
    const duplicate = FilterUtils.findDuplicate(entry, isReplace);

    if (duplicate.isDuplicate) {
      btn.textContent = "Already exists";
      btn.style.color = "var(--yellow-color)";
      this.fillTimeout = setTimeout(resetButton, 2000);
      return;
    }

    // Select parser
    if (parserId) {
      ParserController.toggle(parserId.toString(), true);
    }

    // Success
    btn.textContent = "Filled!";
    btn.style.color = "var(--green-color)";
    this.fillTimeout = setTimeout(resetButton, 1500);
  },

  async blockCurrent() {
    const songInfoBtn = document.querySelector("#getSongInfoBtn span");
    const parentBtn = document.querySelector("#getSongInfoBtn");

    if (!songInfoBtn || !parentBtn) return;

    const buttonText = "Block Current Song";
    clearTimeout(this.blockTimeout);

    const { songData, resetButton } = await SongFetcher.fetch(songInfoBtn, buttonText);

    const resetWithParent = () => {
      resetButton();
      parentBtn.disabled = false;
    };

    if (!songData) {
      songInfoBtn.textContent = "No recent song found";
      this.blockTimeout = setTimeout(resetWithParent, 2000);
      return;
    }

    const { title, artist, parserId } = songData;

    // Check duplicate
    const entry = { artist, title, replaceArtist: "", replaceTitle: "" };
    const duplicate = FilterUtils.findDuplicate(entry, false);

    if (duplicate.isDuplicate) {
      songInfoBtn.textContent = "Already Added";
      this.blockTimeout = setTimeout(resetWithParent, 2000);
      return;
    }

    if (!parserId) {
      songInfoBtn.textContent = "Pending...";
      this.blockTimeout = setTimeout(resetWithParent, 2000);
      return;
    }

    // Find or create filter
    const existingIndex = FilterState.parserFilters.findIndex((f) => {
      const isBlock = !FilterUtils.isReplaceFilter(f);
      return isBlock && f.parsers.includes(parserId);
    });

    if (existingIndex !== -1) {
      FilterState.parserFilters[existingIndex].entries.push({ artist, title });
      FilterState.parserFilters[existingIndex].updatedAt = new Date().toISOString();
    } else {
      FilterState.parserFilters.push({
        id: FilterUtils.generateId(),
        createdAt: new Date().toISOString(),
        entries: [{ artist, title }],
        parsers: [parserId],
      });
    }

    await FilterStorage.saveFilters();

    FilterTabsController.render();
    FilterListController.render();

    // Success
    songInfoBtn.textContent = "Added!";
    songInfoBtn.style.color = "var(--green-color)";
    this.blockTimeout = setTimeout(resetWithParent, 1500);
  },
};
