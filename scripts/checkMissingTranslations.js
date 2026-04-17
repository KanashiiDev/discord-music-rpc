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

module.exports = { checkMissingTranslations };

if (require.main === module) {
  const sourceDir = path.resolve(__dirname, "..", "locales");
  const arg = process.argv[2];

  let targets;

  if (arg === "all" || !arg) {
    targets = ["server", "extension"];
  } else {
    targets = [arg];
  }
  checkMissingTranslations(sourceDir, targets);
}
