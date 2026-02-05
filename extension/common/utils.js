// Default Parser Options
const DEFAULT_PARSER_OPTIONS = {
  showArtist: { label: "Show Artist", type: "checkbox", value: true },
  showSource: { label: "Show Source", type: "checkbox", value: true },
  showCover: { label: "Show Cover", type: "checkbox", value: true },
  showTimeLeft: { label: "Show Time Left", type: "checkbox", value: true },
  showButtons: { label: "Show Buttons", type: "checkbox", value: true },
  showFavIcon: { label: "Show Small Site Icon", type: "checkbox", value: false },
  customCover: { label: "Custom Cover", type: "checkbox", value: false },
  customCoverUrl: { label: "Custom Cover URL", type: "text", value: "" },
};

// Logs
const logInfo = async (...args) => {
  const stored = await browser.storage.local.get("debugMode");
  const debugMode = stored.debugMode === 1 ? true : CONFIG.debugMode;
  if (!debugMode) return;

  const prefix = "[DISCORD-MUSIC-RPC - INFO]";
  if (typeof args[0] === "string" && args[0].includes("%c")) {
    console.info(`%c${prefix}%c ${args[0]}`, "color:#2196f3; font-weight:bold;", "color:#fff;", ...args.slice(1));
  } else {
    console.info(`%c${prefix}`, "color:#2196f3; font-weight:bold;", ...args);
  }
};

const logWarn = async (...args) => {
  const stored = await browser.storage.local.get("debugMode");
  const debugMode = stored.debugMode === 1 ? true : CONFIG.debugMode;
  if (!debugMode) return;

  const prefix = "%c[DISCORD-MUSIC-RPC - WARN]%c";
  const prefixCSS = ["color:#ff9800; font-weight:bold;", "color:#fff;"];
  console.log(prefix, ...prefixCSS, ...args);
};

const errorFilter = (() => {
  const ignorePatterns = [
    /No tab with id/i,
    /extension context invalidated/i,
    /could not establish connection/i,
    /failed to fetch/i,
    /update failed after all retries/i,
    /update failed \(no response\)/i,
    /Request timed out/i,
    /signal is aborted without reason/i,
  ];

  const shouldIgnore = (error) => {
    const errorString = error?.message?.toLowerCase() || error?.toString?.()?.toLowerCase() || "";
    return ignorePatterns.some((re) => re.test(errorString));
  };

  return { shouldIgnore };
})();

const logError = (...a) => {
  const safeStringify = (obj) => {
    const seen = new WeakSet();
    return JSON.stringify(obj, (key, value) => {
      if (typeof value === "object" && value !== null) {
        if (seen.has(value)) return "[Circular]";
        seen.add(value);
      }
      return value;
    });
  };

  const shouldIgnoreAny = a.some((arg) => errorFilter.shouldIgnore(arg));

  if (!shouldIgnoreAny) {
    console.error(
      "[DISCORD-MUSIC-RPC - ERROR]",
      ...a.map((arg) => {
        if (arg instanceof Error) {
          return `${arg.name || ""} ${arg.message || ""} ${arg.stack || ""}`;
        } else if (typeof arg === "object" && arg !== null) {
          return safeStringify(arg);
        }
        return arg?.toString?.() || "";
      }),
    );
  }
};

// Update Color Delete Button Visibility
function updateDeleteButtonVisibility(item, pickerValue, btnDelete, colorConfig) {
  const currentValue = colorConfig[item.key];
  const defaultValue = item.default;

  // If there is no value in the config, it means the default is being used
  if (!currentValue) {
    btnDelete.classList.add("disabled");
    return;
  }

  // Normalize both colors with tinycolor
  const current = tinycolor(currentValue);
  const defaultColor = tinycolor(defaultValue);

  // Compare RGBA values
  const currentRgba = current.toRgb();
  const defaultRgba = defaultColor.toRgb();

  const isDefault =
    currentRgba.r === defaultRgba.r && currentRgba.g === defaultRgba.g && currentRgba.b === defaultRgba.b && Math.abs(currentRgba.a - defaultRgba.a) < 0.01;

  if (isDefault) {
    btnDelete.classList.add("disabled");
  } else {
    btnDelete.classList.remove("disabled");
  }
}

// Settings Panel - Color Settings
function getColorSettings() {
  return [
    {
      key: "backgroundColor",
      label: "Background Color",
      cssVar: "--background-color",
      default: getCSSThemeDefault("--background-color"),
    },
    {
      key: "foregroundColor",
      label: "Foreground Color",
      cssVar: "--foreground-color",
      default: getCSSThemeDefault("--foreground-color-100"),
    },
    {
      key: "accentColor",
      label: "Accent Color",
      cssVar: "--accent-color",
      default: getCSSThemeDefault("--accent-color"),
    },
  ];
}

// Background Image settings
async function applyBackgroundSettings() {
  const bgStorage = await browser.storage.local.get("backgroundSettings");
  const bgSettings = bgStorage.backgroundSettings;

  if (!bgSettings || !bgSettings.image) {
    document.body.style.backgroundImage = "";
    document.body.style.backdropFilter = "";
    return;
  }

  document.body.style.backgroundImage = `url(${bgSettings.image})`;
  document.body.style.backgroundSize = "cover";
  document.body.style.backgroundPosition = "center";
  document.body.style.backgroundRepeat = "no-repeat";
  document.body.style.backgroundPositionX = `${bgSettings.positionX}%`;
  document.body.style.backdropFilter = `blur(${bgSettings.blur}px) brightness(${bgSettings.brightness}%) saturate(${bgSettings.saturation}%)`;
  debounce(async () => {
    // save style attribute to local storage
    await browser.storage.local.set({ styleAttrs: document.body.getAttribute("style") });
  }, 100)();
}

// Color Settings
const saveStyleAttrs = debounce(async () => {
  await browser.storage.local.set({
    styleAttrs: document.body.getAttribute("style"),
  });
}, 100);

async function applyColorSettings() {
  const stored = await browser.storage.local.get("colorSettings");
  const config = stored.colorSettings || {};
  const COLORS = getColorSettings();

  for (const item of COLORS) {
    const val = config[item.key];
    if (val) {
      document.body.style.setProperty(item.cssVar, val);
    } else {
      document.body.style.removeProperty(item.cssVar);

      // Clear derived colors when the foreground is deleted
      if (item.key === "foregroundColor") {
        for (let i = 1; i <= 7; i++) {
          document.body.style.removeProperty(`--foreground-color-${i * 100}`);
        }
      }
    }
  }

  // Foreground derivation
  if (config.foregroundColor) {
    const theme = document.body.getAttribute("data-theme") || "dark";

    // Gradient handling
    if (isGradient(config.foregroundColor)) {
      const gradientInfo = parseGradient(config.foregroundColor);
      const fgScaleGradients = generateForegroundScaleGradients(gradientInfo, theme);

      fgScaleGradients.forEach((gradient, index) => {
        document.body.style.setProperty(`--foreground-color-${(index + 1) * 100}`, gradient);
      });
    } else {
      const fgScale = generateForegroundScale(config.foregroundColor, theme);
      fgScale.forEach((color, index) => {
        document.body.style.setProperty(`--foreground-color-${(index + 1) * 100}`, color);
      });
    }
  }

  // Accent color bright variant
  if (config.accentColor) {
    if (isGradient(config.accentColor)) {
      const gradientInfo = parseGradient(config.accentColor);
      const brightenedColors = gradientInfo.colors.map((color) => {
        const base = tinycolor(color);
        const alpha = base.getAlpha();
        const bright = base.clone().lighten(12);
        bright.setAlpha(alpha);
        return bright.toRgbString();
      });

      // Create a bright version for the entire gradient
      const brightGradient = `linear-gradient(${gradientInfo.degree}deg, ${brightenedColors.join(", ")})`;
      document.body.style.setProperty("--accent-color-bright", brightGradient);

      // Use the middle color for the border
      const middleIndex = Math.floor(gradientInfo.colors.length / 2);
      const borderColor = gradientInfo.colors[middleIndex];
      document.body.style.setProperty("--accent-color-border", borderColor);
    } else {
      const base = tinycolor(config.accentColor);
      const alpha = base.getAlpha();
      const bright = base.clone().lighten(12);
      bright.setAlpha(alpha);
      document.body.style.setProperty("--accent-color-bright", bright.toRgbString());

      // If it's a single color, use the same color
      document.body.style.setProperty("--accent-color-border", config.accentColor);
    }
  } else {
    // Clear the bright variant and border when the accent color is deleted
    document.body.style.removeProperty("--accent-color-bright");
    document.body.style.removeProperty("--accent-color-border");
  }

  saveStyleAttrs();
}

