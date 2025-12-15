let currentRenderCleanup = null;
const settingRefreshMessage = () => {
  showPopupMessage("Please refresh the page to apply the settings.");
};

async function renderList(filteredList = null, isSearch = null) {
  const container = document.getElementById("siteListContainer");

  if (currentRenderCleanup) {
    currentRenderCleanup();
    currentRenderCleanup = null;
  }

  container.replaceChildren();
  const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
  const tabUrl = new URL(tab.url);
  const tabPath = tabUrl.pathname;
  const tabHostname = normalizeHost(tabUrl.hostname);
  const settings = await browser.storage.local.get();

  // Spinner
  const spinner = document.createElement("div");
  spinner.className = "spinner";
  container.appendChild(spinner);

  const updateMinHeight = () => {
    document.getElementById("siteList").style.minHeight = `${container.scrollHeight < 402 ? container.scrollHeight : 402}px`;
  };

  const list = filteredList || (await getFreshParserList());
  spinner.remove();
  if (!list || list.length === 0) {
    const setupListMessage = document.createElement("div");
    setupListMessage.className = "setup-list-message";
    setupListMessage.textContent = isSearch ? "Not Found" : "Please open a supported website (YouTube, Soundcloud, Deezer etc.) in an active tab to build the parser list.";
    container.appendChild(setupListMessage);
    updateMinHeight();
    return false;
  }

  const listeners = [];
  const addListener = (el, event, handler, options = {}) => {
    if (!el) return;
    el.addEventListener(event, handler, options);
    listeners.push({ el, event, handler, options });
  };

  const fragment = document.createDocumentFragment();

  for (const entry of list) {
    const { id, domain, title, userAdd, userScript, urlPatterns = [], authors, authorsLinks, homepage, description } = entry;
    const key = `enable_${id}`;
    const isEnabled = settings[key] !== false;

    // Wrapper
    const wrapper = document.createElement("div");
    wrapper.className = "parser-entry";

    // FavIcon
    const favIconContainer = document.createElement("div");
    favIconContainer.className = "parser-icon-container spinner";

    const favIcon = document.createElement("img");
    favIcon.className = "parser-icon hidden-visibility";
    favIcon.title = `Open ${title || domain}`;
    favIcon.dataset.src = domain;
    favIcon.loading = "lazy";
    favIcon.decoding = "async";
    favIconContainer.appendChild(favIcon);

    // Favicon click
    const handleFavIconClick = () => {
      const url = homepage || `https://${domain}`;
      window.open(url, "_blank", "noopener,noreferrer");
    };
    addListener(favIcon, "click", handleFavIconClick);

    // Entry Inner
    const entryInner = document.createElement("span");
    entryInner.className = "parser-span";

    // Title
    const siteTitle = document.createElement("a");
    siteTitle.className = "parser-title";
    siteTitle.textContent = title || domain;

    // Switch
    const switchLabel = document.createElement("label");
    switchLabel.className = "switch-label";

    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.checked = isEnabled;
    checkbox.dataset.parserId = id;
    checkbox.dataset.isUserScript = userScript ? "true" : "false";

    const slider = document.createElement("span");
    slider.className = "slider";
    switchLabel.append(checkbox, slider);

    if (!userAdd && !userScript) switchLabel.style.marginLeft = "auto";

    // Checkbox change
    const handleCheckboxChange = async (e) => {
      const parserId = e.target.dataset.parserId;
      const isUserScript = e.target.dataset.isUserScript === "true";
      const enabled = e.target.checked;
      const newSetting = { [`enable_${parserId}`]: enabled };
      await browser.storage.local.set(newSetting);
      settings[`enable_${parserId}`] = enabled;
      if (isUserScript) {
        await this.sendAction("toggleUserScript", { id: parserId, enabled });
      }
    };
    addListener(checkbox, "change", handleCheckboxChange);

    // Authors
    const authorDiv = document.createElement("div");
    const authorHeader = document.createElement("h4");

    if (authors?.length > 0 && authors[0].trim() !== "") {
      authorDiv.className = "parser-entry-authors";
      authorHeader.textContent = authors.length > 1 ? "Authors" : "Author";
      authorDiv.appendChild(authorHeader);
      authors.forEach((author, index) => {
        const authorContainer = document.createElement("div");
        authorContainer.className = "author-container";
        if (!authorsLinks?.[index] || authorsLinks?.[index] === "") {
          authorContainer.classList.add("no-link");
        }
        const link = document.createElement("a");
        link.href = authorsLinks?.[index] ? authorsLinks[index] : "";
        link.textContent = author;
        link.target = "_blank";
        link.rel = "noopener noreferrer";
        authorContainer.appendChild(link);
        authorDiv.appendChild(authorContainer);
      });
    }

    // Description
    const descriptionDiv = document.createElement("div");
    const descriptionHeader = document.createElement("h4");

    if (description && description.trim() !== "") {
      descriptionDiv.className = "parser-entry-description";
      descriptionHeader.textContent = "Description";
      descriptionDiv.appendChild(descriptionHeader);
      const descriptionContent = document.createElement("p");
      descriptionContent.textContent = description;
      descriptionDiv.appendChild(descriptionContent);
    }

    // Options Container
    const optionsContainer = document.createElement("div");
    optionsContainer.id = `options-${id}`;
    optionsContainer.className = "parser-options";

    // Sections
    optionsContainer.append(descriptionDiv, authorDiv);

    // Options Header
    const optionsHeader = document.createElement("h4");
    optionsHeader.textContent = "Settings";
    optionsContainer.appendChild(optionsHeader);

    // Parser Options
    const settingKey = `settings_${id}`;
    const stored = await browser.storage.local.get(settingKey);
    let parserOptions = stored[settingKey] || {};

    for (const [key, def] of Object.entries(DEFAULT_PARSER_OPTIONS)) {
      if (parserOptions[key] === undefined) {
        parserOptions[key] = { ...def };
      }
    }
    await browser.storage.local.set({ [settingKey]: parserOptions });

    // renderOptions
    await renderOptions(optionsContainer, parserOptions, settingKey, addListener);

    // First time message
    if (optionsContainer.querySelectorAll(".parser-option").length < 1) {
      const messageDiv = document.createElement("div");
      messageDiv.className = "setup-options-message";
      messageDiv.textContent = "First time setup: close and reopen this popup to load settings.";
      optionsContainer.appendChild(messageDiv);
    }

    // Gear click
    const handleEntryInnerClick = (e) => {
      if (e.target.closest(".switch-label, .del-user-parser, .edit-user-script, .parser-icon")) return;
      e.stopPropagation();

      const isOpen = optionsContainer.classList.contains("open");
      const siteList = document.getElementById("siteList");
      const siteListContainer = document.getElementById("siteListContainer");
      const searchBox = document.getElementById("searchBox");

      if (!isOpen) {
        optionsContainer.classList.add("open");
        wrapper.dataset.originalScrollTop = siteList.scrollTop;
        const wrapperRect = wrapper.getBoundingClientRect();
        const listRect = siteList.getBoundingClientRect();
        wrapper.dataset.originalOffset = wrapperRect.top - listRect.top;
        const targetOffset = -wrapper.dataset.originalOffset;

        siteListContainer.style.transform = `translateY(${targetOffset}px)`;
        siteListContainer.style.marginBottom = `-${-targetOffset}px`;

        container.querySelectorAll(".parser-entry").forEach((el) => {
          if (el !== wrapper) el.classList.add("fading");
        });
        searchBox?.classList.add("fading");
        optionsContainer.style.maxHeight = optionsContainer.scrollHeight + "px";
      } else {
        optionsContainer.classList.remove("open");
        optionsContainer.style.maxHeight = "0";
        siteListContainer.style.transform = "translateY(0)";
        siteListContainer.style.marginBottom = "";
        searchBox?.classList.remove("fading");
        container.querySelectorAll(".parser-entry").forEach((el) => el.classList.remove("fading"));

        setTimeout(() => {
          const original = wrapper.dataset.originalScrollTop;
          if (original !== undefined) {
            siteList.scrollTo({ top: original, behavior: "smooth" });
          }
        }, 400);
      }
    };
    entryInner.append(favIconContainer, siteTitle);
    addListener(entryInner, "click", handleEntryInnerClick);

    // User Add - Delete
    if (userAdd) {
      const delBtn = document.createElement("a");
      delBtn.className = "del-user-parser";
      delBtn.appendChild(createSVG(svg_paths.trashIconPaths));
      delBtn.title = "Delete";
      delBtn.dataset.parserId = id;
      delBtn.dataset.parserTitle = title;
      delBtn.dataset.parserDomain = domain;

      const handleDeleteClick = async (e) => {
        e.stopPropagation();
        const parserId = e.currentTarget.dataset.parserId;
        const parserTitle = e.currentTarget.dataset.parserTitle;

        if (!confirm(`Do you want to delete "${parserTitle}" parser?`)) return;

        const storage = await browser.storage.local.get(["userParserSelectors", "parserList"]);
        const updatedUserList = (storage.userParserSelectors || []).filter((p) => p.id !== parserId);
        const updatedParserList = (storage.parserList || []).filter((p) => p.id !== parserId);

        await browser.storage.local.remove(`enable_${parserId}`);
        await browser.storage.local.set({
          userParserSelectors: updatedUserList,
          parserList: updatedParserList,
        });

        if (Array.isArray(window.parsers?.[domain])) {
          window.parsers[domain] = window.parsers[domain].filter((p) => p.id !== parserId);
        }

        await renderList(updatedParserList);
      };
      addListener(delBtn, "click", handleDeleteClick);
      entryInner.appendChild(delBtn);

      if (tabHostname === normalizeHost(domain)) {
        const regexes = urlPatterns.map(parseUrlPattern);
        if (regexes.some((r) => r.test(tabPath))) {
          document.getElementById("openSelector").textContent = "Edit Music Site";
        }
      }
    }

    // User Script Edit
    if (userScript) {
      const gearBtn = document.createElement("a");
      gearBtn.className = "edit-user-script";
      gearBtn.appendChild(createSVG(svg_paths.gearIconPaths));
      gearBtn.title = "Edit user script";
      gearBtn.dataset.parserId = id;

      addListener(gearBtn, "click", (e) => {
        e.stopPropagation();
        openUserScriptManager(e.currentTarget.dataset.parserId);
      });
      entryInner.appendChild(gearBtn);
    }

    // Append all
    entryInner.append(switchLabel);
    wrapper.append(entryInner, optionsContainer);
    fragment.appendChild(wrapper);
  }

  container.appendChild(fragment);
  updateMinHeight();

  // Favicon lazy load
  const allFavIcons = document.querySelectorAll(".parser-icon");
  loadFavIcons(allFavIcons);

  // Cleanup
  currentRenderCleanup = () => {
    listeners.forEach(({ el, event, handler, options }) => {
      el?.removeEventListener?.(event, handler, options);
    });
    listeners.length = 0;
  };

  return true;
}

