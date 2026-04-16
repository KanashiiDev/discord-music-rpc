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
 * Checks for missing translation keys in the server and extension folders
 * under sourceDir, using en.json as the reference for each folder.
 * @param {string} sourceDir - Root directory containing server/ and extension/
 * @returns {Object} Report of missing keys per target and locale.
 *   Example: { server: { de: ["key1", "a.b"] }, extension: {} }
 */
function checkMissingTranslations(sourceDir, targets = ["server", "extension"]) {
  const report = {};

  for (const target of targets) {
    const targetDir = path.join(sourceDir, target);

    if (!fs.existsSync(targetDir)) {
      console.warn(`[${target}] Directory not found, skipping: ${targetDir}`);
      continue;
    }

    report[target] = {};

    const enJsonPath = path.join(targetDir, "en.json");
    if (!fs.existsSync(enJsonPath)) {
      console.warn(`[${target}] en.json not found, skipping: ${enJsonPath}`);
      continue;
    }

    const enKeys = getKeys(fs.readJsonSync(enJsonPath));

    const jsonFiles = fs.readdirSync(targetDir, { withFileTypes: true }).filter((item) => item.isFile() && item.name.endsWith(".json") && item.name !== "en.json");

    for (const file of jsonFiles) {
      const locale = path.basename(file.name, ".json");
      const filePath = path.join(targetDir, file.name);

      let localeData;
      try {
        localeData = fs.readJsonSync(filePath);
      } catch (err) {
        console.error(`[${target}/${file.name}] Failed to parse JSON: ${err.message}`);
        continue;
      }

      const localeKeys = getKeys(localeData);
      const missing = enKeys.filter((key) => !localeKeys.includes(key));

      if (missing.length > 0) {
        report[target][locale] = missing;
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
