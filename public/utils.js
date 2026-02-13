// Format Time
export function formatTime(sec) {
  if (!sec || sec < 0) return "00:00";

  const m = Math.floor(sec / 60)
    .toString()
    .padStart(2, "0");
  const s = Math.floor(sec % 60)
    .toString()
    .padStart(2, "0");
  return `${m}:${s}`;
}

// Relative Time
export function relativeTime(dateValue) {
  const now = Date.now();
  const past = Number(dateValue);
  if (!past || isNaN(past)) return "—";

  const s = Math.floor((now - past) / 1000);
  if (s < 45) return "just now";
  if (s < 90) return "1 minute ago";
  if (s < 3600) return Math.floor(s / 60) + " minutes ago";

  const mins = Math.floor(s / 60);
  if (mins < 90) return "1 hour ago";
  if (mins < 1440) return Math.floor(mins / 60) + " hours ago";

  const hours = Math.floor(mins / 60);
  const days = Math.floor(hours / 24);

  if (days === 1) return "yesterday";
  if (days < 7) return days + " days ago";

  const weeks = Math.floor(days / 7);
  if (weeks === 1) return "1 week ago";
  if (weeks < 4) return weeks + " weeks ago";

  const months = Math.floor(days / 30.4);
  if (months < 12) return months + ` month${months === 1 ? "" : "s"} ago`;

  const years = Math.floor(months / 12);
  return years + ` year${years === 1 ? "" : "s"} ago`;
}

// Full Date Time
export function fullDateTime(dateValue, fallbackLocale = "en-US") {
  const timestamp = Number(dateValue);
  if (isNaN(timestamp)) return "Invalid date";

  return new Date(timestamp).toLocaleString(navigator.language || fallbackLocale, {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
}

// Create SVG
const svgCache = new Map();
export function createSVG(paths, options = {}) {
  const key = paths.join("");
  if (svgCache.has(key)) return svgCache.get(key).cloneNode(true);

  const { width = 24, height = 24, stroke = "var(--icon-color)", strokeWidth = 1.4, fill = "none", viewBox = "0 0 28 28" } = options;
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

export const svg_paths = {
  single: [
    "M5.5 2.5H18.5A3 3 0 0 1 21.5 5.5V18.5A3 3 0 0 1 18.5 21.5H5.5A3 3 0 0 1 2.5 18.5V5.5A3 3 0 0 1 5.5 2.5Z",
    "M8.5 7H15.5A1.5 1.5 0 0 1 17 8.5V15.5A1.5 1.5 0 0 1 15.5 17H8.5A1.5 1.5 0 0 1 7 15.5V8.5A1.5 1.5 0 0 1 8.5 7Z",
  ],
  dual: [
    "M5.5 2.5H18.5A3 3 0 0 1 21.5 5.5V18.5A3 3 0 0 1 18.5 21.5H5.5A3 3 0 0 1 2.5 18.5V5.5A3 3 0 0 1 5.5 2.5Z",
    "M8 7H11.5A1 1 0 0 1 12.5 8V16A1 1 0 0 1 11.5 17H8A1 1 0 0 1 7 16V8A1 1 0 0 1 8 7Z",
    "M12.5 7H16A1 1 0 0 1 17 8V16A1 1 0 0 1 16 17H12.5A1 1 0 0 1 11.5 16V8A1 1 0 0 1 12.5 7Z",
  ],
  expand: ["M4 12l8 8 8-8"],
  gear: [
    `M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7z M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06 a1.65 1.65
     0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09 a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83
     l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4 h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2
     2 0 1 1 2.83-2.83 l.06.06a1.65 1.65 0 0 0 1.82.33h.09a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09 a1.65 1.65 0 0 0 1 1.51h.09a1.65 1.65 0
     0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83 l-.06.06a1.65 1.65 0 0 0-.33 1.82v.09a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4 h-.09a1.65 1.65 0 0 0-1.51 1z`,
  ],
  back: ["M19 20l-8-8 8-8"],
};

export function getTotalHeight(element, elementParent) {
  const div = typeof element !== "object" ? document.querySelector(element) : element;
  let content = div.querySelector(".simplebar-content");
  if (!content) content = div;
  const parent = typeof elementParent !== "object" ? document.querySelector(elementParent) : elementParent;
  const style = window.getComputedStyle(parent);
  const paddingTop = parseFloat(style.paddingTop) || 0;
  const paddingBottom = parseFloat(style.paddingBottom) || 0;
  return content.scrollHeight + paddingTop + paddingBottom;
}

export function updateSimpleBarPadding(containerId) {
  const container = document.getElementById(containerId);
  if (!container || document.querySelector(".main").style.display === "none") return;

  const hasVisibleScrollbar = document.querySelector(`#${containerId} .simplebar-track[style*="visibility: visible"]`);

  container.style.paddingRight = hasVisibleScrollbar ? "22px" : "0";
}

export function updateCollapsibleHeight(type) {
  const box = document.getElementById(`${type}`);
  if (!box || !box.classList.contains("open")) return;

  const content = box.querySelector(".simplebar-content");
  if (content) {
    box.style.maxHeight = content.scrollHeight + "px";
  }
}

export function shallowEqual(objA, objB) {
  if (objA === objB) return true;
  if (typeof objA !== "object" || typeof objB !== "object" || objA == null || objB == null) {
    return false;
  }

  const keysA = Object.keys(objA);
  const keysB = Object.keys(objB);

  if (keysA.length !== keysB.length) return false;

  for (const key of keysA) {
    if (!Object.prototype.hasOwnProperty.call(objB, key) || objA[key] !== objB[key]) {
      return false;
    }
  }
  return true;
}

export function getCSS(variable, fallback = null, mode = "hex", element = document.documentElement) {
  const value = getComputedStyle(element).getPropertyValue(variable).trim();

  if (!value) return fallback;

  if (value.startsWith("rgb")) {
    const rgb = value.match(/\d+/g);

    if (!rgb) return fallback;

    if (mode === "rgb-string") {
      return rgb.join(",");
    }

    if (mode === "hex") {
      return (
        "#" +
        rgb
          .slice(0, 3)
          .map((x) => parseInt(x).toString(16).padStart(2, "0"))
          .join("")
      );
    }
  }

  return value;
}

export function handleCollapsible(header, AppState, simpleBars) {
  if (AppState.expandTimeout) clearTimeout(AppState.expandTimeout);
  const box = header.nextElementSibling;
  if (!box) return;

  const isOpen = box.classList.contains("open");
  const heightBefore = box.offsetHeight;

  if (isOpen) {
    box.style.maxHeight = box.scrollHeight + "px";
    requestAnimationFrame(() => {
      box.classList.remove("open");
      header.classList.remove("open");
      box.style.maxHeight = "";
    });
  } else {
    box.classList.add("open");
    header.classList.add("open");
    const targetH = getTotalHeight(box, box);
    const maxH = parseInt(box.dataset.maxHeight) || 0;
    const finalH = maxH && targetH > maxH ? maxH : targetH;

    box.style.maxHeight = finalH + "px";
    Object.values(simpleBars).forEach((sb) => sb?.recalculate());
  }

  header.style.pointerEvents = "none";

  AppState.expandTimeout = setTimeout(() => {
    header.style.pointerEvents = "";

    if (!isOpen) {
      const heightAfter = box.offsetHeight;

      if (heightAfter <= heightBefore + 2) {
        box.classList.remove("open");
        header.classList.remove("open");
        box.style.maxHeight = "";
      } else {
        if (!box.dataset.maxHeight) box.style.maxHeight = "100vh";
      }
    }
  }, 355);
}
