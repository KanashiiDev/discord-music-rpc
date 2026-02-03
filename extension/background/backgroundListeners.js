// UserScript Actions
const handleListUserScripts = async () => {
  const scripts = await scriptManager.storage.getScripts();
  const { parserEnabledState = {} } = await browser.storage.local.get("parserEnabledState");
  const scriptsWithStatus = scripts.map((script) => ({
    ...script,
    enabled: parserEnabledState[`enable_${script.id}`] !== false,
  }));

  return { ok: true, list: scriptsWithStatus };
};

const handleSaveUserScript = async (req) => {
  const scriptData = req.script;
  const previousId = req.previousId;
  const scriptsList = await scriptManager.storage.getScripts();

  // If id exists
  if (previousId) {
    const prevIndex = scriptsList.findIndex((s) => s.id === previousId);
    if (prevIndex >= 0) {
      await scriptManager.unregisterUserScript(scriptsList[prevIndex]);

      // Transfer old settings
      const { parserSettings = {}, parserEnabledState = {} } = await browser.storage.local.get(["parserSettings", "parserEnabledState"]);

      const enableSettings = parserEnabledState[`enable_${previousId}`] !== false;
      const oldSettings = {
        [`enable_${previousId}`]: enableSettings,
        [`settings_${previousId}`]: parserSettings[`settings_${previousId}`],
      };

      scriptsList.splice(prevIndex, 1);
      await scriptManager.storage.saveScripts(scriptsList);

      scriptData.id = scriptManager.generateScriptId(scriptData.domain, scriptData.urlPatterns);
      scriptData._oldSettings = oldSettings;
    }
  } else {
    scriptData.id = scriptManager.generateScriptId(scriptData.domain, scriptData.urlPatterns);
  }

  // Normalize URL patterns
  scriptData.urlPatterns = scriptData.urlPatterns ? PatternValidator.normalizePatterns(scriptData.urlPatterns) : ["/.*/"];

  // Saving Script
  const newIndex = scriptsList.findIndex((s) => s.id === scriptData.id);
  const newScript = {
    ...scriptData,
    lastUpdated: Date.now(),
  };

  delete newScript._oldSettings;

  if (newIndex >= 0) {
    await scriptManager.unregisterUserScript(scriptsList[newIndex]);
    scriptsList[newIndex] = newScript;
  } else {
    newScript.created = Date.now();
    scriptsList.push(newScript);
  }

  await scriptManager.storage.saveScripts(scriptsList);

  // Enable Settings
  const { parserEnabledState = {} } = await browser.storage.local.get("parserEnabledState");
  const isEnabled = parserEnabledState[`enable_${scriptData.id}`] !== false;

  // Transfer old settings
  if (scriptData._oldSettings) {
    const { _oldSettings } = scriptData;

    // Enable flag
    if (_oldSettings[`enable_${previousId}`] !== undefined) {
      const { parserEnabledState = {} } = await browser.storage.local.get("parserEnabledState");
      parserEnabledState[`enable_${scriptData.id}`] = _oldSettings[`enable_${previousId}`];
      await browser.storage.local.set({ parserEnabledState });
    }

    // Parser settings
    if (_oldSettings[`settings_${previousId}`]) {
      const { parserSettings = {} } = await browser.storage.local.get("parserSettings");
      parserSettings[`settings_${scriptData.id}`] = _oldSettings[`settings_${previousId}`];
      await browser.storage.local.set({ parserSettings });
    }

    delete scriptData._oldSettings;
  }

  // Register / Unregister
  try {
    let isRegistered = false;
    if (isEnabled) {
      const registerResult = await scriptManager.registerUserScript(scriptData);
      isRegistered = registerResult?.ok && !registerResult.skipped;
    } else {
      await scriptManager.unregisterUserScript(scriptData);
    }

    //  Save current status
    const updatedList = await scriptManager.storage.getScripts();
    const updatedScript = updatedList.find((s) => s.id === scriptData.id);
    if (updatedScript) {
      updatedScript.registered = isRegistered;
      await scriptManager.storage.saveScripts(updatedList);
    }

    scriptData.registered = isRegistered;
    return { ok: true, script: scriptData };
  } catch (err) {
    logError("Error during register/unregister after save:", err);
    return { ok: false, error: err.message };
  }
};

