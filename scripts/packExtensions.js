const fs = require("fs-extra");
const archiver = require("archiver");
const path = require("path");
const TARGET = process.env.TARGET || "chrome";
let sourceDir = path.resolve("extensionBuilds/chrome");
let outputPath = path.resolve("extensionBuilds/chrome-build.zip");

if (TARGET === "firefox") {
  sourceDir = path.resolve("extensionBuilds/firefox");
  outputPath = path.resolve("extensionBuilds/firefox-build.zip");
}

if (!fs.existsSync(sourceDir)) {
  console.error(`Source folder not found: ${sourceDir}`);
  process.exit(1);
}

const output = fs.createWriteStream(outputPath);
const archive = archiver("zip", { zlib: { level: 9 } });

output.on("close", () => {
  console.log(`${TARGET}-build.zip created (${archive.pointer()} total bytes)`);
});

archive.on("error", (err) => {
  throw err;
});

archive.pipe(output);
archive.directory(sourceDir, false);
archive.finalize().catch((err) => {
  console.error("An error occurred while packing:", err);
  process.exit(1);
});
