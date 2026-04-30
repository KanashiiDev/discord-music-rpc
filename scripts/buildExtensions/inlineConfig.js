/**
 * Registers all inline utility function mappings.
 * Called from the build script after `inlineUtilsFunctions` is defined.
 *
 * @param {Function} inlineUtilsFunctions - The registration function from build.js
 */
module.exports = function registerInlines(inlineUtilsFunctions) {
  // CONFIG
  inlineUtilsFunctions(["background.js", "common/utils.js", "mainParser.js"], "config.js", [], "start", true);

  // Localization
  inlineUtilsFunctions(["common/utils.js"], "../shared/i18n.js", [], [], "start");

  // Tom Select Plugins
  inlineUtilsFunctions(["popup/popup.js"], "../shared/tom-select-plugins.js", [], [], "end");

  // Dialog
  inlineUtilsFunctions(["common/utils.js"], "../shared/dialog.js", [], [], "start");

  // Truncate
  inlineUtilsFunctions(["common/utils.js", "popup/selector/selector.js", "background.js"], "../shared/utils.js", ["truncate", "normalizeTitleAndArtist"]);

  // Logs
  inlineUtilsFunctions(["background.js", "mainParser.js"], "common/utils.js", [
    "getDebugMode",
    "logInfo",
    "logWarn",
    "errorFilter",
    "shouldIgnore",
    "logError",
    "delay",
    "DEFAULT_PARSER_OPTIONS",
    "parseUrlPattern",
  ]);

  // Background Utils
  inlineUtilsFunctions("background.js", "common/utils.js", [
    "normalizeHost",
    "normalize",
    "getCurrentTime",
    "openIndexedDB",
    "createMutex",
    "findMatchingParsersForUrl",
    "fetchWithTimeout",
    "getSenderTab",
    "isAllowedDomain",
    "isDomainMatch",
    "sendAction",
    "restartExtension",
    "toggleDebugMode",
    "factoryResetConfirm",
    "factoryResetTimer",
    "factoryResetTimeout",
    "factoryReset",
  ]);

  // Main Utils
  inlineUtilsFunctions("main.js", "common/utils.js", [
    "debounce",
    "getColorSettings",
    "saveStyleAttrs",
    "applyThemeSettings",
    "applyBackgroundSettings",
    "applyColorSettings",
    "isGradient",
    "parseGradient",
    "extractGradientColors",
    "generateForegroundScaleGradients",
    "generateForegroundScale",
    "getCSSThemeDefault",
    "getDefaultCSSValue",
    "getColorVariant",
  ]);

  // Main Parser Utils
  inlineUtilsFunctions("mainParser.js", "common/utils.js", [
    "extractTimeParts",
    "parseTime",
    "formatTime",
    "getTimestamps",
    "processPlaybackInfo",
    "getText",
    "getTextAll",
    "getImage",
    "getImageAll",
    "querySelectorDeep",
    "hashFromPatternStrings",
    "makeIdFromDomainAndPatterns",
    "getExistingElementSelector",
    "getPlainText",
    "isValidUrl",
    "getSafeText",
    "getSafeHref",
  ]);

  inlineUtilsFunctions(["mainParser.js", "common/utils.js"], "popup/selector/modules/selectorUtils.js", ["queryWithPartialClass"]);

  // Selector Utils
  inlineUtilsFunctions("popup/selector/selector.js", "common/utils.js", [
    "throttle",
    "formatLabel",
    "getExistingElementSelector",
    "getPlainText",
    "getIconAsDataUrl",
    "parseRegexArray",
    "svg_paths",
    "svgCache",
    "createSVG",
  ]);

  // Selector Components
  inlineUtilsFunctions("popup/selector/selector.js", [], [], "start", true, { dir: "popup/selector/components" });
  inlineUtilsFunctions("popup/selector/selector.js", [], [], "start", true, { dir: "popup/selector/modules" });

  // Popup Components
  inlineUtilsFunctions("popup/popup.js", [], [], "start", true, { dir: "popup/components" });

  // Build CodeMirror 5
  inlineUtilsFunctions("libs/codemirror/codemirror.js", ["libs/codemirror/libs/jshint.js", "libs/codemirror/addons/", "libs/beautify.js"], [], "end", true);

  // User Script Manager
  inlineUtilsFunctions("manager/userScriptManager.js", "manager/components/UseSettingEditor.js", [], "start", true);
  inlineUtilsFunctions(
    "manager/userScriptWorker.js",
    "common/utils.js",
    ["getText", "getTextAll", "getImage", "getImageAll", "queryWithPartialClass", "querySelectorDeep"],
    "_INLINE_UTILS",
  );
  inlineUtilsFunctions("background.js", ["manager/userScriptWorker.js"], []);
  inlineUtilsFunctions("iframeParser.js", ["common/utils.js"], ["querySelectorDeep"], "start");

  // Background Listeners
  inlineUtilsFunctions("background.js", ["background/historyBackground.js", "background/backgroundListeners.js"], [], "start", true);

  // Setting Components
  inlineUtilsFunctions("settings/settings.js", [], [], "start", true, { dir: "settings/components" });
};