// Check if value is a gradient
function isGradient(value) {
  return value && value.includes("linear-gradient");
}

// Parse the gradient (degree and colors)
function parseGradient(gradientString) {
  const degreeMatch = gradientString.match(/linear-gradient\((\d+)deg/);
  const degree = degreeMatch ? degreeMatch[1] : "90";
  const colors = extractGradientColors(gradientString);
  return { degree, colors };
}

// Extract colors from the gradient
function extractGradientColors(gradientString) {
  const match = gradientString.match(/rgba?\([^)]+\)/g);
  return match || [];
}

// Create foreground scales for the gradient (each one is a gradient)
function generateForegroundScaleGradients(gradientInfo, theme = "dark") {
  const { degree, colors } = gradientInfo;
  const steps = [0, 6, 12, 18, 26, 36, 48];

  return steps.map((step) => {
    // Lighten/darken for each color
    const scaledColors = colors.map((color) => {
      const base = tinycolor(color);
      const alpha = base.getAlpha();
      const scaled = theme === "dark" ? base.clone().lighten(step) : base.clone().darken(step);
      scaled.setAlpha(alpha);
      return scaled.toRgbString();
    });

    // Create new gradient
    return `linear-gradient(${degree}deg, ${scaledColors.join(", ")})`;
  });
}

// Create foreground scales for a single color
function generateForegroundScale(baseColor, theme = "dark") {
  const base = tinycolor(baseColor);
  const alpha = base.getAlpha();

  const steps = [0, 6, 12, 18, 26, 36, 48];

  return steps.map((step) => {
    const color = theme === "dark" ? base.clone().lighten(step) : base.clone().darken(step);
    color.setAlpha(alpha);
    return color.toRgbString();
  });
}

// Get the default value from CSS
function getCSSThemeDefault(cssVar) {
  const computed = getComputedStyle(document.documentElement).getPropertyValue(cssVar).trim();

  // If there is a value, convert it to RGBA format
  if (computed) {
    const color = tinycolor(computed);
    return color.toRgbString();
  }
}

function getDefaultCSSValue(item) {
  if (item.key === "foregroundColor") {
    return getCSSThemeDefault("--foreground-color-100");
  }
  return getCSSThemeDefault(item.cssVar);
}

// Delay
const delay = (ms) => new Promise((res) => setTimeout(res, ms));

// Debounce
function debounce(fn, delay) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), delay);
  };
}

// Throttle
function throttle(fn, wait) {
  let last = 0;
  return function (...args) {
    const now = Date.now();
    if (now - last >= wait) {
      last = now;
      fn.apply(this, args);
    }
  };
}

// Mutex
function createMutex() {
  let lock = Promise.resolve();
  return async (fn) => {
    const unlock = lock;
    let resolveNext;
    lock = new Promise((r) => (resolveNext = r));
    await unlock;
    try {
      return await fn();
    } finally {
      resolveNext();
    }
  };
}

// Waits for a condition to become true
function waitFor(fn, maxWait = 1000) {
  const start = performance.now();

  return new Promise((resolve, reject) => {
    try {
      if (fn()) return resolve(true);
    } catch (error) {
      return reject(error);
    }

    const tick = () => {
      try {
        if (fn()) return resolve(true);
        if (performance.now() - start >= maxWait) return resolve(false);
        requestAnimationFrame(tick);
      } catch (error) {
        reject(error);
      }
    };

    requestAnimationFrame(tick);
  });
}

// Time
const getCurrentTime = () => new Date().toLocaleTimeString("en-GB", { hour12: false });
const dateToday = new Date();
const dateYesterday = new Date();
dateYesterday.setDate(dateToday.getDate() - 1);
const isSameDay = (d1, d2) => d1.getFullYear() === d2.getFullYear() && d1.getMonth() === d2.getMonth() && d1.getDate() === d2.getDate();

// Time Calculations
function getStartTime(range, customStart = null, customEnd = null) {
  const now = new Date();

  const setStartOfDay = (d) => {
    d.setHours(0, 0, 0, 0);
    return d;
  };

  const setEndOfDay = (d) => {
    d.setHours(23, 59, 59, 999);
    return d;
  };

  let startTime = 0;
  let endTime = now.getTime();

  if (range === "custom" && customStart) {
    return { startTime: customStart, endTime: customEnd || endTime };
  }

  switch (range) {
    case "day": {
      const d = setStartOfDay(new Date(now));
      startTime = d.getTime();
      endTime = setEndOfDay(new Date(now)).getTime();
      break;
    }

    case "yesterday": {
      const d = setStartOfDay(new Date(now));
      d.setDate(d.getDate() - 1);
      startTime = d.getTime();
      endTime = setEndOfDay(new Date(d)).getTime();
      break;
    }

    case "week": {
      const d = setStartOfDay(new Date(now));
      const diff = d.getDay() === 0 ? -6 : 1 - d.getDay();
      d.setDate(d.getDate() + diff);
      startTime = d.getTime();

      const weekEnd = new Date(d);
      weekEnd.setDate(weekEnd.getDate() + 6);
      endTime = setEndOfDay(weekEnd).getTime();
      break;
    }

    case "month": {
      const start = new Date(now.getFullYear(), now.getMonth(), 1);
      const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
      startTime = start.getTime();
      endTime = setEndOfDay(end).getTime();
      break;
    }

    case "lastMonth": {
      const start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const end = new Date(now.getFullYear(), now.getMonth(), 0);
      startTime = start.getTime();
      endTime = setEndOfDay(end).getTime();
      break;
    }

    case "3months": {
      const start = new Date(now.getFullYear(), now.getMonth() - 3, 1);
      const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
      startTime = start.getTime();
      endTime = setEndOfDay(end).getTime();
      break;
    }

    case "6months": {
      const start = new Date(now.getFullYear(), now.getMonth() - 6, 1);
      const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
      startTime = start.getTime();
      endTime = setEndOfDay(end).getTime();
      break;
    }

    case "year": {
      const start = new Date(now.getFullYear(), 0, 1);
      const end = new Date(now.getFullYear(), 11, 31);
      startTime = start.getTime();
      endTime = setEndOfDay(end).getTime();
      break;
    }

    case "all": {
      startTime = 0;
      endTime = now.getTime();
      break;
    }

    default: {
      startTime = 0;
      endTime = now.getTime();
      break;
    }
  }

  return { startTime, endTime };
}