const handleDeleteUserScript = async (req) => {
  const scriptsList = await scriptManager.storage.getScripts();
  const deleteIndex = scriptsList.findIndex((s) => s.id === req.id);

  if (deleteIndex === -1) {
    return { ok: false, error: "Script not found" };
  }

  // Unregister
  await scriptManager.unregisterUserScript(scriptsList[deleteIndex]);

  // Clear browser storage
  const parserList = (await browser.storage.local.get("parserList")).parserList || [];
  const filteredParserList = parserList.filter((p) => !(p.domain === scriptsList[deleteIndex].domain && p.title === scriptsList[deleteIndex].title));
  await browser.storage.local.set({ parserList: filteredParserList });

  // Remove enable flag
  const { parserEnabledState = {} } = await browser.storage.local.get("parserEnabledState");
  const enableKey = `enable_${scriptsList[deleteIndex].id}`;
  delete parserEnabledState[enableKey];
  await browser.storage.local.set({ parserEnabledState });

  // Remove settings from parserSettings
  const { parserSettings = {} } = await browser.storage.local.get("parserSettings");
  const settingsKey = `settings_${scriptsList[deleteIndex].id}`;

  if (settingsKey in parserSettings) {
    delete parserSettings[settingsKey];
    await browser.storage.local.set({ parserSettings });
  }

  // Delete from the list
  scriptsList.splice(deleteIndex, 1);
  await scriptManager.storage.saveScripts(scriptsList);

  return { ok: true };
};

const handleRegisterUserScript = async (req) => {
  const scriptsList = await scriptManager.storage.getScripts();
  const scriptToRegister = scriptsList.find((s) => s.id === req.id);

  if (!scriptToRegister) {
    return { ok: false, error: "Script not found" };
  }

  const registerResult = await scriptManager.registerUserScript(scriptToRegister);

  if (!registerResult.ok) {
    return { ok: false, error: registerResult.error };
  }

  // Update registration status
  scriptToRegister.registered = !registerResult.skipped;
  await scriptManager.storage.saveScripts(scriptsList);

  return {
    ok: true,
    registered: !registerResult.skipped,
    registrationId: scriptToRegister.id,
  };
};

const handleUnregisterUserScript = async (req) => {
  const scriptsList = await scriptManager.storage.getScripts();
  const scriptToUnregister = scriptsList.find((s) => s.id === req.id);

  if (!scriptToUnregister) {
    return { ok: false, error: "Script not found" };
  }

  const unregisterResult = await scriptManager.unregisterUserScript(scriptToUnregister);

  if (!unregisterResult.ok) {
    return { ok: false, error: unregisterResult.error };
  }

  scriptToUnregister.registered = false;
  await scriptManager.storage.saveScripts(scriptsList);

  return { ok: true };
};

const handleToggleUserScript = async (req) => {
  const { parserEnabledState = {} } = await browser.storage.local.get("parserEnabledState");
  const enableKey = `enable_${req.id}`;
  const isEnabled = parserEnabledState[enableKey] !== false;
  const newEnabledState = req.enabled !== undefined ? req.enabled : !isEnabled;

  parserEnabledState[enableKey] = newEnabledState;
  await browser.storage.local.set({ parserEnabledState });

  const scriptsList = await scriptManager.storage.getScripts();
  const script = scriptsList.find((s) => s.id === req.id);

  if (script) {
    if (newEnabledState) {
      const result = await scriptManager.registerUserScript(script);
      script.registered = result.ok && !result.skipped;
    } else {
      await scriptManager.unregisterUserScript(script, true);
      script.registered = false;
    }

    await scriptManager.storage.saveScripts(scriptsList);
  }

  return { ok: true, enabled: newEnabledState };
};

// History Actions
const handleAddToHistory = async (req) => {
  await addToHistory(req.data);
  return { ok: true };
};

const handleLoadHistory = async () => {
  const history = await historyData();
  return { ok: true, data: history };
};

const handleSaveHistory = async (req) => {
  await saveHistory(req.data);
  return { ok: true };
};

const handleMigrateHistory = async () => {
  await migrateOldHistory();
  return { ok: true };
};

