const fs = require("fs-extra");
const path = require("path");
const acorn = require("acorn");
const walk = require("acorn-walk");

const STRICT = process.env.PARSER_STRICT === "true";
const ALLOWED_GLOBALS = new Set(["window", "globalThis", "self"]);

// AST helpers
function getLiteralValue(node) {
  return node?.type === "Literal" ? node.value : null;
}

function getKeyName(prop) {
  return prop.key?.name ?? prop.key?.value ?? null;
}

function isRegisterParserCall(callee) {
  if (callee.type === "Identifier") return callee.name === "registerParser";
  if (callee.type === "MemberExpression" && !callee.computed) {
    return ALLOWED_GLOBALS.has(callee.object?.name) && callee.property?.name === "registerParser";
  }
  return false;
}

// Parser extraction
function extractParserInfo(code, ast, fallbackId, seenDomains) {
  let parserId = null;
  let title = null;
  let urlPatternsRaw = null;
  let hasFn = false;
  let iframeFnRaw = null;
  let iframeOrigins = null;
  const settings = [];
  let foundRegisterCall = false;

  walk.simple(ast, {
    CallExpression(node) {
      const { callee, arguments: args } = node;

      if (isRegisterParserCall(callee)) {
        foundRegisterCall = true;

        if (args.length === 0 || args[0].type !== "ObjectExpression") {
          console.warn(`[ParserBundler] Invalid registerParser call (object argument required): ${fallbackId}`);
          return;
        }

        const obj = args[0];

        for (const prop of obj.properties) {
          const key = getKeyName(prop);
          if (!key) continue;

          switch (key) {
            case "domain": {
              const node = prop.value;
              let domains = [];

              if (node.type === "Literal" && typeof node.value === "string") {
                domains = [node.value];
              } else if (node.type === "ArrayExpression") {
                for (const el of node.elements) {
                  if (el?.type === "Literal" && typeof el.value === "string") {
                    domains.push(el.value);
                  } else {
                    console.warn(`[ParserBundler] domain array must contain only strings: ${fallbackId}`);
                    return;
                  }
                }
              } else {
                console.warn(`[ParserBundler] domain must be a string or array of strings: ${fallbackId}`);
                return;
              }

              if (domains.length === 0 || domains.some((d) => !d.trim())) {
                console.warn(`[ParserBundler] domain cannot be empty: ${fallbackId}`);
                return;
              }

              // Duplicate check (for all domains)
              for (const d of domains) {
                if (seenDomains.has(d)) {
                  throw new Error(`Duplicate domain: "${d}" in ${fallbackId}`);
                }
                seenDomains.add(d);
              }

              parserId = domains;
              break;
            }

            case "title": {
              const val = getLiteralValue(prop.value);
              if (typeof val !== "string" || !val.trim()) {
                console.warn(`[ParserBundler] title must be a non-empty string: ${fallbackId}`);
              } else {
                title = val;
              }
              break;
            }

            case "urlPatterns":
              if (prop.value.type === "ArrayExpression" || prop.value.type === "CallExpression" || prop.value.type === "Identifier") {
                urlPatternsRaw = code.slice(prop.value.start, prop.value.end).trim();
              } else {
                console.warn(`[ParserBundler] urlPatterns must be an array or expression: ${fallbackId}`);
              }
              break;

            case "fn": {
              const fnNode = prop.value;
              const validTypes = ["ArrowFunctionExpression", "FunctionExpression"];

              if (!validTypes.includes(fnNode.type)) {
                console.warn(`[ParserBundler] fn must be a function: ${fallbackId}`);
                break;
              }

              const fnBody = fnNode.body?.body;
              if (!Array.isArray(fnBody)) {
                console.warn(`[ParserBundler] fn must have a block body: ${fallbackId}`);
                break;
              }

              const lastReturn = [...fnBody].reverse().find((s) => s.type === "ReturnStatement");

              if (!lastReturn || !lastReturn.argument) {
                console.warn(`[ParserBundler] fn has no return with value: ${fallbackId}`);
                break;
              }

              if (lastReturn.argument.type === "ObjectExpression") {
                const keys = lastReturn.argument.properties.map((p) => getKeyName(p));
                const requiredKeys = ["title", "artist"];
                for (const req of requiredKeys) {
                  if (!keys.includes(req)) {
                    console.warn(`[ParserBundler] fn return object missing "${req}": ${fallbackId}`);
                  }
                }
              }

              hasFn = true;
              break;
            }

            case "iframeFn": {
              const fnNode = prop.value;
              const validTypes = ["ArrowFunctionExpression", "FunctionExpression"];
              if (!validTypes.includes(fnNode.type)) {
                console.warn(`[ParserBundler] iframeFn must be a function: ${fallbackId}`);
                break;
              }
              iframeFnRaw = code.slice(fnNode.start, fnNode.end).trim();
              break;
            }

            case "iframeOrigins": {
              const node = prop.value;
              let origins = [];
              if (node.type === "Literal" && typeof node.value === "string") {
                origins = [node.value];
              } else if (node.type === "ArrayExpression") {
                for (const el of node.elements) {
                  if (el?.type === "Literal" && typeof el.value === "string") {
                    origins.push(el.value);
                  }
                }
              }
              if (origins.length) iframeOrigins = origins;
              break;
            }
          }
        }
        return;
      }

      // useSetting(id, label, type, defaultValue?)
      if (callee.type === "Identifier" && callee.name === "useSetting") {
        if (!args || args.length < 3) return;
        const [idNode, labelNode, typeNode, defaultNode] = args;

        const key = getLiteralValue(idNode);
        const label = getLiteralValue(labelNode);
        const type = getLiteralValue(typeNode) ?? "text";
        if (!key || !label) return;

        let defaultValue;
        if (defaultNode) {
          defaultValue = defaultNode.type === "Literal" ? defaultNode.raw : code.slice(defaultNode.start, defaultNode.end);
        } else {
          defaultValue = type === "checkbox" ? "true" : '""';
        }

        settings.push({ key, label, type, defaultValue });
      }
    },
  });
  if (!foundRegisterCall) {
    console.warn(`[ParserBundler] Skipped: ${fallbackId}.js → registerParser() call not found.`);
    return null;
  }
  const missing = [];
  if (!parserId) missing.push("domain");
  if (!title) missing.push("title");
  if (!urlPatternsRaw) missing.push("urlPatterns");
  if (!hasFn) missing.push("fn");

  if (missing.length > 0) {
    console.warn(`[ParserBundler] Skipped: ${fallbackId}.js → Missing required fields: ${missing.join(", ")}`);
    return null;
  }

  return {
    parserId,
    title,
    urlPatternsRaw,
    settings,
    iframeFnRaw,
    iframeOrigins,
  };
}