// Date formatting
const userLocale = navigator.languages?.[0] || navigator.language || "en-US";
const dateHourMinute = (time) =>
  time.toLocaleTimeString(userLocale, {
    hour: "2-digit",
    minute: "2-digit",
    hour12: undefined,
  });

const dateFull = (time) =>
  time.toLocaleDateString(userLocale, {
    weekday: "long",
    day: "2-digit",
    month: "long",
    year: "numeric",
  });

// Format Label
function formatLabel(name) {
  const capitalized = name.charAt(0).toUpperCase() + name.slice(1);
  return capitalized.replace(/([A-Z0-9])/g, " $1").trim();
}

// Normalize artist name
function normalizeArtistName(name) {
  if (!name) return "";
  return name
    .split(/,|&|feat\.|Feat\.|FEAT\./)[0]
    .trim()
    .toLowerCase();
}

// Normalize host string
const normalizeHost = (hostOrUrl) => {
  try {
    if (!hostOrUrl || typeof hostOrUrl !== "string") return "";
    if (!hostOrUrl.includes("://")) {
      return hostOrUrl
        .trim()
        .replace(/^www\./g, "")
        .toLowerCase();
    }
    return new URL(hostOrUrl).hostname
      .trim()
      .replace(/^www\./g, "")
      .toLowerCase();
  } catch {
    return "";
  }
};

function isDomainMatch(parserDomainRaw, tabHostnameRaw) {
  const parserDomain = normalizeHost(parserDomainRaw);
  const tabDomain = normalizeHost(tabHostnameRaw);

  if (!parserDomain || !tabDomain) return false;
  if (parserDomain === tabDomain) return true;
  if (parserDomain.startsWith("*.")) {
    const base = parserDomain.slice(2);
    return tabDomain.endsWith(`.${base}`) && tabDomain !== base;
  }
  return false;
}

// Url Pattern Regex
const parseUrlPattern = (pattern) => {
  if (pattern instanceof RegExp) return pattern;
  if (typeof pattern === "string") {
    const match = pattern.match(/^\/(.+)\/([gimsuy]*)$/);
    try {
      return new RegExp(match?.[1] ?? pattern, match?.[2] ?? "");
    } catch (e) {
      logWarn("Invalid regex:", pattern, e);
    }
  }
  return /.^/;
};

// Find matching parsers for URL
const findMatchingParsersForUrl = (url, list) => {
  const host = normalizeHost(url);
  return list.filter(({ domain }) => {
    const d = normalizeHost(domain);
    return d && host === d;
  });
};

// Fetch with timeout
const fetchWithTimeout = async (url, options = {}, timeout = 5000) => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);

  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    clearTimeout(timer);
    return response;
  } catch (err) {
    clearTimeout(timer);
    if (err.name === "AbortError") {
      logError(`Request timed out after ${timeout / 1000} seconds: ${url}`);
    } else {
      logError(`Fetch error: ${url}`, err);
    }
    throw err;
  }
};

// Create SVG
const svgCache = new Map();
function createSVG(paths, options = {}) {
  // SVG cache
  const key = paths.join("");
  if (svgCache.has(key)) return svgCache.get(key).cloneNode(true);

  const { width = 16, height = 16, stroke = "var(--icon-color)", strokeWidth = 2, fill = "none", viewBox = "0 0 24 24" } = options;
  const cacheKey = `${paths.join("|")}|${width}|${height}|${stroke}|${strokeWidth}|${fill}|${viewBox}`;

  if (svgCache.has(cacheKey)) {
    return svgCache.get(cacheKey).cloneNode(true);
  }

  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("width", width);
  svg.setAttribute("height", height);
  svg.setAttribute("viewBox", viewBox);
  svg.setAttribute("fill", fill);
  svg.setAttribute("stroke", stroke);
  svg.setAttribute("stroke-width", strokeWidth);
  svg.setAttribute("stroke-linecap", "round");
  svg.setAttribute("stroke-linejoin", "round");

  for (const d of paths) {
    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute("d", d);
    svg.appendChild(path);
  }

  if (svgCache.size < 50) {
    svgCache.set(cacheKey, svg.cloneNode(true));
  }

  return svg;
}

const svg_paths = {
  redirectIconPaths: ["M18 3h3v3", "M21 3l-9 9", "M15 3H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-9"],
  gearIconPaths: [
    `M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7z M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06 a1.65 1.65
     0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09 a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83
     l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4 h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2
     2 0 1 1 2.83-2.83 l.06.06a1.65 1.65 0 0 0 1.82.33h.09a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09 a1.65 1.65 0 0 0 1 1.51h.09a1.65 1.65 0
     0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83 l-.06.06a1.65 1.65 0 0 0-.33 1.82v.09a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4 h-.09a1.65 1.65 0 0 0-1.51 1z`,
  ],
  trashIconPaths: ["M3 6h18", "M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2", "M19 6l-1.5 14h-11L5 6", "M10 11v6", "M14 11v6"],
  historyIconPaths: ["M3 3v5h5", "M3.05 13a9 9 0 1 0 2.13-9.36L3 8", "M12 7v5l3 3"],
  historyStatsIconPaths: [
    "M9 5c0-1.1.9-2 2-2h2c1.1 0 2 .9 2 2v14c0 1.1-.9 2-2 2h-2c-1.1 0-2-.9-2-2V5z",
    "M3 11c0-1.1.9-2 2-2h2c1.1 0 2 .9 2 2v8c0 1.1-.9 2-2 2H5c-1.1 0-2-.9-2-2v-8z",
    "M15 7c0-1.1.9-2 2-2h2c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2h-2c-1.1 0-2-.9-2-2V7z",
  ],
  backIconPaths: ["M19 20l-8-8 8-8"],
  forwardIconPaths: ["M5 4l8 8-8 8"],
  crossIconPaths: ["M6 6L18 18 M18 6L6 18"],
  minusIconPaths: ["M6 12L18 12"],
  plusIconPaths: ["M12 6L12 18 M6 12L18 12"],
  filterIconPaths: ["M3 4h18", "M6 12h12", "M10 20h4"],
  pauseIconPaths: ["M6 5h4v14H6z", "M14 5h4v14h-4z"],
  startIconPaths: ["M8 5v14l10-7z"],
  exportIconPaths: [
    "M20.15,13.1h1.35v6.9a1.9,1.9,0,0,1-1.9,1.9H4.4a1.9,1.9,0,0,1-1.9-1.9V5.6a1.9,1.9,0,0,1,1.9-1.9h6.9v1.35H4.4a0.7,0.7,0,0,0-0.7,0.7V19.8a0.7,0.7,0,0,0,0.7,0.7H19.6a0.7,0.7,0,0,0,0.7-0.7Z",
    "M17,2.6v1h4L12.7,11.6l0.9,0.9L21.9,4.2v3.4h.7V2.8Z",
  ],
  penIconPaths: [
    "M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25z",
    "M20.71 7.04a1.003 1.003 0 0 0 0-1.42l-2.34-2.34a1.003 1.003 0 0 0-1.42 0l-1.83 1.83 3.75 3.75 1.84-1.82z",
  ],
};

// Get Fresh Parser List
async function getFreshParserList() {
  const { parserList = [] } = await browser.storage.local.get("parserList");
  return Array.isArray(parserList) ? parserList : [];
}

// Helper to split time strings like "5:47 / 6:57".
function extractTimeParts(input) {
  if (typeof input === "string" && input.includes("/")) {
    const [start, end] = input.split("/");
    return [start.trim(), end.trim()];
  }
  return [null, null];
}

