const STORAGE_KEY = "userScriptsList";

// URL pattern validation and normalization
class PatternValidator {
  // Regex string → JS RegExp object
  static toRegex(pattern) {
    if (!pattern) return /.*/;
    try {
      const match = pattern.match(/^\/(.+)\/$/);
      const regexStr = match ? match[1] : pattern;
      return new RegExp(regexStr);
    } catch (err) {
      console.warn("Invalid regex pattern:", pattern, err);
      return /.*/; // fallback
    }
  }

  // Domain + regex → Chrome URL match pattern
  static toChromeMatch(domain, pattern) {
    if (!domain) return "*://*/*";

    // Make the general patterns compatible with Chrome
    if (!pattern || pattern === "*" || pattern === "." || pattern === "<all_urls>") {
      return "*://*/*";
    }

    const cleanDomain = domain.replace(/^https?:\/\//, "").replace(/\/$/, "");

    // Fix / signs in regex and make .* → *
    const match = pattern.match(/^\/(.+)\/$/);
    const inner = match ? match[1] : pattern;

    let wildcard = inner
      .replace(/\\\//g, "/") // \/ → /
      .replace(/\.\*/g, "*"); // .* → *

    if (!wildcard.startsWith("/")) wildcard = "/" + wildcard;

    return `*://${cleanDomain}${wildcard}`;
  }

  // Input string → list of normalized patterns
  static normalizePatterns(patterns) {
    if (!patterns) return ["/*"];
    if (typeof patterns === "string") patterns = patterns.split(/\s*,\s*/);
    return patterns.map((p) => {
      const trimmed = p.trim();
      if (!trimmed) return "/*"; // empty pattern → all URLs
      if (/^\/.*\/$/.test(trimmed)) return trimmed;
      return `/${trimmed}/`;
    });
  }

  // Return the pattern list as regex and normalized list
  static processPatterns(patterns) {
    const list = this.normalizePatterns(patterns);
    const regexList = [];
    const invalidPatterns = [];

    for (const p of list) {
      try {
        const r = this.toRegex(p);
        regexList.push(r);
      } catch (err) {
        invalidPatterns.push(p);
        regexList.push(/.*/);
      }
    }

    return {
      regexList,
      normalizedList: list,
      invalidPatterns,
    };
  }
}

// Storage management
class ScriptStorage {
  constructor(storageKey) {
    this.storageKey = storageKey;
  }

  async getScripts() {
    try {
      const result = await browser.storage.local.get(this.storageKey);
      return result[this.storageKey] || [];
    } catch (error) {
      logError("Failed to get scripts from storage:", error);
      return [];
    }
  }

  async saveScripts(scripts) {
    try {
      await browser.storage.local.set({ [this.storageKey]: scripts });
    } catch (error) {
      logError("Failed to save scripts to storage:", error);
      throw error;
    }
  }
}

// UserScript management
class UserScriptManager {
  constructor() {
    this.storage = new ScriptStorage(STORAGE_KEY);
    this.validator = PatternValidator;
    this.registeredScripts = new Map();
  }

  generateScriptId(domain, urlPatterns) {
    const patternStrings = (Array.isArray(urlPatterns) ? urlPatterns : [urlPatterns])
      .map((pattern) => this.validator.normalizePatterns(pattern))
      .flat()
      .sort();

    const hash = btoa(patternStrings.join("|"))
      .replace(/[^a-zA-Z0-9]/g, "")
      .slice(0, 10);

    return `${domain}_${hash}`;
  }

  buildTrackDataScript(script) {
    const { normalizedList } = PatternValidator.processPatterns(script.urlPatterns);
    const patternString = normalizedList.map((p) => `"${p}"`).join(", ");

    return `
    (async function() {
      const trackState = {};

      setTimeout(async () => {
        const __userScriptUsedSettings = [];
        function useSetting(key, label, type, defaultValue) {
          __userScriptUsedSettings.push({ key, label, type, defaultValue });
          return new Promise((resolve, reject) => {
            const requestId = \`useSetting_\${Date.now()}_\${Math.random()}\`;
            function handleResponse(event) {
              if (event.source !== window) return;
              const msg = event.data;
              if (!msg || msg.type !== "USER_SCRIPT_USE_SETTING_RESPONSE" || msg.requestId !== requestId) return;
              window.removeEventListener("message", handleResponse);
              resolve(msg.value);
            }
            window.addEventListener("message", handleResponse);

            window.postMessage({
              type: "USER_SCRIPT_USE_SETTING_REQUEST",
              requestId,
              id: "${script.id}",
              key,
              label,
              inputType: type,
              defaultValue
            }, "*");

            setTimeout(() => reject(new Error("useSetting timeout")), 5000);
          });
        }

        // UserScript
        ${script.code || ""}

        // update trackState
        trackState.title = typeof title !== "undefined" ? title : null;
        trackState.artist = typeof artist !== "undefined" ? artist : null;
        trackState.image = typeof image !== "undefined" ? image : null;
        trackState.source = typeof source !== "undefined" ? source : null;
        trackState.songUrl = typeof songUrl !== "undefined" ? songUrl : null;
        trackState.timePassed = typeof timePassed !== "undefined" ? timePassed : null;
        trackState.duration = typeof duration !== "undefined" ? duration : null;

        // Track Data Interval
        setInterval(async () => {
          try {
            const trackData = {
              id: "${script.id}",
              domain: "${script.domain}",
              authors: ${JSON.stringify(script.authors || [])},
              authorsLinks: ${JSON.stringify(script.authorsLinks || [])},
              homepage: "${script.homepage || ""}",
              description: "${script.description || ""}",
              urlPatterns: [${patternString}],
              title: "${script.title || "Unknown"}",
              song: { ...trackState }
            };

            // Debug Mode
            if (${script.debug} && trackData) {
              const now = new Date();
              const timeString = \`\${String(now.getHours()).padStart(2,'0')}:\${String(now.getMinutes()).padStart(2,'0')}:\${String(now.getSeconds()).padStart(2,'0')}\`;
              console.groupCollapsed(\`%c DISCORD MUSIC RPC - DEBUG [%c\${timeString}%c]: %c\${trackData.title}\`,
                "color: #7bd583ff; font-weight: bold; font-size: 14px;",
                "color: #cfa600ff; font-weight: bold; font-size: 14px;",
                "color: #7bd583ff; font-weight: bold; font-size: 14px;",
                "color: #efefefff; font-weight: bold; font-size: 14px;"
              );
              console.log("%cScript Information:", "color: #ffb86c; font-weight: bold; font-size: 13px;");
              console.log("  • Title:     ", trackData.title);
              console.log("  • Domain:    ", trackData.domain);
              console.log("  • Url Patterns:  ", trackData.urlPatterns || "—");
              const song = trackData.song;
              console.log("%cSong Information:", "color: #8be9fd; font-weight: bold; font-size: 13px;");
              console.log("  • Title:      ", song.title || "Unknown");
              console.log("  • Artist:     ", song.artist || "Unknown");
              console.log("  • Source:     ", song.source || "Unknown");
              console.log("  • Song URL:   ", song.songUrl || "N/A");
              console.log("  • Image:      ", song.image || "Default Image");
              console.log("  • Duration:   ", song.duration ?? "N/A");
              console.log("  • Time Passed:", song.timePassed ?? "N/A");
              console.groupEnd();
            }

            window.postMessage({ type: "USER_SCRIPT_TRACK_DATA", data: trackData }, "*");
          } catch (error) {
            console.warn("UserScript tracking error:", error);
          }
        }, 5000);
      }, 5000);
    })();
    `;
  }

  async registerUserScript(script) {
    try {
      const manifest = browser.runtime.getManifest();
      const isMV3 = manifest.manifest_version === 3;
      const patterns = Array.isArray(script.urlPatterns) ? script.urlPatterns : [script.urlPatterns];
      const matches = patterns.map((p) => PatternValidator.toChromeMatch(script.domain, p));
      const { parserEnabledState = {} } = await browser.storage.local.get("parserEnabledState");
      const isEnabled = parserEnabledState[`enable_${script.id}`] !== false;

      if (!isEnabled) return { ok: true, skipped: true, reason: "Script is disabled" };

      const trackingCode = this.buildTrackDataScript(script);

      if (!browser.userScripts?.register) throw new Error("No compatible userscript API available");

      let registeredUserScript = null;

      if (isMV3) {
        registeredUserScript = await browser.userScripts.register([
          {
            id: script.id,
            js: [{ code: trackingCode }],
            matches,
            runAt: script.runAt || "document_idle",
          },
        ]);
        this.registeredScripts.set(script.id, registeredUserScript);
      } else {
        registeredUserScript = await browser.userScripts.register({
          js: [{ code: trackingCode }],
          matches,
          runAt: script.runAt || "document_idle",
          scriptMetadata: { id: script.id, domain: script.domain },
        });

        this.registeredScripts.set(script.id, registeredUserScript);
      }

      return { ok: true, registrationId: script.id, raw: registeredUserScript };
    } catch (error) {
      logError("Failed to register user script:", error);
      return { ok: false, error: error?.message || String(error) };
    }
  }

  async unregisterUserScript(script, skipStorageUpdate = false) {
    if (!script?.id) return { ok: true, skipped: true, reason: "No script ID provided" };

    try {
      const manifest = browser.runtime.getManifest();
      const isMV3 = manifest.manifest_version === 3;

      if (isMV3) {
        const existingScripts = await browser.userScripts.getScripts();
        const scriptExists = existingScripts.some((s) => s.id === script.id);

        if (!scriptExists) {
          return { ok: true, skipped: true, reason: "Script not registered" };
        }
        await browser.userScripts.unregister({ ids: [script.id] });
      }

      const registeredUserScript = this.registeredScripts.get(script.id);
      if (registeredUserScript) await registeredUserScript.unregister();

      this.registeredScripts.delete(script.id);

      if (!skipStorageUpdate) {
        const scripts = await this.storage.getScripts();
        const scriptIndex = scripts.findIndex((s) => s.id === script.id);
        if (scriptIndex >= 0) {
          scripts[scriptIndex].registered = false;
          await this.storage.saveScripts(scripts);
        }
      }

      await this.delay(50);
      return { ok: true };
    } catch (error) {
      if (!error.message.includes("Nonexistent script ID")) {
        logError("Failed to unregister user script:", error);
      }
      return { ok: true };
    }
  }

  async registerAllScripts() {
    const scripts = await this.storage.getScripts();
    const { parserEnabledState = {} } = await browser.storage.local.get("parserEnabledState");
    const results = { successful: [], failed: [], disabled: [] };

    for (const script of scripts) {
      try {
        if (!script.id) script.id = this.generateScriptId(script.domain, script.urlPatterns);

        await this.unregisterUserScript(script, true);

        if (parserEnabledState[`enable_${script.id}`] === false) {
          script.registered = false;
          results.disabled.push(script.id);
          continue;
        }

        await this.delay(50);
        const registrationResult = await this.registerUserScript(script);

        if (registrationResult.ok && !registrationResult.skipped) {
          script.registered = true;
          results.successful.push(script.id);
        } else if (registrationResult.skipped) {
          results.disabled.push(script.id);
        } else {
          script.registered = false;
          results.failed.push({ id: script.id, error: registrationResult.error });
        }
      } catch (error) {
        logError(`Error processing script ${script.id}:`, error);
        script.registered = false;
        results.failed.push({ id: script.id, error: error.message });
      }
    }

    await this.storage.saveScripts(scripts);
    return results;
  }

  async delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

// Export main functionality
const scriptManager = new UserScriptManager();
