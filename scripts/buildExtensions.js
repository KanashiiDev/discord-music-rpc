const fs = require("fs-extra");
const path = require("path");
const acorn = require("acorn");
const postcss = require("postcss");
const autoprefixer = require("autoprefixer");
const ROOT_DIR = path.join(__dirname, "..");
const TARGET = process.env.TARGET || "chrome";
const EXTENSION_DIR = path.join(ROOT_DIR, "extension");
const DIST_DIR = path.join(ROOT_DIR, "extensionBuilds", TARGET);
const pkgPath = path.join(ROOT_DIR, "package.json");
const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"));
const pkgVersion = pkg.version;
const pendingInlines = {};

(async () => {
  // 1. Clean and create the destination folder
  fs.emptyDirSync(DIST_DIR);

  // 1.2 Autoprefixer
  const prefixer = autoprefixer({
    overrideBrowserslist: ["last 4 versions"],
  });

  function getCssFiles(dir) {
    let results = [];
    const list = fs.readdirSync(dir);

    list.forEach((file) => {
      const fullPath = path.join(dir, file);
      const stat = fs.statSync(fullPath);

      if (stat && stat.isDirectory()) {
        results = results.concat(getCssFiles(fullPath));
      } else if (fullPath.endsWith(".css")) {
        results.push(fullPath);
      }
    });

    return results;
  }

  // Prefix operation
  async function prefixCssFiles() {
    const cssFiles = getCssFiles(EXTENSION_DIR);

    for (const file of cssFiles) {
      const css = fs.readFileSync(file, "utf8");
      try {
        const result = await postcss([prefixer]).process(css, { from: file, to: file });
        fs.writeFileSync(file, result.css);
      } catch (err) {
        console.error(`Autoprefixer Error ${file}:`, err);
      }
    }
  }

  await prefixCssFiles();

  // 2. Copy ALL files in Extension (except manifest.json, parsers/, matches/, manifests/)
  const EXCLUDED_DIRS = ["manifests", "parsers", "matches", path.join("libs", "codemirror", "addons")];

  fs.copySync(EXTENSION_DIR, DIST_DIR, {
    filter: (src) => {
      return !EXCLUDED_DIRS.some((dir) => src.includes(path.join(EXTENSION_DIR, dir)));
    },
  });

  // 3. Read base manifest for the current target
  const manifestPath = path.join(EXTENSION_DIR, "manifests", `manifest.${TARGET}.json`);
  const manifest = fs.readJsonSync(manifestPath);
  manifest.version = pkgVersion;

  // 4. Update manifest content_scripts to use compiledParsers.js and <all_urls>
  const defaultJSFiles = [
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

  if (!manifest.content_scripts) {
    manifest.content_scripts = [];
  }

  manifest.content_scripts = manifest.content_scripts.map((script) => ({
    ...script,
    matches: ["<all_urls>"],
    js: defaultJSFiles,
  }));

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
    const allParserSettings = {};

    for (const file of parserFiles) {
      const filePath = path.join(parsersDir, file);
      const code = fs.readFileSync(filePath, "utf8");

      // Detect the parser id
      const domainMatch = code.match(/registerParser\s*\(\s*{[^}]*domain:\s*['"`]([^'"`]+)['"`]/);
      const parserId = domainMatch ? domainMatch[1] : file.replace(/\.js$/, "");

      // Detect useSetting calls
      const regex = /useSetting\s*\(\s*["']([^"']+)["']\s*,\s*["']([^"']+)["']\s*,\s*["']([^"']+)"(?:\s*,\s*([\s\S]*?))?\s*\)/g;
      let match;
      const parserSettings = [];

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
        const urlPatternsMatch = code.match(/urlPatterns\s*:\s*(\[[\s\S]*?\])/);
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
            if (shouldInclude(keyName) || includeAll) {
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

      // IIFE and anonymous functions
      if (node.type === "ExpressionStatement" && node.expression.type === "CallExpression" && node.expression.callee.type === "FunctionExpression") {
        if (includeAll || shouldInclude(node.expression.callee.id?.name)) {
          extracted.push(code.slice(node.start, node.end));
        }
        continue;
      }
    }

    return extracted;
  }

  /**
   * Register utility functions from one or more source files to be inlined into one or more target files.
   *
   * Normalizes the `targetFiles` and `sourceFiles` arguments to arrays (if they are not already),
   * and for each target/source pair pushes an entry into the global `pendingInlines` map.
   * Each entry is an object containing:
   *   - sourceFile: the path of the source file
   *   - functionsToInclude: the specification of which functions to inline (passed through as-is)
   *   - position: where the inlined functions should be placed in the target ("start" by default)
   *
   * The function has the side effect of mutating the global `pendingInlines` object and returns nothing.
   *
   * @param {string|string[]} targetFiles - A single target file path or an array of target file paths that will receive the inlined functions.
   * @param {string|string[]} sourceFiles - A single source file path or an array of source file paths to copy functions from.
   * @param {string|RegExp|Array<string|RegExp>|Object} functionsToInclude - Specification of which functions to include from each source.
   *        This value is passed through into each pending inline entry; it can be a function name, a RegExp matcher, an array of names/regexes,
   *        or a descriptor object depending on the callers' expected format.
   * @param {"start"|"end"} [position="start"] - Where to insert the inlined functions in the target file. Defaults to "start".
   * @param {boolean [shouldDelete=false] - Whether to delete the file after inlining. Defaults to `false`.
   * @returns {void}
   */
  function inlineUtilsFunctions(targetFiles, sourceFiles, functionsToInclude, position = "start", shouldDelete = false) {
    if (!Array.isArray(targetFiles)) targetFiles = [targetFiles];
    if (!Array.isArray(sourceFiles)) sourceFiles = [sourceFiles];

    const expandedSources = [];
    sourceFiles.forEach((src) => {
      const fullPath = path.join(EXTENSION_DIR, src);
      // If src is a directory -> get all .js files in that directory
      if (fs.existsSync(fullPath) && fs.lstatSync(fullPath).isDirectory()) {
        expandedSources.push(...getJsFilesInDirectory(fullPath, src));
      } else {
        // If src is a normal file -> add directly
        expandedSources.push(src);
      }
    });

    targetFiles.forEach((target) => {
      if (!pendingInlines[target]) pendingInlines[target] = [];
      expandedSources.forEach((sourceFile) => {
        pendingInlines[target].push({
          sourceFile,
          functionsToInclude,
          position,
          shouldDelete,
        });
      });
    });
  }

  // Finds all .js files in the specified directory (including subfolders)
  function getJsFilesInDirectory(dir, base = "") {
    const files = fs.readdirSync(dir);
    let results = [];

    files.forEach((file) => {
      const fullPath = path.join(dir, file);
      const relPath = path.join(base, file);
      const stat = fs.statSync(fullPath);

      if (stat.isDirectory()) {
        results = results.concat(getJsFilesInDirectory(fullPath, relPath));
      } else if (file.endsWith(".js")) {
        results.push(relPath);
      }
    });

    return results;
  }

  function buildInlineFunctions() {
    const filesToDelete = new Set();

    for (const [targetFile, inlines] of Object.entries(pendingInlines)) {
      const targetPath = path.join(DIST_DIR, targetFile);
      let targetContent = fs.readFileSync(targetPath, "utf8");
      let startInlinedCode = "";
      let endInlinedCode = "";

      for (const { sourceFile, functionsToInclude, position, shouldDelete } of inlines) {
        const sourcePath = path.join(EXTENSION_DIR, sourceFile);
        const extractedFunctions = extractFunctionsFromFile(sourcePath, functionsToInclude);
        const inlineTag = `// === BEGIN INLINE UTILS (${sourceFile}) - (${functionsToInclude?.join?.(", ") || "ALL"}) ===`;
        const inlinedCode = `${inlineTag}\n${extractedFunctions.join("\n\n")}\n// === END INLINE UTILS (${sourceFile}) ===\n\n`;

        if (position === "end") {
          endInlinedCode += inlinedCode;
        } else {
          startInlinedCode += inlinedCode;
        }

        // Mark the files to be deleted
        if (shouldDelete) {
          filesToDelete.add(path.join(DIST_DIR, sourceFile));
        }
      }

      targetContent = startInlinedCode + "\n" + targetContent + "\n" + endInlinedCode;
      fs.writeFileSync(targetPath, targetContent, "utf8");
    }

    // Delete selected files
    filesToDelete.forEach((filePath) => {
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    });
  }

  function applyCssConfig(configFile, targetFiles, marker = "/*CSS-CONFIG*/") {
    const configContent = fs.readFileSync(path.join(EXTENSION_DIR, configFile), "utf8");

    targetFiles.forEach((file) => {
      const filePath = path.join(DIST_DIR, file);
      const originalContent = fs.readFileSync(filePath, "utf8");
      let newContent;

      if (originalContent.includes(marker)) {
        newContent = originalContent.replace(marker, marker + "\n" + configContent);
      } else {
        newContent = configContent + "\n" + originalContent;
      }

      fs.writeFileSync(filePath, newContent, "utf8");
    });
  }

  // --- INLINE UTILITIES REGISTRATION START ---

  // CONFIG
  inlineUtilsFunctions(["background.js", "common/utils.js", "mainParser.js"], "config.js", [], "start", true);

  // Truncate
  inlineUtilsFunctions(["common/utils.js", "popup/selector/selector.js", "popup/selector/components/preview.js", "background.js"], "../utils.js", ["truncate", "normalizeTitleAndArtist"]);

  // Delay
  inlineUtilsFunctions("main.js", "common/utils.js", ["delay"]);

  // Logs
  inlineUtilsFunctions(["background.js"], "common/utils.js", ["logInfo", "logWarn", "errorFilter", "shouldIgnore", "logError", "delay"]);

  // Background Utils
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

  inlineUtilsFunctions("background.js", ["manager/userScriptWorker.js", "background/historyBackground.js", "background/backgroundListeners.js"], [], "start", true);

  // Popup Selector Utils
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
    [],
    "start",
    true
  );

  // Main Parser Utils
  inlineUtilsFunctions("mainParser.js", "common/utils.js", [
    "logInfo",
    "logWarn",
    "errorFilter",
    "shouldIgnore",
    "logError",
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

  // Build CodeMirror 5
  inlineUtilsFunctions("libs/codemirror/codemirror.js", ["libs/codemirror/libs/jshint.js", "libs/codemirror/addons/", "libs/beautify.js"], [], "end", true);

  // User Script Manager
  inlineUtilsFunctions("manager/userScriptManager.js", "manager/components/UseSettingEditor.js", [], "start", true);

  // --- INLINE UTILITIES REGISTRATION END ---

  // Build the inlined functions
  buildInlineFunctions();

  // Apply CSS Configurations
  applyCssConfig("css-config.css", ["popup/popup.css", "popup/selector/selector.css", "manager/userScriptManager.css", "settings/settings.css"]);
  applyCssConfig("css-global.css", ["popup/popup.css", "popup/selector/selector.css", "manager/userScriptManager.css", "settings/settings.css"], "/*CSS-GLOBAL*/");

  // 7. Write the manifest in the dist folder
  fs.writeJsonSync(path.join(DIST_DIR, "manifest.json"), manifest, {
    spaces: 2,
  });

  console.log(`✅ ${TARGET} build completed: ${DIST_DIR}`);
})();