// Helper to convert mm:ss to seconds.
function parseTime(timeInput) {
  if (typeof timeInput === "number" && isFinite(timeInput)) {
    return Math.floor(timeInput);
  }
  if (typeof timeInput !== "string") return 0;

  let s = timeInput.trim();
  if (s === "") return 0;

  // catch any short/long dash/minus character
  const neg = /^[-–—]/.test(s);
  s = s.replace(/^[-–—]+/, "");

  const parts = s.split(":").reverse();
  const seconds = parts.reduce((acc, part, i) => {
    const n = parseInt(part, 10);
    return acc + (isNaN(n) ? 0 : n * Math.pow(60, i));
  }, 0);

  return neg ? -seconds : seconds;
}

// Helper to convert seconds to mm:ss format.
function formatTime(seconds) {
  if (typeof seconds === "string") {
    seconds = parseTime(seconds);
  }

  if (!isFinite(seconds) || typeof seconds !== "number") return "00:00";

  const neg = seconds < 0;
  seconds = Math.abs(Math.floor(seconds));

  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;

  let formatted;
  if (hrs > 0) {
    formatted = `${hrs}:${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
  } else {
    formatted = `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
  }

  return (neg ? "-" : "") + formatted;
}

// Helper to get timestamps
function getTimestamps(currentPosition, totalDuration, options = { returnEnd: true }) {
  if (isNaN(currentPosition) || isNaN(totalDuration) || totalDuration <= 0) {
    return {};
  }

  const now = Date.now();

  // Start is "now"
  const startTimestamp = now;

  if (options.returnEnd) {
    // End is "now + remaining time"
    const remaining = totalDuration - currentPosition;
    return {
      startTimestamp,
      endTimestamp: startTimestamp + Math.max(0, remaining) * 1000,
    };
  } else {
    return { startTimestamp };
  }
}

// Parses playback time values and returns detailed playback information.
function processPlaybackInfo(timePassed = "", durationElem = "", progress = 0, duration = 0) {
  if (typeof timePassed === "string" && typeof durationElem === "string") {
    timePassed = timePassed.trim();
    durationElem = durationElem.trim();
    progress = parseTime(timePassed);
    duration = parseTime(durationElem);
  } else {
    progress = Number(timePassed) || 0;
    duration = Number(durationElem) || 0;
  }

  const currentPosition = Math.max(0, progress);
  const totalDuration = Math.max(0, duration);
  const timestamps = getTimestamps(currentPosition, totalDuration);
  const currentProgress = totalDuration ? (currentPosition / totalDuration) * 100 : 0;

  return {
    currentPosition,
    totalDuration,
    currentProgress,
    timestamps,
  };
}

/**
 *Selects the element, takes the desired Attribute (or TextContent), then applies optional operations.
 * @param {string} selector - CSS selector
 * @param {object} options - Optional Parameters
 *    - attr: String, Element Attribute Name (eg "href", "title", "src")
 *    - transform: Function, function that will be processed on the string received
 *    - root: Element or Document, Search Root (default: document)
 * @returns {string} - processed string or empty string
 */
function getText(selector, options = {}) {
  const { attr = null, transform = null, root = document } = options;
  const elem = root.querySelector(selector);
  if (!elem) return "";

  let val = attr ? elem.getAttribute(attr) : elem.textContent;
  if (!val) return "";

  val = val.trim();

  if (transform) {
    try {
      val = transform(val);
      if (!val) return "";
    } catch (_) {
      return "";
    }
  }

  return val;
}

/**
 * Gets text/attributes from ALL matching elements
 * @param {string} selector - CSS selector
 * @param {object} options - Same as getText options
 * @returns {string[]} - Array of processed strings
 */
function getTextAll(selector, options = {}) {
  const { root = document, ...rest } = options;
  const elements = root.querySelectorAll(selector);

  return Array.from(elements)
    .map((el) => getText(selector, { ...rest, root: el.parentElement }))
    .filter((val) => val !== "");
}

/**
 * Retrieves image URL from element matching selector.
 *
 * @param {string} selector - CSS selector to find the image element.
 * @param {Document|Element} [root=document] - Root element for querySelector.
 * @returns {string|null} Image URL or null if not found.
 */
