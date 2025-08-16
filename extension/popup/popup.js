document.addEventListener("DOMContentLoaded", async () => {
  try {
    const setup = await browser.storage.local.get("initialSetupDone");
    if (!setup.initialSetupDone) {
      showInitialSetupDialog();
      return;
    }

    const ohm = await browser.storage.local.get("oldHistoryMigrate");
    if (!ohm.oldHistoryMigrate) {
      await migrateOldHistory();
      await browser.storage.local.set({ oldHistoryMigrate: true });
      return;
    }

    const container = document.getElementById("siteList");
    const searchBox = document.getElementById("searchBox");
    const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
    const tabUrl = new URL(tab.url);
    const tabPath = tabUrl.pathname;
    const tabHostname = normalize(tabUrl.hostname);
    const settings = await browser.storage.local.get();

    async function renderList(filteredList = null) {
      const list = filteredList || (await getFreshParserList());
      container.innerHTML = "";

      for (const entry of list) {
        const { id, domain, title, userAdd, urlPatterns = [] } = entry;
        const key = `enable_${id}`;
        const isEnabled = settings[key] !== false;

        const wrapper = document.createElement("div");
        wrapper.className = "parser-entry";

        const span = document.createElement("span");
        span.className = "parser-span";

        const checkbox = document.createElement("input");
        checkbox.type = "checkbox";
        checkbox.checked = isEnabled;
        checkbox.addEventListener("change", async () => {
          const newSetting = {};
          newSetting[key] = checkbox.checked;
          await browser.storage.local.set(newSetting);
          settings[key] = checkbox.checked;
        });

        // Redirect Button
        const redirectBtn = document.createElement("a");
        redirectBtn.className = "redirect-user-parser";
        redirectBtn.title = "Redirect to the website";
        redirectBtn.appendChild(createSVG(svg_paths.redirectIconPaths));
        redirectBtn.addEventListener("click", () => {
          window.open(`https://${domain}`, "_blank").focus();
        });

        // Settings Button
        const gearBtn = document.createElement("button");
        gearBtn.className = "gear-button";
        gearBtn.title = "Settings";
        if (!userAdd) gearBtn.style.marginLeft = "auto";
        gearBtn.appendChild(createSVG(svg_paths.gearIconPaths));

        // Settings Panel
        const optionsContainer = document.createElement("div");
        optionsContainer.className = "parser-options hidden";
        const defaultOpts = { showCover: true, showSource: true, showTimeLeft: true, showButtons: true, customCover: false, customCoverUrl: "", showFavIcon: false };
        const settingKey = `settings_${id}`;
        const parserOptions = settings[settingKey] || defaultOpts;

        for (const [key, spanText] of Object.entries({
          showCover: "Show Cover",
          showSource: "Show Source",
          showTimeLeft: "Show Time Left",
          showButtons: "Show Buttons",
          showFavIcon: "Show Small Site Icon",
        })) {
          const optionSpan = document.createElement("span");
          optionSpan.className = "parser-option";

          const optCheckbox = document.createElement("input");
          optCheckbox.type = "checkbox";
          optCheckbox.checked = parserOptions[key] ?? defaultOpts[key];

          optCheckbox.addEventListener("change", async () => {
            parserOptions[key] = optCheckbox.checked;
            await browser.storage.local.set({ [settingKey]: parserOptions });
          });

          optionSpan.append(optCheckbox, ` ${spanText}`);
          optionsContainer.appendChild(optionSpan);
        }

        // Custom Cover
        const customCoverSpan = document.createElement("span");
        customCoverSpan.className = "parser-option";

        const customCoverCheckbox = document.createElement("input");
        customCoverCheckbox.type = "checkbox";
        customCoverCheckbox.checked = parserOptions.customCover ?? false;

        customCoverCheckbox.addEventListener("change", async () => {
          parserOptions.customCover = customCoverCheckbox.checked;
          await browser.storage.local.set({ [settingKey]: parserOptions });
        });

        const customCoverText = document.createElement("input");
        customCoverText.className = "parser-custom-cover";
        customCoverText.type = "text";
        customCoverText.placeholder = "Custom cover URL";
        customCoverText.value = parserOptions.customCoverUrl || "";
        customCoverText.addEventListener("input", async () => {
          parserOptions.customCoverUrl = customCoverText.value;
          await browser.storage.local.set({ [settingKey]: parserOptions });
        });

        customCoverSpan.append(customCoverCheckbox, " Custom Cover", customCoverText);
        optionsContainer.appendChild(customCoverSpan);

        // Gear click
        gearBtn.addEventListener("click", () => {
          optionsContainer.classList.toggle("hidden");
        });

        span.appendChild(checkbox);
        span.appendChild(document.createTextNode(`${title || domain}`));

        // User Add - Delete
        if (userAdd) {
          const delBtn = document.createElement("a");
          delBtn.className = "del-user-parser";
          delBtn.appendChild(createSVG(svg_paths.trashIconPaths));
          delBtn.title = "Delete this user parser";
          delBtn.addEventListener("click", async () => {
            const confirmed = confirm(`Do you want to delete "${title}" parser?`);
            if (!confirmed) return;

            const storage = await browser.storage.local.get(["userParserSelectors", "parserList"]);
            const updatedUserList = (storage.userParserSelectors || []).filter((p) => p.id !== id);
            const updatedParserList = (storage.parserList || []).filter((p) => p.id !== id);

            await browser.storage.local.remove(`enable_${id}`);
            await browser.storage.local.set({
              userParserSelectors: updatedUserList,
              parserList: updatedParserList,
            });

            if (Array.isArray(window.parsers?.[domain])) {
              window.parsers[domain] = window.parsers[domain].filter((p) => p.id !== id);
            }

            await renderList(updatedParserList);
          });

          span.appendChild(delBtn);

          if (tabHostname === normalize(domain)) {
            const regexes = urlPatterns.map(parseUrlPattern);
            if (regexes.some((r) => r.test(tabPath))) {
              document.getElementById("openSelector").textContent = "Edit Music Parser";
            }
          }
        }
        // Append to Span
        span.appendChild(gearBtn);
        span.appendChild(redirectBtn);

        wrapper.append(span, optionsContainer);
        container.appendChild(wrapper);
      }
    }

    await renderList();

    // Search Box
    const debouncedSearch = debounce(async () => {
      const query = searchBox.value.toLowerCase();
      const list = await getFreshParserList();
      const filtered = list.filter(({ domain, title }) => domain.toLowerCase().includes(query) || (title && title.toLowerCase().includes(query)));
      await renderList(filtered);
    }, 200);

    // History Search Box
    searchBox.addEventListener("input", debouncedSearch);
    const historySearchInput = document.getElementById("historySearchBox");
    const debouncedHistorySearch = debounce(() => {
      const query = historySearchInput.value.toLowerCase();
      filterRenderedHistory(query);
    }, 200);
    historySearchInput.addEventListener("input", debouncedHistorySearch);

    // Open Element Selector
    document.getElementById("openSelector").addEventListener("click", async function () {
      try {
        let t = this.textContent;
        let isEdit = t.includes("Edit");

        const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
        await browser.tabs.sendMessage(tab.id, { action: "startSelectorUI", editMode: isEdit });
        window.close();
      } catch (e) {
        const button = document.getElementById("openSelector");
        button.textContent = "This page is not supported or not loaded yet.";
        setTimeout(() => {
          button.textContent = "Add Music Parser";
        }, 3000);
      }
    });

    const toggleBtn = document.getElementById("historyToggle");
    const panel = document.getElementById("historyPanel");
    const panelHeader = document.getElementById("historyHeader");
    const clearBtn = document.getElementById("clearHistoryBtn");
    const cancelCleanBtn = document.getElementById("cancelCleanBtn");

    toggleBtn.appendChild(createSVG(svg_paths.historyIconPaths));
    let cleaningMode = false;
    let fullHistory = [];

    // Toggle history panel
    toggleBtn.addEventListener("click", async () => {
      const isOpen = panel.style.display === "block";
      panel.style.display = isOpen ? "none" : "block";
      panelHeader.style.display = isOpen ? "none" : "flex";
      document.querySelector("#siteList").style.display = isOpen ? "flex" : "none";
      document.querySelector("#searchBox").style.display = isOpen ? "block" : "none";
      document.querySelector("#openSelector").style.display = isOpen ? "flex" : "none";
      document.getElementById("historySearchBox").style.display = isOpen ? "none" : "block";
      const mainHeader = document.querySelector("#mainHeader");
      mainHeader.textContent = isOpen ? "Discord Music RPC" : "History";
      mainHeader.appendChild(toggleBtn);
      toggleBtn.innerHTML = "";
      toggleBtn.appendChild(!isOpen ? createSVG(svg_paths.backIconPaths) : createSVG(svg_paths.historyIconPaths));

      if (!isOpen) {
        await renderHistory();
      }
    });

    // Render history
    async function renderHistory() {
      panel.innerHTML = "";
      const spinner = document.createElement("div");
      spinner.className = "spinner";
      panel.appendChild(spinner);
      fullHistory = await loadHistory();
      const history = fullHistory.slice(0, MAX_HISTORY);
      panel.innerHTML = "";

      if (!history.length) {
        const emptyMsg = document.createElement("i");
        emptyMsg.textContent = "Empty.";
        panel.appendChild(emptyMsg);
        return;
      }

      if (document.getElementById("historySearchBox")) {
        document.getElementById("historySearchBox").value = "";
      }

      let lastHeader = null;
      const fragment = document.createDocumentFragment();

      history.forEach((entry, i) => {
        const time = new Date(entry.p);
        const header = isSameDay(time, dateToday) ? "Today" : isSameDay(time, dateYesterday) ? "Yesterday" : dateFull(time);

        if (header !== lastHeader) {
          const h3 = document.createElement("h3");
          h3.textContent = header;
          h3.style.marginTop = "10px";
          fragment.appendChild(h3);
          lastHeader = header;
        }

        const div = document.createElement("div");
        div.className = "history-entry";

        const checkbox = document.createElement("input");
        checkbox.type = "checkbox";
        checkbox.className = "history-checkbox";
        checkbox.dataset.index = fullHistory.indexOf(entry);

        const img = document.createElement("img");
        img.width = 36;
        img.height = 36;
        img.className = "lazyload";
        img.dataset.src = entry.i || browser.runtime.getURL("icons/48x48.png");

        img.onerror = function () {
          this.onerror = null;
          this.src = browser.runtime.getURL("icons/48x48.png");
        };

        const info = document.createElement("div");
        info.className = "history-info";

        const strong = document.createElement("strong");
        strong.textContent = entry.t;

        const link = document.createElement("a");
        link.className = entry.u ? "song-link" : "song-link hidden";
        link.title = "Go to The Song";
        link.appendChild(createSVG(svg_paths.redirectIconPaths));
        if (entry.u) link.href = entry.u;
        link.target = "_blank";
        link.rel = "noopener noreferrer";

        const small = document.createElement("small");
        small.textContent = `${entry.s}${dateHourMinute(time) ? " • " + dateHourMinute(time) : ""}`;

        info.appendChild(strong);
        const parts = [];
        if (entry.a !== "Radio") {
          const br = document.createElement("br");
          parts.push(` ${entry.a}`, br);
        }
        parts.push(small);
        info.append(...parts);
        div.append(checkbox, img, info, link);
        fragment.appendChild(div);
      });

      panel.appendChild(fragment);

      // Add checkbox events while in cleaning mode
      if (cleaningMode) attachCheckboxListeners();
    }

    // Filter Render history
    function filterRenderedHistory(query) {
      const entries = document.querySelectorAll(".history-entry");

      entries.forEach((entry) => {
        const textContent = entry.innerText.toLowerCase();
        entry.style.display = textContent.includes(query) ? "" : "none";
      });

      // Hide headers if no visible entries
      const headers = document.querySelectorAll("#historyPanel h3");
      headers.forEach((header) => {
        // Check if any sibling entries are visible
        let sibling = header.nextElementSibling;
        let hasVisible = false;
        while (sibling && !sibling.matches("h3")) {
          if (sibling.style.display !== "none") {
            hasVisible = true;
            break;
          }
          sibling = sibling.nextElementSibling;
        }
        header.style.display = hasVisible ? "" : "none";
      });
    }

    // Listen checkbox changes
    function attachCheckboxListeners() {
      const checkboxes = document.querySelectorAll(".history-checkbox");
      checkboxes.forEach((cb) => {
        cb.addEventListener("change", updateClearBtnText);
      });
    }

    // Update Clear Button
    function updateClearBtnText() {
      if (!cleaningMode) return;

      const selectedCount = Array.from(document.querySelectorAll(".history-checkbox")).filter((cb) => cb.checked && cb.closest(".history-entry").style.display !== "none").length;

      clearBtn.textContent = selectedCount > 0 ? `Delete Selected (${selectedCount})` : "Delete All";
    }

    // Clear Button Click Event
    clearBtn.addEventListener("click", async () => {
      if (!cleaningMode) {
        // Start the cleaning mode
        cleaningMode = true;
        document.body.classList.add("cleaning-mode");
        cancelCleanBtn.style.display = "inline-block";
        updateClearBtnText();
        attachCheckboxListeners();
        return;
      }

      // Get selected items
      const selectedIndexes = Array.from(document.querySelectorAll(".history-checkbox:checked"))
        .filter((cb) => cb.closest(".history-entry").style.display !== "none")
        .map((cb) => parseInt(cb.dataset.index));

      //If no items were selected, ask for user confirmation to delete all history.
      if (selectedIndexes.length === 0) {
        if (!confirm("Are you sure you want to delete ALL history?")) return;
        fullHistory = [];
      }
      // If there are selected items, delete only them.
      else {
        if (!confirm(`Delete ${selectedIndexes.length} selected item(s)?`)) return;
        fullHistory = fullHistory.filter((_, i) => !selectedIndexes.includes(i));
      }

      //Update the database and refresh the UI
      await saveHistory(fullHistory);
      await renderHistory();
      exitCleaningMode();
    });

    // Cancel Button Event
    cancelCleanBtn.addEventListener("click", exitCleaningMode);

    // Exit cleaning mode
    function exitCleaningMode() {
      cleaningMode = false;
      document.body.classList.remove("cleaning-mode");
      clearBtn.textContent = "Clear History";
      cancelCleanBtn.style.display = "none";
      document.querySelectorAll(".history-checkbox").forEach((cb) => (cb.checked = false));
    }
  } catch (error) {
    logError("Error loading settings:", error);
  }
});
