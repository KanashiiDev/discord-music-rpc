const fs = require("fs-extra");
const path = require("path");
const postcss = require("postcss");
const autoprefixer = require("autoprefixer");

function getCssFiles(dir) {
  let results = [];
  const list = fs.readdirSync(dir);

  list.forEach((file) => {
    const fullPath = path.join(dir, file);
    const stat = fs.statSync(fullPath);

    if (stat && stat.isDirectory()) {
      results = results.concat(getCssFiles(fullPath));
    } else if (fullPath.endsWith(".css")) {
      results.push(fullPath);
    }
  });

  return results;
}

async function prefixCssFiles(extensionDir) {
  const prefixer = autoprefixer({ overrideBrowserslist: ["last 4 versions"] });
  const cssFiles = getCssFiles(extensionDir);

  for (const file of cssFiles) {
    const css = fs.readFileSync(file, "utf8");
    try {
      const result = await postcss([prefixer]).process(css, { from: file, to: file });
      fs.writeFileSync(file, result.css);
    } catch (err) {
      console.error(`Autoprefixer Error ${file}:`, err);
    }
  }
}

module.exports = { prefixCssFiles };
