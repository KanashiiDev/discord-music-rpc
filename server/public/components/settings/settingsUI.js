import { dom, simpleBars } from "../../core/dom.js";
import { SettingsManager } from "./settingsManager.js";
import { formatKeyName, displayValue, getDisplayMinMax, hasChanges } from "./settingsHelpers.js";
import { startAutoUpdate, stopAutoUpdate } from "../../index.js";
import { initMusicCard, destroyMusicCard } from "../musicCard/musicCard.js";

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

const createSelect = (id, options = {}, defaultValue = null) => {
  const select = createElement("select", "", { id });

  Object.entries(options).forEach(([key, value]) => {
    const option = createElement("option", "", {
      value: key,
      textContent: value.label,
    });
    select.appendChild(option);
  });

  if (defaultValue && options[defaultValue]) {
    select.value = defaultValue;
  }

  return select;
};

export const createSettingOption = (key, def) => {
  const { type, note, display } = def;
  const wrapper = createElement("div", "settings-option");
  wrapper.setAttribute("data-key", key);

  const wrapperLabel = createElement("div", "setting-label");

  const labelText = formatKeyName(key);
  const label = createElement("label", "", {
    htmlFor: key,
    textContent: labelText,
    className: "title",
    title: note || "",
    "data-i18n": `settings.${key.toLowerCase()}`,
  });

  const noteElement = createElement("span", "option-note", { "data-i18n": `settings.${key.toLowerCase()}.note` });
  noteElement.textContent = `${note || ""}${display ? ` (${display})` : ""}`;

  const inputWrapper = createElement("div", "input-wrapper");
  const input = type === "boolean" ? createBooleanInput(key, def.value, def) : createTextInput(key, def.value, def);
  const errorMsg = createElement("span", "error-message");
  errorMsg.style.display = "none";

  if (def.path) {
    const openBtn = createElement("button", "open-path-btn", {
      type: "button",
      title: def.path,
      textContent: "Open",
      "data-i18n": "settings.open.directory",
    });
    openBtn.addEventListener("click", async () => {
      try {
        const res = await fetch("/open-path", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ path: def.path }),
        });
        const result = await res.json();

        if (!result.success) {
          const key = result.reason === "not_found" ? "settings.open.directory.not_found" : "settings.open.directory.error";
          showInfoMessage(i18n.t(key), "error");
        }
      } catch {
        showInfoMessage(i18n.t("settings.open.directory.error"), "error");
      }
    });
    inputWrapper.appendChild(openBtn);
  }

  inputWrapper.appendChild(errorMsg);
  inputWrapper.appendChild(input);

  wrapperLabel.append(label, noteElement);
  wrapper.append(wrapperLabel, inputWrapper);
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
  if (typeof dom.container !== "undefined") {
    dom.container.classList.add("switch");
    dom.footer.classList.add("switch");
  }

  setTimeout(() => {
    if (show) {
      stopAutoUpdate();
      destroyMusicCard();
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
      initMusicCard();
    }
    setTimeout(() => {
      dom.container.classList.remove("switch");
      dom.footer.classList.remove("switch");
    }, 150);
  }, 300);
};

let _langTsInstance = null;

export const initLanguageSelect = async (container) => {
  if (!container) return;

  if (_langTsInstance) {
    _langTsInstance.destroy();
    _langTsInstance = null;
  }

  try {
    const response = await fetch("locales/languages.json");
    const data = await response.json();

    // Filter only those with "server": true
    const serverLanguages = Object.fromEntries(Object.entries(data).filter(([key, lang]) => key && lang.server === true));

    const savedLang = localStorage.getItem("lang") || Object.keys(serverLanguages)[0];

    const wrapper = createElement("div", "settings-option");
    const label = createElement("div", "setting-label", {
      textContent: "Language",
      "data-i18n": "settings.language",
    });

    // send the filtered data to the createSelect function
    const select = createSelect("languageSelect", serverLanguages, savedLang);
    select.classList.add("lang-select");

    wrapper.append(label, select);
    container.appendChild(wrapper);

    _langTsInstance = new TomSelect(select, {
      controlInput: null,
      sortField: false,
      plugins: {
        auto_width: {},
        simplebar: {
          simpleBars,
          key: "settingsLanguage",
        },
      },
      onChange: async (value) => {
        localStorage.setItem("lang", value);
        window.location.reload();
      },
    });
  } catch (err) {
    console.error("Error loading languages.json:", err);
  }
};
