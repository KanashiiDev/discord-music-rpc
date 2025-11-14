const fs = require("fs");
const path = require("path");
const packageJsonPath = path.join(__dirname, "..", "package.json");
const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf-8"));
const unpackList = new Set();

// Clear Dist Folder
const target = process.argv[2];
const platformMap = {
  win: "win32",
  linux: "linux",
  mac: "mac",
};

const targetFolder = platformMap[target] || target || "";
const distPath = path.resolve(__dirname, "..", "dist", targetFolder);

try {
  fs.rmSync(distPath, { recursive: true, force: true });
} catch (err) {
  console.error("Dist Clean Failed:", err.message);
}

// Generate AsarUnpack Deps
// Recursive function to traverse dependencies
function addDeps(depName, nodeModulesPath, visited = new Set()) {
  if (visited.has(depName)) return;
  visited.add(depName);

  const depPath = path.join(nodeModulesPath, depName);
  unpackList.add(`node_modules/${depName}/**`);

  const depPackageJsonPath = path.join(depPath, "package.json");
  if (!fs.existsSync(depPackageJsonPath)) return;

  const depPackageJson = JSON.parse(fs.readFileSync(depPackageJsonPath, "utf-8"));
  if (depPackageJson.dependencies) {
    Object.keys(depPackageJson.dependencies).forEach((subDep) => {
      addDeps(subDep, nodeModulesPath, visited);
    });
  }
}

// Add all production dependencies recursively
Object.keys(packageJson.dependencies || {}).forEach((dep) => {
  addDeps(dep, path.join(__dirname, "..", "node_modules"));
});

// Add server.js and assets/icon
unpackList.add("server.js");
unpackList.add("utils.js");
unpackList.add("assets/icon/**/*");

// Sort and write back
const output = Array.from(unpackList).sort();
packageJson.build = packageJson.build || {};
packageJson.build.asarUnpack = output;
fs.writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 2), "utf-8");