// Output serialization
function serializeSettings(allParserSettings) {
  let out = "window.initialSettings = {\n";

  for (const [primaryDomain, { domains, urlPatterns, settings }] of Object.entries(allParserSettings)) {
    const domainsStr = domains.length === 1 ? `"${domains[0]}"` : `[${domains.map((d) => `"${d}"`).join(", ")}]`;

    out += `  "${primaryDomain}": {\n`;
    out += `    domain: ${domainsStr},\n`;
    out += `    urlPatterns: ${urlPatterns},\n`;
    out += `    settings: [\n`;
    for (const { key, label, type, defaultValue } of settings) {
      out += `      { key: "${key}", label: "${label}", type: "${type}", defaultValue: ${defaultValue} },\n`;
    }
    out += "    ]\n  },\n";
  }

  return out + "};\n";
}

// Entry point
function bundleParsers(extensionDir, distDir) {
  if (!extensionDir || !distDir) {
    console.error("[ParserBundler] Missing extensionDir or distDir.");
    return;
  }

  const parsersDir = path.join(extensionDir, "parsers");
  const parserOutputPath = path.join(distDir, "compiledParsers.js");
  const tempOutputPath = `${parserOutputPath}.tmp`;

  let stat;
  try {
    stat = fs.statSync(parsersDir);
  } catch {
    console.warn("[ParserBundler] Parsers directory not found:", parsersDir);
    return;
  }
  if (!stat?.isDirectory()) {
    console.warn("[ParserBundler] Parsers path is not a directory:", parsersDir);
    return;
  }

  const files = fs
    .readdirSync(parsersDir)
    .filter((f) => f.endsWith(".js"))
    .sort();
  if (!files.length) {
    console.warn("[ParserBundler] No parser files found.");
    return;
  }

  const allParserSettings = Object.create(null);
  const allIframeParsers = [];
  const seenDomains = new Set();
  const failedParsers = [];
  const codeParts = [];

  for (const file of files) {
    const filePath = path.join(parsersDir, file);

    try {
      const code = fs.readFileSync(filePath, "utf8");
      if (!code?.trim()) throw new Error("Empty file.");

      const ast = acorn.parse(code, { ecmaVersion: "latest", sourceType: "module" });
      const fallbackId = file.replace(/\.js$/, "");
      const info = extractParserInfo(code, ast, fallbackId, seenDomains);
      if (!info) {
        failedParsers.push(`Skipped: ${file} (required field is missing or registerParser is not present)`);
        continue;
      }

      const { parserId, urlPatternsRaw, settings, iframeFnRaw, iframeOrigins } = info;
      const primaryDomain = parserId[0];
      allParserSettings[primaryDomain] = {
        domains: parserId,
        urlPatterns: urlPatternsRaw,
        settings,
      };

      // If there is iframeFn, save it
      if (iframeFnRaw) {
        const origins = iframeOrigins || null;
        allIframeParsers.push({ origins, parserId, iframeFnRaw });
      }

      codeParts.push(`// ${file} \n${code.trim()}`);
    } catch (err) {
      const message = `⚠️  Parser failed: ${file} → ${err.message}`;
      failedParsers.push(message);
      if (STRICT) throw new Error(`Build failed (STRICT): ${message}`);
      console.warn(message);
    }
  }

  const combinedCode = codeParts.join("\n\n");
  const output = serializeSettings(allParserSettings);

  // Generate compiledIframeParsers.js
  if (allIframeParsers.length > 0) {
    const iframeOutputPath = path.join(distDir, "compiledIframeParsers.js");
    const iframeTempPath = `${iframeOutputPath}.tmp`;

    let iframeOut = "window.iframeParsers = {\n";
    for (const { origins, parserId, iframeFnRaw } of allIframeParsers) {
      for (const parser of parserId) {
        iframeOut += `  "${parser}": {\n    match: "${origins || ""}",\n    fn: ${iframeFnRaw} },\n`;
      }
    }
    iframeOut += "};\n";

    try {
      fs.writeFileSync(iframeTempPath, iframeOut, "utf8");
      fs.renameSync(iframeTempPath, iframeOutputPath);
    } catch (err) {
      console.error("⚠️  Failed to write iframe bundle:", err.message);
    }
  }

  try {
    fs.ensureDirSync(distDir);
    fs.writeFileSync(tempOutputPath, `${combinedCode}\n\n${output}`, "utf8");
    fs.renameSync(tempOutputPath, parserOutputPath);
    console.log(`📦 Successfully bundled ${Object.keys(allParserSettings).length} parsers.`);
    if (failedParsers.length) console.warn(`⚠️  ${failedParsers.length} parser(s) skipped.`);
  } catch (err) {
    console.error("⚠️  Failed to write bundle:", err.message);
  }
}

module.exports = { bundleParsers };
