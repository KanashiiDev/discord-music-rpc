const fs = require("fs-extra");
const path = require("path");

const { prefixCssFiles } = require("./steps/prefixCss");
const { copyExtensionFiles, buildManifest, writeManifest, patchFirefoxBackground } = require("./steps/copyAndManifest");
const { bundleParsers } = require("./steps/bundleParsers");
const { createInlineUtils } = require("./steps/inlineUtils");
const { applyCssConfig } = require("./steps/applyCssConfig");
const registerInlines = require("./inlineConfig");
const { copyLocales } = require("./steps/copyLocales");
const { checkMissingTranslations } = require("../checkMissingTranslations");

const ROOT_DIR = path.join(__dirname, "..", "..");
const TARGET = process.env.TARGET || "chrome";
const EXTENSION_DIR = path.join(ROOT_DIR, "extension");
const SHARED_DIR = path.join(ROOT_DIR, "shared");
const LOCALES_DIR = path.join(ROOT_DIR, "locales");
const DIST_DIR = path.join(ROOT_DIR, "extensionBuilds", TARGET);
const DIST_LOCALES_DIR = path.join(DIST_DIR, "locales");
const pkgVersion = JSON.parse(fs.readFileSync(path.join(ROOT_DIR, "package.json"), "utf8")).version;

const CSS_TARGETS = ["popup/popup.css", "popup/selector/selector.css", "manager/userScriptManager.css", "settings/settings.css"];

(async () => {
  // 1. Clean dist folder
  fs.emptyDirSync(DIST_DIR);

  // 2. Autoprefixer — mutates CSS files in extensionDir
  await prefixCssFiles(EXTENSION_DIR);

  // 3. Copy extension files to dist (excluding manifests, parsers, matches, codemirror addons)
  copyExtensionFiles(EXTENSION_DIR, DIST_DIR);

  // 4. Build and write manifest
  const manifest = buildManifest(EXTENSION_DIR, TARGET, pkgVersion);
  if (TARGET === "firefox") patchFirefoxBackground(DIST_DIR);

  // 5. Bundle all parsers into compiledParsers.js
  bundleParsers(EXTENSION_DIR, DIST_DIR);

  // 6. Inline utilities
  const { inlineUtilsFunctions, buildInlineFunctions } = createInlineUtils(EXTENSION_DIR, DIST_DIR);
  registerInlines(inlineUtilsFunctions);
  buildInlineFunctions();

  // 7. Apply CSS config
  applyCssConfig(SHARED_DIR, DIST_DIR, "css-config.css", CSS_TARGETS);
  applyCssConfig(SHARED_DIR, DIST_DIR, "css-global.css", CSS_TARGETS, "/*CSS-GLOBAL*/");

  // 8. Copy locales
  checkMissingTranslations(LOCALES_DIR, ["extension"]);
  fs.mkdirSync(DIST_LOCALES_DIR, { recursive: true });
  copyLocales(LOCALES_DIR, DIST_LOCALES_DIR);

  // 9. Write manifest
  writeManifest(DIST_DIR, manifest);

  console.log(`✅ ${TARGET} build completed: ${DIST_DIR}`);
})();
