import { dom } from "../../core/dom.js";
import { SettingsManager } from "./settingsManager.js";
import { formatKeyName, displayValue, getDisplayMinMax, hasChanges } from "./settingsHelpers.js";
import { startAutoUpdate, stopAutoUpdate } from "../../index.js";

const createElement = (tag, className = "", attributes = {}) => {
  const element = document.createElement(tag);
  if (className) element.className = className;

  Object.entries(attributes).forEach(([key, value]) => {
    if (key.startsWith("data-")) {
      element.setAttribute(key, value);
    } else {
      element[key] = value;
    }
  });

  return element;
};

const createBooleanInput = (key, value, def) => {
  const switchLabel = createElement("label", "switch-label");
  const checkbox = createElement("input", "", {
    type: "checkbox",
    id: key,
    checked: value,
    "data-original": value,
    "data-def": JSON.stringify(def),
  });
  const slider = createElement("span", "slider");
  switchLabel.append(checkbox, slider);
  return switchLabel;
};

const createTextInput = (key, value, def) => {
  const displayVal = displayValue(value, def);
  const { min, max } = getDisplayMinMax(def);

  const attributes = {
    id: key,
    value: displayVal,
    type: def.type === "number" ? "number" : "text",
    "data-original": displayVal,
    "data-def": JSON.stringify(def),
  };

  if (min !== undefined) attributes.min = min;
  if (max !== undefined) attributes.max = max;
  if (def.type === "number" && def.display) {
    attributes.step = def.display === "mb" ? "0.01" : "0.1";
  }

  return createElement("input", "", attributes);
};

export const createSettingOption = (key, def) => {
  const { type, note, display } = def;
  const wrapper = createElement("div", "settings-option");
  wrapper.setAttribute("data-key", key);

  const labelText = formatKeyName(key);
  const label = createElement("label", "", {
    htmlFor: key,
    textContent: labelText,
    className: "title",
    title: note || "",
  });

  const noteElement = createElement("span", "option-note");
  noteElement.textContent = `${note || ""}${display ? ` (${display})` : ""}`;
  label.appendChild(noteElement);

  const inputWrapper = createElement("div", "input-wrapper");
  const input = type === "boolean" ? createBooleanInput(key, def.value, def) : createTextInput(key, def.value, def);
  const errorMsg = createElement("span", "error-message");
  errorMsg.style.display = "none";

  inputWrapper.appendChild(errorMsg);
  inputWrapper.appendChild(input);
  wrapper.append(label, inputWrapper);
  return wrapper;
};

export const showError = (element, message) => {
  const errorMsg = element.parentElement?.querySelector(".error-message");
  if (errorMsg) {
    errorMsg.textContent = message;
    errorMsg.style.display = "block";
    element.classList.add("invalid");
  }
};

export const clearError = (element) => {
  const errorMsg = element.parentElement?.querySelector(".error-message");
  if (errorMsg) {
    errorMsg.style.display = "none";
    element.classList.remove("invalid");
  }
};

export const showInfoMessage = (message, type = "info", keep = false) => {
  const infoMessage = createElement("div", `info-message ${type}`);
  const indicator = createElement("div", "info-message-indicator");
  infoMessage.textContent = message;
  infoMessage.appendChild(indicator);
  document.querySelector("#settingsContainer").appendChild(infoMessage);

  if (keep) return;
  setTimeout(() => infoMessage.classList.add("show"), 10);
  setTimeout(() => {
    infoMessage.classList.remove("show");
    setTimeout(() => infoMessage.remove(), 300);
  }, 5000);
};

export const updateChangeIndicator = () => {
  hasChanges() ? dom.settings.saveBtn.classList.add("has-changes") : dom.settings.saveBtn.classList.remove("has-changes");
};

export const toggleSettings = (show) => {
  if (typeof dom.container !== "undefined") dom.container.classList.add("switch");

  setTimeout(() => {
    if (show) {
      stopAutoUpdate();
      dom.main.style.display = "none";
      dom.settings.container.style.display = "block";
      dom.settings.toggle.style.display = "none";
      dom.containerToggle.style.display = "none";
      dom.settings.back.style.display = "block";
      SettingsManager.load();
    } else {
      dom.settings.container.style.display = "none";
      dom.settings.back.style.display = "none";
      dom.main.style.display = "block";
      dom.settings.toggle.style.display = "block";
      dom.containerToggle.style.display = "block";
      startAutoUpdate();
    }
    dom.container.classList.remove("switch");
  }, 300);
};
