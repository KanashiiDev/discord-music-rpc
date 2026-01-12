// Format Time
function formatTime(sec) {
  if (!sec || sec < 0) return "00:00";

  const m = Math.floor(sec / 60)
    .toString()
    .padStart(2, "0");
  const s = Math.floor(sec % 60)
    .toString()
    .padStart(2, "0");
  return `${m}:${s}`;
}

// Time Calculate
function nativeTimeElement(e) {
  const date = new Date(e * 1000);
  if (isNaN(date.valueOf())) return "just now";

  return (function () {
    const r = Math.round(Date.now() / 1000) - Math.round(date.valueOf() / 1000);

    if (r === 0) return "just now";
    if (r === 1) return "1 second ago";
    if (r < 60) return `${r} seconds ago`;
    if (r < 120) return "1 minute ago";
    if (r < 3600) return `${Math.floor(r / 60)} minutes ago`;
    if (r < 7200) return "1 hour ago";
    if (r < 86400) return `${Math.floor(r / 3600)} hours ago`;
    if (r < 172800) return "1 day ago";
    if (r < 604800) return `${Math.floor(r / 86400)} days ago`;
    if (r < 1209600) return "1 week ago";
    if (r < 2419200) return `${Math.floor(r / 604800)} weeks ago`;
    if (r < 29030400) return `${Math.floor(r / 2419200)} months ago`;

    return `${Math.floor(r / 29030400)} years ago`;
  })();
}

// Create SVG
const svgCache = new Map();
function createSVG(paths, options = {}) {
  // SVG cache
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

const svg_paths = {
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

// Add Expand SVG
document.querySelectorAll("span.arrow").forEach((arrow) => {
  const expandSvg = createSVG(svg_paths.expand);
  arrow.appendChild(expandSvg);
});

// Find the total height for accordion divs
function getTotalHeight(element, elementParent) {
  const div = typeof element !== "object" ? document.querySelector(element) : element;
  let content = div.querySelector(".simplebar-content");
  if (!content) content = div;
  const parent = typeof elementParent !== "object" ? document.querySelector(elementParent) : elementParent;
  const style = window.getComputedStyle(parent);
  const paddingTop = parseFloat(style.paddingTop) || 0;
  const paddingBottom = parseFloat(style.paddingBottom) || 0;
  return content.scrollHeight + paddingTop + paddingBottom;
}
