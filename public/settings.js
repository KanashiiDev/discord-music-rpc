// CONSTANTS
const CONVERSIONS = {
  bytes_to_kb: { factor: 1024 },
  bytes_to_mb: { factor: 1024 * 1024 },
  ms_to_seconds: { factor: 1000 },
  ms_to_minutes: { factor: 1000 * 60 },
  ms_to_hours: { factor: 1000 * 60 * 60 },
  ms_to_days: { factor: 1000 * 60 * 60 * 24 },
};

const CONVERSION_MAP = {
  bytes: { kb: CONVERSIONS.bytes_to_kb.factor, mb: CONVERSIONS.bytes_to_mb.factor },
  ms: {
    seconds: CONVERSIONS.ms_to_seconds.factor,
    minutes: CONVERSIONS.ms_to_minutes.factor,
    hours: CONVERSIONS.ms_to_hours.factor,
    days: CONVERSIONS.ms_to_days.factor,
  },
};

const MESSAGE_DURATION = 5000;
const SERVER_CHECK_INTERVAL = 500;
const SERVER_TIMEOUT = 15000;

// UTILITY HELPERS
const formatKeyName = (key) => {
  return key
    .split("_")
    .map((word) => word.charAt(0) + word.slice(1).toLowerCase())
    .join(" ");
};

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

const getDefinition = (key, input, serverDefinitions) => {
  if (input.dataset.def) {
    try {
      return JSON.parse(input.dataset.def);
    } catch (e) {
      console.warn(`Failed to parse def for ${key}`);
    }
  }
  return serverDefinitions?.[key];
};

const handleError = (error, context) => {
  console.error(`Error in ${context}:`, error);
  return null;
};

// CONVERSION HELPERS
const getConversionFactor = (unit, display) => {
  return CONVERSION_MAP[unit]?.[display] || 1;
};

const convertValue = (value, unit, display, direction = "display") => {
  if (!display || !unit) return value;

  const factor = getConversionFactor(unit, display);
  if (factor === 1) return value;

  const result = direction === "display" ? value / factor : value * factor;

  return direction === "display" ? Number(result.toFixed(2)) : Math.round(result);
};

const displayValue = (value, def) => {
  return convertValue(value, def.unit, def.display, "display");
};

const parseValue = (value, def) => {
  const numValue = Number(value);

  if (isNaN(numValue)) return value;

  const converted = convertValue(numValue, def.unit, def.display, "parse");
  return def.type === "number" ? converted : value;
};

const getDisplayMinMax = (def) => {
  if (def.min === undefined && def.max === undefined) return {};
  if (!def.display || !def.unit) {
    return { min: def.min, max: def.max };
  }

  return {
    min: def.min !== undefined ? convertValue(def.min, def.unit, def.display, "display") : undefined,
    max: def.max !== undefined ? convertValue(def.max, def.unit, def.display, "display") : undefined,
  };
};

// VALIDATION
const validateValue = (value, def) => {
  if (def.type !== "number") {
    return { valid: true };
  }

  const num = Number(value);
  if (isNaN(num)) {
    return { valid: false, error: "Please enter a valid number" };
  }

  const { min, max } = getDisplayMinMax(def);

  if (min !== undefined && num < min) {
    return {
      valid: false,
      error: `Minimum Value: ${min}`,
    };
  }

  if (max !== undefined && num > max) {
    return {
      valid: false,
      error: `Maximum Value: ${max}`,
    };
  }

  return { valid: true };
};

const validateAllSettings = (serverDefinitions) => {
  let isValid = true;

  document.querySelectorAll("#settingsForm input").forEach((input) => {
    const def = getDefinition(input.id, input, serverDefinitions);
    if (!def || def.type !== "number") return;

    const validation = validateValue(input.value, def);

    if (!validation.valid) {
      showError(input, validation.error);
      isValid = false;
    } else {
      clearError(input);
    }
  });

  return isValid;
};

// ERROR HANDLING
const showError = (element, message) => {
  const errorMsg = element.parentElement?.querySelector(".error-message");
  if (errorMsg) {
    errorMsg.textContent = message;
    errorMsg.style.display = "block";
    element.classList.add("invalid");
  }
};

const clearError = (element) => {
  const errorMsg = element.parentElement?.querySelector(".error-message");
  if (errorMsg) {
    errorMsg.style.display = "none";
    element.classList.remove("invalid");
  }
};

// INPUT CREATION
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

const createSettingOption = (key, def) => {
  const { value, type, note, display, unit } = def;

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
  const input = type === "boolean" ? createBooleanInput(key, value, def) : createTextInput(key, value, def);
  const errorMsg = createElement("span", "error-message");
  errorMsg.style.display = "none";
  inputWrapper.appendChild(errorMsg);
  inputWrapper.appendChild(input);
  wrapper.append(label, inputWrapper);
  return wrapper;
};

// CHANGE DETECTION
const hasChanges = () => {
  return Array.from(document.querySelectorAll("#settingsForm input")).some((input) => {
    const original = input.dataset.original;
    const current = input.type === "checkbox" ? input.checked : input.value;
    return String(current) !== String(original);
  });
};

const updateChangeIndicator = () => {
  const saveBtn = document.getElementById("saveSettingsBtn");
  if (!saveBtn) return;

  if (hasChanges()) {
    saveBtn.classList.add("has-changes");
  } else {
    saveBtn.classList.remove("has-changes");
  }
};