const handleFilterHistoryReplace = async (request) => {
  const action = request.mode || "update";
  const entries = Array.isArray(request.entries) ? request.entries : [];
  const parsers = Array.isArray(request.parsers) ? request.parsers : [];
  const parserList = Array.isArray(request.parserList) ? request.parserList : [];

  //  Check for empty entries
  if (!entries.length) {
    return { ok: true, count: 0, message: "No entries provided" };
  }

  // At least one entry must have either the artist or the title filled in
  const hasValidEntry = entries.some((e) => (typeof e.artist === "string" && e.artist.trim() && e.artist.trim() !== "*") || (typeof e.title === "string" && e.title.trim() && e.title.trim() !== "*"));
  if (!hasValidEntry) {
    return { ok: false, count: 0, error: "At least one entry must have artist or title" };
  }

  // Load current history entries
  let history;
  try {
    history = await loadHistory();
  } catch (err) {
    return { ok: false, count: 0, error: "Failed to load history: " + err.message };
  }

  if (!Array.isArray(history) || history.length === 0) {
    return { ok: true, count: 0, message: "History is empty" };
  }

  // Convert parser IDs to source names
  const sourceNames = new Set();
  const applyToAll = parsers.includes("*");

  if (!applyToAll) {
    // Error if the parser list is empty
    if (!parsers.length) return { ok: false, count: 0, error: "No parsers specified" };

    parsers.forEach((id) => {
      const parser = parserList.find((p) => p.id === id);
      if (parser) {
        const name = (parser.title || parser.domain || "").toLowerCase().trim();
        if (name) sourceNames.add(name);
      }
    });

    // Error if no source is found
    if (sourceNames.size === 0) return { ok: false, count: 0, error: "No valid sources found" };
  }

  let changeCount = 0;
  const indicesToRemove = new Set();

  // Find the matches in history for each replace entry
  entries.forEach((entry) => {
    const origA = typeof entry.artist === "string" ? entry.artist.trim().toLowerCase() : "";
    const origT = typeof entry.title === "string" ? entry.title.trim().toLowerCase() : "";
    const newA = typeof entry.replaceArtist === "string" ? entry.replaceArtist.trim() : "";
    const newT = typeof entry.replaceTitle === "string" ? entry.replaceTitle.trim() : "";

    if (action === "update" && !newA && !newT) {
      return;
    }
    if (action === "revert" && !origA && !origT) {
      return;
    }
    if (!origA && !origT) {
      return;
    }

    history.forEach((record, idx) => {
      const histA = typeof record.a === "string" ? record.a.trim().toLowerCase() : "";
      const histT = typeof record.t === "string" ? record.t.trim().toLowerCase() : "";
      const histS = typeof record.s === "string" ? record.s.trim().toLowerCase() : "";

      let hasConcreteMatch = false;

      if (action === "revert") {
        const replaceA = newA.toLowerCase();
        const replaceT = newT.toLowerCase();

        const hasA = replaceA && replaceA !== "*";
        const hasT = replaceT && replaceT !== "*";

        if (hasA && hasT) {
          hasConcreteMatch = histA === replaceA && histT === replaceT;
        } else if (hasA) {
          hasConcreteMatch = histA === replaceA;
        } else if (hasT) {
          hasConcreteMatch = histT === replaceT;
        } else {
          hasConcreteMatch = false;
        }
      } else {
        const hasOrigA = origA && origA !== "*";
        const hasOrigT = origT && origT !== "*";

        if (hasOrigA && hasOrigT) {
          hasConcreteMatch = histA === origA && histT === origT;
        } else if (hasOrigA) {
          hasConcreteMatch = histA === origA;
        } else if (hasOrigT) {
          hasConcreteMatch = histT === origT;
        }
      }

      if (!hasConcreteMatch) return;

      // Source matching check
      let sourceOk = applyToAll;
      if (!applyToAll) {
        for (const s of sourceNames) {
          if (s.length >= 3 && histS.length >= 3 && (histS.includes(s) || s.includes(histS))) {
            sourceOk = true;
            break;
          }
        }
      }
      if (!sourceOk) return;

      if (action === "update") {
        let changed = false;
        if (newA && newA !== record.a) {
          record.a = newA;
          changed = true;
        }
        if (newT && newT !== record.t) {
          record.t = newT;
          changed = true;
        }
        if (changed) changeCount++;
      } else if (action === "revert") {
        let changed = false;
        // Revert to original values
        if (origA && origA !== record.a.toLowerCase()) {
          record.a = entry.artist.trim();
          changed = true;
        }
        if (origT && origT !== record.t.toLowerCase()) {
          record.t = entry.title.trim();
          changed = true;
        }
        if (changed) changeCount++;
      } else if (action === "clean") {
        indicesToRemove.add(idx);
        changeCount++;
      }
    });
  });

  if (changeCount > 0) {
    if (action === "clean") {
      Array.from(indicesToRemove)
        .sort((a, b) => b - a)
        .forEach((i) => history.splice(i, 1));
    }

    try {
      await saveHistory(history);
    } catch (err) {
      return { ok: false, count: 0, error: "Failed to save history: " + err.message };
    }
  }

  return {
    ok: true,
    count: changeCount,
    message:
      changeCount > 0
        ? action === "update"
          ? `${changeCount} record(s) updated`
          : action === "revert"
            ? `${changeCount} record(s) reverted`
            : `${changeCount} record(s) removed`
        : `No matching records found to ${action}`,
  };
};

