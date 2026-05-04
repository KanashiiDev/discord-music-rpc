const fs = require("fs");
const { Router } = require("express");
const { sendRestart, sendResetConfig } = require("../services/electron.js");
const { sendOpenPath } = require("../services/electron.js");

// Reads and parses the settings file.
function readSettings(filePath, res) {
  try {
    const raw = fs.readFileSync(filePath, "utf8");
    const settings = JSON.parse(raw);
    return { settings, raw };
  } catch (err) {
    const msg = err instanceof SyntaxError ? "Settings parse failed" : "Settings read failed";
    res.status(500).json({ error: `${msg}: ${err.message}` });
    return null;
  }
}

function createSettingsRouter(settingsFilePath) {
  const router = Router();

  router.post("/open-path", (req, res) => {
    const { path } = req.body;
    if (!path) return res.status(400).json({ success: false });

    if (!fs.existsSync(path)) {
      return res.status(404).json({ success: false, reason: "not_found" });
    }

    sendOpenPath(path);
    res.json({ success: true });
  });

  // GET /settings
  router.get("/settings", (_req, res) => {
    const result = readSettings(settingsFilePath, res);
    if (result) res.json(result.settings);
  });

  // POST /update-settings
  router.post("/update-settings", (req, res) => {
    const incoming = req.body;
    const result = readSettings(settingsFilePath, res);
    if (!result) return;

    const { settings } = result;
    let updated = false;

    for (const key of Object.keys(incoming.server ?? {})) {
      // Skip keys that don't exist in the schema
      if (!(key in (settings.server ?? {}))) continue;
      settings.server[key].value = incoming.server[key];
      updated = true;
    }

    if (!updated) {
      return res.status(400).json({ error: "No valid settings to update" });
    }

    fs.writeFile(settingsFilePath, JSON.stringify(settings, null, 4), "utf8", (err) => {
      if (err) return res.status(500).json({ error: "Settings update failed: " + err.message });
      res.json({ success: true, message: "Settings updated" });
      console.log("[SETTINGS] Restarting server to apply new settings...");
      sendRestart();
    });
  });

  // POST /reset-settings
  router.post("/reset-settings", (_req, res) => {
    sendResetConfig();
    res.json({ success: true, message: "Config reset initiated" });
  });

  // POST /update-port
  router.post("/update-port", (req, res) => {
    const { newPort } = req.body;

    if (typeof newPort !== "number" || isNaN(newPort)) {
      return res.status(400).json({ error: "Invalid port value" });
    }

    const result = readSettings(settingsFilePath, res);
    if (!result) return;

    const { settings } = result;
    const portSchema = settings?.server?.PORT;

    if (!portSchema || portSchema.type !== "number") {
      return res.status(500).json({ error: "PORT setting schema not found" });
    }

    if ((portSchema.min != null && newPort < portSchema.min) || (portSchema.max != null && newPort > portSchema.max)) {
      return res.status(400).json({
        error: `Port must be between ${portSchema.min} and ${portSchema.max}`,
      });
    }

    portSchema.value = newPort;

    fs.writeFile(settingsFilePath, JSON.stringify(settings, null, 4), "utf8", (err) => {
      if (err) return res.status(500).json({ error: "Settings update failed: " + err.message });
      res.json({ success: true, message: "Port updated successfully", updatedPort: newPort });
      console.log(`[SETTINGS] Port changed to ${newPort} — restarting...`);
      sendRestart();
    });
  });

  return router;
}

module.exports = { createSettingsRouter, readSettings };
