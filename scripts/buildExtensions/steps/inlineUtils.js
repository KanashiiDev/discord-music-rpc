const fs = require("fs-extra");
const path = require("path");
const acorn = require("acorn");

/**
 * Creates the inline utils system bound to specific extensionDir and distDir.
 * Returns { inlineUtilsFunctions, buildInlineFunctions }
 */
function createInlineUtils(extensionDir, distDir) {
  const pendingInlines = {};

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
   * @param {string|string[]} targetFiles
   * @param {string|string[]} sourceFiles
   * @param {string[]|[]} functionsToInclude - Pass empty array to include all.
   * @param {"start"|"end"} [position="start"]
   * @param {boolean} [shouldDelete=false]
   * @param {boolean|{ shallow?: boolean, dir?: string }} [inlineAllSiblings=false]
   */
  function inlineUtilsFunctions(targetFiles, sourceFiles, functionsToInclude, position = "start", shouldDelete = false, inlineAllSiblings = false) {
    if (!Array.isArray(targetFiles)) targetFiles = [targetFiles];
    if (!Array.isArray(sourceFiles)) sourceFiles = [sourceFiles];

    let siblingsOpts = null;
    if (inlineAllSiblings === true) {
      siblingsOpts = {};
    } else if (inlineAllSiblings && typeof inlineAllSiblings === "object") {
      siblingsOpts = inlineAllSiblings;
    }

    if (siblingsOpts !== null) {
      targetFiles.forEach((target) => {
        const scanDir = siblingsOpts.dir ? path.join(extensionDir, siblingsOpts.dir) : path.join(extensionDir, path.dirname(target));
        const baseDir = siblingsOpts.dir || path.dirname(target);

        const siblingFiles = siblingsOpts.shallow
          ? fs
              .readdirSync(scanDir)
              .filter((f) => f.endsWith(".js"))
              .map((f) => path.join(baseDir, f))
          : getJsFilesInDirectory(scanDir, baseDir);

        siblingFiles.forEach((siblingRelPath) => {
          const normalizedSibling = siblingRelPath.split(path.sep).join("/");
          const normalizedTarget = target.split(path.sep).join("/");
          const alreadyIncluded = sourceFiles.some((s) => s.split(path.sep).join("/") === normalizedSibling);

          if (normalizedSibling !== normalizedTarget && !alreadyIncluded) {
            sourceFiles.push(siblingRelPath);
          }
        });
      });
    }

    const expandedSources = [];
    sourceFiles.forEach((src) => {
      const fullPath = path.join(extensionDir, src);
      if (fs.existsSync(fullPath) && fs.lstatSync(fullPath).isDirectory()) {
        expandedSources.push(...getJsFilesInDirectory(fullPath, src));
      } else {
        expandedSources.push(src);
      }
    });

    targetFiles.forEach((target) => {
      if (!pendingInlines[target]) pendingInlines[target] = [];
      expandedSources.forEach((sourceFile) => {
        pendingInlines[target].push({ sourceFile, functionsToInclude, position, shouldDelete });
      });
    });
  }

  function buildInlineFunctions() {
    const filesToDelete = new Set();

    for (const [targetFile, inlines] of Object.entries(pendingInlines)) {
      const targetPath = path.join(distDir, targetFile);
      let targetContent = fs.readFileSync(targetPath, "utf8");
      let startInlinedCode = "";
      let endInlinedCode = "";

      for (const { sourceFile, functionsToInclude, position, shouldDelete } of inlines) {
        const sourcePath = path.join(extensionDir, sourceFile);
        const extractedFunctions = extractFunctionsFromFile(sourcePath, functionsToInclude);
        const inlineTag = `// === BEGIN INLINE UTILS (${sourceFile}) - (${functionsToInclude?.join?.(", ") || "ALL"}) ===`;
        const inlinedCode = `${inlineTag}\n${extractedFunctions.join("\n\n")}\n// === END INLINE UTILS (${sourceFile}) ===\n\n`;

        if (position === "end") {
          endInlinedCode += inlinedCode;
        } else {
          startInlinedCode += inlinedCode;
        }

        if (shouldDelete) {
          filesToDelete.add(path.join(distDir, sourceFile));
        }
      }

      targetContent = startInlinedCode + "\n" + targetContent + "\n" + endInlinedCode;
      fs.writeFileSync(targetPath, targetContent, "utf8");
    }

    filesToDelete.forEach((filePath) => {
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    });
  }

  return { inlineUtilsFunctions, buildInlineFunctions };
}

module.exports = { createInlineUtils };