// Song Info
const handleGetSongInfo = async () => {
  const map = state.activeTabMap;
  if (map.size === 0) {
    return { ok: false, error: "No active tab map or it's empty" };
  }

  // Iterate over the Map to find the current song
  for (const [key, value] of map.entries()) {
    const current = value;
    if (current && current.title && current.artist) {
      return { ok: true, data: current };
    }
  }

  return { ok: false, error: "No current song" };
};

// Update RPC
const handleUpdateRpc = async (req, sender) => {
  const tab = await getSenderTab(sender);
  if (!tab) {
    logWarn("No tab info from sender, skipping:", req);
    return { ok: false, error: "No tab info" };
  }

  const tabId = tab.id;
  // Get the tab info
  await delay(1000); // Delay to allow audible info to be ready
  let tabInfo;
  try {
    tabInfo = await browser.tabs.get(tabId);
  } catch {
    return { ok: false, error: "Tab not found" };
  }

  const now = Date.now();
  const { title, artist, progress, duration } = req.data;
  const current = state.activeTabMap.get(tabId) || {};
  let parserId = current.parserId;

  // Match the parser via the tab URL
  if (tabInfo.url) {
    try {
      const url = new URL(tabInfo.url);
      const hostname = normalizeHost(url.hostname);

      const exactMatch = state.parserList.find((p) => {
        try {
          return isDomainMatch(p.domain, hostname);
        } catch {
          return false;
        }
      });

      if (exactMatch) parserId = exactMatch.id;
    } catch {}
  }

  // 1️) Audible check
  const isAudioPlaying = tabInfo.audible ?? false;
  if (isAudioPlaying) {
    if (state.audibleTimers.has(tabId)) {
      clearTimeout(state.audibleTimers.get(tabId));
      state.audibleTimers.delete(tabId);
      logInfo(`Tab ${tabId} resumed audio in UPDATE_RPC, timer cancelled`);
    }
  }

  if (!isAudioPlaying) {
    // The tab is silent, but the player might be loading
    if (!state.activeTabMap.has(tabId)) {
      logInfo(`Tab ${tabId} UPDATE_RPC received but not audible and not in map, rejecting`);
      return { ok: false, waiting: true };
    }

    state.activeTabMap.set(tabId, {
      ...req.data,
      isAudioPlaying: false,
      lastKey: `${title}|${artist}`,
      lastUpdated: now,
      progress,
      parserId,
    });
    logInfo(`Tab ${tabId} UPDATE_RPC received but not audible`);
    return { ok: true, waiting: true };
  }

  // 2️) Update state
  state.activeTabMap.set(tabId, {
    ...req.data,
    isAudioPlaying: true,
    lastKey: `${title}|${artist}`,
    lastUpdated: now,
    progress,
    parserId,
  });

  // 3) RPC update
  scheduleRpcUpdate(req.data, tabId)?.catch((err) => logError("RPC schedule failed", err));

  // 4️) Add History
  if (req.data.mode !== "watch" && req.data.title !== "Unknown Song" && req.data.artist !== "Unknown Artist" && req.data.artist !== "-1") {
    scheduleHistoryAdd(tabId, {
      title: req.data.title,
      artist: req.data.artist,
      image: req.data.image,
      source: req.data.source || "",
      songUrl: req.data.songUrl || "",
    });
  }

  return { ok: true };
};

