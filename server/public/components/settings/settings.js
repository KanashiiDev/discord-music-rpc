import { createSVG, svg_paths } from "../../utils.js";
import { SettingsManager } from "./settingsManager.js";
import { toggleSettings } from "./settingsUI.js";
import { dom } from "../../core/dom.js";

export function initSettingsUI() {
  const settingsToggle = dom.settings.toggle;
  const settingsBack = dom.settings.back;

  if (settingsToggle) {
    settingsToggle.innerHTML = "";
    settingsToggle.appendChild(createSVG(svg_paths.gear));

    settingsBack.innerHTML = "";
    settingsBack.appendChild(createSVG(svg_paths.back));

    dom.settings.toggle.addEventListener("click", () => toggleSettings(true));
    dom.settings.back.addEventListener("click", () => toggleSettings(false));
    dom.settings.saveBtn.addEventListener("click", () => SettingsManager.save());
    dom.settings.resetBtn.addEventListener("click", () => SettingsManager.reset());
  }
}
