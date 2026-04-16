import { dom } from "../../core/dom.js";
import { createSettingOption, showInfoMessage, updateChangeIndicator, clearError, showError, initLanguageSelect } from "./settingsUI.js";
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

      initLanguageSelect(dom.settings.form);

      await new Promise((res) => setTimeout(res, 50));

      Object.entries(serverSettings).forEach(([key, def]) => {
        if (!def.hidden) {
          dom.settings.form.appendChild(createSettingOption(key, def));
        }
      });

      await new Promise((res) => setTimeout(res, 50));

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
      applyTranslations();
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
      showInfoMessage(i18n.t("settings.message.noChanges"), "info");
      return;
    }

    updateSaveButton(i18n.t("settings.saving"), true);

    try {
      const saveRes = await fetch("/update-settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updated),
      });

      const result = await saveRes.json();
      if (result.success) {
        updateSaveButton(i18n.t("settings.saved"));
        showInfoMessage(i18n.t("settings.message.saved"), "success");

        const newPort = document.getElementById("PORT")?.value;
        const currentPort = window.location.port;

        await this.handlePortChange(newPort, currentPort);
      } else {
        throw new Error(result.error || "Save failed");
      }
    } catch (error) {
      updateSaveButton(i18n.t("settings.save"), false);
      showInfoMessage(error.message, "error");
    }
  },

  async reset() {
    if (!confirm(i18n.t("settings.message.reset"))) {
      return;
    }

    try {
      const response = await fetch("/reset-settings", { method: "POST" });
      if (!response.ok) throw new Error("Settings could not be reset");

      showInfoMessage(i18n.t("settings.reset.complete"), "success");
      setTimeout(() => window.location.reload(), 5000);
    } catch (error) {
      console.error("Reset Error:", error);
      showInfoMessage(i18n.t("settings.reset.fail"), "error");
    }
  },

  async handlePortChange(newPort, currentPort) {
    if (newPort && String(newPort) !== String(currentPort)) {
      updateSaveButton(i18n.t("settings.newPort"));

      try {
        await waitForServer(newPort);
        await new Promise((resolve) => setTimeout(resolve, 300));
        window.location.href = `http://${window.location.hostname}:${newPort}`;
      } catch (_) {
        showInfoMessage(i18n.t("settings.redirect.fail"), "error");
      }
    } else {
      await new Promise((resolve) => setTimeout(resolve, 5000));
      window.location.reload();
    }
  },
};