const handleUpdateRpcPort = async (req) => {
  try {
    const response = await fetchWithTimeout(
      `http://localhost:${state.serverPort}/update-port`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(req.data),
      },
      CONFIG.requestTimeout,
    );

    return { success: true, port: req.data.port };
  } catch (err) {
    console.error("Update port error:", err);
    return { success: false, error: err.message };
  }
};

const handleClearRpc = async (sender) => {
  const tab = await getSenderTab(sender);
  if (!tab) {
    logWarn("No tab info from sender, skipping");
    return { ok: false, error: "No tab info" };
  }

  await clearRpcForTab(tab.id, "CLEAR_RPC triggered");
  return { ok: true };
};

const handleIsRpcConnected = async () => {
  try {
    const res = await fetchWithTimeout(`http://localhost:${state.serverPort}/health`, {}, CONFIG.requestTimeout);

    if (!res) {
      return { ok: false, reason: "No response from RPC server" };
    }

    if (!res.ok) {
      return { ok: false, reason: `HTTP ${res.status}` };
    }

    const data = await res.json();
    return { ok: !!data.rpcConnected };
  } catch (err) {
    return { ok: false, reason: err.message || "Unknown error" };
  }
};

const handleIsHostnameMatch = async (sender) => {
  const tab = await getSenderTab(sender);
  if (!tab) {
    return { ok: false, error: { code: 0, message: "No tab info" } };
  }

  const tabId = tab.id;
  let tabInfo;
  try {
    tabInfo = await browser.tabs.get(tabId);
  } catch {
    return { ok: false, error: { code: 0, message: "No tab info" } };
  }

  if (!tabInfo.url || tabInfo.url.length === 0) {
    return { ok: false, error: { code: 0, message: "No tab info" } };
  }

  let url;
  try {
    url = new URL(tabInfo.url);
  } catch (e) {
    return { ok: false, error: { code: 0, message: "No tab info" } };
  }

  if (state.activeTabMap.size > 0 && !state.activeTabMap.has(tabId)) {
    for (const [activeTabId, tabData] of state.activeTabMap.entries()) {
      if (tabData.isAudioPlaying) {
        try {
          const activeTab = await browser.tabs.get(activeTabId);
          if (activeTab.audible) {
            return {
              ok: false,
              error: {
                code: 1,
                message: `⏸️ Another tab (${activeTabId}${tabData?.source ? " | " + tabData.source : ""}) is currently playing audio.`,
              },
            };
          } else {
            logInfo(`Tab ${activeTabId} in map but not audible, updating state`);
            tabData.isAudioPlaying = false;
            state.activeTabMap.set(activeTabId, tabData);
          }
        } catch (err) {
          logInfo(`Tab ${activeTabId} not found, removing from map`);
          state.activeTabMap.delete(activeTabId);
        }
      }
    }
  }
  const allowed = await isAllowedDomain(url.hostname, url.pathname);
  return { ok: allowed.ok, match: allowed.match, error: allowed.error };
};

