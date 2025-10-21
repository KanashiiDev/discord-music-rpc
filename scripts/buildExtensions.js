const fs = require("fs-extra");
const path = require("path");
const acorn = require("acorn");
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
const pendingInlines = {};

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
const defaultJSFiles = ["libs/browser-polyfill.js", "libs/pako.js", "libs/flatpickr.js", "rpcStateManager.js", "mainParser.js", "compiledParsers.js", "popup/selector/selector.js", "main.js"];

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
    backgroundContent = backgroundContent.replace(/import\s+["']\.\/libs\/pako\.js["'];?\s*/g, "");
    fs.writeFileSync(backgroundPath, backgroundContent);
  }
}

// 6. Bundle all parser JS files into one compiledParsers.js
const parsersDir = path.join(EXTENSION_DIR, "parsers");
const parserOutputPath = path.join(DIST_DIR, "compiledParsers.js");

if (fs.existsSync(parsersDir)) {
  const parserFiles = fs.readdirSync(parsersDir).filter((file) => file.endsWith(".js"));
  let combinedCode = "";
  let allParserSettings = {};

  for (const file of parserFiles) {
    const filePath = path.join(parsersDir, file);
    const code = fs.readFileSync(filePath, "utf8");

    // Detect the parser id
    const domainMatch = code.match(/registerParser\s*\(\s*{[^}]*domain:\s*['"`]([^'"`]+)['"`]/);
    const parserId = domainMatch ? domainMatch[1] : file.replace(/\.js$/, "");

    // Detect useSetting calls
    const regex = /useSetting\(\s*['"`]([^'"`]+)['"`]\s*,\s*['"`]([^'"`]+)['"`]\s*,\s*['"`]([^'"`]+)['"`]\s*,\s*([\s\S]*?)\)/g;
    let match;
    let parserSettings = [];

    while ((match = regex.exec(code)) !== null) {
      const [_, key, label, type, defaultValueRaw] = match;
      parserSettings.push({
        key,
        label,
        type,
        defaultValue: defaultValueRaw.trim(),
      });
    }

    // Only add the parser if useSetting exists.
    if (parserSettings.length > 0) {
      const urlPatternsMatch = code.match(/urlPatterns\s*:\s*(\[[^\]]*\])/);
      let urlPatternsLiteral = "[]";

      if (urlPatternsMatch) {
        urlPatternsLiteral = urlPatternsMatch[1];
      }

      allParserSettings[parserId] = {
        urlPatterns: urlPatternsLiteral,
        settings: parserSettings,
      };
    }
    combinedCode += `\n// --- ${file} ---\n${code.trim()}\n`;
  }

  // Write as a JS literal file during the build phase
  let output = "window.initialSettings = {\n";
  for (const [parserId, data] of Object.entries(allParserSettings)) {
    output += `  "${parserId}": {\n    urlPatterns: ${data.urlPatterns},\n    settings: [\n`;
    for (const s of data.settings) {
      output += `      { key: "${s.key}", label: "${s.label}", type: "${s.type}", defaultValue: ${s.defaultValue} },\n`;
    }
    output += "    ]\n  }, \n";
  }
  output += "};\n";

  fs.writeFileSync(parserOutputPath, combinedCode + "\n\n" + output, "utf8");
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

// 6.6 Inline selected utils into specific files
function extractFunctionsFromFile(sourceFilePath, namesToInclude) {
  const code = fs.readFileSync(sourceFilePath, "utf8");

  const ast = acorn.parse(code, {
    ecmaVersion: "latest",
    sourceType: "module",
  });

  const extracted = [];
  const includeAll = !Array.isArray(namesToInclude) || namesToInclude.length === 0;

  function shouldInclude(name) {
    return includeAll || (name && namesToInclude.includes(name));
  }

  for (const node of ast.body) {
    // Function declarations
    if (node.type === "FunctionDeclaration" && shouldInclude(node.id?.name)) {
      extracted.push(code.slice(node.start, node.end));
      continue;
    }

    // Variable declarations
    if (node.type === "VariableDeclaration") {
      const declarations = node.declarations.filter((d) => shouldInclude(d.id?.name));
      if (declarations.length > 0 || includeAll) {
        extracted.push(code.slice(node.start, node.end));
      }
      continue;
    }

    // Export named declarations
    if (node.type === "ExportNamedDeclaration") {
      const decl = node.declaration;
      if (!decl) continue;

      if (decl.type === "FunctionDeclaration" && shouldInclude(decl.id?.name)) {
        extracted.push(code.slice(node.start, node.end));
      }

      if (decl.type === "VariableDeclaration") {
        const declarations = decl.declarations.filter((d) => shouldInclude(d.id?.name));
        if (declarations.length > 0 || includeAll) {
          extracted.push(code.slice(node.start, node.end));
        }
      }
      continue;
    }

    // CommonJS exports
    if (node.type === "ExpressionStatement" && node.expression.type === "AssignmentExpression") {
      const left = node.expression.left;
      const right = node.expression.right;

      if (left.type === "MemberExpression" && left.object.name === "module" && left.property.name === "exports" && right.type === "ObjectExpression") {
        for (const prop of right.properties) {
          const keyName = prop.key?.name || prop.key?.value;
          if (shouldInclude(keyName)) {
            extracted.push(code.slice(prop.start, prop.end));
          }
        }
      }
    }

    // Class declarations
    if (node.type === "ClassDeclaration" && shouldInclude(node.id?.name)) {
      extracted.push(code.slice(node.start, node.end));
      continue;
    }
  }

  return extracted;
}

function inlineUtilsFunctions(targetFiles, sourceFiles, functionsToInclude) {
  if (!Array.isArray(targetFiles)) targetFiles = [targetFiles];
  if (!Array.isArray(sourceFiles)) sourceFiles = [sourceFiles];

  targetFiles.forEach((target) => {
    if (!pendingInlines[target]) pendingInlines[target] = [];

    sourceFiles.forEach((sourceFile) => {
      pendingInlines[target].push({
        sourceFile,
        functionsToInclude,
      });
    });
  });
}

function buildInlineFunctions() {
  for (const [targetFile, inlines] of Object.entries(pendingInlines)) {
    const targetPath = path.join(DIST_DIR, targetFile);
    let targetContent = fs.readFileSync(targetPath, "utf8");
    let allInlinedCode = "";

    for (const { sourceFile, functionsToInclude } of inlines) {
      const sourcePath = path.join(EXTENSION_DIR, sourceFile);
      const extractedFunctions = extractFunctionsFromFile(sourcePath, functionsToInclude);
      const inlineTag = `// === BEGIN INLINE UTILS (${sourceFile}) - (${functionsToInclude?.join?.(", ") || "ALL"}) ===`;
      const inlinedCode = `${inlineTag}\n${extractedFunctions.join("\n\n")}\n// === END INLINE UTILS (${sourceFile}) ===\n\n`;
      allInlinedCode += inlinedCode;
    }

    targetContent = allInlinedCode + "\n" + targetContent ;
    fs.writeFileSync(targetPath, targetContent, "utf8");
  }
}

inlineUtilsFunctions(["common/utils.js", "popup/modules/history.js", "popup/selector/selector.js", "popup/selector/components/preview.js", "background.js"], "../utils.js", [
  "truncate",
  "cleanTitle",
  "normalizeTitleAndArtist",
]);
inlineUtilsFunctions("main.js", "common/utils.js", ["overridesApplied", "applyOverrides", "applyOverridesLoop"]);
inlineUtilsFunctions(["background.js", "main.js"], "common/utils.js", ["logInfo", "logWarn", "logError", "delay"]);
inlineUtilsFunctions("background.js", "popup/modules/history.js", []);
inlineUtilsFunctions("background.js", "common/utils.js", [
  "parseUrlPattern",
  "normalizeHost",
  "normalize",
  "getCurrentTime",
  "openIndexedDB",
  "createMutex",
  "findMatchingParsersForUrl",
  "fetchWithTimeout",
  "getSenderTab",
]);
inlineUtilsFunctions("popup/selector/selector.js", "common/utils.js", ["throttle", "formatLabel", "getExistingElementSelector", "getPlainText", "getIconAsDataUrl", "parseRegexArray"]);
inlineUtilsFunctions(
  "popup/selector/selector.js",
  [
    "popup/selector/modules/selectorRegexes.js",
    "popup/selector/modules/selectorUtils.js",
    "popup/selector/modules/selectorEvaluate.js",
    "popup/selector/modules/selectorStrategies.js",
    "popup/selector/components/selectorChooser.js",
    "popup/selector/modules/selectorInterfaceHelpers.js",
    "popup/selector/components/preview.js",
  ],
  []
);

inlineUtilsFunctions("mainParser.js", "common/utils.js", [
  "DEFAULT_PARSER_OPTIONS",
  "extractTimeParts",
  "parseTime",
  "formatTime",
  "getTimestamps",
  "processPlaybackInfo",
  "getText",
  "getImage",
  "querySelectorDeep",
  "hashFromPatternStrings",
  "makeIdFromDomainAndPatterns",
  "parseUrlPattern",
  "getExistingElementSelector",
  "getPlainText",
  "isValidUrl",
  "getSafeText",
  "getSafeHref",
]);

buildInlineFunctions();

// 7. Write the manifest in the dist folder
fs.writeJsonSync(path.join(DIST_DIR, "manifest.json"), manifest, {
  spaces: 2,
});

console.log(`✅ ${TARGET} build completed: ${DIST_DIR}`);