async function renderOptions(container, parserOptions, settingKey, addListener) {
  const userKeys = Object.keys(parserOptions).filter((k) => !Object.keys(DEFAULT_PARSER_OPTIONS).includes(k));

  for (const key of userKeys) {
    await renderOption(key, parserOptions[key], container, settingKey, addListener);
  }

  if (userKeys.length > 0) {
    const defaultHeader = document.createElement("h4");
    defaultHeader.textContent = "General Settings";
    container.appendChild(defaultHeader);
  }

  const defaultKeys = Object.keys(DEFAULT_PARSER_OPTIONS).filter((k) => !["customCover", "customCoverUrl"].includes(k));
  for (const key of defaultKeys) {
    await renderOption(key, parserOptions[key], container, settingKey, addListener);
  }

  ["customCover", "customCoverUrl"].forEach((key) => {
    if (parserOptions[key]) {
      renderOption(key, parserOptions[key], container, settingKey, addListener);
    }
  });
}

async function renderOption(key, data, container, settingKey, addListener) {
  const optionSpan = document.createElement("span");
  optionSpan.className = "parser-option";

  const label = document.createElement("label");
  label.textContent = data.label || key;

  let input = null;

  if (data.type === "select") {
    input = document.createElement("select");
    input.dataset.optionKey = key;
    input.dataset.settingKey = settingKey;

    const optionsArray = Array.isArray(data.value) ? data.value : [];
    optionsArray.forEach((opt) => {
      const optEl = document.createElement("option");
      optEl.value = opt.value;
      optEl.textContent = opt.label;
      if (opt.selected) optEl.selected = true;
      input.appendChild(optEl);
    });

    const handler = async (e) => {
      const optKey = e.target.dataset.optionKey;
      const setKey = e.target.dataset.settingKey;
      const selectedValue = e.target.value;
      const stored = await browser.storage.local.get(setKey);
      const opts = stored[setKey] || {};
      const arr = Array.isArray(opts[optKey]?.value) ? opts[optKey].value : [];
      opts[optKey].value = arr.map((o) => ({ ...o, selected: o.value === selectedValue }));
      await browser.storage.local.set({ [setKey]: opts });
      settingRefreshMessage();
    };
    addListener(input, "change", handler);
  } else if (data.type === "checkbox") {
    const switchLabel = document.createElement("label");
    switchLabel.className = "switch-label";

    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.checked = !!data.value;
    checkbox.dataset.optionKey = key;
    checkbox.dataset.settingKey = settingKey;

    const slider = document.createElement("span");
    slider.className = "slider";
    switchLabel.append(checkbox, slider);
    input = switchLabel;

    addListener(checkbox, "change", async (e) => {
      const optKey = e.target.dataset.optionKey;
      const setKey = e.target.dataset.settingKey;
      const stored = await browser.storage.local.get(setKey);
      const opts = stored[setKey] || {};
      opts[optKey].value = e.target.checked;
      await browser.storage.local.set({ [setKey]: opts });
      settingRefreshMessage();
    });
  } else if (data.type === "text") {
    input = document.createElement("input");
    input.type = "text";
    input.value = data.value ?? "";
    input.dataset.optionKey = key;
    input.dataset.settingKey = settingKey;

    const debounced = debounce(async (e) => {
      const optKey = e.target.dataset.optionKey;
      const setKey = e.target.dataset.settingKey;
      const stored = await browser.storage.local.get(setKey);
      const opts = stored[setKey] || {};
      opts[optKey].value = e.target.value;
      await browser.storage.local.set({ [setKey]: opts });
      settingRefreshMessage();
    }, 300);

    addListener(input, "input", debounced);
  }

  if (input) {
    optionSpan.append(label, input);
    container.appendChild(optionSpan);
  }
}