function getImage(selector, root = document) {
  const elem = root.querySelector(selector);
  if (!elem) return null;

  // Priority: element directly <img>
  if (elem.tagName.toLowerCase() === "img" && elem.src) {
    return elem.src;
  }

  // Alternative: background-image
  const bgImage = getComputedStyle(elem).backgroundImage;
  if (bgImage && bgImage !== "none") {
    const match = bgImage.match(/url\(["']?(.+?)["']?\)/);
    return match ? match[1] : null;
  }

  // Alternative: check for <img> inside
  const childImg = elem.querySelector("img");
  return childImg?.src || null;
}

/**
 * Gets image URLs from ALL matching elements
 * @param {string} selector - CSS selector
 * @param {Document|Element} root - Search root
 * @returns {string[]} - Array of image URLs
 */
function getImageAll(selector, root = document) {
  const elements = root.querySelectorAll(selector);

  return Array.from(elements)
    .map((el) => getImage(el.tagName === "IMG" ? el : selector, el.parentElement))
    .filter((url) => url !== null);
}

// Deep query selector that traverses shadow DOMs
function querySelectorDeep(selector, root = document) {
  const el = root.querySelector(selector);
  if (el) return el;

  const elemsWithShadow = root.querySelectorAll("*");
  for (const el of elemsWithShadow) {
    if (el.shadowRoot) {
      const found = querySelectorDeep(selector, el.shadowRoot);
      if (found) return found;
    }
  }
  return null;
}

// Pattern hash creation
function hashFromPatternStrings(patterns) {
  return btoa(patterns.join("|"))
    .replace(/[^a-zA-Z0-9]/g, "")
    .slice(0, 10);
}

// Create ID from domain and patterns
function makeIdFromDomainAndPatterns(domain, urlPatterns) {
  const patternStrings = (urlPatterns || [])
    .map((p) => {
      if (typeof p === "string") return p;
      if (p instanceof RegExp) return p.source;
      return p.toString();
    })
    .sort();
  return `${domain}_${hashFromPatternStrings(patternStrings)}`;
}

// Create a platform dropdown with options
function createPlatformDropdown(label, options, manifestVersion) {
  const container = document.createElement("div");
  container.classList.add("setup-link-dropdown-container");

  const button = document.createElement("a");
  button.textContent = label;
  button.classList.add("setup-link", "setup-link-dropdown-toggle");
  container.appendChild(button);

  const dropdown = document.createElement("div");
  dropdown.classList.add("setup-dropdown");
  container.appendChild(dropdown);

  options.forEach((option) => {
    const dropdownLink = document.createElement("a");
    dropdownLink.href = option.url.replace(/{version}/g, manifestVersion);
    dropdownLink.textContent = option.label;
    dropdownLink.target = "_blank";
    dropdownLink.rel = "noopener noreferrer";
    dropdownLink.classList.add("setup-dropdown-item");
    dropdown.appendChild(dropdownLink);
  });

  // Toggle dropdown
  let leaveTimeout;

  const showDropdown = () => {
    clearTimeout(leaveTimeout);
    dropdown.classList.add("show");
  };

  const hideDropdown = () => {
    leaveTimeout = setTimeout(() => {
      dropdown.classList.remove("show");
    }, 100);
  };

  container.addEventListener("click", showDropdown);
  container.addEventListener("mouseleave", hideDropdown);
  dropdown.addEventListener("mouseenter", showDropdown);
  dropdown.addEventListener("mouseleave", hideDropdown);

  return container;
}

// Show initial setup dialog
function showInitialSetupDialog() {
  const dialog = document.createElement("div");
  dialog.className = "setup-dialog";

  const content = document.createElement("div");
  content.className = "setup-dialog-content";

  const contentHeader = document.createElement("h2");
  contentHeader.textContent = "Installation Required";
  content.appendChild(contentHeader);

  const contentText = document.createElement("p");
  contentText.textContent = "This extension requires a companion application to function properly. Please install the required application to continue.";
  content.appendChild(contentText);

  const contentLinkContainer = document.createElement("div");
  contentLinkContainer.classList.add("setup-link-container");
  content.appendChild(contentLinkContainer);

  const manifestVersion = browser.runtime.getManifest().version;

  // Windows Dropdown
  const windowsOptions = [
    {
      label: "Installer (EXE)",
      url: `https://github.com/KanashiiDev/discord-music-rpc/releases/download/{version}/Discord-Music-RPC-{version}-x64-installer.exe`,
    },
    {
      label: "Portable (ZIP)",
      url: `https://github.com/KanashiiDev/discord-music-rpc/releases/download/{version}/Discord-Music-RPC-{version}-x64.zip`,
    },
  ];
  contentLinkContainer.appendChild(createPlatformDropdown("Windows", windowsOptions, manifestVersion));

  // Linux Dropdown
  const linuxOptions = [
    {
      label: "AppImage (x64)",
      url: `https://github.com/KanashiiDev/discord-music-rpc/releases/download/{version}/discord-music-rpc-{version}-x86_64.AppImage`,
    },
    {
      label: "DEB (x64)",
      url: `https://github.com/KanashiiDev/discord-music-rpc/releases/download/{version}/discord-music-rpc-{version}-amd64.deb`,
    },
    {
      label: "RPM (x64)",
      url: `https://github.com/KanashiiDev/discord-music-rpc/releases/download/{version}/discord-music-rpc-{version}-x86_64.rpm`,
    },
  ];
  contentLinkContainer.appendChild(createPlatformDropdown("Linux", linuxOptions, manifestVersion));

  // MacOS Dropdown
  const macOptions = [
    {
      label: "Universal",
      url: `https://github.com/KanashiiDev/discord-music-rpc/releases/download/{version}/Discord-Music-RPC-{version}-universal.dmg`,
    },
  ];
  contentLinkContainer.appendChild(createPlatformDropdown("MacOS", macOptions, manifestVersion));

  const contentNote = document.createElement("p");
  contentNote.textContent = "The application is provided via the latest GitHub release.";
  contentNote.classList.add("setup-note");
  content.appendChild(contentNote);

  const contentNote2 = document.createElement("p");
  const noteText = document.createTextNode("Links not working?");
  const noteLink = document.createElement("a");
  noteLink.href = "https://github.com/KanashiiDev/discord-music-rpc/releases/latest";
  noteLink.target = "_blank";
  noteLink.rel = "noopener noreferrer";
  noteLink.textContent = "GitHub Releases";
  noteLink.classList.add("setup-link-github");
  noteLink.classList.add("setup-note-link");

  contentNote2.appendChild(noteText);
  contentNote2.appendChild(noteLink);
  content.appendChild(contentNote2);

  const confirmButton = document.createElement("button");
  confirmButton.id = "confirmSetup";
  confirmButton.textContent = "I have installed the application";
  content.appendChild(confirmButton);

  dialog.appendChild(content);
  document.body.appendChild(dialog);
  document.body.classList.add("setup-dialog-open");

  let confirmed = false;
  document.getElementById("confirmSetup").addEventListener("click", async () => {
    if (confirmed) return;
    confirmed = true;
    await browser.storage.local.set({ initialSetupDone: true });
    document.body.removeChild(dialog);
    document.body.classList.remove("setup-dialog-open");
    window.location.reload();
  });
}

// Show initial tutorial dialog
async function showInitialTutorial() {
  // Steps in the tutorial
  const steps = [
    {
      text: "You can open the settings by clicking on a music site.",
      selector: ".parser-entry",
    },
    {
      text: "You can enable/disable the music site by clicking on its switch.",
      selector: ".parser-entry .switch-label",
    },
    {
      text: 'You can add custom music site by clicking "Add Music Site" button.',
      selector: "#openSelector",
    },
    {
      text: 'You can manage your scripts by clicking "Open Script Manager" button.',
      selector: "#openManager",
    },
  ];

  // References to DOM elements
  const tooltip = document.getElementById("tutorialTooltip");
  const tooltipHeader = document.getElementById("tooltipHeader");
  const tooltipText = document.getElementById("tooltipText");
  const nextBtn = document.getElementById("tooltipNextBtn");
  const skipBtn = document.getElementById("tooltipSkipBtn");
  const siteList = document.getElementById("siteList");
  const allEntries = document.querySelectorAll(".header-container, .parser-entry, #searchBox, #openSelector, #openManager, .simplebar-track.simplebar-vertical");

  // Initial settings
  let currentStep = 0;
  tooltip.style.display = "block";
  siteList.style.pointerEvents = "none";

  // Highlight a specific item
  function highlightElement(targetEl) {
    // Add fading to all entries
    allEntries.forEach((entry) => entry.classList.add("fading"));

    // If there is a target element, remove fading from it
    if (targetEl) {
      targetEl.classList.remove("fading");

      // If the target element is inside a parser entry, remove it from there as well.
      const parserParent = targetEl.closest(".parser-entry");
      if (parserParent) {
        parserParent.classList.remove("fading");
      }
    }

    // Remove previous highlights
    document.querySelectorAll(".tutorialTooltip-highlight").forEach((el) => el.classList.remove("tutorialTooltip-highlight"));

    // Add Highlight
    if (targetEl) {
      targetEl.classList.add("tutorialTooltip-highlight");
    }
  }

  // Set the tooltip position relative to the target element
  function positionTooltip(targetEl) {
    if (!targetEl) return;

    const rect = targetEl.getBoundingClientRect();
    const scrollTop = document.documentElement.scrollTop || document.body.scrollTop;
    const scrollLeft = document.documentElement.scrollLeft || document.body.scrollLeft;

    const tooltipHeight = tooltip.offsetHeight;
    const popupHeight = document.body.scrollHeight;

    // Place the tooltip below or above the target
    const top = rect.bottom + 8 + tooltipHeight > popupHeight ? rect.top + scrollTop - tooltipHeight - 12 : rect.bottom + scrollTop + 8;

    tooltip.style.top = `${top}px`;
    tooltip.style.left = `${rect.left + scrollLeft}px`;

    // Let the tooltip not go outside the screen
    const tooltipRect = tooltip.getBoundingClientRect();
    if (tooltipRect.right > window.innerWidth) {
      tooltip.style.left = `${window.innerWidth - tooltipRect.width - 10}px`;
    }
  }

  // Show a specific step
  function showStep(index) {
    const step = steps[index];
    const isLastStep = index + 1 >= steps.length;

    tooltipHeader.textContent = `Tutorial (${index + 1}/${steps.length})`;
    tooltipText.textContent = step.text;

    const targetEl = document.querySelector(step.selector);
    highlightElement(targetEl);
    positionTooltip(targetEl);

    // The last step is to show the 'Finish' button
    if (isLastStep) {
      nextBtn.classList.add("finish");
      nextBtn.textContent = "Finish";
      skipBtn.remove();
    }
  }

  // End the tutorial
  async function endTutorial() {
    tooltip.style.display = "none";
    siteList.style.pointerEvents = "";
    document.querySelectorAll(".tutorialTooltip-highlight").forEach((el) => el.classList.remove("tutorialTooltip-highlight"));
    allEntries.forEach((entry) => entry.classList.remove("fading"));
    await browser.storage.local.set({ initialTutorialDone: true });
  }

  // Event Listener
  nextBtn.addEventListener("click", async () => {
    currentStep++;
    if (currentStep >= steps.length) {
      await endTutorial();
    } else {
      showStep(currentStep);
    }
  });

  skipBtn.addEventListener("click", async () => {
    await endTutorial();
  });

  // Start the first step
  showStep(currentStep);
}

function getExistingElementSelector(text) {
  if (typeof text !== "string") return null;

  const trimmed = text.trim();
  if (!trimmed) return null;

  try {
    const el = document.querySelector(trimmed);
    if (el) {
      return trimmed;
    }
    return null;
  } catch {
    return null;
  }
}

function getPlainText(text) {
  if (typeof text !== "string") return text;
  const trimmed = text.trim();
  if (!trimmed) return null;

  const htmlTags = new Set([
    "html",
    "head",
    "body",
    "div",
    "span",
    "p",
    "a",
    "ul",
    "ol",
    "li",
    "table",
    "tr",
    "td",
    "th",
    "thead",
    "tbody",
    "tfoot",
    "section",
    "article",
    "nav",
    "header",
    "footer",
    "main",
    "aside",
    "form",
    "input",
    "textarea",
    "button",
    "select",
    "option",
    "label",
    "img",
    "canvas",
    "svg",
    "video",
    "audio",
    "source",
    "iframe",
    "script",
    "style",
    "link",
    "meta",
    "h1",
    "h2",
    "h3",
    "h4",
    "h5",
    "h6",
    "pre",
    "code",
    "blockquote",
    "figure",
    "figcaption",
    "strong",
    "em",
    "b",
    "i",
    "u",
    "small",
    "sub",
    "sup",
    "hr",
    "br",
  ]);
  if (/^[.#[]/.test(trimmed)) return null;
  if (!trimmed.includes(" ") && htmlTags.has(trimmed.toLowerCase())) return null;
  if (/[\s>+~.#:[\]]/.test(trimmed)) return null;
  return trimmed;
}

function openIndexedDB(DB_NAME, STORE_NAME, DB_VERSION) {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: null });
      }
    };

    request.onsuccess = (e) => {
      resolve(e.target.result);
    };

    request.onerror = (e) => {
      logError("IndexedDB open error:", e.target.error);
      reject(e.target.error);
    };
  });
}

function encodeValue(value) {
  if (value instanceof Uint8Array) {
    return {
      __type: "uint8array",
      data: btoa(String.fromCharCode(...value)),
    };
  }
  if (value instanceof ArrayBuffer) {
    const uint8 = new Uint8Array(value);
    return {
      __type: "arraybuffer",
      data: btoa(String.fromCharCode(...uint8)),
    };
  }
  return value;
}

async function exportIndexedDB(dbName) {
  return new Promise((resolve, reject) => {
    const openReq = indexedDB.open(dbName);

    openReq.onerror = () => reject(openReq.error);

    openReq.onsuccess = () => {
      const db = openReq.result;
      const tx = db.transaction(db.objectStoreNames, "readonly");

      const result = {};
      let pending = db.objectStoreNames.length;

      for (const storeName of db.objectStoreNames) {
        const store = tx.objectStore(storeName);

        const keysReq = store.getAllKeys();
        const valsReq = store.getAll();

        keysReq.onsuccess = () => {
          valsReq.onsuccess = () => {
            const entries = {};
            keysReq.result.forEach((key, i) => {
              entries[key] = encodeValue(valsReq.result[i]);
            });

            result[storeName] = entries;

            pending--;
            if (pending === 0) resolve(result);
          };
        };
      }
    };
  });
}

function decodeValue(value) {
  if (value?.__type === "uint8array") {
    const binary = atob(value.data);
    const arr = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) arr[i] = binary.charCodeAt(i);
    return arr;
  }

  if (value?.__type === "arraybuffer") {
    const binary = atob(value.data);
    const arr = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) arr[i] = binary.charCodeAt(i);
    return arr.buffer;
  }

  return value;
}

