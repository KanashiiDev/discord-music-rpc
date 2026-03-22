// Section Manager
const sectionManager = {
  currentSection: "main",
  listeners: {},

  init() {
    this.setupEventListeners();
  },

  setupEventListeners() {
    const historyToggleBtn = document.getElementById("historyToggle");
    const historyStatsToggleBtn = document.getElementById("historyStatsToggle");
    const settingsToggleBtn = document.getElementById("settingsToggle");

    // Add SVG icons
    historyToggleBtn.appendChild(createSVG(svg_paths.historyIconPaths));
    historyStatsToggleBtn.appendChild(createSVG(svg_paths.historyStatsIconPaths));
    settingsToggleBtn.appendChild(createSVG(svg_paths.gearIconPaths));

    // Lock button functionality to prevent multiple clicks while processing
    const withLock = (btn, fn) => {
      let locked = false;
      return async () => {
        if (locked) return;
        locked = true;
        btn.disabled = true;
        try {
          await fn();
        } finally {
          locked = false;
          btn.disabled = false;
        }
      };
    };

    // History toggle
    this.listeners.historyToggle = withLock(historyToggleBtn, async () => {
      if (this.currentSection === "main") {
        await this.switchTo("history");
      } else {
        await this.switchTo("main");
      }
    });

    // Stats toggle
    this.listeners.statsToggle = withLock(historyStatsToggleBtn, async () => {
      await this.switchTo("stats");
    });

    // Settings toggle
    this.listeners.settingsToggle = withLock(settingsToggleBtn, async () => {
      await this.switchTo("settings");
    });

    historyToggleBtn.addEventListener("click", this.listeners.historyToggle);
    historyStatsToggleBtn.addEventListener("click", this.listeners.statsToggle);
    settingsToggleBtn.addEventListener("click", this.listeners.settingsToggle);
  },

  _transitioning: false,

  async switchTo(sectionName) {
    if (this.currentSection === sectionName) return;
    if (this._transitioning) return;
    this._transitioning = true;
    try {
      const prevSection = this.currentSection;
      this.currentSection = sectionName;
      document.body.dataset.section = sectionName;
      this.updateHeader(sectionName);
      await this.handleSectionTransition(sectionName, prevSection);
    } finally {
      this._transitioning = false;
    }
  },

  updateHeader(sectionName) {
    const mainHeader = document.querySelector("#mainHeader");
    const historyToggleBtn = document.getElementById("historyToggle");
    const historyStatsToggleBtn = document.getElementById("historyStatsToggle");

    const titles = {
      main: "Discord Music RPC",
      history: "History",
      stats: "Stats",
      settings: "Settings",
    };

    mainHeader.textContent = titles[sectionName];
    mainHeader.appendChild(historyToggleBtn);
    mainHeader.prepend(historyStatsToggleBtn);

    // Update icon
    historyToggleBtn.innerHTML = "";
    if (sectionName === "main") {
      historyToggleBtn.appendChild(createSVG(svg_paths.historyIconPaths));
      historyToggleBtn.title = "History";
    } else {
      historyToggleBtn.appendChild(createSVG(svg_paths.backIconPaths));
      historyToggleBtn.title = sectionName === "stats" ? "Back to History" : "Back";
    }
  },

  async handleSectionTransition(newSection, prevSection) {
    // Clear the search boxes
    if (newSection === "main") {
      document.querySelector("#searchBox").value = "";
      document.querySelector("#historySearchBox").value = "";
    }

    // Clear Sections
    const historyPanel = document.getElementById("historyStatsPanel");
    const datePicker = document.querySelector(".date-range-picker");
    const filterMenu = document.getElementById("historyFilterMenu");
    filterMenu.classList.remove("open");
    filterMenu.style.height = "0";
    historyPanel.classList.remove("custom");
    historyPanel.style.minHeight = "";
    datePicker.style.display = "none";
    if (prevSection === "stats" || newSection === "stats") {
      resetStatsDropdown();
    }
    document.body.classList.remove("parser-options-open");

    // Section-specific Operations
    switch (newSection) {
      case "main":
        historyState.isFiltering = false;
        historyState.selectedSources.clear();
        parserFilterState.selectedCategories.clear();
        parserFilterState.selectedTags.clear();
        parserTagFilterResetBtn?.classList.remove("filter-active");
        exitCleaningMode();
        await renderList();
        await buildParserTagCache();
        await activateSimpleBar("siteList");
        await destroyOtherSimpleBars("siteList");
        break;

      case "history":
        await renderHistory();
        await activateSimpleBar("historyPanel");
        await destroyOtherSimpleBars("historyPanel");
        activateHistoryScroll();
        break;

      case "stats": {
        initStatsDropdown();
        statsModule.init();
        const res = await sendAction("loadHistory");
        historyState.fullHistory = res.data;
        await renderTopStats(historyState.fullHistory, "day");
        await activateSimpleBar("historyStatsPanel");
        break;
      }

      case "settings":
        exitCleaningMode();
        await renderSettings();
        await activateSimpleBar("settingsPanel");
        await destroyOtherSimpleBars("settingsPanel");
        break;
    }
  },
};

