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

    // Initial render
    await renderList();

    // Search Box
    const searchBox = document.getElementById("searchBox");
    const debouncedSearch = debounce(async () => {
      const query = searchBox.value.toLowerCase();
      const list = await getFreshParserList();
      const filtered = list.filter(({ domain, title }) => domain.toLowerCase().includes(query) || (title && title.toLowerCase().includes(query)));
      await renderList(filtered, 1);
    }, 250);

    // History Search Box
    searchBox.addEventListener("input", debouncedSearch);
    const historySearchInput = document.getElementById("historySearchBox");
    const debouncedHistorySearch = debounce(() => {
      renderHistory({ query: historySearchInput.value });
    }, 250);
    historySearchInput.addEventListener("input", debouncedHistorySearch);

    // Open Element Selector
    document.getElementById("openSelector").addEventListener("click", async function () {
      const button = this;
      if (button.disabled) return;
      button.disabled = true;

      const messages = {
        default: "Add Music Parser",
        notSupported: "This page is not supported.",
        wait: "Wait for the page to load.",
      };

      try {
        const isEdit = button.textContent.includes("Edit");
        const [tab] = await browser.tabs.query({ active: true, currentWindow: true });

        if (tab.url?.startsWith("http")) {
          await browser.tabs.sendMessage(tab.id, { action: "startSelectorUI", editMode: isEdit });
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

    const toggleBtn = document.getElementById("historyToggle");
    toggleBtn.appendChild(createSVG(svg_paths.historyIconPaths));

    // Toggle history panel
    toggleBtn.addEventListener("click", async () => {
      const panel = document.getElementById("historyPanel");
      const panelHeader = document.getElementById("historyHeader");
      const isOpen = panel.style.display === "block";
      panel.style.display = isOpen ? "none" : "block";
      panelHeader.style.display = isOpen ? "none" : "flex";
      document.querySelector("#siteList").style.display = isOpen ? "block" : "none";
      document.querySelector("#searchBox").style.display = isOpen ? "block" : "none";
      document.querySelector("#searchBox").value = "";
      document.querySelector("#historySearchBox").value = "";
      document.querySelector("#openSelector").style.display = isOpen ? "flex" : "none";
      document.querySelector(".history-controls").style.display = isOpen ? "none" : "block";
      const mainHeader = document.querySelector("#mainHeader");
      mainHeader.textContent = isOpen ? "Discord Music RPC" : "History";
      mainHeader.appendChild(toggleBtn);
      toggleBtn.innerHTML = "";
      toggleBtn.appendChild(!isOpen ? createSVG(svg_paths.backIconPaths) : createSVG(svg_paths.historyIconPaths));

      if (!isOpen) {
        isFiltering = false;
        selectedSources.clear();
        exitCleaningMode();
        await renderHistory();
      } else {
        await renderList();
      }
    });

    // Close history filter and parser options by clicking outside
    document.addEventListener("click", (e) => {
      // History filter menu
      if (!filterBtn.contains(e.target) && !filterMenu.contains(e.target)) {
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