async function importIndexedDB(dbName, data) {
  await indexedDB.deleteDatabase(dbName);

  return new Promise((resolve, reject) => {
    const openReq = indexedDB.open(dbName);

    openReq.onupgradeneeded = () => {
      const db = openReq.result;

      for (const storeName of Object.keys(data)) {
        db.createObjectStore(storeName);
      }
    };

    openReq.onsuccess = () => {
      const db = openReq.result;

      const tx = db.transaction(Object.keys(data), "readwrite");

      for (const [storeName, entries] of Object.entries(data)) {
        const store = tx.objectStore(storeName);

        for (const [key, value] of Object.entries(entries)) {
          store.put(decodeValue(value), key);
        }
      }

      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    };
  });
}

async function getIconAsDataUrl() {
  const iconUrl = browser.runtime.getURL("icons/128x128.png");
  const response = await fetch(iconUrl);
  const blob = await response.blob();

  return await new Promise((resolve) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result);
    reader.readAsDataURL(blob);
  });
}

function parseRegexArray(input) {
  try {
    const trimmed = input.trim();
    const inner = trimmed.startsWith("[") && trimmed.endsWith("]") ? trimmed.slice(1, -1).trim() : trimmed;

    if (!inner) return [/.*/];

    const parts = inner
      .split(/,(?![^[]*])/g)
      .map((s) => s.trim())
      .filter(Boolean);

    const regexes = parts.map((str) => {
      const m = str.match(/^\/(.+)\/([gimsuy]*)$/);
      try {
        return m ? new RegExp(m[1], m[2]) : new RegExp(str);
      } catch {
        return /.*/;
      }
    });

    return regexes.length ? regexes : [/.*/];
  } catch {
    return [/.*/];
  }
}

// Validate URL function
const isValidUrl = (url) => {
  try {
    const parsed = new URL(url, location.origin);
    return parsed.protocol === "https:" || parsed.protocol === "http:";
  } catch (_) {
    return false;
  }
};

const isAllowedDomain = async (hostname, pathname) => {
  try {
    const normHost = normalizeHost(hostname);
    for (const parser of state.parserList) {
      if (!isDomainMatch(parser.domain, normHost)) continue;
      // URL pattern check
      const urlPatterns = parser.urlPatterns || [];
      const hasMatch = urlPatterns.length === 0 || urlPatterns.map(parseUrlPattern).some((re) => re.test(pathname));

      if (!hasMatch) continue;

      // Parser enabled check
      const cached = state.parserEnabledCache.has(parser.id) ? state.parserEnabledCache.get(parser.id) : parser.isEnabled !== false;
      if (cached) {
        return { ok: true, match: `Match: ${hostname}${pathname} (parser: ${parser.title || parser.id})` };
      }
    }

    return { ok: false, error: { code: 2, message: "Hostname not allowed, not starting watcher." } };
  } catch (err) {
    logError("Domain Match Error", err);
    return { ok: false, error: { code: 3, message: "Domain Match Error" } };
  }
};

// Helper function to safely get text content
const getSafeText = (getFn, key, fallback) => {
  try {
    const el = getFn(key);
    return el?.textContent?.trim() || fallback || null;
  } catch (_) {
    return fallback || null;
  }
};