// Global event handlers
const popupModule = {
  listeners: {},
  initialized: false,

  init() {
    if (this.initialized) return;
    this.initialized = true;

    // Search Box
    const searchBox = document.getElementById("searchBox");
    this.listeners.searchBoxInput = debounce(async () => {
      const query = searchBox.value;
      const list = await getFreshParserList();
      const filtered = applyParserTagFilter(list, query);
      await renderList(filtered.length < list.length || query.trim() ? filtered : undefined, 1);
      await activateSimpleBar("siteList");
    }, 300);

    searchBox.addEventListener("input", this.listeners.searchBoxInput);

    // History Search Box
    const historySearchInput = document.getElementById("historySearchBox");
    this.listeners.historySearchInput = debounce(async () => {
      if (historyState.activeScrollCleanup) {
        historyState.activeScrollCleanup();
        historyState.activeScrollCleanup = null;
      }

      await renderHistory({
        reset: true,
        query: historySearchBox.value,
      });

      const hasText = historySearchBox.value.trim() !== "";
      historyFilterResetBtn?.classList.toggle("filter-active", hasText);

      await activateSimpleBar("historyPanel");
      await activateHistoryScroll();
    }, 300);

    historySearchInput.addEventListener("input", this.listeners.historySearchInput);

    // Open userScript Manager
    this.listeners.openManager = async () => {
      await openUserScriptManager();
    };
    document.getElementById("openManager").addEventListener("click", this.listeners.openManager);

    // Open Element Selector
    let buttonDisableTimeout = null;
    this.listeners.openSelector = async function () {
      const button = this;
      if (button.disabled) return;
      button.disabled = true;

      const enableButton = (delay = 2000) => {
        buttonDisableTimeout = setTimeout(() => {
          button.disabled = false;
        }, delay);
      };

      try {
        const currentTheme = await applyThemeSettings();
        let blurMode = false;
        const { colorSettings } = await browser.storage.local.get("colorSettings");
        if (colorSettings) {
          blurMode = colorSettings.applyFgBlur;
        }
        clearTimeout(buttonDisableTimeout);

        const isEdit = button.textContent.includes("Edit");
        const [tab] = await browser.tabs.query({ active: true, currentWindow: true });

        if (tab.status !== "complete") {
          showPopupMessage("Please wait for the page to finish loading", "warning", 2000);
          enableButton();
          return;
        }

        await browser.tabs.sendMessage(tab.id, {
          action: "startSelectorUI",
          editMode: isEdit,
          theme: currentTheme,
          style: getCurrentStyleAttributes(),
          bg: getCurrentStyleAttributes("#bg-layer"),
          blur: blurMode,
        });

        window.close();
      } catch (_) {
        showPopupMessage("This page is not supported", "alert", 2000);
        enableButton();
      }
    };
    document.getElementById("openSelector").addEventListener("click", this.listeners.openSelector);

    // Document click handler
    this.listeners.documentClick = (e) => {
      // Main
      if (sectionManager.currentSection === "main") {
        // Parser options
        const openOptions = e.target.closest(".parser-options.open");
        const openedPaserOptions = document.querySelector(".parser-options.open");
        if (!openOptions && openedPaserOptions) {
          if (parserState.isParserAnimating) return;
          closeParserOptions(openedPaserOptions);
          parserState.isParserOpen = false;
        }

        // Close Parser Tag Filter Menu
        const ptfMenu = document.getElementById("parserTagFilterMenu");
        if (ptfMenu?.classList.contains("open") && !ptfMenu.contains(e.target)) {
          ptfMenu.classList.remove("open");
          ptfMenu.style.height = "0";
        }
      }

      // History
      if (sectionManager.currentSection === "history") {
        // Close History Filter Menu
        if (filterMenu.classList.contains("open") && !filterMenu.contains(e.target)) {
          filterMenu.classList.remove("open");
          filterMenu.style.height = "0";
        }
      }

      // Settings
      if (sectionManager.currentSection === "settings") {
        // Close Color Picker
        const pickerEl = document.querySelector(".picker-popover");
        if (pickerEl && !pickerEl.classList.contains("hidden") && !pickerEl.contains(e.target)) {
          closePicker();
        }

        // Close Background Image Settings
        const btnExpandEl = document.querySelector(".bg-expand-btn");
        const bgExpandableSectionEl = document.querySelector(".bg.expandable-section");
        if (btnExpandEl && bgExpandableSectionEl) {
          if (!bgExpandableSectionEl.contains(e.target) && e.target !== btnExpandEl) {
            bgExpandableSectionEl.classList.add("hidden");
            btnExpandEl.classList.remove("expanded");
          }
        }
        // Close Color Settings
        const btnColorEl = document.querySelector(".color-expand-btn");
        const colorExpandableSectionEl = document.querySelector(".color.expandable-section");
        if (btnColorEl && colorExpandableSectionEl) {
          if (!colorExpandableSectionEl.contains(e.target) && e.target !== btnColorEl) {
            closeColorsModal();
          }
        }
      }
    };

    document.addEventListener("click", this.listeners.documentClick);
  },
};

