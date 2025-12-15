async function renderSettings() {
  const panel = document.getElementById("settingsPanel");
  const panelContainer = document.createElement("div");
  panelContainer.id = "settingsContainer";

  while (panel.firstChild) panel.removeChild(panel.firstChild);

  // Theme Switch
  let themeStorage = await browser.storage.local.get("theme");
  let themeConfig = themeStorage.theme || {};
  const themeWrap = document.createElement("div");
  themeWrap.className = "settings-option theme-wrapper";
  // Theme Label
  const themeLabel = document.createElement("label");
  themeLabel.textContent = "Theme";

  // Theme Select
  const themeInput = document.createElement("select");
  const themes = ["dark", "light"];
  themeInput.className = "settings-select";
  themeInput.value = themeConfig || "dark";

  const themeDebounce = debounce(async () => {
    themeConfig = themeInput.value;
    await browser.storage.local.set({ theme: themeConfig });
    document.body.dataset.theme = themeInput.value;
    const COLORS = getColorSettings();
    const colorInputs = document.querySelectorAll("#settingsContainer [type='color']");

    for (const input of colorInputs) {
      const key = input.dataset.key || input.id.replace("Input", "");
      const item = COLORS.find((x) => x.key === key);
      if (item) input.value = item.default;
    }
  }, 300);

  themeInput.addEventListener("input", themeDebounce);

  // Theme Select Options
  themes.forEach((theme) => {
    const optEl = document.createElement("option");
    optEl.value = theme;
    optEl.textContent = theme;
    if (theme === themeConfig) optEl.selected = true;
    themeInput.appendChild(optEl);
  });

  // Add themeWrap to the panel
  themeWrap.appendChild(themeLabel);
  themeWrap.appendChild(themeInput);
  panelContainer.appendChild(themeWrap);

  // Color Settings
  let COLOR_SETTINGS = getColorSettings();
  let colorStorage = await browser.storage.local.get("colorSettings");
  let colorConfig = colorStorage.colorSettings || {};

  for (const item of COLOR_SETTINGS) {
    const wrap = document.createElement("div");
    wrap.className = "settings-option color-wrapper";

    // Label
    const lbl = document.createElement("label");
    lbl.textContent = item.label;
    lbl.setAttribute("for", item.key + "Input");

    // Color Input
    const inp = document.createElement("input");
    inp.type = "color";
    inp.id = item.key + "Input";
    inp.className = "settings-input";
    inp.value = colorConfig[item.key] || item.default;

    const inpDebounce = debounce(async () => {
      colorConfig[item.key] = inp.value;
      await browser.storage.local.set({ colorSettings: colorConfig });
      applyColorSettings();
    }, 300);

    inp.addEventListener("input", inpDebounce);

    // Delete Button
    const btnDelete = document.createElement("span");
    btnDelete.appendChild(createSVG(svg_paths.crossIconPaths));
    btnDelete.className = "color-delete-btn button";
    btnDelete.title = "Revert";

    btnDelete.addEventListener("click", async () => {
      delete colorConfig[item.key];
      await browser.storage.local.set({ colorSettings: colorConfig });
      document.body.style.removeProperty(item.cssVar);
      const COLOR_SETTINGS = getColorSettings();
      for (const item of COLOR_SETTINGS) {
        inp.value = item.default;
      }
      applyColorSettings();
    });

    wrap.appendChild(lbl);
    wrap.appendChild(inp);
    wrap.appendChild(btnDelete);
    panelContainer.appendChild(wrap);
  }

  // Port
  const portWrapper = document.createElement("div");
  portWrapper.className = "settings-option port-wrapper";

  const portLabel = document.createElement("label");
  portLabel.textContent = "Port";
  portLabel.setAttribute("for", "portInput");

  const portInput = document.createElement("input");
  portInput.type = "text";
  portInput.id = "portInput";
  portInput.className = "settings-input";

  // Load the port value
  const storedPort = (await browser.storage.local.get("serverPort")).serverPort;
  if (storedPort !== undefined) {
    portInput.value = storedPort;
  } else {
    portInput.value = CONFIG.serverPort;
  }

  // Write to storage when the input changes
  const portInputDebounce = debounce(async () => {
    await browser.storage.local.set({ serverPort: portInput.value });
  }, 300);

  portInput.addEventListener("input", portInputDebounce);

  const btnApply = document.createElement("span");
  btnApply.appendChild(createSVG(svg_paths.penIconPaths));
  btnApply.className = "port-apply-btn button";
  btnApply.title = "Apply";

  btnApply.addEventListener("click", async () => {
    btnApply.classList.toggle("spinner");
    const tabs = await browser.tabs.query({ active: true, currentWindow: true });
    const res = await browser.runtime.sendMessage({
      type: "UPDATE_RPC_PORT",
      data: { port: Number(portInput.value) },
    });
    btnApply.classList.toggle("spinner");
    restartExtension(tabs[0]);
  });

  // Port Info
  const portInfo = document.createElement("small");
  portInfo.className = "settings-option-info";
  portInfo.textContent = "You don't need to change the port separately in the application.";

  portWrapper.appendChild(portLabel);
  portWrapper.appendChild(portInput);
  portWrapper.appendChild(btnApply);

  panelContainer.appendChild(portWrapper);
  portWrapper.insertAdjacentElement("afterend", portInfo);
  // Buttons
  const createButton = (text, id) => {
    const btn = document.createElement("a");
    btn.textContent = text;
    btn.className = "settings-btn";
    btn.id = id;
    return btn;
  };
  const stored = (await browser.storage.local.get("debugMode")).debugMode;
  const debugState = stored ?? CONFIG.debugMode;
  const btnRestart = createButton("Restart Extension", "restart");
  const btnDebug = createButton(`${debugState ? "Disable" : "Activate"} Debug Mode`, "debugMode");
  const btnFactory = createButton("Factory Reset (Default Settings)", "factoryReset");
  const btnBackup = createButton("Backup / Restore", "backupSettings");

  // Backup Button
  btnBackup.onclick = async () => {
    const themeStorage = await browser.storage.local.get("theme");
    const theme = themeStorage.theme || "dark";
    const url = browser.runtime.getURL(`backup/backup.html${theme ? `?theme=${theme}` : ""}`);
    try {
      const tabs = await browser.tabs.query({ url });
      if (tabs && tabs.length > 0) {
        const tab = tabs[0];
        await browser.tabs.update(tab.id, { active: true });
        try {
          await browser.windows.update(tab.windowId, { focused: true });
        } catch (e) {}
        window.close();
        return;
      }

      await browser.tabs.create({ url });
      window.close();
    } catch (err) {
      logError("Open settings failed:", err);
    }
  };

  // Restart
  btnRestart.onclick = async () => {
    const tabs = await browser.tabs.query({ active: true, currentWindow: true });
    restartExtension(tabs[0]);
  };

  // Debug Mode
  if (debugState === 1) {
    btnDebug.classList.add("active");
  }

  btnDebug.onclick = async () => {
    const tabs = await browser.tabs.query({ active: true, currentWindow: true });
    await toggleDebugMode(tabs[0]);
    const newStored = (await browser.storage.local.get("debugMode")).debugMode;
    const newState = newStored ?? CONFIG.debugMode;

    if (newState === 1) {
      btnDebug.classList.add("active");
      btnDebug.textContent = "Disable Debug Mode";
    } else {
      btnDebug.classList.remove("active");
      btnDebug.textContent = "Activate Debug Mode";
    }
  };

  // Factory Reset
  btnFactory.onclick = async () => {
    const tabs = await browser.tabs.query({ active: true, currentWindow: true });
    const result = await factoryReset(tabs[0], true);

    if (result?.needConfirm) {
      btnFactory.textContent = "This will reset this extension. Confirm.";
      btnFactory.classList.add("active");
      setTimeout(() => {
        btnFactory.textContent = "Factory Reset";
        btnFactory.classList.remove("active");
      }, 5000);
    }
  };

  // Add to panel
  panelContainer.append(btnBackup, btnRestart, btnDebug, btnFactory);
  panel.appendChild(panelContainer);
}
