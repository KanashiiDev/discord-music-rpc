const fs = require("fs-extra");
const path = require("path");

/**
 * Recursively flattens a nested object into dot-notation keys.
 * Example: { a: { b: 1 } } → ["a.b"]
 */
function getKeys(obj, prefix = "") {
  return Object.entries(obj).flatMap(([key, value]) => {
    const fullKey = prefix ? `${prefix}.${key}` : key;
    return value !== null && typeof value === "object" ? getKeys(value, fullKey) : [fullKey];
  });
}

/**
 * Checks for missing translation keys across all locales.
 * Uses en/{namespace}.json as the reference for each namespace.
 *
 * @param {string} sourceDir - Root directory (the "locales" folder)
 * @param {string[]} targets  - Namespaces to check, e.g. ["server", "extension"]
 * @returns {Object} Report of missing keys per target and locale.
 *   Example: { server: { de: ["key1", "a.b"] }, extension: {} }
 */
function checkMissingTranslations(sourceDir, targets = ["server", "extension"]) {
  const report = {};

  // Collect all lang dirs (skip "en" — it's the reference)
  const langDirs = fs
    .readdirSync(sourceDir, { withFileTypes: true })
    .filter((item) => item.isDirectory() && item.name !== "en")
    .map((item) => item.name);

  for (const target of targets) {
    report[target] = {};

    // Reference file: locales/en/{namespace}.json
    const refPath = path.join(sourceDir, "en", `${target}.json`);
    if (!fs.existsSync(refPath)) {
      console.warn(`[${target}] Reference file not found, skipping: ${refPath}`);
      continue;
    }

    const enKeys = getKeys(fs.readJsonSync(refPath));

    for (const lang of langDirs) {
      const filePath = path.join(sourceDir, lang, `${target}.json`);

      if (!fs.existsSync(filePath)) {
        console.warn(`[${target}] "${lang}" file not found, skipping: ${filePath}`);
        continue;
      }

      let localeData;
      try {
        localeData = fs.readJsonSync(filePath);
      } catch (err) {
        console.error(`[${target}/${lang}.json] Failed to parse JSON: ${err.message}`);
        continue;
      }

      const localeKeys = getKeys(localeData);
      const missing = enKeys.filter((key) => !localeKeys.includes(key));

      if (missing.length > 0) {
        report[target][lang] = missing;
      }
    }
  }

  printReport(report);
  return report;
}

/**
 * Prints the missing keys report to the console.
 */
function printReport(report) {
  let hasIssue = false;

  for (const [target, locales] of Object.entries(report)) {
    for (const [locale, missingKeys] of Object.entries(locales)) {
      if (missingKeys.length === 0) continue;
      hasIssue = true;
      console.warn(`\n[${target}] "${locale}" is missing ${missingKeys.length} key(s):`);
      missingKeys.forEach((key) => console.warn(`❌ ${key}`));
    }
  }

  if (!hasIssue) {
    console.log("✅ All locales are up to date!");
  }
}

/**
 * Auto-generates locales/languages.json by scanning the locales directory.
 * - extension: true  → locales/{lang}/extension.json exists
 * - server: true     → locales/{lang}/server.json exists
 * - label            → derived from Intl.DisplayNames (no manual mapping needed)
 *
 * @param {string} sourceDir - Root directory (the "locales" folder)
 */
function generateLanguages(sourceDir) {
  const outputPath = path.join(sourceDir, "languages.json");
  const displayNames = new Intl.DisplayNames(["en"], { type: "language" });

  const langDirs = fs
    .readdirSync(sourceDir, { withFileTypes: true })
    .filter((item) => item.isDirectory())
    .map((item) => item.name)
    .sort();

  const output = {};

  for (const lang of langDirs) {
    const hasExtension = fs.existsSync(path.join(sourceDir, lang, "extension.json"));
    const hasServer = fs.existsSync(path.join(sourceDir, lang, "server.json"));

    if (!hasExtension && !hasServer) continue;

    let label;
    try {
      label = displayNames.of(lang);
    } catch {
      label = lang;
    }

    output[lang] = {
      label: label ?? lang,
      extension: hasExtension,
      server: hasServer,
    };
  }

  fs.writeJsonSync(outputPath, output, { spaces: 2 });
  console.log(`✅ Locales metadata generated!`);
}

module.exports = { checkMissingTranslations, generateLanguages };

if (require.main === module) {
  const sourceDir = path.resolve(__dirname, "..", "locales");
  const arg = process.argv[2];

  const targets = !arg || arg === "all" ? ["server", "extension"] : [arg];
  checkMissingTranslations(sourceDir, targets);
  generateLanguages(sourceDir);
}
