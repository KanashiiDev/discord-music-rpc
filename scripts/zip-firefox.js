const fs = require("fs-extra");
const archiver = require("archiver");
const path = require("path");

const sourceDir = path.resolve("extensionBuilds/firefox");
const outputPath = path.resolve("extensionBuilds/firefox-build.zip");

if (!fs.existsSync(sourceDir)) {
  console.error(`Source folder not found: ${sourceDir}`);
  process.exit(1);
}

const output = fs.createWriteStream(outputPath);
const archive = archiver("zip", { zlib: { level: 9 } });

output.on("close", () => {
  console.log(`firefox-build.zip created (${archive.pointer()} total bytes)`);
});

archive.on("error", err => {
  throw err;
});

archive.pipe(output);
archive.directory(sourceDir, false);
archive.finalize();
