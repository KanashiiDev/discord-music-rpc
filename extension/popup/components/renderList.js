async function renderList(filteredList = null, isSearch = null) {
  const container = document.getElementById("siteListContainer");
  const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
  const tabUrl = new URL(tab.url);
  const tabPath = tabUrl.pathname;
  const tabHostname = normalize(tabUrl.hostname);
  const settings = await browser.storage.local.get();
  const spinner = document.createElement("div");
  spinner.className = "spinner";
  container.appendChild(spinner);
  const list = filteredList || (await getFreshParserList());
  container.innerHTML = "";

  if (!list || list.length === 0) {
    const setupListMessage = document.createElement("div");
    setupListMessage.className = "setup-list-message";
    setupListMessage.textContent = isSearch ? "Not Found" : "Please open a supported website (YouTube, Soundcloud, Deezer etc.) in an active tab to build the parser list.";
    container.appendChild(setupListMessage);
    return;
  }

  // Settings change message handler
  const settingRefreshMessage = async () => {
    const e = document.querySelector("#openSelector");
    if (!e) return;
    const tabs = await browser.tabs.query({ active: true, currentWindow: true });
    const tab = tabs[0];

    if (tab.url?.startsWith("http")) {
      e.textContent = "Please refresh the page to apply the settings.";
      e.title = "Click to refresh the page";

      const newEl = e.cloneNode(true);
      e.replaceWith(newEl);

      newEl.addEventListener("click", async () => {
        await browser.tabs.sendMessage(tab.id, { action: "reloadPage" });
        window.close();
      });

      newEl.classList.add("changed");
    }
  };

  for (const entry of list) {
    const { id, domain, title, userAdd, urlPatterns = [], authors, homepage } = entry;
    const key = `enable_${id}`;
    const isEnabled = settings[key] !== false;

    // Wrapper
    const wrapper = document.createElement("div");
    wrapper.className = "parser-entry";

    // Authors
    const authorDiv = document.createElement("div");
    const authorHeader = document.createElement("h4");

    if (authors) {
      authorDiv.className = "parser-entry-authors";
      authorHeader.textContent = authors.length > 1 ? "Authors" : "Author";

      authors.forEach((author, i) => {
        let authorContainer = document.createElement("div");
        authorContainer.className = "author-container";
        let authorIconContainer = document.createElement("div");
        authorIconContainer.className = "author-image-container spinner";
        let authorIcon = document.createElement("img");
        authorIcon.className = "author-image hidden";
        authorIcon.dataset.src = author;
        authorIconContainer.appendChild(authorIcon);

        const link = document.createElement("a");
        link.href = `https://github.com/${encodeURIComponent(author)}`;
        link.textContent = author;
        link.target = "_blank";
        link.rel = "noopener noreferrer";
        authorContainer.append(authorIconContainer, link);
        authorDiv.appendChild(authorContainer);
        if (i !== authors.length - 1) {
          authorDiv.appendChild(document.createTextNode(", "));
        }
      });
    }

    // FavIcons
    let favIconContainer = document.createElement("div");
    favIconContainer.className = "parser-icon-container spinner";
    let favIcon = document.createElement("img");
    favIcon.className = "parser-icon hidden";
    favIcon.title = `Open ${title || domain}`;
    favIcon.dataset.src = `${domain}`;
    favIconContainer.appendChild(favIcon);
    favIcon.addEventListener("click", () => {
      const url = homepage || `https://${domain}`;
      window.open(url, "_blank", "noopener,noreferrer");
    });

    const entryInner = document.createElement("span");
    entryInner.className = "parser-span";

    // Title
    const siteTitle = document.createElement("a");
    siteTitle.className = "parser-title";
    siteTitle.textContent = `${title || domain}`;

    // Switch
    const switchLabel = document.createElement("label");
    switchLabel.className = "switch-label";

    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.checked = isEnabled;

    const slider = document.createElement("span");
    slider.className = "slider";

    switchLabel.appendChild(checkbox);
    switchLabel.appendChild(slider);

    checkbox.addEventListener("change", async () => {
      const newSetting = {};
      newSetting[key] = checkbox.checked;
      await browser.storage.local.set(newSetting);
      settings[key] = checkbox.checked;
    });

    if (!userAdd) switchLabel.style.marginLeft = "auto";

    // Settings Panel
    let optionsContainer = document.querySelector(`#options-${id}`);
    if (!optionsContainer) {
      optionsContainer = document.createElement("div");
      optionsContainer.id = `options-${id}`;
      optionsContainer.className = "parser-options";
      wrapper.appendChild(optionsContainer);
    }
    optionsContainer.innerHTML = "";

    // Header for author and other stuff
    optionsContainer.append(authorHeader, authorDiv);

    // Header for custom/user options
    const optionsHeader = document.createElement("h4");
    optionsHeader.textContent = "Settings";
    optionsContainer.appendChild(optionsHeader);

    const settingKey = `settings_${id}`;
    const stored = await browser.storage.local.get(settingKey);
    const parserOptions = stored[settingKey] || {};

    // Default Options
    for (const [key, def] of Object.entries(DEFAULT_PARSER_OPTIONS)) {
      if (parserOptions[key] === undefined) {
        parserOptions[key] = { ...def };
      }
    }
    await browser.storage.local.set({ [settingKey]: parserOptions });

    // Function to render options
    async function renderOptions(optionsContainer) {
      // Render custom parser options
      const userKeys = Object.keys(parserOptions).filter((k) => !Object.keys(DEFAULT_PARSER_OPTIONS).includes(k));

      for (const key of userKeys) {
        await renderOption(key, parserOptions[key], optionsContainer);
      }

      // Add header for Default Parser Options
      if (userKeys.length > 0) {
        const defaultHeader = document.createElement("h4");
        defaultHeader.textContent = "General Settings";
        optionsContainer.appendChild(defaultHeader);
      }

      // Render DEFAULT_PARSER_OPTIONS in order
      const defaultKeys = Object.keys(DEFAULT_PARSER_OPTIONS).filter((k) => k !== "customCover" && k !== "customCoverUrl");

      for (const key of defaultKeys) {
        await renderOption(key, parserOptions[key], optionsContainer);
      }

      // Finally, render customCover & customCoverUrl
      ["customCover", "customCoverUrl"].forEach((key) => {
        if (parserOptions[key]) {
          renderOption(key, parserOptions[key], optionsContainer);
        }
      });
    }

    // Helper function to render a single option
    async function renderOption(key, data, container) {
      const optionSpan = document.createElement("span");
      optionSpan.className = "parser-option";

      const label = document.createElement("label");
      label.textContent = data.label || key;

      let input = null;

      if (data.type === "select") {
        const optionsArray = Array.isArray(data.value) ? data.value : [];
        input = document.createElement("select");

        optionsArray.forEach((opt) => {
          const optEl = document.createElement("option");
          optEl.value = opt.value;
          optEl.textContent = opt.label;
          optEl.selected = opt.selected === true;
          input.appendChild(optEl);
        });

        ((keyCopy, inputCopy) => {
          inputCopy.addEventListener("change", async () => {
            const selectedValue = inputCopy.value;
            const newOptions = optionsArray.map((opt) => ({
              ...opt,
              selected: opt.value === selectedValue,
            }));
            parserOptions[keyCopy].value = newOptions;
            await browser.storage.local.set({ [settingKey]: parserOptions });
            settingRefreshMessage();
          });
        })(key, input);
      } else if (data.type === "checkbox") {
        const switchLabel = document.createElement("label");
        switchLabel.className = "switch-label";

        const checkbox = document.createElement("input");
        checkbox.type = "checkbox";
        checkbox.checked = data.value;

        const slider = document.createElement("span");
        slider.className = "slider";

        switchLabel.appendChild(checkbox);
        switchLabel.appendChild(slider);
        input = switchLabel;

        ((keyCopy, checkboxCopy) => {
          checkboxCopy.addEventListener("change", async () => {
            parserOptions[keyCopy].value = checkboxCopy.checked;
            await browser.storage.local.set({ [settingKey]: parserOptions });
            settingRefreshMessage();
          });
        })(key, checkbox);
      } else if (data.type === "text") {
        input = document.createElement("input");
        input.type = "text";
        input.value = data.value ?? "";

        ((keyCopy, inputCopy) => {
          inputCopy.addEventListener("change", async () => {
            parserOptions[keyCopy].value = inputCopy.value;
            await browser.storage.local.set({ [settingKey]: parserOptions });
            settingRefreshMessage();
          });
        })(key, input);
      }

      if (input) {
        optionSpan.append(label, input);
        container.appendChild(optionSpan);
      }
    }

    await renderOptions(optionsContainer);

    // First Time Options Setup Message
    if (optionsContainer.querySelectorAll(".parser-option").length < 1) {
      const messageDiv = document.createElement("div");
      messageDiv.className = "setup-options-message";
      messageDiv.textContent = "First time setup: close and reopen this popup to load settings.";
      optionsContainer.appendChild(messageDiv);
    }

    // Gear click
    entryInner.addEventListener("click", async (e) => {
      const allEntries = document.querySelectorAll(".parser-entry");
      const optionsContainer = wrapper.querySelector(".parser-options");
      const siteListContainer = document.getElementById("siteListContainer");
      const siteList = document.getElementById("siteList");
      const isOpen = optionsContainer.classList.contains("open");
      e.stopPropagation();

      if (!isOpen) {
        // Open
        optionsContainer.classList.add("open");
        const originalScrollTop = siteList.scrollTop;
        const wrapperRect = wrapper.getBoundingClientRect();
        const siteListRect = siteList.getBoundingClientRect();
        wrapper.dataset.originalScrollTop = originalScrollTop;
        wrapper.dataset.originalOffset = wrapperRect.top - siteListRect.top;
        const targetOffset = -wrapper.dataset.originalOffset;

        // Scroll the siteListContainer to bring the clicked entry to the top.
        siteListContainer.style.transform = `translateY(${targetOffset}px)`;
        siteListContainer.style.marginBottom = `-${-targetOffset}px`;

        // Fade the other entries
        allEntries.forEach((entry) => {
          if (entry !== wrapper) {
            entry.classList.add("fading");
          }
        });

        searchBox.classList.add("fading");

        // Open the options container
        optionsContainer.style.maxHeight = optionsContainer.scrollHeight + "px";
      } else {
        // Close
        optionsContainer.classList.remove("open");
        optionsContainer.style.maxHeight = "0";
        siteListContainer.style.transform = "translateY(0)";
        siteListContainer.style.marginBottom = ``;
        searchBox.classList.remove("fading");
        allEntries.forEach((entry) => {
          entry.classList.remove("fading");
        });

        //Return to the original scroll position
        setTimeout(() => {
          const originalScrollTop = wrapper.dataset.originalScrollTop;
          if (originalScrollTop !== undefined) {
            siteList.scrollTo({ top: originalScrollTop, behavior: "smooth" });
          }
        }, 400);
      }
    });
    entryInner.append(favIconContainer, siteTitle);
    // User Add - Delete
    if (userAdd) {
      const delBtn = document.createElement("a");
      delBtn.className = "del-user-parser";
      delBtn.appendChild(createSVG(svg_paths.trashIconPaths));
      delBtn.title = "Delete this user music site";
      delBtn.addEventListener("click", async (e) => {
        e.stopPropagation();
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

      entryInner.appendChild(delBtn);

      if (tabHostname === normalize(domain)) {
        const regexes = urlPatterns.map(parseUrlPattern);
        if (regexes.some((r) => r.test(tabPath))) {
          document.getElementById("openSelector").textContent = "Edit Music Site";
        }
      }
    }

    entryInner.appendChild(switchLabel);
    wrapper.append(entryInner, optionsContainer);
    container.appendChild(wrapper);
  }

  // Load Icons
  const allFavIcons = document.querySelectorAll(".parser-icon");
  loadFavIcons(allFavIcons);

  // Load Author Icons
  const allAuthorIcons = document.querySelectorAll(".author-image");
  loadAuthorIcons(allAuthorIcons);
}
