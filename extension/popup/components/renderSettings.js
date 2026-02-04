async function renderSettings() {
  const panel = document.getElementById("settingsPanel");
  const panelContainer = document.createElement("div");
  panelContainer.id = "settingsContainer";

  while (panel.firstChild) panel.removeChild(panel.firstChild);

  // Theme Switch
  const themeStorage = await browser.storage.local.get("theme");
  let themeConfig = themeStorage.theme || "dark";
  const themeWrap = document.createElement("div");
  themeWrap.className = "settings-option theme-wrapper";

  // Theme Label
  const themeLabel = document.createElement("label");
  themeLabel.textContent = "Theme";

  // Theme Select
  const themeInput = document.createElement("select");
  const themes = ["dark", "light"];
  themeInput.className = "settings-select";
  themeInput.value = themeConfig;

  const themeDebounce = debounce(async () => {
    themeConfig = themeInput.value;

    await browser.storage.local.set({ theme: themeConfig });

    document.documentElement.setAttribute("data-theme", themeConfig);
    document.body.setAttribute("data-theme", themeConfig);
    document.body.style = "";

    colorConfig = {};
    await browser.storage.local.remove("colorSettings");
    await applyColorSettings();
    await applyBackgroundSettings();

    // Wait for two animation frames to ensure styles are applied
    await new Promise((resolve) =>
      requestAnimationFrame(() => {
        requestAnimationFrame(resolve);
      }),
    );

    // Update all swatches and picker if open
    await updateAllSwatchesForTheme();
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

  // BACKGROUND IMAGE SETTINGS
  // Load saved background settings
  const bgStorage = await browser.storage.local.get("backgroundSettings");
  let bgSettings = bgStorage.backgroundSettings || {
    image: null,
    blur: 0,
    brightness: 100,
    saturation: 100,
  };

  // Helper functions
  async function saveBgSettings() {
    await browser.storage.local.set({ backgroundSettings: bgSettings });
  }

  // Background Image URL
  const bgUrlWrapper = document.createElement("div");
  bgUrlWrapper.className = "settings-option bg-url-wrapper";

  const bgUrlLabel = document.createElement("label");
  bgUrlLabel.textContent = "Background Image";

  const bgUrlControl = document.createElement("div");
  bgUrlControl.className = "bg-url-control";

  const urlInput = document.createElement("input");
  urlInput.type = "text";
  urlInput.placeholder = "image URL...";
  urlInput.className = "bg-url-input settings-input";
  urlInput.value = bgSettings.image || "";

  // Expand button
  const btnExpand = document.createElement("span");
  btnExpand.appendChild(createSVG(svg_paths.gearIconPaths));
  btnExpand.className = "bg-expand-btn button";
  btnExpand.title = "Show/Hide Options";

  // URL input handler
  const urlInputDebounce = debounce(async () => {
    const url = urlInput.value.trim();

    if (!url) {
      bgSettings.image = null;
      btnDeleteBg.classList.add("disabled");
    } else {
      bgSettings.image = url;
      btnDeleteBg.classList.remove("disabled");
    }

    await saveBgSettings();
    applyBackgroundSettings();
  }, 500);

  urlInput.addEventListener("input", urlInputDebounce);

  bgUrlControl.appendChild(urlInput);
  bgUrlControl.appendChild(btnExpand);

  bgUrlWrapper.appendChild(bgUrlLabel);
  bgUrlWrapper.appendChild(bgUrlControl);

  // Delete button for URL
  const btnDeleteBg = document.createElement("span");
  btnDeleteBg.appendChild(createSVG(svg_paths.crossIconPaths));
  btnDeleteBg.className = "color-delete-btn button";
  btnDeleteBg.title = "Remove Background";
  if (!bgSettings.image) {
    btnDeleteBg.classList.add("disabled");
  }

  btnDeleteBg.addEventListener("click", async () => {
    bgSettings = {
      image: null,
      blur: 0,
      brightness: 100,
      saturation: 100,
      positionX: 50,
    };
    await saveBgSettings();

    urlInput.value = "";
    btnDeleteBg.classList.add("disabled");

    // Reset slider values
    blurWrapper.querySelector("input").value = 0;
    blurWrapper.querySelector(".slider-value").textContent = "0px";
    brightnessWrapper.querySelector("input").value = 100;
    brightnessWrapper.querySelector(".slider-value").textContent = "100%";
    saturationWrapper.querySelector("input").value = 100;
    saturationWrapper.querySelector(".slider-value").textContent = "100%";

    applyBackgroundSettings();
  });

  bgUrlWrapper.appendChild(btnDeleteBg);
  panelContainer.appendChild(bgUrlWrapper);

  // Expandable section container
  const bgExpandableSection = document.createElement("div");
  bgExpandableSection.className = "bg-expandable-section hidden";

  // Blur control
  const blurWrapper = document.createElement("div");
  blurWrapper.className = "settings-option";

  const blurLabel = document.createElement("label");
  blurLabel.textContent = "Blur";

  const blurControl = createSliderControl(0, 20, 1, bgSettings.blur, "px", async (value) => {
    bgSettings.blur = value;
    await saveBgSettings();
    applyBackgroundSettings();
  });

  blurWrapper.appendChild(blurLabel);
  blurWrapper.appendChild(blurControl);
  bgExpandableSection.appendChild(blurWrapper);

  // Brightness control
  const brightnessWrapper = document.createElement("div");
  brightnessWrapper.className = "settings-option";

  const brightnessLabel = document.createElement("label");
  brightnessLabel.textContent = "Brightness";

  const brightnessControl = createSliderControl(0, 200, 1, bgSettings.brightness, "%", async (value) => {
    bgSettings.brightness = value;
    await saveBgSettings();
    applyBackgroundSettings();
  });

  brightnessWrapper.appendChild(brightnessLabel);
  brightnessWrapper.appendChild(brightnessControl);
  bgExpandableSection.appendChild(brightnessWrapper);

  // Saturation control
  const saturationWrapper = document.createElement("div");
  saturationWrapper.className = "settings-option";

  const saturationLabel = document.createElement("label");
  saturationLabel.textContent = "Saturation";

  const saturationControl = createSliderControl(0, 200, 1, bgSettings.saturation, "%", async (value) => {
    bgSettings.saturation = value;
    await saveBgSettings();
    applyBackgroundSettings();
  });

  saturationWrapper.appendChild(saturationLabel);
  saturationWrapper.appendChild(saturationControl);
  bgExpandableSection.appendChild(saturationWrapper);

  // Position X control
  const posXWrapper = document.createElement("div");
  posXWrapper.className = "settings-option";
  const posXLabel = document.createElement("label");
  posXLabel.textContent = "Position";
  const posXControl = createSliderControl(0, 100, 1, bgSettings.positionX || 50, "%", async (value) => {
    bgSettings.positionX = value;
    await saveBgSettings();
    applyBackgroundSettings();
  });
  posXWrapper.appendChild(posXLabel);
  posXWrapper.appendChild(posXControl);
  bgExpandableSection.appendChild(posXWrapper);

  bgUrlWrapper.appendChild(bgExpandableSection);

  // Expand button click handler
  btnExpand.addEventListener("click", (e) => {
    e.stopPropagation();
    bgExpandableSection.classList.toggle("hidden");
    btnExpand.classList.toggle("expanded");
  });

  function createSliderControl(min, max, step, value, unit, onChange) {
    const controlRow = document.createElement("div");
    controlRow.className = "slider-row";

    const slider = document.createElement("input");
    slider.type = "range";
    slider.min = min;
    slider.max = max;
    slider.step = step;
    slider.value = value;
    slider.className = "slider-input";

    const valueDisplay = document.createElement("span");
    valueDisplay.className = "slider-value";
    valueDisplay.textContent = `${value}${unit}`;

    const sliderDebounce = debounce(async () => {
      const val = Number(slider.value);
      valueDisplay.textContent = `${val}${unit}`;
      await onChange(val);
    }, 150);

    slider.addEventListener("input", () => {
      valueDisplay.textContent = `${slider.value}${unit}`;
    });

    slider.addEventListener("input", sliderDebounce);

    controlRow.appendChild(slider);
    controlRow.appendChild(valueDisplay);

    return controlRow;
  }
  const COLOR_SETTINGS = getColorSettings();
  const colorStorage = await browser.storage.local.get("colorSettings");
  let colorConfig = colorStorage.colorSettings || {};

  for (const item of COLOR_SETTINGS) {
    const wrap = document.createElement("div");
    wrap.className = "settings-option color-wrapper";

    const lbl = document.createElement("label");
    lbl.textContent = item.label;

    const control = document.createElement("div");
    control.className = "color-control";

    const swatch = document.createElement("div");
    swatch.className = "color-swatch";

    const initialColor = colorConfig[item.key] || item.default;
    swatch.style.background = initialColor;

    // Delete Button
    const btnDelete = document.createElement("span");
    btnDelete.appendChild(createSVG(svg_paths.crossIconPaths));
    btnDelete.className = "color-delete-btn button";
    btnDelete.title = "Revert";

    // Update delete button initially
    (async () => {
      const storage = await browser.storage.local.get("colorSettings");
      const config = storage.colorSettings || {};
      const currentValue = config[item.key];

      if (!currentValue || currentValue === item.default) {
        btnDelete.classList.add("disabled");
      } else {
        btnDelete.classList.remove("disabled");
      }
    })();

    // Delete button click
    btnDelete.addEventListener("click", async (e) => {
      document.body.style.transition = "none";
      e.stopPropagation();

      const storage = await browser.storage.local.get("colorSettings");
      const config = storage.colorSettings || {};
      delete config[item.key];
      await browser.storage.local.set({ colorSettings: config });

      const def = getDefaultCSSValue(item);
      swatch.style.background = def;

      await applyColorSettings();
      await applyBackgroundSettings();
      closePicker();
      if (!def || def === item.default) {
        btnDelete.classList.add("disabled");
      } else {
        btnDelete.classList.remove("disabled");
      }
      setTimeout(() => {
        document.body.style.transition = "";
      }, 50);
    });

    // Swatch click → open picker
    swatch.addEventListener("click", (e) => {
      e.stopPropagation();
      openPickerForSwatch(item, swatch, btnDelete);
    });

    control.appendChild(swatch);
    wrap.appendChild(lbl);
    wrap.appendChild(control);
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
  const btnFilter = createButton("Manage Filters", "filterSettings");

  // Backup Button
  btnBackup.onclick = async () => {
    const url = browser.runtime.getURL(`settings/settings.html?section=backup`);
    try {
      const tabs = await browser.tabs.query({ url });
      if (tabs && tabs.length > 0) {
        const tab = tabs[0];
        await browser.tabs.update(tab.id, { active: true });
        try {
          await browser.windows.update(tab.windowId, { focused: true });
        } catch (_) {}
        window.close();
        return;
      }

      await browser.tabs.create({ url });
      window.close();
    } catch (err) {
      logError("Open settings failed:", err);
    }
  };

  // Filter Button
  btnFilter.onclick = async () => {
    const url = browser.runtime.getURL(`settings/settings.html?section=filter`);
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
        btnFactory.textContent = "Factory Reset (Default Settings)";
        btnFactory.classList.remove("active");
      }, 5000);
    }
  };

  // Add to panel
  panelContainer.append(btnFilter, btnBackup, btnRestart, btnDebug, btnFactory);
  panel.appendChild(panelContainer);

  // Apply background settings on load
  applyBackgroundSettings();
}