// DOMContentLoaded Event
let domLoadedListener = null;

domLoadedListener = async () => {
  try {
    // Check for wide mode parameter
    const params = new URLSearchParams(window.location.search);
    if (params.get("wideMode")) document.body.classList.add("wideMode");

    // Set Theme
    await applyThemeSettings();

    // Initial Setup
    const setup = await browser.storage.local.get("initialSetupDone");
    if (!setup.initialSetupDone) {
      showInitialSetupDialog();
      return;
    }

    // Motion Preference Check
    await initMotionPreference();

    // Start the Section Manager
    sectionManager.init();

    // Initial render
    const renderStatus = await renderList();
    await activateSimpleBar("siteList");
    await buildParserTagCache();

    // Initial Tutorial
    if (renderStatus) {
      const tutorial = await browser.storage.local.get("initialTutorialDone");
      if (!tutorial.initialTutorialDone) {
        showInitialTutorial();
      }
    }

    // Initialize History Handlers
    initHistoryHandlers();

    // Initialize Parser Tag Filter
    initParserTagFilter();

    // Initialize popup module
    popupModule.init();
  } catch (error) {
    logError("Error loading settings:", error);
  }

  // Apply Custom Colors
  await new Promise((resolve) => requestAnimationFrame(() => resolve()));
  applyColorSettings(0);
  applyBackgroundSettings(0);
};

document.addEventListener("DOMContentLoaded", domLoadedListener);
