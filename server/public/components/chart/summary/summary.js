import { HC_RANGES, chartState } from "../chart.js";
import { createSVG, svg_paths } from "../../../utils.js";
import { buildSummaryData } from "./summaryData.js";
import { buildMinutesView, buildRankedList, buildArtistDrillDown } from "./summaryBuilder.js";
import { captureSummaryPanel, initCaptureMenu, toggleCaptureMenu, closeCaptureMenu } from "./summaryCapture.js";

// Chart element visibility
const CHART_SELECTORS = ["#listeningWaveform", "#historyChartLoading", "#chartDetails", ".chart-canvas-wrap"];

function hideChartElements() {
  for (const sel of CHART_SELECTORS) {
    const node = document.querySelector(sel);
    if (!node) continue;
    node.dataset.summaryDisplay ??= node.style.display || "";
    node.style.maxHeight = "0px";
  }
}

function showChartElements() {
  for (const sel of CHART_SELECTORS) {
    const node = document.querySelector(sel);
    if (!node) continue;
    node.style.display = node.dataset.summaryDisplay ?? "";
    delete node.dataset.summaryDisplay;
    node.style.maxHeight = "";
  }
}

// Panel state
let _visible = false;
let _cachedData = null;
let _lastRange = null;
let _renderAc = null;

// Panel rendering
function renderPanel(range) {
  const panel = document.getElementById("chartSummaryPanel");
  if (!panel) return;

  if (_lastRange !== range) {
    _cachedData = buildSummaryData(range);
    _lastRange = range;
  }

  const content = panel.querySelector(".summary-content");
  if (!content) return;

  content.replaceChildren();
  _renderAc?.abort();
  _renderAc = new AbortController();
  const { signal } = _renderAc;

  // Wire drill-down events (once per render, delegated on content)
  content.addEventListener(
    "summary:artistClick",
    (e) => {
      buildArtistDrillDown(e.detail.artist, _cachedData);
    },
    { signal },
  );

  panel.addEventListener("summary:back", () => renderPanel(chartState.range), { signal });

  const periodLabel = panel.querySelector(".summary-period-label");
  if (periodLabel) periodLabel.textContent = HC_RANGES[range].getLabel(chartState.offset);

  const data = _cachedData;
  const layout = document.createElement("div");
  layout.className = "summary-two-column-layout";

  const leftCol = document.createElement("div");
  leftCol.className = "summary-column summary-column-left";
  const lHeader = document.createElement("div");
  lHeader.className = "summary-column-header";
  lHeader.textContent = "Top Songs";
  lHeader.dataset.i18n = "chart.summary.topSongs";

  leftCol.append(lHeader, buildRankedList(data.topSongs, "songs"));

  const rightCol = document.createElement("div");
  rightCol.className = "summary-column summary-column-right";
  const rHeader = document.createElement("div");
  rHeader.className = "summary-column-header";
  rHeader.textContent = "Top Artists";
  rHeader.dataset.i18n = "chart.summary.topArtists";
  rightCol.append(rHeader, buildRankedList(data.topArtists, "artists"));

  layout.append(leftCol, rightCol);

  const bottomCenter = document.createElement("div");
  bottomCenter.className = "summary-bottom-center";
  bottomCenter.appendChild(buildMinutesView(data));

  content.append(layout, bottomCenter);
  applyTranslations();
}

// Panel creation
function createPanel() {
  const existing = document.getElementById("chartSummaryPanel");
  if (existing) return existing;

  const panel = document.createElement("div");
  panel.className = "summary-panel";
  panel.id = "chartSummaryPanel";

  const header = document.createElement("div");
  header.className = "summary-header";

  const periodLabel = document.createElement("span");
  periodLabel.className = "summary-period-label";

  const captureBtn = document.createElement("span");
  captureBtn.className = "summary-capture";

  const captureBtnIcon = document.createElement("span");
  captureBtnIcon.className = "summary-capture-icon";

  captureBtnIcon.addEventListener("click", (e) => {
    e.stopPropagation();
    toggleCaptureMenu(captureBtn);
  });

  captureBtnIcon.appendChild(createSVG(svg_paths.camera));
  captureBtn.appendChild(captureBtnIcon);

  header.append(periodLabel, captureBtn);

  const content = document.createElement("div");
  content.className = "summary-content";

  panel.append(header, content);

  // Wire up the capture menu callback once the panel (and its button) exist
  initCaptureMenu({
    onCapture: async ({ layout, preset }) => {
      panel.classList.add("disable-motion");
      captureBtnIcon.classList.add("spinner");
      await captureSummaryPanel({ layout, preset });
      panel.classList.remove("disable-motion");
      captureBtnIcon.classList.remove("spinner");
    },
  });

  return panel;
}

// Public API
export function showSummary() {
  const panel = createPanel();

  if (!panel.parentElement) {
    const canvas = document.getElementById("listeningWaveform");
    const canvasParent = canvas?.closest(".chart-canvas-wrap") ?? canvas?.parentElement;
    const target = canvasParent ?? document.querySelector("#chartDetails")?.parentElement;

    if (target) target.insertAdjacentElement("beforebegin", panel);
    else document.body.appendChild(panel);
  }

  hideChartElements();
  _visible = true;
  requestAnimationFrame(() => panel.classList.add("summary-panel--open"));
  renderPanel(chartState.range);
}

export function hideSummary() {
  const panel = document.getElementById("chartSummaryPanel");
  if (!panel) return;

  _visible = false;
  panel.classList.remove("summary-panel--open");
  showChartElements();

  const captureBtn = panel.querySelector(".summary-capture");
  closeCaptureMenu(captureBtn);

  _renderAc?.abort();
  _renderAc = null;

  panel.addEventListener(
    "transitionend",
    () => {
      if (!_visible) {
        panel.remove();
        _cachedData = null;
        _lastRange = null;
      }
    },
    { once: true },
  );

  document.querySelector("#chartSummaryToggle")?.classList.remove("active");
}

export function toggleSummary() {
  _visible ? hideSummary() : showSummary();
}

export function syncSummary() {
  if (_visible) {
    _lastRange = null;
    renderPanel(chartState.range);
  }
}

export function isSummaryVisible() {
  return _visible;
}
