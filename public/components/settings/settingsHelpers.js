import { dom } from "../../core/dom.js";

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

export const handleError = (error, context) => {
  console.error(`Error in ${context}:`, error);
  return null;
};

export const formatKeyName = (key) => {
  return key
    .split("_")
    .map((word) => word.charAt(0) + word.slice(1).toLowerCase())
    .join(" ");
};

const getConversionFactor = (unit, display) => {
  return CONVERSION_MAP[unit]?.[display] || 1;
};

export const convertValue = (value, unit, display, direction = "display") => {
  if (!display || !unit) return value;
  const factor = getConversionFactor(unit, display);
  if (factor === 1) return value;

  const result = direction === "display" ? value / factor : value * factor;
  return direction === "display" ? Number(result.toFixed(2)) : Math.round(result);
};

export const displayValue = (value, def) => {
  return convertValue(value, def.unit, def.display, "display");
};

export const parseValue = (value, def) => {
  const numValue = Number(value);
  if (isNaN(numValue)) return value;
  const converted = convertValue(numValue, def.unit, def.display, "parse");
  return def.type === "number" ? converted : value;
};

export const getDisplayMinMax = (def) => {
  if (def.min === undefined && def.max === undefined) return {};
  if (!def.display || !def.unit) return { min: def.min, max: def.max };

  return {
    min: def.min !== undefined ? convertValue(def.min, def.unit, def.display, "display") : undefined,
    max: def.max !== undefined ? convertValue(def.max, def.unit, def.display, "display") : undefined,
  };
};

export const validateValue = (value, def) => {
  if (def.type !== "number") return { valid: true };
  const num = Number(value);
  if (isNaN(num)) return { valid: false, error: "Invalid number" };

  const { min, max } = getDisplayMinMax(def);
  if (min !== undefined && num < min) return { valid: false, error: `Min: ${min}` };
  if (max !== undefined && num > max) return { valid: false, error: `Max: ${max}` };

  return { valid: true };
};

export const updateSaveButton = (text, disabled = false) => {
  dom.settings.saveBtn.textContent = text;
  dom.settings.saveBtn.disabled = disabled;
};

export const getDefinition = (key, input, serverDefinitions) => {
  if (input.dataset.def) {
    try {
      return JSON.parse(input.dataset.def);
    } catch (e) {
      console.warn(`Failed to parse def for ${key}`);
    }
  }
  return serverDefinitions?.[key];
};

export const hasChanges = () => {
  return Array.from(dom.settings.form.querySelectorAll("input")).some((input) => {
    const original = input.dataset.original;
    const current = input.type === "checkbox" ? input.checked : input.value;
    return String(current) !== String(original);
  });
};

export const waitForServer = async (port, maxAttempts = 10, delay = 500) => {
  for (let i = 0; i < maxAttempts; i++) {
    try {
      const response = await fetch(`http://${window.location.hostname}:${port}/status`, {
        method: "GET",
        cache: "no-cache",
      });
      if (response.ok) return true;
    } catch (_) {
      // Server not ready yet
    }
    await new Promise((resolve) => setTimeout(resolve, delay));
  }
  throw new Error("Server did not respond");
};
