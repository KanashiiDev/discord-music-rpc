const fs = require("fs-extra");
const path = require("path");

function applyCssConfig(extensionDir, distDir, configFile, targetFiles, marker = "/*CSS-CONFIG*/") {
  const configContent = fs.readFileSync(path.join(extensionDir, configFile), "utf8");

  targetFiles.forEach((file) => {
    const filePath = path.join(distDir, file);
    const originalContent = fs.readFileSync(filePath, "utf8");
    let newContent;

    if (originalContent.includes(marker)) {
      newContent = originalContent.replace(marker, marker + "\n" + configContent);
    } else {
      newContent = configContent + "\n" + originalContent;
    }

    fs.writeFileSync(filePath, newContent, "utf8");
  });
}

module.exports = { applyCssConfig };
