const setupListeners = () => {
  browser.runtime.onMessage.addListener((req, sender, sendResponse) => {
    (async () => {
      try {
        if (req.action) {
          // List all scripts
          if (req.action === "listUserScripts") {
            const scripts = await scriptManager.storage.getScripts();
            const settings = await scriptManager.storage.getScriptSettings();

            // Add enabled status to each script
            const scriptsWithStatus = scripts.map((script) => ({
              ...script,
              enabled: settings[`enable_${script.id}`] !== false,
            }));

            sendResponse({ ok: true, list: scriptsWithStatus });
            return;
          }

          // -- Save UserScript --
          if (req.action === "saveUserScript") {
            const scriptData = req.script;
            const previousId = req.previousId;
            const scriptsList = await scriptManager.storage.getScripts();

            // If id exists
            if (previousId) {
              const prevIndex = scriptsList.findIndex((s) => s.id === previousId);
              if (prevIndex >= 0) {
                await scriptManager.unregisterUserScript(scriptsList[prevIndex]);
                const oldSettings = await browser.storage.local.get([`enable_${previousId}`, `settings_${previousId}`]);

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
            const settings = await scriptManager.storage.getScriptSettings();
            const enableKey = `enable_${scriptData.id}`;
            const isEnabled = settings[enableKey] !== false;

            // If not, it is active by default
            if (!(enableKey in settings)) {
              await browser.storage.local.set({ [enableKey]: true });
            }

            // Transfer old settings
            if (scriptData._oldSettings) {
              const { _oldSettings } = scriptData;
              if (_oldSettings[`enable_${previousId}`] !== undefined) {
                await browser.storage.local.set({
                  [`enable_${scriptData.id}`]: _oldSettings[`enable_${previousId}`],
                });
              }
              if (_oldSettings[`settings_${previousId}`]) {
                await browser.storage.local.set({
                  [`settings_${scriptData.id}`]: _oldSettings[`settings_${previousId}`],
                });
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
              sendResponse({ ok: true, script: scriptData });
            } catch (err) {
              logError("Error during register/unregister after save:", err);
              sendResponse({ ok: false, error: err.message });
            }

            return;
          }

          // -- Delete userScript --
          if (req.action === "deleteUserScript") {
            const scriptsList = await scriptManager.storage.getScripts();
            const deleteIndex = scriptsList.findIndex((s) => s.id === req.id);

            if (deleteIndex === -1) {
              sendResponse({ ok: false, error: "Script not found" });
              return;
            }

            // Unregister
            await scriptManager.unregisterUserScript(scriptsList[deleteIndex]);

            // Clear browser storage
            const parserList = (await browser.storage.local.get("parserList")).parserList || [];
            const filteredParserList = parserList.filter((p) => !(p.domain === scriptsList[deleteIndex].domain && p.title === scriptsList[deleteIndex].title));
            await browser.storage.local.set({ parserList: filteredParserList });

            await browser.storage.local.remove(`enable_${scriptsList[deleteIndex].id}`);
            await browser.storage.local.remove(`settings_${scriptsList[deleteIndex].id}`);

            // Delete from the list
            scriptsList.splice(deleteIndex, 1);
            await scriptManager.storage.saveScripts(scriptsList);

            sendResponse({ ok: true });
            return;
          }

          // -- Register single userScript --
          if (req.action === "registerUserScript") {
            const scriptsList = await scriptManager.storage.getScripts();
            const scriptToRegister = scriptsList.find((s) => s.id === req.id);

            if (!scriptToRegister) {
              sendResponse({ ok: false, error: "Script not found" });
              return;
            }

            const registerResult = await scriptManager.registerUserScript(scriptToRegister);

            if (!registerResult.ok) {
              sendResponse({ ok: false, error: registerResult.error });
              return;
            }

            // Update registration status
            scriptToRegister.registered = !registerResult.skipped;
            await scriptManager.storage.saveScripts(scriptsList);

            sendResponse({
              ok: true,
              registered: !registerResult.skipped,
              registrationId: scriptToRegister.id,
            });
            return;
          }

          // -- Unregister Single userScript --
          if (req.action === "unregisterUserScript") {
            const scriptsList = await scriptManager.storage.getScripts();
            const scriptToUnregister = scriptsList.find((s) => s.id === req.id);

            if (!scriptToUnregister) {
              sendResponse({ ok: false, error: "Script not found" });
              return;
            }

            const unregisterResult = await scriptManager.unregisterUserScript(scriptToUnregister);

            if (!unregisterResult.ok) {
              sendResponse({ ok: false, error: unregisterResult.error });
              return;
            }

            scriptToUnregister.registered = false;
            await scriptManager.storage.saveScripts(scriptsList);

            sendResponse({ ok: true });
            return;
          }

          // -- Toggle userScript enable/disable --
          if (req.action === "toggleUserScript") {
            const settings = await scriptManager.storage.getScriptSettings();
            const newEnabledState = req.enabled !== undefined ? req.enabled : !settings[`enable_${req.id}`];

            // Save the enable status
            await browser.storage.local.set({
              [`enable_${req.id}`]: newEnabledState,
            });

            const scriptsList = await scriptManager.storage.getScripts();
            const script = scriptsList.find((s) => s.id === req.id);

            if (script) {
              if (newEnabledState) {
                const result = await scriptManager.registerUserScript(script);
                script.registered = result.ok && !result.skipped;
              } else {
                await scriptManager.unregisterUserScript(script);
                script.registered = false;
              }

              await scriptManager.storage.saveScripts(scriptsList);
            }

            sendResponse({ ok: true, enabled: newEnabledState });
            return;
          }

          // -- History --
          if (req.action === "addToHistory") {
            await addToHistory(req.data).then(() => {
              sendResponse({ ok: true });
            });
            return true;
          }

          if (req.action === "loadHistory") {
            historyData().then((history) => {
              sendResponse({ ok: true, data: history });
            });
            return true;
          }

          if (req.action === "saveHistory") {
            await saveHistory(req.data).then(() => {
              sendResponse({ ok: true });
            });
            return true;
          }

          if (req.action === "migrateHistory") {
            await migrateOldHistory().then(() => {
              sendResponse({ ok: true });
            });
            return true;
          }
        }

        const tab = await getSenderTab(sender);
        if (!tab) {
          logWarn("No tab info from sender, skipping:", req);
          sendResponse({ ok: false, error: "No tab info" });
          return;
        }

        const tabId = tab.id;

        // -- RPC Updates --
        if (req.type === "UPDATE_RPC") {
          let tabInfo;
          try {
            tabInfo = await browser.tabs.get(tabId);
          } catch {
            sendResponse({ ok: false, error: "Tab not found" });
            return;
          }

          if (!tabInfo.audible) {
            const current = state.activeTabMap.get(tabId);
            if (!current || current.isAudioPlaying === false) {
              sendResponse({ ok: false, error: "Tab is not audible." });
              return;
            }
            await clearRpcForTab(tabId);
            sendResponse({ ok: false, error: "Tab is not audible." });
            return;
          }

          const now = Date.now();
          const { title, artist, progress, duration } = req.data;
          const key = `${title}|${artist}|true|${Math.floor(progress / 10)}|${duration}`;
          const current = state.activeTabMap.get(tabId) || {};

          if (current.lastKey === key && now - current.lastUpdated < CONFIG.activeInterval && duration > 0 && progress > 0) {
            sendResponse({ ok: true });
            return;
          }

          markOtherTabsForCleanup(tabId);
          await deferredCleanup();

          let parserId = current.parserId;
          if (tabInfo.url) {
            try {
              const url = new URL(tabInfo.url);
              const hostname = normalizeHost(url.hostname);
              const exactMatch = state.parserList.find((p) => {
                try {
                  return isDomainMatch(p.domain, hostname);
                } catch (e) {
                  logError("Domain match error:", e);
                  return false;
                }
              });

              if (exactMatch) {
                parserId = exactMatch.id;
                if (parserId !== current.parserId) {
                  logInfo(`Using parser match: ${hostname} -> ${parserId}`);
                }
              }
            } catch (e) {
              logError("Error parsing URL:", e);
            }
          }

          state.activeTabMap.set(tabId, {
            ...req.data,
            isAudioPlaying: true,
            lastKey: key,
            lastUpdated: now,
            parserId,
          });

          scheduleRpcUpdate(req.data, tabId);
          if (!req.data.watching) {
            scheduleHistoryAdd(tabId, {
              image: req.data.image,
              title: req.data.title,
              artist: req.data.artist,
              source: req.data?.source || (tabInfo.url ? new URL(tabInfo.url).hostname.replace(/^www\./, "") : "unknown"),
              songUrl: req.data?.songUrl || "",
            });
          }

          sendResponse({ ok: true });
          return;
        }

        // -- RPC Clear --
        if (req.type === "CLEAR_RPC") {
          await clearRpcForTab(tabId);
          sendResponse({ ok: true });
          return;
        }

        // -- RPC Server Health Check --
        if (req.type === "IS_RPC_CONNECTED") {
          const checkServerHealth = async () => {
            const now = Date.now();
            if (now - state.serverStatus.lastCheck < CONFIG.serverCacheTime) return state.serverStatus.isHealthy;

            try {
              const res = await fetchWithTimeout(`http://localhost:${CONFIG.serverPort}/health`, {}, CONFIG.requestTimeout);
              if (res.ok) {
                const data = await res.json();
                state.serverStatus.isHealthy = !!data.rpcConnected;
              } else {
                state.serverStatus.isHealthy = false;
              }
            } catch {
              state.serverStatus.isHealthy = false;
            }

            state.serverStatus.lastCheck = now;
            return state.serverStatus.isHealthy;
          };

          const healthy = await checkServerHealth();
          sendResponse({ ok: !!healthy });
          return;
        }

        // -- RPC Tab Hostname Match --
        if (req.type === "IS_HOSTNAME_MATCH") {
          let tabInfo;
          try {
            tabInfo = await browser.tabs.get(tabId);
          } catch {
            sendResponse({ ok: false, error: "Tab not found" });
            return;
          }
          const url = new URL(tabInfo.url);

          const allowed = await isAllowedDomain(url.hostname, url.pathname);
          sendResponse({ ok: allowed });
          return;
        }

        sendResponse({ ok: false, error: "Unknown message type" });
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

    for (const [key, { newValue }] of Object.entries(changes)) {
      // enable_ updates the cache with changes
      if (key.startsWith("enable_")) {
        const parserId = key.replace("enable_", "");
        state.parserEnabledCache.set(parserId, newValue !== false && newValue !== undefined);
      }

      // If the parser list or settings have changed, reload
      if (key === "parserList" || key === "userParserSelectors" || key === "userScriptsList" || key.startsWith("settings_")) {
        // Force reload, bypass the flag
        if (state.parserReloadDebounce) clearTimeout(state.parserReloadDebounce);
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

    const controller = state.pendingFetches.get(tabId);
    if (controller) controller.abort();

    clearRpcForTab(tabId).catch(logError);
  });

  // onUpdated
  browser.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    // Tab mute status
    if (changeInfo.mutedInfo?.muted === true && state.activeTabMap.has(tabId)) {
      logInfo(`Tab ${tabId} muted, clearing RPC`);
      clearRpcForTab(tabId).catch(logError);
    }

    // Tab reload / URL change
    if ((changeInfo.status === "loading" || changeInfo.url) && state.activeTabMap.has(tabId)) {
      logInfo(`Tab ${tabId} reloaded or URL changed, clearing RPC`);
      clearRpcForTab(tabId).catch(logError);
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
  let factoryResetConfirm = false;
  let factoryResetTimer = null;
  const factoryResetTimeout = 8000;

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
      try {
        if (tab && tab.id) {
          browser.tabs.reload(tab.id).then(() => {
            browser.runtime.reload();
          });
        } else {
          browser.runtime.reload();
        }
      } catch (err) {
        logError("Restart the extension error:", err);
      }
    }

    // Toggle Debug Mode Action
    if (info.menuItemId === "toggleDebugMode") {
      try {
        const stored = (await browser.storage.local.get("debugMode")).debugMode;
        const current = stored ?? CONFIG.debugMode;
        const newValue = current === 0 ? 1 : 0;
        await browser.storage.local.set({ debugMode: newValue });
        CONFIG.debugMode = newValue;

        if (tab && tab.id) {
          browser.tabs.reload(tab.id);
        }
      } catch (err) {
        logError("Toggle Debug Mode error:", err);
      }
    }

    // Reset to Defaults Action
    if (info.menuItemId === "factoryReset") {
      const ORIGINAL_FACTORY_TITLE = "Reset to Defaults (Click > Open Menu Again > Confirm)";
      const CONFIRM_FACTORY_TITLE = "❗ Confirm Reset to Defaults (Click)";
      // FIRST CLICK: Ask for confirmation
      if (!factoryResetConfirm) {
        factoryResetConfirm = true;

        browser.contextMenus.update("factoryReset", { title: CONFIRM_FACTORY_TITLE });
        // timeout to reset confirmation
        factoryResetTimer = setTimeout(() => {
          factoryResetConfirm = false;
          browser.contextMenus.update("factoryReset", { title: ORIGINAL_FACTORY_TITLE });
        }, factoryResetTimeout);

        return;
      }

      // SECOND CLICK: execute reset
      factoryResetConfirm = false;
      clearTimeout(factoryResetTimer);
      browser.contextMenus.update("factoryReset", { title: ORIGINAL_FACTORY_TITLE });

      try {
        await browser.storage.local.clear();

        if (tab && tab.id) {
          await browser.tabs.reload(tab.id);
        }

        browser.runtime.reload();
      } catch (err) {
        logError("Reset to Defaults error:", err);
      }
    }
  });
};