// Main Setup Function
const setupListeners = () => {
  browser.runtime.onMessage.addListener((req, sender, sendResponse) => {
    (async () => {
      try {
        // Handle action-based requests
        if (req.action) {
          let result;

          switch (req.action) {
            case "listUserScripts":
              result = await handleListUserScripts();
              break;
            case "saveUserScript":
              result = await handleSaveUserScript(req);
              break;
            case "deleteUserScript":
              result = await handleDeleteUserScript(req);
              break;
            case "registerUserScript":
              result = await handleRegisterUserScript(req);
              break;
            case "unregisterUserScript":
              result = await handleUnregisterUserScript(req);
              break;
            case "toggleUserScript":
              result = await handleToggleUserScript(req);
              break;
            case "addToHistory":
              result = await handleAddToHistory(req);
              break;
            case "loadHistory":
              result = await handleLoadHistory();
              break;
            case "saveHistory":
              result = await handleSaveHistory(req);
              break;
            case "migrateHistory":
              result = await handleMigrateHistory();
              break;
            case "filterHistoryReplace":
              result = await handleFilterHistoryReplace(req);
              break;
            case "getSongInfo":
              result = await handleGetSongInfo();
              break;
            default:
              result = { ok: false, error: "Unknown action" };
          }

          sendResponse(result);
          return;
        }

        // Handle type-based requests
        if (req.type) {
          let result;

          switch (req.type) {
            case "UPDATE_RPC":
              result = await handleUpdateRpc(req, sender);
              break;
            case "CLEAR_RPC":
              result = await handleClearRpc(sender);
              break;
            case "IS_RPC_CONNECTED":
              result = await handleIsRpcConnected();
              break;
            case "IS_HOSTNAME_MATCH":
              result = await handleIsHostnameMatch(sender);
              break;
            case "UPDATE_RPC_PORT":
              result = await handleUpdateRpcPort(req);
              break;
            default:
              result = { ok: false, error: "Unknown message type" };
          }

          sendResponse(result);
          return;
        }

        // If neither action nor type is present
        sendResponse({ ok: false, error: "No action or type specified" });
      } catch (err) {
        logError("Unified message handler error:", err);
        sendResponse({ ok: false, error: err.message });
      }
    })();

    return true;
  });

  // update the local storage when the data changes
  browser.storage.onChanged.addListener((changes, area) => {
    if (area !== "local") return;

    for (const [key, change] of Object.entries(changes)) {
      // Update parser enabled cache
      if (key === "parserEnabledState") {
        const enabledState = change.newValue || {};

        for (const [enableKey, isEnabled] of Object.entries(enabledState)) {
          const parserId = enableKey.startsWith("enable_");
          state.parserEnabledCache.set(parserId, isEnabled !== false);
        }
      }
      // If the parser list or settings have changed, reload
      if (key === "parserList" || key === "userParserSelectors" || key === "userScriptsList" || key === "parserSettings" || key === "parserEnabledState") {
        if (state.parserReloadDebounce) {
          clearTimeout(state.parserReloadDebounce);
        }

        state.parserReloadDebounce = setTimeout(() => {
          parserListMutex(async () => {
            state.parserListLoaded = false;
            await loadParserList();
          }).catch(logError);
        }, 200);
      }
    }
  });

  // onRemoved
  browser.tabs.onRemoved.addListener((tabId) => {
    if (typeof tabId !== "number" || tabId <= 0) return;

    // Cancel pending network operations
    const controller = state.pendingFetches.get(tabId);
    if (controller) controller.abort();
    state.pendingFetches.delete(tabId);

    // Clear RPC
    clearRpcForTab(tabId, "tab removed").catch(logError);

    // Clean URL cache
    state.tabUrlMap.delete(tabId);
  });

  // onUpdated
  browser.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    const tabState = state.activeTabMap.get(tabId);
    if (!tabState) return;

    const oldUrl = state.tabUrlMap.get(tabId);
    const newUrl = changeInfo.url || oldUrl;

    try {
      // 1) Tab muted check
      if (changeInfo.mutedInfo?.muted === true) {
        logInfo(`Tab ${tabId} muted, clearing RPC`);

        if (state.audibleTimers.has(tabId)) {
          clearTimeout(state.audibleTimers.get(tabId));
          state.audibleTimers.delete(tabId);
        }

        clearRpcForTab(tabId, "tab muted").catch(logError);
        tabState.isAudioPlaying = false;
        state.activeTabMap.set(tabId, tabState);
        return;
      }

      // 2) Domain change control
      let shouldClearImmediately = false;

      if (changeInfo.url && oldUrl) {
        try {
          const oldHost = new URL(oldUrl).host;
          const newHost = new URL(changeInfo.url).host;

          if (oldHost !== newHost) {
            shouldClearImmediately = true;
            logInfo(`Tab ${tabId} domain changed: ${oldHost} → ${newHost}, clearing RPC immediately`);
          }
        } catch (err) {
          logError("Domain comparison error:", err);
        }
      }

      // 3) Page reload control
      if (!shouldClearImmediately && changeInfo.status === "loading" && oldUrl) {
        try {
          const currentHost = new URL(oldUrl).host;
          const tabHost = new URL(tab.url || oldUrl).host;

          if (currentHost !== tabHost) {
            shouldClearImmediately = true;
            logInfo(`Tab ${tabId} page reloaded on different domain, clearing RPC immediately`);
          }
        } catch (err) {
          logError("Page reload check error:", err);
        }
      }

      // If the domain has changed, clear it immediately
      if (shouldClearImmediately) {
        if (state.audibleTimers.has(tabId)) {
          clearTimeout(state.audibleTimers.get(tabId));
          state.audibleTimers.delete(tabId);
        }

        clearRpcForTab(tabId, "domain/navigation changed").catch(logError);
        state.activeTabMap.delete(tabId);
        state.tabUrlMap.set(tabId, newUrl);
        return;
      }

      // 4) Audible check
      const isCurrentlyAudible = tab.audible ?? false;

      if (isCurrentlyAudible) {
        if (!tabState.isAudioPlaying) {
          tabState.isAudioPlaying = true;
          state.activeTabMap.set(tabId, tabState);
          logInfo(`Tab ${tabId} became audible, state updated`);
        }

        // If there is an audible timer, cancel it
        if (state.audibleTimers.has(tabId)) {
          clearTimeout(state.audibleTimers.get(tabId));
          state.audibleTimers.delete(tabId);
          logInfo(`Tab ${tabId} audible resumed, cleanup timer cancelled`);
        }
      } else {
        // The tab no longer active → just update the state
        if (tabState.isAudioPlaying) {
          tabState.isAudioPlaying = false;
          state.activeTabMap.set(tabId, tabState);
          logInfo(`Tab ${tabId} lost audio, will clear RPC in 5s if not recovered`);

          // Only start a new timer if there isn't one already
          if (!state.audibleTimers.has(tabId)) {
            const timer = setTimeout(async () => {
              try {
                const t = await browser.tabs.get(tabId);
                const currentState = state.activeTabMap.get(tabId);
                if (!t.audible && currentState?.isAudioPlaying === false) {
                  logInfo(`Tab ${tabId} still not audible after 5s, clearing RPC`);
                  await clearRpcForTab(tabId, "audio stopped for 5+ seconds");
                  state.activeTabMap.delete(tabId);
                } else {
                  logInfo(`Tab ${tabId} recovered audio within 5s, keeping RPC active`);
                }
              } catch (err) {
                logInfo(`Tab ${tabId} not found during cleanup timer, removing from map`);
                state.activeTabMap.delete(tabId);
              } finally {
                state.audibleTimers.delete(tabId);
              }
            }, 5000);

            state.audibleTimers.set(tabId, timer);
            logInfo(`Tab ${tabId} cleanup timer started (5s)`);
          }
        }
      }
    } catch (err) {
      logError(`Tab ${tabId} onUpdated error:`, err);
    } finally {
      if (newUrl) state.tabUrlMap.set(tabId, newUrl);
    }
  });

  // onSuspend
  browser.runtime.onSuspend.addListener(async () => {
    const allTabs = Array.from(state.activeTabMap.keys());
    for (const tabId of allTabs) {
      const controller = state.pendingFetches.get(tabId);
      if (controller) controller.abort();
      await cleanupRpcForTab(tabId);
    }
    state.activeTabMap.clear();
    state.pendingFetches.clear();
  });

  // Context Menu
  const manifestVersion = browser.runtime.getManifest().manifest_version;
  const contextType = manifestVersion === 3 ? "action" : "browser_action";

  // Create Menu
  try {
    browser.contextMenus.removeAll().finally(() => {
      // Restart Extension
      browser.contextMenus.create({
        id: "reloadExtension",
        title: "Restart the extension (Page Reload Required)",
        contexts: [contextType],
      });

      // Toggle Debug Mode
      browser.contextMenus.create({
        id: "toggleDebugMode",
        title: "Toggle Debug Mode (Check Developer Console)",
        contexts: [contextType],
      });

      // Reset to Defaults
      browser.contextMenus.create({
        id: "factoryReset",
        title: "Reset to Defaults (Click > Open Menu Again > Confirm)",
        contexts: [contextType],
      });
    });
  } catch (err) {}

  // Handle click on menu
  browser.contextMenus.onClicked.addListener(async (info, tab) => {
    // Restart Extension Action
    if (info.menuItemId === "reloadExtension") {
      restartExtension(tab);
    }

    // Toggle Debug Mode Action
    if (info.menuItemId === "toggleDebugMode") {
      toggleDebugMode(tab);
    }

    // Reset to Defaults Action
    if (info.menuItemId === "factoryReset") {
      factoryReset(tab);
    }
  });
};
