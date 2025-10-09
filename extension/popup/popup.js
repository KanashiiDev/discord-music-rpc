// Section Manager
const sectionManager = {
  currentSection: "main",

  init() {
    this.setupEventListeners();
  },

  setupEventListeners() {
    const historyToggleBtn = document.getElementById("historyToggle");
    const historyStatsToggleBtn = document.getElementById("historyStatsToggle");

    // Add SVG icons
    historyToggleBtn.appendChild(createSVG(svg_paths.historyIconPaths));
    historyStatsToggleBtn.appendChild(createSVG(svg_paths.historyStatsIconPaths));

    // History toggle
    historyToggleBtn.addEventListener("click", async () => {
      if (this.currentSection === "main") {
        await this.switchTo("history");
      } else {
        await this.switchTo("main");
      }
    });

    // Stats toggle
    historyStatsToggleBtn.addEventListener("click", async () => {
      await this.switchTo("stats");
    });
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

    const titles = {
      main: "Discord Music RPC",
      history: "History",
      stats: "Stats",
    };

    mainHeader.textContent = titles[sectionName];
    mainHeader.appendChild(historyToggleBtn);

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
    filterMenu.classList.remove("open");
    filterMenu.style.height = "0";
    dropdownMenu.classList.remove("open");
    historyPanel.classList.remove("custom");
    historyPanel.style.minHeight = "";
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
        break;

      case "history":
        await renderHistory();
        await activateSimpleBar("historyPanel");
        activateHistoryScroll();
        break;

      case "stats":
        fullHistory = await loadHistory();
        await renderTopStats(fullHistory, "day");
        await activateSimpleBar("historyStatsPanel");
        break;
    }
  },
};

// DOMContentLoaded Event
document.addEventListener("DOMContentLoaded", async () => {
  try {
    // Initial Setup
    const setup = await browser.storage.local.get("initialSetupDone");
    if (!setup.initialSetupDone) {
      showInitialSetupDialog();
      return;
    }

    // Migrate Old History
    const ohm = await browser.storage.local.get("oldHistoryMigrate");
    if (!ohm.oldHistoryMigrate) {
      await migrateOldHistory();
      await browser.storage.local.set({ oldHistoryMigrate: true });
    }

    // Start the Section Manager
    sectionManager.init();

    // Initial render
    await renderList();
    await activateSimpleBar("siteList");

    // Search Box
    const searchBox = document.getElementById("searchBox");
    const debouncedSearch = debounce(async () => {
      const query = searchBox.value.toLowerCase();
      const list = await getFreshParserList();
      const filtered = list.filter(({ domain, title }) => domain.toLowerCase().includes(query) || (title && title.toLowerCase().includes(query)));
      await renderList(filtered, 1);
    }, 300);

    searchBox.addEventListener("input", debouncedSearch);

    // History Search Box
    const historySearchInput = document.getElementById("historySearchBox");
    const debouncedHistorySearch = debounce(async () => {
      await renderHistory({ query: historySearchInput.value });
      await activateSimpleBar("historyPanel");
    }, 300);

    historySearchInput.addEventListener("input", debouncedHistorySearch);

    // Open Element Selector
    document.getElementById("openSelector").addEventListener("click", async function () {
      const button = this;
      if (button.disabled) return;
      button.disabled = true;

      const messages = {
        default: "Add Music Site",
        notSupported: "This page is not supported.",
        wait: "Wait for the page to load.",
      };

      try {
        const isEdit = button.textContent.includes("Edit");
        const [tab] = await browser.tabs.query({ active: true, currentWindow: true });

        if (tab.url?.startsWith("http")) {
          await browser.tabs.sendMessage(tab.id, {
            action: "startSelectorUI",
            editMode: isEdit,
          });
          window.close();
        } else {
          button.textContent = messages.notSupported;
          setTimeout(() => {
            button.textContent = messages.default;
            button.disabled = false;
          }, 3000);
        }
      } catch (e) {
        button.textContent = messages.wait;
        setTimeout(() => {
          button.textContent = messages.default;
          button.disabled = false;
        }, 3000);
      }
    });

    // Close dropdowns by clicking outside
    const filterBtn = document.getElementById("filterBtn");
    const filterMenu = document.getElementById("filterMenu");

    document.addEventListener("click", (e) => {
      // History filter menu
      if (filterBtn && filterMenu && !filterBtn.contains(e.target) && !filterMenu.contains(e.target)) {
        filterMenu.classList.remove("open");
        filterMenu.style.height = "0";
      }

      // Parser options
      document.querySelectorAll(".parser-options.open").forEach((optionsContainer) => {
        if (!optionsContainer.contains(e.target)) {
          const siteListContainer = document.getElementById("siteListContainer");
          const searchBox = document.getElementById("searchBox");
          const allEntries = document.querySelectorAll(".parser-entry");

          optionsContainer.classList.remove("open");
          optionsContainer.style.maxHeight = "0";
          siteListContainer.style.transform = "translateY(0)";
          siteListContainer.style.marginBottom = ``;
          searchBox.classList.remove("fading");
          allEntries.forEach((entry) => {
            entry.classList.remove("fading");
          });
        }
      });
    });
  } catch (error) {
    logError("Error loading settings:", error);
  }
});
