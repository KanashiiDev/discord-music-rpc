const fs = require("fs-extra");
const path = require("path");
const ROOT_DIR = path.join(__dirname, "..");
const TARGET = process.env.TARGET || "chrome";
const EXTENSION_DIR = path.join(ROOT_DIR, "extension");
const DIST_DIR = path.join(ROOT_DIR, "extensionBuilds", TARGET);
const configPath = path.join(EXTENSION_DIR, "config.js");
const configContent = fs.readFileSync(configPath, "utf8").trim();
const portMatch = configContent.match(/serverPort\s*[:=]\s*(\d+)/);
const port = portMatch ? parseInt(portMatch[1], 10) : 3000;
const localhostPermission = `http://localhost:${port}/*`;
const pkgPath = path.join(ROOT_DIR, "package.json");
const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"));
const pkgVersion = pkg.version;

// 1. Clean and create the destination folder
fs.emptyDirSync(DIST_DIR);

// 2. Copy ALL files in Extension (except manifest.json, parsers/, matches/, manifests/)
fs.copySync(EXTENSION_DIR, DIST_DIR, {
  filter: (src) => {
    return !src.includes(path.join(EXTENSION_DIR, "manifests")) && !src.includes(path.join(EXTENSION_DIR, "parsers")) && !src.includes(path.join(EXTENSION_DIR, "matches"));
  },
});

// 3. Read base manifest for the current target
const manifestPath = path.join(EXTENSION_DIR, "manifests", `manifest.${TARGET}.json`);
let manifest = fs.readJsonSync(manifestPath);
manifest.version = pkgVersion;

// 4. Update manifest content_scripts to use compiledParsers.js and <all_urls>
const defaultJSFiles = ["libs/browser-polyfill.js", "rpcStateManager.js", "mainParser.js", "compiledParsers.js", "selector.js", "main.js"];

if (!manifest.content_scripts) {
  manifest.content_scripts = [];
}

manifest.content_scripts = manifest.content_scripts.map((script) => ({
  ...script,
  matches: ["<all_urls>"],
  js: defaultJSFiles,
}));

// 4.5 Update localhost port
if (TARGET === "firefox") {
  manifest.permissions = (manifest.permissions || []).filter((p) => !p.startsWith("http://localhost:"));
  manifest.permissions.push(localhostPermission);
} else {
  manifest.host_permissions = (manifest.host_permissions || []).filter((p) => !p.startsWith("http://localhost:"));
  manifest.host_permissions.push(localhostPermission);
}

// 5. Remove the polyfill import in background.js for Firefox
if (TARGET === "firefox") {
  const backgroundPath = path.join(DIST_DIR, "background.js");
  if (fs.existsSync(backgroundPath)) {
    let backgroundContent = fs.readFileSync(backgroundPath, "utf8");
    backgroundContent = backgroundContent.replace(/import\s+["']\.\/libs\/browser-polyfill\.js["'];?\s*/g, "");
    fs.writeFileSync(backgroundPath, backgroundContent);
  }
}

// 6. Bundle all parser JS files into one compiledParsers.js
const parsersDir = path.join(EXTENSION_DIR, "parsers");
const parserOutputPath = path.join(DIST_DIR, "compiledParsers.js");

if (fs.existsSync(parsersDir)) {
  const parserFiles = fs.readdirSync(parsersDir).filter((file) => file.endsWith(".js"));
  let combinedCode = "";

  for (const file of parserFiles) {
    const filePath = path.join(parsersDir, file);
    const code = fs.readFileSync(filePath, "utf8");
    combinedCode += `\n// --- ${file} ---\n${code.trim()}\n`;
  }

  fs.writeFileSync(parserOutputPath, combinedCode, "utf8");
  console.log(`📦 Parsers bundled into: ${parserOutputPath}`);
}

// 6.5 Inline config.js content into background.js and main.js
const filesToPatch = ["background.js", "main.js"];

if (fs.existsSync(configPath)) {
  const inlinedConfig = `${configContent}\n\n`;
  filesToPatch.forEach((fileName) => {
    const filePath = path.join(DIST_DIR, fileName);
    if (fs.existsSync(filePath)) {
      let content = fs.readFileSync(filePath, "utf8");
      content = inlinedConfig + content;
      fs.writeFileSync(filePath, content, "utf8");
    }
  });
}

// 7. Write the manifest in the dist folder
fs.writeJsonSync(path.join(DIST_DIR, "manifest.json"), manifest, {
  spaces: 2, // Format for readability
});

console.log(`✅ ${TARGET} build completed: ${DIST_DIR}`);
