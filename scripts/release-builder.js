const fs = require("fs");
const path = require("path");
const archiver = require("archiver");

// Paths
const projectRoot = path.join(__dirname, "..");
const distDir = path.join(projectRoot, "dist");
const extensionBuildsDir = path.join(projectRoot, "extensionBuilds");
const releaseDir = path.join(projectRoot, "release");

// Clean or create release folder
if (fs.existsSync(releaseDir)) {
  fs.rmSync(releaseDir, { recursive: true });
}
fs.mkdirSync(releaseDir);

// Find .exe and latest.yml
let exeFilePath = null;
fs.readdirSync(distDir).forEach((file) => {
  const fullPath = path.join(distDir, file);

  if (file === "latest.yml") {
    fs.copyFileSync(fullPath, path.join(releaseDir, file));
  }

  if (file.endsWith(".exe")) {
    exeFilePath = fullPath;
    fs.copyFileSync(fullPath, path.join(releaseDir, file));
  }
});

// Zip the .exe
if (exeFilePath) {
  const zipPath = path.join(releaseDir, "Discord-Music-RPC-Setup.zip");
  const output = fs.createWriteStream(zipPath);
  const archive = archiver("zip", { zlib: { level: 9 } });

  output.on("close", () => {
    console.log(`✅ Zipped EXE as ${path.basename(zipPath)} (${archive.pointer()} bytes)`);
  });

  archive.on("error", (err) => {
    throw err;
  });

  archive.pipe(output);
  archive.file(exeFilePath, { name: "Discord-Music-RPC-Setup.exe" });
  archive.finalize();
} else {
  console.warn("⚠️ No .exe file found in dist/. ZIP will not be created.");
}

// Copy extension .zip files
fs.readdirSync(extensionBuildsDir)
  .filter((file) => file.endsWith(".zip"))
  .forEach((file) => {
    const src = path.join(extensionBuildsDir, file);
    const dest = path.join(releaseDir, file);
    fs.copyFileSync(src, dest);
  });

console.log(`✅ All release files prepared in: ${path.relative(projectRoot, releaseDir)}`);
