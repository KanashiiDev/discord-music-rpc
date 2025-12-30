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

    // History toggle
    this.listeners.historyToggle = async () => {
      if (this.currentSection === "main") {
        await this.switchTo("history");
      } else {
        await this.switchTo("main");
      }
    };

    // Stats toggle
    this.listeners.statsToggle = async () => {
      await this.switchTo("stats");
    };

    this.listeners.settingsToggle = async () => {
      await this.switchTo("settings");
    };

    historyToggleBtn.addEventListener("click", this.listeners.historyToggle);
    historyStatsToggleBtn.addEventListener("click", this.listeners.statsToggle);
    settingsToggleBtn.addEventListener("click", this.listeners.settingsToggle);
  },

  async switchTo(sectionName) {
    if (this.currentSection === sectionName) return;

    const prevSection = this.currentSection;
    this.currentSection = sectionName;

    // Add data-section to the body (for CSS)
    document.body.dataset.section = sectionName;

    // Update title
    this.updateHeader(sectionName);

    // Operations specific to the Section
    await this.handleSectionTransition(sectionName, prevSection);
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
    const dropdownToggle = document.getElementById("dropdownToggle");
    const dropdownMenu = document.getElementById("dropdownMenu");
    const datePicker = document.querySelector(".date-range-picker");
    const filterMenu = document.getElementById("historyFilterMenu");
    filterMenu.classList.remove("open");
    filterMenu.style.height = "0";
    historyPanel.classList.remove("custom");
    historyPanel.style.minHeight = "";
    dropdownMenu.classList.remove("open");
    datePicker.style.display = "none";
    dropdownToggle.classList.remove("open");
    dropdownToggle.querySelector(".arrow").style.transform = "rotate(0deg)";
    dropdownToggle.childNodes[0].textContent = "Today";

    // Section-specific Operations
    switch (newSection) {
      case "main":
        isFiltering = false;
        selectedSources.clear();
        exitCleaningMode();
        await renderList();
        await activateSimpleBar("siteList");
        await destroyOtherSimpleBars("siteList");
        break;

      case "history":
        await renderHistory();
        await activateSimpleBar("historyPanel");
        await destroyOtherSimpleBars("historyPanel");
        activateHistoryScroll();
        break;

      case "stats":
        res = await sendAction("loadHistory");
        fullHistory = res.data;
        await renderTopStats(fullHistory, "day");
        await activateSimpleBar("historyStatsPanel");
        break;

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
      const query = searchBox.value.toLowerCase();
      const list = await getFreshParserList();
      const filtered = list.filter(({ title }) => title && title.toLowerCase().includes(query));
      await renderList(filtered, 1);
      await activateSimpleBar("siteList");
    }, 300);

    searchBox.addEventListener("input", this.listeners.searchBoxInput);

    // History Search Box
    const historySearchInput = document.getElementById("historySearchBox");
    this.listeners.historySearchInput = debounce(async () => {
      if (activeScrollCleanup) {
        activeScrollCleanup();
        activeScrollCleanup = null;
      }

      await renderHistory({
        reset: true,
        query: historySearchBox.value,
      });

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

      try {
        let theme = await browser.storage.local.get("theme");
        document.body.dataset.theme = theme.theme || "dark";
        document.documentElement.dataset.theme = theme.theme || "dark";
        clearTimeout(buttonDisableTimeout);
        const isEdit = button.textContent.includes("Edit");
        const [tab] = await browser.tabs.query({ active: true, currentWindow: true });

        if (tab.url?.startsWith("http")) {
          await browser.tabs.sendMessage(tab.id, {
            action: "startSelectorUI",
            editMode: isEdit,
            theme: theme.theme || "dark",
            style: getCurrentStyleAttributes(),
          });
          window.close();
        } else {
          showPopupMessage("This page is not supported.", "alert", 3000);
          buttonDisableTimeout = setTimeout(() => {
            button.disabled = false;
          }, 3000);
        }
      } catch (e) {
        showPopupMessage("Wait for the page to load.", "warning", 3000);
        buttonDisableTimeout = setTimeout(() => {
          button.disabled = false;
        }, 3000);
      }
    };
    document.getElementById("openSelector").addEventListener("click", this.listeners.openSelector);

    // Document click handler
    this.listeners.documentClick = (e) => {
      // Main
      if (sectionManager.currentSection === "main") {
        // Parser options
        const openOptions = e.target.closest(".parser-options.open");
        if (!openOptions) {
          // If the clicked element is not inside an open parser-options
          document.querySelectorAll(".parser-options.open").forEach((optionsContainer) => {
            const siteListContainer = document.getElementById("siteListContainer");
            const searchBox = document.getElementById("searchBox");
            const allEntries = document.querySelectorAll(".parser-entry");

            optionsContainer.classList.remove("open");
            optionsContainer.style.maxHeight = "0";
            siteListContainer.style.transform = "translateY(0)";
            siteListContainer.style.marginBottom = "";
            searchBox.classList.remove("fading");
            allEntries.forEach((entry) => {
              entry.classList.remove("fading");
            });
          });
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

      // Stats
      if (sectionManager.currentSection === "stats") {
        // Close Stats Filter Menu
        const historyPanel = document.getElementById("historyStatsPanel");
        const dropdownToggle = document.getElementById("dropdownToggle");
        const dropdownMenu = document.getElementById("dropdownMenu");
        if (dropdownMenu.classList.contains("open") && !dropdownMenu.contains(e.target) && !dropdownToggle.contains(e.target)) {
          dropdownMenu.classList.remove("open");
          dropdownToggle.classList.remove("open");
          historyPanel.style.minHeight = "";
          dropdownToggle.querySelector(".arrow").style.transform = "rotate(0deg)";
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
        const bgExpandableSectionEl = document.querySelector(".bg-expandable-section");
        if (btnExpandEl && bgExpandableSectionEl) {
          if (!bgExpandableSectionEl.contains(e.target) && e.target !== btnExpandEl) {
            bgExpandableSectionEl.classList.add("hidden");
            btnExpandEl.classList.remove("expanded");
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
    // Set Theme
    let theme = await browser.storage.local.get("theme");
    document.body.dataset.theme = theme.theme || "dark";
    document.documentElement.dataset.theme = theme.theme || "dark";

    // Initial Setup
    const setup = await browser.storage.local.get("initialSetupDone");
    if (!setup.initialSetupDone) {
      showInitialSetupDialog();
      return;
    }

    // Migrate Old History
    const ohm = await browser.storage.local.get("oldHistoryMigrate");
    if (!ohm.oldHistoryMigrate) {
      await sendAction("migrateHistory");
      await browser.storage.local.set({ oldHistoryMigrate: true });
    }

    // Start the Section Manager
    sectionManager.init();

    // Initial render
    const renderStatus = await renderList();
    await activateSimpleBar("siteList");

    // Initial Tutorial
    if (renderStatus) {
      const tutorial = await browser.storage.local.get("initialTutorialDone");
      if (!tutorial.initialTutorialDone) {
        showInitialTutorial();
      }
    }

    // Initialize popup module
    popupModule.init();
  } catch (error) {
    logError("Error loading settings:", error);
  }

  // Apply Custom Colors
  await new Promise((resolve) => requestAnimationFrame(() => resolve()));
  applyColorSettings();
  applyBackgroundSettings();
};

document.addEventListener("DOMContentLoaded", domLoadedListener);
window.addEventListener("pagehide", () => {
  fullHistory = [];
  filteredHistory = [];
  selectedSources.clear();

  if (draggingIntervalRef) {
    clearInterval(draggingIntervalRef);
    draggingIntervalRef = null;
  }

  if (scrollListenerRef && scrollElementGlobal) {
    scrollElementGlobal.removeEventListener("scroll", scrollListenerRef);
    scrollListenerRef = null;
  }

  panel._cleanupCheckboxListener?.();
  panel._cleanupTrashListener?.();

  if (filterMenuContent._sourceChangeListener) {
    filterMenuContent.removeEventListener("change", filterMenuContent._sourceChangeListener);
    filterMenuContent._sourceChangeListener = null;
  }
  if (currentRenderCleanup) {
    currentRenderCleanup();
    currentRenderCleanup = null;
  }
  scrollElementGlobal = null;
  if (flatpickrInstances.start) flatpickrInstances.start.destroy();
  if (flatpickrInstances.end) flatpickrInstances.end.destroy();
  flatpickrInstances = { start: null, end: null };
  svgCache.clear();
  destroyOtherSimpleBars();
});