// Helper function to safely get href
const getSafeHref = (getFn, key, fallback) => {
  try {
    const el = getFn(key);
    let raw = el?.getAttribute?.("href") ?? fallback;

    try {
      raw = new URL(raw, location.origin).href;
    } catch (_) {
      // If URL parsing fails, fallback to the original href
    }

    return isValidUrl(raw) ? raw : null;
  } catch (_) {
    try {
      fallback = new URL(fallback, location.origin).href;
    } catch (_) {}
    return isValidUrl(fallback) ? fallback : null;
  }
};

// Get Sender Tab
async function getSenderTab(sender) {
  if (sender?.tab?.id) return sender.tab;

  try {
    const [activeTab] = await browser.tabs.query({
      active: true,
      lastFocusedWindow: true,
    });
    if (activeTab) return activeTab;
  } catch (err) {
    logWarn("getSenderTab fallback error:", err);
  }

  return null;
}

// Activate simplebar
const simpleBarInstances = new WeakMap();
const panelPromises = new WeakMap();
const allPanels = new Set();

async function activateSimpleBar(targetIds, timeout = 500, interval = 30, maxWaitMs = 1000) {
  if (!Array.isArray(targetIds)) targetIds = [targetIds];
  const ids = targetIds.map((id) => String(id).replace(/^#/, ""));

  const results = [];

  for (const id of ids) {
    try {
      // Find the element
      const panel = document.getElementById(id);
      if (!panel) {
        results.push({ id, success: false, reason: "not_found" });
        continue;
      }

      // Wait for panel visibility
      const isVisible = await waitFor(() => {
        const style = getComputedStyle(panel);
        return style.display !== "none" && style.visibility !== "hidden" && panel.offsetWidth > 0 && panel.offsetHeight > 0;
      }, 200);

      if (!isVisible) {
        results.push({ id, success: false, reason: "not_visible" });
        continue;
      }

      // Initialize or update SimpleBar
      let instance = simpleBarInstances.get(panel);
      if (instance && typeof instance.recalculate === "function") {
        instance.recalculate();
        results.push({ id, success: true, action: "recalculated" });
      } else {
        // Clear the old instance
        if (instance?.unMount) {
          instance.unMount?.();
          simpleBarInstances.delete(panel);
          panelPromises.delete(panel);
          panel.dataset.sbInit = "";
        }
        // Create a new instance
        instance = new SimpleBar(panel, { autoHide: false });
        simpleBarInstances.set(panel, instance);
        allPanels.add(panel);
        panel.dataset.sbInit = "1";
        results.push({ id, success: true, action: "initialized" });
      }

      // Update the padding
      await updatePanelPadding(panel, timeout, interval);
    } catch (error) {
      results.push({ id, success: false, reason: "error", error: error.message });
    }
  }

  return results;
}
// Destroy Single Simplebar
async function destroySimplebar(panelOrId) {
  const panel = typeof panelOrId === "string" ? document.getElementById(panelOrId) : panelOrId;

  if (!panel || !simpleBarInstances.has(panel)) return;

  const instance = simpleBarInstances.get(panel);
  instance.el.querySelectorAll(":scope > .simplebar-track").forEach((el) => el.remove());
  instance.unMount?.();

  await new Promise((r) => requestAnimationFrame(r));
  await new Promise((r) => setTimeout(r, 16));

  // Cleanup
  simpleBarInstances.delete(panel);
  panel.dataset.sbInit = "";
  panel.style.paddingRight = "";
  allPanels?.delete?.(panel);
}

// Wait for unmount simplebar
function waitForUnmountSimplebars() {
  return new Promise((resolve) => {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        resolve();
      });
    });
  });
}

// Destroy other simplebars except the one with keepId
let destroyingSimplebars = false;
let destroyQueue = Promise.resolve();
async function destroyOtherSimpleBarsQueued(keepId) {
  destroyQueue = destroyQueue.then(() => destroyOtherSimpleBars(keepId));
  return destroyQueue;
}

async function destroyOtherSimpleBars(keepId) {
  if (destroyingSimplebars) return;
  destroyingSimplebars = true;

  try {
    const keepPanel = document.getElementById(keepId);
    const unmountPromises = [];

    allPanels.forEach((panel) => {
      if (panel !== keepPanel) {
        const instance = simpleBarInstances.get(panel);

        const scrollbar = instance.el.querySelectorAll(":scope > .simplebar-track");
        scrollbar.forEach((el) => el.remove());

        instance?.unMount?.();
        unmountPromises.push(waitForUnmountSimplebars());

        simpleBarInstances.delete(panel);
        panelPromises.delete(panel);
        panel.dataset.sbInit = "";
        panel.style.paddingRight = "2px";

        allPanels.delete(panel);
      }
    });

    await Promise.all(unmountPromises);

    if (keepId) {
      const header = document.getElementById("mainHeader");
      header.style.pointerEvents = "none";
      await waitForUnmountSimplebars();
      await new Promise((r) => setTimeout(r, 30));
      header.style.pointerEvents = "";
    }
  } finally {
    destroyingSimplebars = false;
  }
}

// If simplebar is added, update the element's padding
async function updatePanelPadding(panel, timeout = 1000) {
  // Parallel process control
  if (panelPromises.has(panel)) return panelPromises.get(panel);

  const promise = (async () => {
    try {
      const instance = simpleBarInstances.get(panel);
      if (!instance) return { ok: false, reason: "no_instance" };

      // Recalculate
      instance.recalculate?.();

      // Wait for the scrollbar to appear
      const scrollbar = await waitForScrollbar(instance, timeout);

      if (!scrollbar) {
        panel.style.paddingRight = "2px";
        return { ok: false, reason: "scrollbar_not_found" };
      }

      const isVisible = getComputedStyle(scrollbar).visibility === "visible";
      if (!panel.style.transition) {
        panel.style.transition = "padding .1s";
      }
      panel.style.paddingRight = isVisible ? "16px" : "2px";

      return { ok: true, visible: isVisible };
    } catch (error) {
      panel.style.paddingRight = "2px";
      return { ok: false, error: error.message };
    } finally {
      panelPromises.delete(panel);
    }
  })();

  panelPromises.set(panel, promise);
  return promise;
}

// Wait for scrollbar to appear
function waitForScrollbar(instance, timeout = 1000) {
  return new Promise((resolve) => {
    const startTime = Date.now();
    const scrollbar = instance.el.querySelector(":scope > .simplebar-vertical");

    // If scrollbar already exists
    if (scrollbar && scrollbar.offsetHeight > 0) {
      return resolve(scrollbar);
    }

    // Monitor DOM changes with MutationObserver
    const observer = new MutationObserver(() => {
      const currentScrollbar = instance.el.querySelector(":scope > .simplebar-vertical");
      if (currentScrollbar && currentScrollbar.offsetHeight > 0) {
        observer.disconnect();
        resolve(currentScrollbar);
      }

      // Timeout control
      if (Date.now() - startTime > timeout) {
        observer.disconnect();
        resolve(null);
      }
    });

    observer.observe(instance.el, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["class", "style"],
    });

    // Fallback: timeout
    setTimeout(() => {
      observer.disconnect();
      const finalScrollbar = instance.el.querySelector(":scope > .simplebar-vertical");
      resolve(finalScrollbar);
    }, timeout);
  });
}

