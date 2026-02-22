const fs = require("fs-extra");
const path = require("path");

function bundleParsers(extensionDir, distDir) {
  const parsersDir = path.join(extensionDir, "parsers");
  const parserOutputPath = path.join(distDir, "compiledParsers.js");

  if (!fs.existsSync(parsersDir)) return;

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

    if (parserSettings.length > 0) {
      const urlPatternsMatch = code.match(/urlPatterns\s*:\s*(\[[\s\S]*?\])/);
      allParserSettings[parserId] = {
        urlPatterns: urlPatternsMatch ? urlPatternsMatch[1] : "[]",
        settings: parserSettings,
      };
    }

    combinedCode += `\n// --- ${file} ---\n${code.trim()}\n`;
  }

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

module.exports = { bundleParsers };
