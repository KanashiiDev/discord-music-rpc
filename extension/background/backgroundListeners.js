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

const handleCleanHistoryForReplace = async (req) => {
  const entries = req.entries || [];
  const parsers = req.parsers || [];
  const parserList = req.parserList || [];

  //  Check for empty entries
  if (!entries.length) {
    return { ok: true, removedCount: 0, error: "No entries provided" };
  }

  // At least one entry must have either the artist or the title filled in
  const hasValidEntry = entries.some((e) => (e.artist && e.artist.trim() && e.artist.trim() !== "*") || (e.title && e.title.trim() && e.title.trim() !== "*"));
  if (!hasValidEntry) {
    return { ok: false, removedCount: 0, error: "At least one entry must have artist or title" };
  }

  const history = await loadHistory();
  if (!history.length) {
    return { ok: true, removedCount: 0 };
  }

  // Convert parser IDs to source names
  const sourceNames = new Set();
  const applyToAll = parsers.includes("*");

  if (!applyToAll) {
    // Error if the parser list is empty
    if (!parsers.length) {
      return { ok: false, removedCount: 0, error: "No parsers specified" };
    }

    parsers.forEach((parserId) => {
      const parser = parserList.find((p) => p.id === parserId);
      if (parser) {
        const sourceName = (parser.title || parser.domain || "").toLowerCase().trim();
        if (sourceName) {
          sourceNames.add(sourceName);
        }
      }
    });

    // Error if no source is found
    if (sourceNames.size === 0) {
      return { ok: false, removedCount: 0, error: "No valid sources found from parsers" };
    }
  }

  let hasChanges = false;
  const entriesToRemove = new Set();

  // Find the matches in history for each replace entry
  entries.forEach((entry) => {
    const artist = (entry.artist || "").trim().toLowerCase();
    const title = (entry.title || "").trim().toLowerCase();

    // Neither of them can be empty or a wildcard
    if ((!artist || artist === "*") && (!title || title === "*")) {
      return;
    }

    history.forEach((historyEntry, index) => {
      const historyArtist = (historyEntry.a || "").trim().toLowerCase();
      const historyTitle = (historyEntry.t || "").trim().toLowerCase();
      const historySource = (historyEntry.s || "").trim().toLowerCase();

      // Artist/Title match check
      const artistMatches = !artist || artist === "*" || historyArtist === artist;
      const titleMatches = !title || title === "*" || historyTitle === title;

      // At least one specific match is required
      const hasSpecificMatch = (artist && artist !== "*" && historyArtist === artist) || (title && title !== "*" && historyTitle === title);
      if (!hasSpecificMatch) {
        return;
      }

      // Source matching check
      let sourceMatches = false;
      if (applyToAll) {
        sourceMatches = true;
      } else {
        // Check if the history source matches any source in the parser list
        for (const sourceName of sourceNames) {
          // A minimum of 3 character matches is required
          if (sourceName.length >= 3 && historySource.length >= 3) {
            if (historySource.includes(sourceName) || sourceName.includes(historySource)) {
              sourceMatches = true;
              break;
            }
          }
        }
      }

      // Delete if they all match
      if (artistMatches && titleMatches && sourceMatches) {
        entriesToRemove.add(index);
        hasChanges = true;
      }
    });
  });

  if (!hasChanges) {
    return { ok: true, removedCount: 0 };
  }

  // Delete the indices backwards
  const indicesToRemove = Array.from(entriesToRemove).sort((a, b) => b - a);
  indicesToRemove.forEach((index) => {
    history.splice(index, 1);
  });

  await saveHistory(history);

  return {
    ok: true,
    removedCount: indicesToRemove.length,
    percentage: removalPercentage.toFixed(1),
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

// Type Handlers
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
  if (!isAudioPlaying) {
    // The tab is silent, but the player might be loading
    state.activeTabMap.set(tabId, {
      ...req.data,
      isAudioPlaying: false,
      lastKey: `${title}|${artist}`,
      lastUpdated: now,
      progress,
      parserId,
    });
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
  if (!req.data.watching && req.data.title !== "Unknown Song" && req.data.artist !== "Unknown Artist") {
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
      CONFIG.requestTimeout
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
    return { ok: false, error: { code: 1, message: "Another tab is currently active." } };
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
            case "cleanHistoryForReplace":
              result = await handleCleanHistoryForReplace(req);
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
        clearRpcForTab(tabId, "tab muted").catch(logError);
        tabState.isAudioPlaying = false;
        state.activeTabMap.set(tabId, tabState);
        return;
      }

      // 2) Audible control
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
        }
      } else {
        // The tab no longer active → just update the state
        if (tabState.isAudioPlaying) {
          tabState.isAudioPlaying = false;
          state.activeTabMap.set(tabId, tabState);

          logInfo(`Tab ${tabId} is not audible, will clear RPC in 5s if still silent`);
          const timer = setTimeout(async () => {
            try {
              const t = await browser.tabs.get(tabId);
              const currentState = state.activeTabMap.get(tabId);
              if (!t.audible && currentState?.isAudioPlaying === false) {
                logInfo(`Tab ${tabId} still not audible after 5s, clearing RPC`);
                clearRpcForTab(tabId, "tab not audible").catch(logError);
              } else {
                logInfo(`Tab ${tabId} became audible within 5s, keeping RPC`);
              }
            } catch (err) {
              logError(err);
            } finally {
              state.audibleTimers.delete(tabId);
            }
          }, 5000);

          state.audibleTimers.set(tabId, timer);
        }
      }

      // 3) URL change check
      if (!oldUrl && newUrl) {
        state.tabUrlMap.set(tabId, newUrl);
        return;
      }

      if (changeInfo.url && oldUrl) {
        const oldHost = new URL(oldUrl).host;
        const newHost = new URL(changeInfo.url).host;

        if (oldHost !== newHost) {
          logInfo(`Tab ${tabId} domain changed, clearing RPC`);
          clearRpcForTab(tabId, "domain changed").catch(logError);
        } else {
          logInfo(`Tab ${tabId} SPA navigation detected, keeping RPC`);
        }
      }

      // 4) Page reload control
      if (changeInfo.status === "loading" && oldUrl) {
        const currentHost = new URL(oldUrl).host;
        const tabHost = new URL(tab.url || oldUrl).host;

        if (currentHost !== tabHost) {
          logInfo(`Tab ${tabId} page reloaded on new domain, clearing RPC`);
          clearRpcForTab(tabId, "page reloaded").catch(logError);
        } else {
          logInfo(`Tab ${tabId} page loading (SPA soft reload), keeping RPC`);
        }
      }
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
