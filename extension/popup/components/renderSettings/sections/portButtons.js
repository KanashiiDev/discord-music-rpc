async function buildPortButtons(container) {
  const portWrapper = document.createElement("div");
  portWrapper.className = "settings-option port-wrapper";

  const portLabel = document.createElement("label");
  portLabel.textContent = "Port";
  portLabel.dataset.i18n = "settings.port";
  portLabel.setAttribute("for", "portInput");

  const portInput = document.createElement("input");
  portInput.type = "text";
  portInput.id = "portInput";
  portInput.className = "settings-input";

  const { serverPort: storedPort } = await browser.storage.local.get("serverPort");
  portInput.value = storedPort ?? CONFIG.serverPort;

  portInput.addEventListener(
    "input",
    debounce(async () => {
      await browser.storage.local.set({ serverPort: portInput.value });
    }, 300),
  );

  // Apply Button
  const btnApply = document.createElement("span");
  btnApply.appendChild(createSVG(svg_paths.penIconPaths));
  btnApply.className = "port-apply-btn button";
  btnApply.title = i18n.t("settings.apply");

  btnApply.addEventListener("click", async () => {
    btnApply.classList.toggle("spinner");
    try {
      const [activeTab] = await browser.tabs.query({ active: true, currentWindow: true });
      await browser.runtime.sendMessage({
        type: "UPDATE_RPC_PORT",
        data: { newPort: Number(portInput.value) },
      });
      restartExtension(activeTab);
    } catch (err) {
      console.error("Port update failed:", err);
    } finally {
      btnApply.classList.toggle("spinner");
    }
  });

  // Port Info
  const portInfo = document.createElement("small");
  portInfo.className = "settings-option-info";
  portInfo.textContent = "You don't need to change the port separately in the application.";
  portInfo.dataset.i18n = "settings.port_info";

  portWrapper.append(portLabel, portInput, btnApply);
  container.appendChild(portWrapper);
  portWrapper.insertAdjacentElement("afterend", portInfo);

  // Buttons

  const buttonsWrapper = document.createElement("div");
  buttonsWrapper.className = "settings-option buttons-wrapper";

  const { debugMode: storedDebug } = await browser.storage.local.get("debugMode");
  let debugState = storedDebug ?? CONFIG.debugMode;

  const btnRestart = createBtn(i18n.t("settings.restart"), "restart");
  const btnDebug = createBtn(i18n.t(debugState ? "settings.debug.disable" : "settings.debug.enable"), "debugMode");
  const btnFactory = createBtn(i18n.t("settings.factory"), "factoryReset");
  const btnBackup = createBtn(i18n.t("settings.backup"), "backupSettings");

  if (debugState === 1) btnDebug.classList.add("active");

  // Event listeners
  btnBackup.onclick = () => openSettingsPage("backup");

  btnRestart.onclick = async () => {
    const [activeTab] = await browser.tabs.query({ active: true, currentWindow: true });
    restartExtension(activeTab);
  };

  btnDebug.onclick = async () => {
    const [activeTab] = await browser.tabs.query({ active: true, currentWindow: true });
    await toggleDebugMode(activeTab);

    const { debugMode: newStored } = await browser.storage.local.get("debugMode");
    debugState = newStored ?? CONFIG.debugMode;

    const isActive = debugState === 1;
    btnDebug.classList.toggle("active", isActive);
    btnDebug.textContent = i18n.t(isActive ? "settings.debug.disable" : "settings.debug.enable");
  };

  let factoryTimer = null;

  btnFactory.onclick = async () => {
    const [activeTab] = await browser.tabs.query({ active: true, currentWindow: true });
    const result = await factoryReset(activeTab, true);

    if (result?.needConfirm) {
      btnFactory.textContent = i18n.t("settings.factory_confirm");
      btnFactory.classList.add("active");

      clearTimeout(factoryTimer);
      factoryTimer = setTimeout(() => {
        btnFactory.textContent = i18n.t("settings.factory");
        btnFactory.classList.remove("active");
      }, 5000);
    }
  };

  buttonsWrapper.append(btnBackup, btnRestart, btnDebug, btnFactory);
  container.append(buttonsWrapper);
}
