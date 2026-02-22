const fs = require("fs-extra");
const path = require("path");

const DEFAULT_JS_FILES = [
  "libs/browser-polyfill.js",
  "libs/pako.js",
  "libs/flatpickr.js",
  "libs/tinycolor.js",
  "libs/iro@5.js",
  "rpcStateManager.js",
  "keepAliveManager.js",
  "mainParser.js",
  "compiledParsers.js",
  "popup/selector/selector.js",
  "main.js",
];

const EXCLUDED_DIRS = ["manifests", "parsers", "matches", path.join("libs", "codemirror", "addons")];

function copyExtensionFiles(extensionDir, distDir) {
  fs.copySync(extensionDir, distDir, {
    filter: (src) => {
      return !EXCLUDED_DIRS.some((dir) => src.includes(path.join(extensionDir, dir)));
    },
  });
}

function buildManifest(extensionDir, target, pkgVersion) {
  const manifestPath = path.join(extensionDir, "manifests", `manifest.${target}.json`);
  const manifest = fs.readJsonSync(manifestPath);
  manifest.version = pkgVersion;

  if (!manifest.content_scripts) {
    manifest.content_scripts = [];
  }

  manifest.content_scripts = manifest.content_scripts.map((script) => ({
    ...script,
    matches: ["<all_urls>"],
    js: DEFAULT_JS_FILES,
  }));

  return manifest;
}

function writeManifest(distDir, manifest) {
  fs.writeJsonSync(path.join(distDir, "manifest.json"), manifest, { spaces: 2 });
}

function patchFirefoxBackground(distDir) {
  const backgroundPath = path.join(distDir, "background.js");
  if (fs.existsSync(backgroundPath)) {
    let content = fs.readFileSync(backgroundPath, "utf8");
    content = content.replace(/import\s+["']\.\/libs\/browser-polyfill\.js["'];?\s*/g, "");
    content = content.replace(/import\s+["']\.\/libs\/pako\.js["'];?\s*/g, "");
    fs.writeFileSync(backgroundPath, content);
  }
}

module.exports = { copyExtensionFiles, buildManifest, writeManifest, patchFirefoxBackground };
