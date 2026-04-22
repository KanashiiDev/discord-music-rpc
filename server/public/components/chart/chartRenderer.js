import { HC_RANGES, chartState, getHcColor } from "./chart.js";
import { hc_prepareData } from "./chartData.js";
import { hc_showDetails, hc_hideDetails, cancelDetailsAnimation, hc_destroyDetails } from "./chartDetails.js";
import { DataStore } from "../../core/dataStore.js";
import { createSVG, getCSS, svg_paths } from "../../utils.js";
import { syncSummary, toggleSummary, hideSummary as hideSummaryPanel, isSummaryVisible } from "./summary/summary.js";
import { renderChartContainer } from "./chartDom.js";

// DataStore subscription reference
let historyUnsubscribe = null;
let _controlsBound = false;

// Update Navigation Label
function _updateNavLabel() {
  const labelEl = document.getElementById("chartPeriodLabel");
  const nextBtn = document.getElementById("chartPeriodNext");
  if (!labelEl) return;

  const cfg = HC_RANGES[chartState.range];
  labelEl.textContent = cfg.getLabel(chartState.offset);

  if (nextBtn) {
    nextBtn.disabled = chartState.offset >= 0;
    nextBtn.style.opacity = chartState.offset >= 0 ? "0.3" : "1";
  }
}

// Destroy the current Chart.js instance if it exists
function hc_destroyChart() {
  if (chartState.instance) {
    chartState.instance.destroy();
    chartState.instance = null;
  }
}