// UI STATE UPDATES
const updateSaveButton = (text, disabled = false) => {
  const saveBtn = document.getElementById("saveSettingsBtn");
  if (saveBtn) {
    saveBtn.textContent = text;
    saveBtn.disabled = disabled;
  }
};

const showInfoMessage = (message, type = "info", keep = false) => {
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
  }, MESSAGE_DURATION);
};

// INPUT VALIDATION ATTACHMENT
const attachInputValidation = (serverDefinitions) => {
  document.querySelectorAll('#settingsForm input[type="number"]').forEach((input) => {
    input.addEventListener("blur", function () {
      const def = getDefinition(this.id, this, serverDefinitions);
      if (!def) return;

      const validation = validateValue(this.value, def);
      validation.valid ? clearError(this) : showError(this, validation.error);
    });

    input.addEventListener("input", function () {
      clearError(this);
    });
  });
};

const attachChangeListeners = () => {
  document.querySelectorAll("#settingsForm input").forEach((input) => {
    input.addEventListener("input", updateChangeIndicator);
  });
};

// SETTINGS COLLECTION
const collectSettings = (serverDefinitions) => {
  const settings = { server: {} };
  let hasError = false;

  document.querySelectorAll("#settingsForm input").forEach((input) => {
    const key = input.id;
    const def = getDefinition(key, input, serverDefinitions);

    if (!def) {
      console.warn(`Definition not found for input: ${key}`);
      return;
    }

    let value;

    if (input.type === "checkbox") {
      value = input.checked;
    } else if (input.type === "number") {
      value = input.value;
      const validation = validateValue(value, def);

      if (!validation.valid) {
        showError(input, validation.error);
        hasError = true;
        return;
      }
    } else {
      value = input.value;
    }

    settings.server[key] = parseValue(value, def);
  });

  return hasError ? null : settings;
};

// SERVER OPERATIONS
const waitForServer = (port, timeout = SERVER_TIMEOUT) => {
  return new Promise((resolve, reject) => {
    const startTime = Date.now();

    const check = async () => {
      try {
        const response = await fetch(`http://localhost:${port}/health`, {
          method: "GET",
          cache: "no-cache",
        });

        if (response.ok) {
          resolve();
        } else {
          throw new Error("Server not healthy");
        }
      } catch (error) {
        if (Date.now() - startTime > timeout) {
          reject(new Error("Server timeout"));
        } else {
          setTimeout(check, SERVER_CHECK_INTERVAL);
        }
      }
    };

    check();
  });
};

const handlePortChange = async (newPort, currentPort) => {
  if (String(newPort) !== String(currentPort)) {
    updateSaveButton("Connecting to the new port...");
    await waitForServer(newPort);
    window.location.href = `http://localhost:${newPort}`;
  } else {
    setTimeout(() => window.location.reload(), 1000);
  }
};

// MAIN FUNCTIONS
async function loadSettings() {
  try {
    const response = await fetch("/settings");

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const settings = await response.json();
    const serverSettings = settings.server;
    const settingsForm = document.getElementById("settingsForm");

    if (!settingsForm) {
      throw new Error("Settings form element not found");
    }

    settingsForm.innerHTML = "";

    Object.entries(serverSettings).forEach(([key, def]) => {
      if (!def.hidden) {
        const option = createSettingOption(key, def);
        settingsForm.appendChild(option);
      }
    });

    attachInputValidation(serverSettings);
    attachChangeListeners();
  } catch (error) {
    handleError(error, "loadSettings");
    const settingsForm = document.getElementById("settingsForm");
    if (settingsForm) {
      showInfoMessage("An error occurred while loading settings", "error", 1);
    }
  }
}

async function saveSettings() {
  try {
    updateSaveButton("Saving...", true);

    const response = await fetch("/settings");
    if (!response.ok) {
      throw new Error("Failed to retrieve settings");
    }

    const currentSettings = await response.json();

    if (!validateAllSettings(currentSettings.server)) {
      updateSaveButton("Save", false);
      showInfoMessage("Please enter correct values", "error");
      return;
    }

    const updated = collectSettings(currentSettings.server);
    if (!updated) {
      updateSaveButton("Save", false);
      return;
    }

    if (!hasChanges()) {
      updateSaveButton("Save", false);
      showInfoMessage("No changes were made", "info");
      return;
    }

    const saveResponse = await fetch("/update-settings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(updated),
    });

    if (!saveResponse.ok) {
      throw new Error(`HTTP error! status: ${saveResponse.status}`);
    }

    const result = await saveResponse.json();

    if (result.success) {
      updateSaveButton("Saved! Redirecting...");
      showInfoMessage("Settings have been saved successfully", "success");

      const portInput = document.getElementById("PORT");
      const newPort = portInput ? portInput.value : window.location.port || 3000;
      const currentPort = window.location.port || 3000;

      await handlePortChange(newPort, currentPort);
    } else {
      throw new Error(result.message || "Settings could not be saved");
    }
  } catch (error) {
    handleError(error, "saveSettings");
    updateSaveButton("Save", false);
    showInfoMessage("An error occurred: " + error.message, "error");
  }
}

async function resetSettings() {
  if (!confirm("All settings will be reset to default values. Are you sure?")) {
    return;
  }

  try {
    const response = await fetch("/reset-settings", {
      method: "POST",
    });

    if (!response.ok) {
      throw new Error("Settings could not be reset");
    }

    showInfoMessage("Settings have been reset", "success");
    setTimeout(() => window.location.reload(), 1000);
  } catch (error) {
    handleError(error, "resetSettings");
    showInfoMessage("An error occurred while resetting the settings", "error");
  }
}
