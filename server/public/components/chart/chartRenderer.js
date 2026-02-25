import { HC_COLORS, HC_RANGES, chartState } from "./chart.js";
import { hc_prepareData } from "./chartData.js";
import { hc_showDetails, hc_hideDetails } from "./chartDetails.js";
import { DataStore } from "../../core/dataStore.js";
import { getCSS } from "../../utils.js";

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

  const chartData = hc_prepareData(mode, range);
  const isEmpty = !chartData.data.length || chartData.data.every((v) => v === 0);

  if (isEmpty) {
    if (loadingEl) {
      loadingEl.style.display = "flex";
      loadingEl.textContent = "No data available for this period";
      loadingEl.classList.remove("error");
    }
    canvas.style.display = "none";
    hc_hideDetails();
    return;
  }

  if (loadingEl) loadingEl.style.display = "none";
  canvas.style.display = "block";

  hc_destroyChart();

  const color = HC_COLORS[mode] ?? HC_COLORS.minutes;
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
          backgroundColor(ctx) {
            const val = Number(ctx.dataset.data[ctx.dataIndex]) || 0;
            const max = chartData.maxValue || 1;
            const ratio = Math.max(0, Math.min(val / max, 1));
            const alpha = 0.35 + ratio * 0.65;
            return `rgba(${color.rgb}, ${alpha})`;
          },
          barThickness,
          fill: true,
          tension: 0.4,
          pointRadius: 3,
          pointHoverRadius: 6,
          borderRadius: 6,
          borderWidth: 0,
          hoverBorderWidth: 2,
          hoverBorderColor: color.accent,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      devicePixelRatio: window.devicePixelRatio ?? 1,

      layout: { padding: { right: 8, bottom: 4 } },

      scales: {
        x: {
          grid: { display: false },
          ticks: {
            color: getCSS("--text-color-muted", "#555"),
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
            color: getCSS("--text-color-muted", "#555"),
            stepSize,
            callback: (v) => (isSongs ? v : `${v} min`),
          },
          grid: { color: "rgba(255,255,255,0.05)" },
        },
      },

      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: getCSS("--foreground-color-300", "rgba(47, 47, 47, 0.95)"),
          padding: 10,
          cornerRadius: 8,
          callbacks: {
            label(ctx) {
              const v = ctx.parsed.y;
              return isSongs ? ` ${v} song${v !== 1 ? "s" : ""}` : ` ${v} min listened`;
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

      animation: { duration: 550, easing: "easeOutQuart" },
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
  document.querySelectorAll(".chart-range-btn").forEach((btn) => btn.classList.toggle("active", btn.dataset.range === range));
  hc_hideDetails();
  drawHistoryChart(chartState.mode, range);
}

// Redraw the chart
function redrawChart() {
  const historyData = DataStore.get("history");
  if (historyData && Array.isArray(historyData) && historyData.length > 0) {
    drawHistoryChart(chartState.mode, chartState.range);
  }
}

// DataStore subscription reference
let historyUnsubscribe = null;

// Main entry point – call once when the history panel opens
export async function updateHistoryChart() {
  const canvas = document.getElementById("listeningWaveform");
  const loadingEl = document.getElementById("historyChartLoading");
  if (!canvas || !loadingEl) return;

  loadingEl.style.display = "flex";
  loadingEl.textContent = "Loading…";
  loadingEl.classList.remove("error");
  canvas.style.display = "none";
  hc_hideDetails();

  // Wire up toggles exactly once for each element's lifetime
  const modeToggle = document.getElementById("chartModeToggle");
  if (modeToggle && !modeToggle.__hcBound) {
    modeToggle.__hcBound = true;
    modeToggle.addEventListener("click", (e) => {
      const btn = e.target.closest(".chart-mode-btn");
      if (btn?.dataset.mode) switchHistoryChartMode(btn.dataset.mode);
    });
  }

  const rangeToggle = document.getElementById("chartRangeToggle");
  if (rangeToggle && !rangeToggle.__hcBound) {
    rangeToggle.__hcBound = true;
    rangeToggle.addEventListener("click", (e) => {
      const btn = e.target.closest(".chart-range-btn");
      if (btn?.dataset.range) switchHistoryChartRange(btn.dataset.range);
    });
  }

  // Restore persisted active states
  document.querySelectorAll(".chart-mode-btn").forEach((btn) => btn.classList.toggle("active", btn.dataset.mode === chartState.mode));
  document.querySelectorAll(".chart-range-btn").forEach((btn) => btn.classList.toggle("active", btn.dataset.range === chartState.range));

  // Get history data from DataStore
  const historyData = DataStore.get("history");

  if (historyData && Array.isArray(historyData) && historyData.length > 0) {
    // If there is data, draw it immediately
    drawHistoryChart(chartState.mode, chartState.range);
  } else {
    loadingEl.style.display = "flex";
    loadingEl.textContent = "Waiting for data…";
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
  hc_destroyChart();
  if (historyUnsubscribe) {
    historyUnsubscribe();
    historyUnsubscribe = null;
  }
}
