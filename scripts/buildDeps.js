const fs = require("fs");
const path = require("path");

const packageJsonPath = path.join(__dirname, "..", "package.json");
const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf-8"));
const buildDepsPath = path.resolve(__dirname, "..", "build_deps");
const platformMap = {
  win: "win32",
  linux: "linux",
  mac: "mac",
};
const args = process.argv.slice(2);
let target;
for (const arg of args) {
  if (arg.startsWith("--")) {
    const key = arg.slice(2);
    if (platformMap[key]) {
      target = platformMap[key];
      break;
    }
  }
}
const distPath = path.resolve(__dirname, "..", "dist", target);

// Recursive folder deletion
function removeDir(dirPath) {
  if (!fs.existsSync(dirPath)) return;
  for (const entry of fs.readdirSync(dirPath)) {
    const entryPath = path.join(dirPath, entry);
    if (fs.lstatSync(entryPath).isDirectory()) {
      removeDir(entryPath);
    } else {
      fs.unlinkSync(entryPath);
    }
  }
  fs.rmdirSync(dirPath);
}

// Recursive folder copying
function copyDir(src, dest) {
  if (!fs.existsSync(src)) return;
  if (!fs.existsSync(dest)) fs.mkdirSync(dest, { recursive: true });

  for (const entry of fs.readdirSync(src)) {
    const srcPath = path.join(src, entry);
    const destPath = path.join(dest, entry);
    if (fs.lstatSync(srcPath).isDirectory()) {
      copyDir(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

// Recursive function to copy a module and its dependencies
function copyModule(depName, nodeModulesPath, destNodeModulesPath, visited = new Set()) {
  if (visited.has(depName)) return;
  visited.add(depName);

  const srcPath = path.join(nodeModulesPath, depName);
  const destPath = path.join(destNodeModulesPath, depName);

  copyDir(srcPath, destPath);

  const depPackageJsonPath = path.join(srcPath, "package.json");
  if (!fs.existsSync(depPackageJsonPath)) return;

  const depPackageJson = JSON.parse(fs.readFileSync(depPackageJsonPath, "utf-8"));
  if (depPackageJson.dependencies) {
    Object.keys(depPackageJson.dependencies).forEach((subDep) => {
      copyModule(subDep, nodeModulesPath, destNodeModulesPath, visited);
    });
  }
}

// Cleaning
removeDir(distPath);
removeDir(buildDepsPath);

// Copy production dependencies (recursive)
Object.keys(packageJson.dependencies || {}).forEach((dep) => {
  copyModule(dep, path.join(__dirname, "..", "node_modules"), path.join(buildDepsPath, "node_modules"));
});

// Necessary files and icons
copyDir(path.join(__dirname, "..", "assets/icon"), path.join(buildDepsPath, "assets/icon"));
copyDir(path.join(__dirname, "..", "public"), path.join(buildDepsPath, "public"));
fs.copyFileSync(path.join(__dirname, "..", "scripts", "discord_ipc_diagnostic.sh"), path.join(buildDepsPath, "discord_ipc_diagnostic.sh"));
fs.copyFileSync(path.join(__dirname, "..", "server.js"), path.join(buildDepsPath, "server.js"));
fs.copyFileSync(path.join(__dirname, "..", "utils.js"), path.join(buildDepsPath, "utils.js"));