// Render the chart
function drawHistoryChart(mode, range) {
  const canvas = document.getElementById("listeningWaveform");
  const loadingEl = document.getElementById("historyChartLoading");
  if (!canvas) return;

  _updateNavLabel();
  if (isSummaryVisible()) return;

  const chartData = hc_prepareData(mode, range);
  const isEmpty = !chartData.data.length || chartData.data.every((v) => v === 0);

  if (isEmpty) {
    if (loadingEl) {
      loadingEl.style.display = "flex";
      loadingEl.textContent = i18n.t("chart.summary.empty");
      loadingEl.classList.remove("error");
    }
    canvas.style.display = "none";
    hc_hideDetails();
    return;
  }

  if (loadingEl) loadingEl.style.display = "none";
  canvas.style.display = "block";

  hc_destroyChart();
  hc_destroyDetails();

  const color = getHcColor(mode);
  const barThickness = HC_RANGES[range].barThickness;
  const isSongs = mode === "songs";
  const yMax = Math.ceil(chartData.maxValue * 1.12) || 1;
  const stepSize = isSongs ? undefined : Math.max(1, Math.ceil(chartData.maxValue / 5));

  chartState.instance = new Chart(canvas.getContext("2d"), {
    type: "bar",
    data: {
      labels: chartData.labels,
      datasets: [
        {
          label: color.label,
          data: chartData.data,
          backgroundColor: (ctx) => {
            const val = Number(ctx.dataset.data[ctx.dataIndex]) || 0;
            const max = chartData.maxValue || 1;
            let ratio = Math.max(0, Math.min(val / max, 1));
            ratio = Math.pow(1 - ratio, 0.8);
            const maxDarken = 15;
            return tinycolor(`rgb(${color.rgb})`)
              .darken(ratio * maxDarken)
              .toRgbString();
          },
          hoverBackgroundColor: (ctx) => {
            const baseColor = ctx.dataset.backgroundColor instanceof Function ? ctx.dataset.backgroundColor(ctx) : ctx.dataset.backgroundColor;
            return tinycolor(baseColor).brighten(8).toRgbString();
          },
          barThickness,
          fill: true,
          tension: 0.4,
          pointRadius: 3,
          pointHoverRadius: 6,
          borderRadius: 6,
          borderWidth: 0,
          hoverBorderWidth: 0,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      devicePixelRatio: window.devicePixelRatio ?? 1,
      animation: { duration: 0 },
      layout: { padding: 8 },

      scales: {
        x: {
          grid: { display: false },
          ticks: {
            color: getCSS("--text-color-muted", "#555", "hexa"),
            maxRotation: 0,
            minRotation: 0,
            font: { size: 11 },
            padding: 8,
          },
        },
        y: {
          beginAtZero: true,
          max: yMax,
          ticks: {
            color: getCSS("--text-color-muted", "#555", "hexa"),
            stepSize,
            callback: (v) => {
              if (isSongs) return v;
              return i18n.t("chart.minute_short", { value: v });
            },
          },
          grid: { color: "rgba(255,255,255,0.05)" },
        },
      },

      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: getCSS("--foreground-color-300", "rgba(47, 47, 47, 0.95)", "hex"),
          multiKeyBackground: getCSS("--foreground-color-300", "rgba(47, 47, 47, 0.95)", "hex"),
          titleColor: getCSS("--text-color-primary", "#ddd", "hexa"),
          bodyColor: getCSS("--text-color-secondary", "#bbb", "hexa"),
          padding: 10,
          cornerRadius: 8,
          callbacks: {
            label(ctx) {
              const v = ctx.parsed.y;
              if (isSongs) {
                const key = v === 1 ? "chart.songs" : "chart.songs_plural";
                return " " + i18n.t(key, { count: v });
              }
              return " " + i18n.t("chart.minutes_listened", { count: v });
            },
            title(items) {
              if (!items.length) return "";

              const idx = items[0].dataIndex;
              const locale = navigator.language || "en-US";
              const cfg = HC_RANGES[range];

              const baseDate = new Date(cfg.getStart(chartState.offset));
              let d;

              if (range === "year") {
                d = new Date(baseDate);
                d.setMonth(idx);
                d.setDate(1);
              } else {
                d = new Date(baseDate);
                d.setDate(d.getDate() + idx);
              }

              d.setHours(12, 0, 0, 0);

              if (range === "year") {
                return d.toLocaleDateString(locale, {
                  month: "long",
                  year: "numeric",
                });
              }

              if (range === "month") {
                return d.toLocaleDateString(locale, {
                  day: "numeric",
                  month: "long",
                });
              }

              return d.toLocaleDateString(locale, {
                weekday: "long",
              });
            },
          },
        },
      },

      onHover(evt, active) {
        evt.chart.canvas.style.cursor = active.length ? "pointer" : "default";
      },

      onClick(_, active) {
        if (!active.length) {
          hc_hideDetails();
          return;
        }

        const idx = active[0].index;

        if (chartState.lastClickedBarIndex === idx) {
          hc_hideDetails();
          return;
        }

        chartState.lastClickedBarIndex = idx;
        hc_showDetails(idx, chartData, mode, range);
      },
    },
  });
}

// Toggle handlers
function switchHistoryChartMode(mode) {
  chartState.mode = mode;
  document.querySelectorAll(".chart-mode-btn").forEach((btn) => btn.classList.toggle("active", btn.dataset.mode === mode));
  hc_hideDetails();
  drawHistoryChart(mode, chartState.range);
}

function switchHistoryChartRange(range) {
  chartState.range = range;
  chartState.offset = 0;
  document.querySelectorAll(".chart-range-btn").forEach((btn) => btn.classList.toggle("active", btn.dataset.range === range));
  hc_hideDetails();
  drawHistoryChart(chartState.mode, range);
  syncSummary();
}

// Period Navigation
function navigatePeriod(direction) {
  const newOffset = chartState.offset + direction;
  if (newOffset > 0) return;
  chartState.offset = newOffset;
  hc_hideDetails();
  drawHistoryChart(chartState.mode, chartState.range);
  syncSummary();
}

function _initNavigation() {
  const prevBtn = document.getElementById("chartPeriodPrev");
  const nextBtn = document.getElementById("chartPeriodNext");

  if (prevBtn && !_controlsBound) {
    prevBtn.addEventListener("click", () => navigatePeriod(-1));
    prevBtn.appendChild(createSVG(svg_paths.leftChev, { width: 20, height: 20 }));
  }
  if (nextBtn && !_controlsBound) {
    nextBtn.addEventListener("click", () => navigatePeriod(+1));
    nextBtn.appendChild(createSVG(svg_paths.rightChev, { width: 20, height: 20 }));
  }
}

