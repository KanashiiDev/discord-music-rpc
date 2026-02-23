async function buildPortButtons(container) {
  const portWrapper = document.createElement("div");
  portWrapper.className = "settings-option port-wrapper";

  const portLabel = document.createElement("label");
  portLabel.textContent = "Port";
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
  btnApply.title = "Apply";

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

  portWrapper.append(portLabel, portInput, btnApply);
  container.appendChild(portWrapper);
  portWrapper.insertAdjacentElement("afterend", portInfo);

  // Buttons
  const { debugMode: storedDebug } = await browser.storage.local.get("debugMode");
  let debugState = storedDebug ?? CONFIG.debugMode;

  const btnRestart = createBtn("Restart Extension", "restart");
  const btnDebug = createBtn(`${debugState ? "Disable" : "Activate"} Debug Mode`, "debugMode");
  const btnFactory = createBtn("Factory Reset (Default Settings)", "factoryReset");
  const btnBackup = createBtn("Backup / Restore", "backupSettings");
  const btnFilter = createBtn("Manage Filters", "filterSettings");

  if (debugState === 1) btnDebug.classList.add("active");

  // Event listeners
  btnBackup.onclick = () => openSettingsPage("backup");
  btnFilter.onclick = () => openSettingsPage("filter");

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
    btnDebug.textContent = isActive ? "Disable Debug Mode" : "Activate Debug Mode";
  };

  let factoryTimer = null;

  btnFactory.onclick = async () => {
    const [activeTab] = await browser.tabs.query({ active: true, currentWindow: true });
    const result = await factoryReset(activeTab, true);

    if (result?.needConfirm) {
      btnFactory.textContent = "This will reset this extension. Confirm.";
      btnFactory.classList.add("active");

      clearTimeout(factoryTimer);
      factoryTimer = setTimeout(() => {
        btnFactory.textContent = "Factory Reset (Default Settings)";
        btnFactory.classList.remove("active");
      }, 5000);
    }
  };

  container.append(btnFilter, btnBackup, btnRestart, btnDebug, btnFactory);
}