// Send Action to background with retry
async function sendAction(action, payload = {}, retry = 0) {
  try {
    const response = await browser.runtime.sendMessage({ action, ...payload });

    // If no response
    if (!response) {
      if (retry < 10) {
        await new Promise((r) => setTimeout(r, 200));
        return sendAction(action, payload, retry + 1);
      }
      return { ok: false, error: "No response from background after retries" };
    }

    // If the response is not an object or the ok field is missing, fallback
    if (typeof response !== "object" || response.ok === undefined) {
      return { ok: false, error: "Invalid response format from background" };
    }

    return response;
  } catch (err) {
    const errMsg = err?.message || JSON.stringify(err);

    // If the background is not ready yet or is reloading
    if (/Receiving end does not exist|Could not establish connection/i.test(errMsg)) {
      if (retry < 10) {
        await new Promise((r) => setTimeout(r, 200));
        return sendAction(action, payload, retry + 1);
      }
      return { ok: false, error: "Receiving end not found after retries" };
    }

    // Other unexpected errors
    return { ok: false, error: errMsg };
  }
}

function getCurrentStyleAttributes() {
  const styleAttrs = {};
  const rootStyles = document.body.style;

  for (const name of rootStyles) {
    rootStyles.getPropertyValue(name) && (styleAttrs[name] = rootStyles.getPropertyValue(name));
  }

  return styleAttrs;
}

// Open User Script Manager
async function openUserScriptManager(id) {
  const url = browser.runtime.getURL("manager/userScriptManager.html");
  await browser.storage.local.set({
    managerContext: {
      target: id,
    },
  });

  const tabs = await browser.tabs.query({ url });
  if (tabs.length > 0 && tabs[0].id) {
    // if tab is already open → refresh it
    await browser.tabs.reload(tabs[0].id);
    await browser.tabs.update(tabs[0].id, { active: true });
    window.close();
    return;
  }

  // if tab is not open → create new tab
  await browser.tabs.create({ url });
  window.close();
}

// Load all favicons
async function loadFavIcons(icons, concurrency = 3, delayMs = 150, slowAfter = 8) {
  if (!icons || !icons.length) return;

  const queue = Array.from(icons);
  let loadedCount = 0;

  function loadSingleIcon(icon, domain) {
    return new Promise((resolve) => {
      if (!domain) return resolve();

      const proxyUrl = `https://favicons.seadfeng.workers.dev/${domain}.ico`;
      const googleUrl = `https://www.google.com/s2/favicons?domain=${domain}&sz=32`;
      const fallback = browser.runtime.getURL("icons/48x48.png");
      const classRemove = () => {
        icon.classList.remove("hidden-visibility");
        icon.parentElement?.classList.remove("spinner");
      };

      icon.onload = () => {
        classRemove();
        icon.onload = icon.onerror = null;
        resolve();
      };

      icon.onerror = () => {
        if (icon.src === proxyUrl) {
          icon.src = googleUrl;
        } else {
          icon.src = fallback;
          classRemove();
          icon.onload = icon.onerror = null;
          resolve();
        }
      };

      icon.src = proxyUrl;

      // show immediately
      if (icon.complete && icon.naturalWidth !== 0) {
        classRemove();
        resolve();
        return;
      }
    });
  }

  async function worker() {
    while (queue.length > 0) {
      const icon = queue.shift();
      if (!icon) return;

      const domain = icon.dataset?.src;
      await loadSingleIcon(icon, domain);
      loadedCount++;

      // slow after
      const slowdown = loadedCount > slowAfter ? delayMs * 2 : delayMs;
      await delay(slowdown + Math.random() * 60);
    }
  }

  const safeConcurrency = Math.min(concurrency, queue.length);
  const workers = Array.from({ length: safeConcurrency }, worker);

  await Promise.all(workers);
}

// Popup Message
let showPopupMessageTimeout = null;
let currentMessageContainer = null;
function showPopupMessage(text, type = "info", closeAfter = null) {
  const section = document.querySelector("body").dataset.section;
  const footer = section === "main" ? document.getElementById("mainFooterButtons") : document.getElementById("historyFooter");

  if (currentMessageContainer && currentMessageContainer.parentNode) {
    currentMessageContainer.remove();
    currentMessageContainer = null;
  }

  let messageContainer = document.querySelector(".popup-message");
  if (!messageContainer) {
    messageContainer = document.createElement("div");
    messageContainer.className = `popup-message ${type}`;
    footer.appendChild(messageContainer);
  }

  const handleMessageClick = () => {
    hidePopupMessage();
  };

  messageContainer.addEventListener("click", handleMessageClick, { once: true });
  currentMessageContainer = messageContainer;

  messageContainer.textContent = text;

  if (closeAfter) {
    clearTimeout(showPopupMessageTimeout);
    const loadingIndicator = document.createElement("div");
    loadingIndicator.className = "popup-message-indicator";
    messageContainer.appendChild(loadingIndicator);
    loadingIndicator.style.display = "none";
    void loadingIndicator.offsetWidth;
    loadingIndicator.style.display = "block";

    showPopupMessageTimeout = setTimeout(() => {
      hidePopupMessage();
    }, closeAfter);
  }
}

function hidePopupMessage() {
  if (currentMessageContainer && currentMessageContainer.parentNode) {
    currentMessageContainer.classList.add("hide");
    setTimeout(() => {
      currentMessageContainer.remove();
      currentMessageContainer = null;
    }, 300);
  }
  if (showPopupMessageTimeout) {
    clearTimeout(showPopupMessageTimeout);
    showPopupMessageTimeout = null;
  }
}

// Restart Extension
async function restartExtension(tab) {
  try {
    if (tab && tab.id) {
      await browser.tabs.reload(tab.id);
      browser.runtime.reload();
    } else {
      browser.runtime.reload();
    }
  } catch (err) {
    logError("Restart the extension error:", err);
  }
}

// Toggle Debug Mode
async function toggleDebugMode(tab) {
  try {
    const stored = (await browser.storage.local.get("debugMode")).debugMode;
    const current = stored ?? CONFIG.debugMode;
    const newValue = current === 0 ? 1 : 0;

    await browser.storage.local.set({ debugMode: newValue });
    CONFIG.debugMode = newValue;

    if (tab && tab.id) browser.tabs.reload(tab.id);
  } catch (err) {
    logError("Toggle Debug Mode error:", err);
  }
}

// Factory Reset
let factoryResetConfirm = false;
let factoryResetTimer = null;
const factoryResetTimeout = 5000;

async function factoryReset(tab, fromSettings = false) {
  const ORIGINAL_FACTORY_TITLE = "Reset to Defaults (Click > Open Menu Again > Confirm)";
  const CONFIRM_FACTORY_TITLE = "❗ Confirm Reset to Defaults (Click)";

  // Settings Section Action
  if (fromSettings && !factoryResetConfirm) {
    factoryResetConfirm = true;

    setTimeout(() => {
      factoryResetConfirm = false;
    }, factoryResetTimeout);

    return { needConfirm: true };
  }

  // Context Menu Action
  if (!fromSettings && !factoryResetConfirm) {
    factoryResetConfirm = true;

    browser.contextMenus.update("factoryReset", { title: CONFIRM_FACTORY_TITLE });

    factoryResetTimer = setTimeout(() => {
      factoryResetConfirm = false;
      browser.contextMenus.update("factoryReset", { title: ORIGINAL_FACTORY_TITLE });
    }, factoryResetTimeout);

    return;
  }

  // Factory Reset Action
  factoryResetConfirm = false;
  clearTimeout(factoryResetTimer);
  try {
    await browser.storage.local.clear();
    if (tab && tab.id) await browser.tabs.reload(tab.id);
    browser.runtime.reload();
  } catch (err) {
    logError("Reset to Defaults error:", err);
  }
}
