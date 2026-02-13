import { dom } from "../../core/dom.js";
import { createSettingOption, showInfoMessage, updateChangeIndicator, clearError, showError } from "./settingsUI.js";
import { validateValue, convertValue, updateSaveButton, hasChanges, waitForServer } from "./settingsHelpers.js";

const domSettings = dom.settings;

const collectSettings = () => {
  const settings = { server: {} };
  let hasError = false;

  domSettings.form.querySelectorAll("input").forEach((input) => {
    const key = input.id;
    const def = JSON.parse(input.dataset.def);
    const value = input.type === "checkbox" ? input.checked : input.value;

    if (input.type === "number") {
      const validation = validateValue(value, def);
      if (!validation.valid) {
        showError(input, validation.error);
        hasError = true;
      }
    }

    settings.server[key] = input.type === "number" ? convertValue(Number(value), def.unit, def.display, "parse") : value;
  });

  return hasError ? null : settings;
};

export const SettingsManager = {
  async load() {
    try {
      const response = await fetch("/settings");
      if (!response.ok) throw new Error("Settings fetch failed");

      const { server: serverSettings } = await response.json();

      dom.settings.form.replaceChildren();

      Object.entries(serverSettings).forEach(([key, def]) => {
        if (!def.hidden) {
          dom.settings.form.appendChild(createSettingOption(key, def));
        }
      });

      dom.settings.form.querySelectorAll("input").forEach((input) => {
        input.addEventListener("input", updateChangeIndicator);
        if (input.type === "number") {
          input.addEventListener("blur", () => {
            const def = JSON.parse(input.dataset.def);
            const val = validateValue(input.value, def);
            val.valid ? clearError(input) : showError(input, val.error);
          });
        }
      });
      updateChangeIndicator();
    } catch (error) {
      showInfoMessage("Failed to load settings", "error");
      console.error(error);
    }
  },

  async save() {
    const updated = collectSettings();
    if (!updated) {
      showInfoMessage("Please check invalid fields", "error");
      return;
    }

    if (!hasChanges()) {
      showInfoMessage("No changes detected", "info");
      return;
    }

    updateSaveButton("Saving...", true);

    try {
      const saveRes = await fetch("/update-settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updated),
      });

      const result = await saveRes.json();
      if (result.success) {
        updateSaveButton("Saved!");
        showInfoMessage("Settings saved successfully", "success");

        const newPort = document.getElementById("PORT")?.value;
        const currentPort = window.location.port;

        await this.handlePortChange(newPort, currentPort);
      } else {
        throw new Error(result.error || "Save failed");
      }
    } catch (error) {
      updateSaveButton("Save", false);
      showInfoMessage(error.message, "error");
    }
  },

  async reset() {
    if (!confirm("All settings will be reset to default values and song history will be cleared. This action cannot be undone. Are you sure?")) {
      return;
    }

    try {
      const response = await fetch("/reset-settings", { method: "POST" });
      if (!response.ok) throw new Error("Settings could not be reset");

      showInfoMessage("Settings have been reset", "success");
      setTimeout(() => window.location.reload(), 2000);
    } catch (error) {
      console.error("Reset Error:", error);
      showInfoMessage("An error occurred while resetting the settings", "error");
    }
  },

  async handlePortChange(newPort, currentPort) {
    if (newPort && String(newPort) !== String(currentPort)) {
      updateSaveButton("Connecting to new port...");
      try {
        await waitForServer(newPort);
        window.location.href = `http://${window.location.hostname}:${newPort}`;
      } catch (err) {
        showInfoMessage("Redirect failed, please refresh manually", "error");
      }
    } else {
      setTimeout(() => window.location.reload(), 1000);
    }
  },
};
