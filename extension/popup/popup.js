document.addEventListener("DOMContentLoaded", async () => {
  try {
    const setup = await browser.storage.local.get("initialSetupDone");

    if (!setup.initialSetupDone) {
      showInitialSetupDialog();
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
          delBtn.style.marginLeft = "auto";
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

    // SearchBox
    searchBox.addEventListener("input", async () => {
      const query = searchBox.value.toLowerCase();
      const list = await getFreshParserList();
      const filtered = list.filter(({ domain, title }) => domain.toLowerCase().includes(query) || (title && title.toLowerCase().includes(query)));
      await renderList(filtered);
    });

    // Open Element Selector
    document.getElementById("openSelector").addEventListener("click", async () => {
      try {
        const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
        await browser.tabs.sendMessage(tab.id, { action: "startSelectorUI" });
        window.close();
      } catch (e) {
        const button = document.getElementById("openSelector");
        button.textContent = "This page is not supported or not loaded yet.";
        setTimeout(() => {
          button.textContent = "Add Music Parser";
        }, 3000);
      }
    });

    // History
    const toggleBtn = document.getElementById("historyToggle");
    toggleBtn.appendChild(createSVG(svg_paths.historyIconPaths));
    const panel = document.getElementById("historyPanel");
    const panelHeader = document.getElementById("historyHeader");
    const clearBtn = document.getElementById("clearHistoryBtn");
    const cancelCleanBtn = document.getElementById("cancelCleanBtn");

    toggleBtn.addEventListener("click", async () => {
      const isOpen = panel.style.display === "block";
      panel.style.display = isOpen ? "none" : "block";
      panelHeader.style.display = isOpen ? "none" : "flex";
      document.querySelector("#siteList").style.display = isOpen ? "flex" : "none";
      document.querySelector("#searchBox").style.display = isOpen ? "block" : "none";
      document.querySelector("#openSelector").style.display = isOpen ? "flex" : "none";
      const mainHeader = document.querySelector("#mainHeader");
      mainHeader.textContent = isOpen ? "Discord Music RPC" : "History";
      mainHeader.appendChild(toggleBtn);
      toggleBtn.innerHTML = "";
      toggleBtn.appendChild(!isOpen ? createSVG(svg_paths.backIconPaths) : createSVG(svg_paths.historyIconPaths));
      if (!isOpen) await renderHistory();
    });

    // Clear History
    let cleaningMode = false;
    clearBtn.addEventListener("click", async () => {
      const checkboxes = document.querySelectorAll(".history-checkbox");
      const selectedIndexes = Array.from(checkboxes)
        .filter((cb) => cb.checked)
        .map((cb) => parseInt(cb.dataset.index, 10));
      if (!cleaningMode) {
        cleaningMode = true;
        document.body.classList.add("cleaning-mode");
        clearBtn.textContent = selectedIndexes.length ? "Delete Selected" : "Delete All";
        cancelCleanBtn.style.display = "inline-block";
        return;
      }

      const confirmMsg = selectedIndexes.length ? `Should the selected ${selectedIndexes.length} history be deleted?` : "Should all history be erased?";

      if (!confirm(confirmMsg)) return;

      let history = await loadHistory();

      if (selectedIndexes.length) {
        history = history.filter((_, i) => !selectedIndexes.includes(i));
      } else {
        history = [];
      }

      await saveHistory(history);
      await renderHistory();
      exitCleaningMode();
    });

    cancelCleanBtn.addEventListener("click", () => {
      exitCleaningMode();
    });

    function exitCleaningMode() {
      cleaningMode = false;
      document.body.classList.remove("cleaning-mode");
      clearBtn.textContent = "Clear History";
      cancelCleanBtn.style.display = "none";
      document.querySelectorAll(".history-checkbox").forEach((cb) => (cb.checked = false));
    }

    async function renderHistory() {
      const history = (await loadHistory()).slice(0, 50);
      panel.innerHTML = "";

      if (!history.length) {
        const emptyMsg = document.createElement("i");
        emptyMsg.textContent = "Empty.";
        panel.appendChild(emptyMsg);
        return;
      }

      let lastHeader = null;

      history.forEach((entry, i) => {
        const time = new Date(entry.playedAt);
        let header;

        if (isSameDay(time, dateToday)) {
          header = "Today";
        } else if (isSameDay(time, dateYesterday)) {
          header = "Yesterday";
        } else {
          header = dateFull(time);
        }

        if (header !== lastHeader) {
          const h3 = document.createElement("h3");
          h3.textContent = header;
          h3.style.marginTop = "10px";
          panel.appendChild(h3);
          lastHeader = header;
        }

        const div = document.createElement("div");
        div.className = "history-entry";

        const checkbox = document.createElement("input");
        checkbox.type = "checkbox";
        checkbox.className = "history-checkbox";
        checkbox.dataset.index = i;
        checkbox.addEventListener("click", async () => {
          const checkboxes = document.querySelectorAll(".history-checkbox");
          const selectedIndexes = Array.from(checkboxes)
            .filter((cb) => cb.checked)
            .map((cb) => parseInt(cb.dataset.index, 10));
          clearBtn.textContent = selectedIndexes.length ? "Delete Selected" : "Delete All";
        });

        const img = document.createElement("img");
        img.width = 36;
        img.height = 36;
        img.className = "lazyload";
        img.dataset.src = entry.image ||  browser.runtime.getURL("icons/48x48.png");

        const info = document.createElement("div");
        info.className = "history-info";

        const strong = document.createElement("strong");
        strong.textContent = entry.title;

        const br = document.createElement("br");

        const small = document.createElement("small");
        small.textContent = `${entry.source}${dateHourMinute(time) ? " • " + dateHourMinute(time) : ""}`;

        info.appendChild(strong);
        info.append(` ${entry.artist}`, br, small);
        div.append(checkbox, img, info);
        panel.appendChild(div);
      });
    }
  } catch (error) {
    logError("Error loading settings:", error);
  }
});