// Redraw the chart
function redrawChart() {
  const historyData = DataStore.get("history");
  if (historyData && Array.isArray(historyData) && historyData.length > 0) {
    drawHistoryChart(chartState.mode, chartState.range);
  }
}

function _updateModeButtonsState() {
  const modeButtons = document.querySelectorAll(".chart-mode-btn");
  const isSummary = isSummaryVisible();

  modeButtons.forEach((btn) => {
    if (isSummary) {
      btn.classList.add("summary-active");
    } else {
      btn.classList.remove("summary-active");
    }
  });
}

function _handleSummaryToggle(btn) {
  btn.classList.toggle("active");
  toggleSummary();
  _updateModeButtonsState();
}

function _handleModeSwitch(btn) {
  if (isSummaryVisible()) {
    hideSummaryPanel();
    const summaryToggle = document.getElementById("chartSummaryToggle");
    if (summaryToggle) {
      summaryToggle.classList.remove("active");
    }
    _updateModeButtonsState();
  }
  switchHistoryChartMode(btn.dataset.mode);
}

// Main entry point - call once when the history panel opens
export async function updateHistoryChart() {
  if (!document.querySelector(".chart-container")) {
    renderChartContainer();
    _controlsBound = false;
  }

  const canvas = document.getElementById("listeningWaveform");
  const loadingEl = document.getElementById("historyChartLoading");
  if (!canvas || !loadingEl) return;

  loadingEl.style.display = "flex";
  loadingEl.textContent = i18n.t("chart.loading");
  loadingEl.classList.remove("error");
  canvas.style.display = "none";
  hc_hideDetails();

  if (!_controlsBound) {
    // Mode toggle
    const modeToggle = document.getElementById("chartModeToggle");
    if (modeToggle) {
      modeToggle.addEventListener("click", (e) => {
        const summaryBtn = e.target.closest("#chartSummaryToggle, [data-mode='summary']");
        if (summaryBtn) {
          _handleSummaryToggle(summaryBtn);
          return;
        }
        const btn = e.target.closest(".chart-mode-btn");
        if (btn?.dataset.mode) _handleModeSwitch(btn);
      });
    }

    // Range toggle
    const rangeToggle = document.getElementById("chartRangeToggle");
    if (rangeToggle) {
      rangeToggle.addEventListener("click", (e) => {
        const btn = e.target.closest(".chart-range-btn");
        if (btn?.dataset.range) switchHistoryChartRange(btn.dataset.range);
      });
    }

    // Navigation buttons
    _initNavigation();
    _controlsBound = true;
  }

  // Restore persisted active states
  document.querySelectorAll(".chart-mode-btn").forEach((btn) => btn.classList.toggle("active", btn.dataset.mode === chartState.mode));
  document.querySelectorAll(".chart-range-btn").forEach((btn) => btn.classList.toggle("active", btn.dataset.range === chartState.range));

  // Initialize state on mode buttons
  _updateModeButtonsState();

  // Get history data from DataStore
  const historyData = DataStore.get("history");

  if (historyData && Array.isArray(historyData) && historyData.length > 0) {
    // If there is data, draw it immediately
    drawHistoryChart(chartState.mode, chartState.range);
  } else {
    loadingEl.style.display = "flex";
    loadingEl.textContent = i18n.t("chart.loading");
  }

  // Update the chart when the history data changes (subscribe only once)
  if (!historyUnsubscribe) {
    historyUnsubscribe = DataStore.subscribe("history", (newHistoryData) => {
      if (newHistoryData && Array.isArray(newHistoryData) && newHistoryData.length > 0) {
        // Redraw the chart when new data arrives
        redrawChart();
      }
    });
  }
}

export function destroyHistoryChart() {
  cancelDetailsAnimation();
  hc_destroyChart();
  hc_destroyDetails();
  if (historyUnsubscribe) {
    historyUnsubscribe();
    historyUnsubscribe = null;
  }
}
