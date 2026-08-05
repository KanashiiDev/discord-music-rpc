import { HC_RANGES, chartState as createChartState, getHcColor } from "./chart.js";
import { hc_prepareData } from "./chartData.js";
import { createDetailsController } from "./chartDetails.js";
import { DataStore } from "../../core/dataStore.js";
import { createSVG, getCSS, svg_paths } from "../../utils.js";
import { renderChartContainer } from "./chartDom.js";
import { createSummaryController } from "./summary/summary.js";

const _noopSummary = {
  syncSummary: () => {},
  toggleSummary: () => {},
  hideSummary: () => {},
  isSummaryVisible: () => false,
  showSummaryRangeBtn: () => {},
  hideSummaryRangeBtn: () => {},
};

function createChartRenderer(historyMode = "listen") {
  const isWatch = historyMode === "watch";
  const p = isWatch ? "watch_" : "";
  const containerId = isWatch ? "watchChartContainer" : "listenChartContainer";
  const state = createChartState(historyMode);
  const details = createDetailsController(p, historyMode);

  let historyUnsubscribe = null;
  let _controlsBound = false;

  const rendererAPI = {
    showSummaryRangeBtn() {
      document.querySelectorAll(`#${_id("chartRangeToggle")} .chart-range-btn[data-summary-only]`).forEach((btn) => {
        btn.style.display = "";
      });
    },

    hideSummaryRangeBtn() {
      document.querySelectorAll(`#${_id("chartRangeToggle")} .chart-range-btn[data-summary-only]`).forEach((btn) => {
        btn.style.display = "none";
        if (btn.classList.contains("active")) {
          btn.classList.remove("active");
          state.range = "month";
          document.querySelectorAll(`#${_id("chartRangeToggle")} .chart-range-btn`).forEach((b) => b.classList.toggle("active", b.dataset.range === "month"));
        }
      });
    },
  };

  let _summary = _noopSummary;
  if (!isWatch) {
    _summary = createSummaryController(p, historyMode, state, rendererAPI);
  }

  function _id(name) {
    return p ? `${p}${name}` : name;
  }

  function _updateNavLabel() {
    const labelEl = document.getElementById(_id("chartPeriodLabel"));
    const nextBtn = document.getElementById(_id("chartPeriodNext"));
    if (!labelEl) return;
    const cfg = HC_RANGES[state.range];
    labelEl.textContent = cfg.getLabel(state.offset);
    if (nextBtn) {
      nextBtn.disabled = state.offset >= 0;
      nextBtn.style.opacity = state.offset >= 0 ? "0.3" : "1";
    }
  }

  function hc_destroyChart() {
    if (state.instance) {
      state.instance.destroy();
      state.instance = null;
    }
  }

  function drawChart(mode, range) {
    const canvas = document.getElementById(_id("listeningWaveform"));
    const loadingEl = document.getElementById(_id("historyChartLoading"));
    if (!canvas) return;

    _updateNavLabel();
    if (_summary.isSummaryVisible()) return;

    const chartData = hc_prepareData(mode, range, state, historyMode);
    const isEmpty = !chartData.data.length || chartData.data.every((v) => v === 0);

    if (isEmpty) {
      if (loadingEl) {
        loadingEl.style.display = "flex";
        loadingEl.textContent = i18n.t("chart.summary.empty");
        loadingEl.dataset.i18n = "chart.summary.empty";
        loadingEl.classList.remove("error");
      }
      canvas.style.display = "none";
      details.hc_hideDetails(state);
      return;
    }

    if (loadingEl) loadingEl.style.display = "none";
    canvas.style.display = "block";

    hc_destroyChart();
    details.hc_destroyDetails(state);

    const color = getHcColor(mode);
    const barThickness = HC_RANGES[range].barThickness;
    const isSongs = mode === "songs";
    const isVideos = mode === "videos";
    const isVideoMinutes = mode === "minutes_watch";
    const yMax = Math.ceil(chartData.maxValue * 1.12) || 1;
    const stepSize = Math.max(1, Math.ceil(chartData.maxValue / 5));

    state.instance = new Chart(canvas.getContext("2d"), {
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
              return tinycolor(`rgb(${color.rgb})`)
                .darken(ratio * 15)
                .toRgbString();
            },
            hoverBackgroundColor: (ctx) => {
              const base = ctx.dataset.backgroundColor instanceof Function ? ctx.dataset.backgroundColor(ctx) : ctx.dataset.backgroundColor;
              return tinycolor(base).brighten(8).toRgbString();
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
            ticks: { color: getCSS("--text-color-muted", "#555", "hexa"), maxRotation: 0, minRotation: 0, font: { size: 11 }, padding: 8 },
          },
          y: {
            beginAtZero: true,
            max: yMax,
            ticks: {
              color: getCSS("--text-color-muted", "#555", "hexa"),
              stepSize,
              callback: (v) => (isSongs || isVideos ? v : i18n.t("chart.minute_short", { value: v })),
            },
            grid: { color: "rgba(255,255,255,0.05)" },
          },
        },
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: getCSS("--foreground-color-300", "rgba(47,47,47,0.95)", "hex"),
            multiKeyBackground: getCSS("--foreground-color-300", "rgba(47,47,47,0.95)", "hex"),
            titleColor: getCSS("--text-color-primary", "#ddd", "hexa"),
            bodyColor: getCSS("--text-color-secondary", "#bbb", "hexa"),
            padding: 10,
            cornerRadius: 8,
            callbacks: {
              label(ctx) {
                const v = ctx.parsed.y;
                if (isVideos) return " " + i18n.t(v === 1 ? "chart.video.one" : "chart.video.other", { count: v });
                if (isSongs) return " " + i18n.t(v === 1 ? "chart.song.one" : "chart.song.other", { count: v });
                if (isVideoMinutes) return " " + i18n.t("chart.minutes_watched", { count: v });
                return " " + i18n.t("chart.minutes_listened", { count: v });
              },
              title(items) {
                if (!items.length) return "";
                const idx = items[0].dataIndex;
                if (range === "alltime") return chartData.labels[idx];
                const locale = navigator.languages?.[0] || navigator.language || "en-US";
                const cfg = HC_RANGES[range];
                const baseDate = new Date(cfg.getStart(state.offset));
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
                if (range === "year") return d.toLocaleDateString(locale, { month: "long", year: "numeric" });
                if (range === "month") return d.toLocaleDateString(locale, { day: "numeric", month: "long" });
                return d.toLocaleDateString(locale, { weekday: "long" });
              },
            },
          },
        },
        onHover(evt, active) {
          evt.chart.canvas.style.cursor = active.length ? "pointer" : "default";
        },
        onClick(_, active) {
          if (!active.length) {
            details.hc_hideDetails(state);
            return;
          }
          const idx = active[0].index;
          if (state.lastClickedBarIndex === idx) {
            details.hc_hideDetails(state);
            return;
          }
          state.lastClickedBarIndex = idx;
          details.hc_showDetails(idx, chartData, mode, range, state);
        },
      },
    });
  }

  function toggleNavVisibility() {
    const periodToggle = document.querySelector(`#${_id("chartRangeToggle")}`);
    const periodNav = document.querySelector(`#${_id("chartPeriodNav")}`);
    if (periodToggle.querySelector(".chart-range-btn.active")?.dataset.range === "alltime") {
      periodNav.style.opacity = "0";
      periodNav.style.pointerEvents = "none";
    } else {
      periodNav.style.opacity = "";
      periodNav.style.pointerEvents = "";
    }
  }

  function switchMode(mode) {
    state.mode = mode;
    document.querySelectorAll(`#${_id("chartModeToggle")} .chart-mode-btn`).forEach((btn) => btn.classList.toggle("active", btn.dataset.mode === mode));
    toggleNavVisibility();
    details.hc_hideDetails(state);
    drawChart(mode, state.range);
  }

  function switchRange(range) {
    state.range = range;
    if (range !== "alltime") state.offset = 0;
    document.querySelectorAll(`#${_id("chartRangeToggle")} .chart-range-btn`).forEach((btn) => btn.classList.toggle("active", btn.dataset.range === range));
    toggleNavVisibility();
    details.hc_hideDetails(state);
    drawChart(state.mode, range);
    _summary.syncSummary();
  }

  function navigatePeriod(direction) {
    const newOffset = state.offset + direction;
    if (newOffset > 0) return;
    state.offset = newOffset;
    details.hc_hideDetails(state);
    drawChart(state.mode, state.range);
    _summary.syncSummary();
  }

  function _initNavigation() {
    const prevBtn = document.getElementById(_id("chartPeriodPrev"));
    const nextBtn = document.getElementById(_id("chartPeriodNext"));
    if (prevBtn && !_controlsBound) {
      prevBtn.addEventListener("click", () => navigatePeriod(-1));
      prevBtn.appendChild(createSVG(svg_paths.leftChev, { width: 20, height: 20 }));
    }
    if (nextBtn && !_controlsBound) {
      nextBtn.addEventListener("click", () => navigatePeriod(+1));
      nextBtn.appendChild(createSVG(svg_paths.rightChev, { width: 20, height: 20 }));
    }
  }

  function _updateModeButtonsState() {
    document.querySelectorAll(`#${_id("chartModeToggle")} .chart-mode-btn`).forEach((btn) => {
      btn.classList.toggle("summary-active", _summary.isSummaryVisible());
    });
  }

  return {
    ...rendererAPI,
    showSummary: () => _summary.showSummary(),
    hideSummary: () => _summary.hideSummary(),
    toggleSummary: () => _summary.toggleSummary(),
    syncSummary: () => _summary.syncSummary(),
    isSummaryVisible: () => _summary.isSummaryVisible(),

    setSummary(summaryModule) {
      _summary = summaryModule;
    },

    async init() {
      if (!document.querySelector(`#${containerId} .chart-container`)) {
        renderChartContainer(containerId, historyMode);
        _controlsBound = false;
      }

      const canvas = document.getElementById(_id("listeningWaveform"));
      const loadingEl = document.getElementById(_id("historyChartLoading"));
      if (!canvas || !loadingEl) return;

      loadingEl.style.display = "flex";
      loadingEl.textContent = i18n.t("chart.loading");
      loadingEl.dataset.i18n = "chart.loading";
      loadingEl.classList.remove("error");
      canvas.style.display = "none";
      details.hc_hideDetails(state);

      if (!_controlsBound) {
        const modeToggle = document.getElementById(_id("chartModeToggle"));
        if (modeToggle) {
          modeToggle.addEventListener("click", (e) => {
            if (!isWatch) {
              const summaryBtn = e.target.closest(`#${_id("chartSummaryToggle")}, [data-mode='summary']`);
              if (summaryBtn) {
                summaryBtn.classList.toggle("active");
                _summary.toggleSummary();
                _updateModeButtonsState();
                return;
              }
            }
            const btn = e.target.closest(".chart-mode-btn");
            if (!btn?.dataset.mode) return;
            if (!isWatch && _summary.isSummaryVisible()) {
              _summary.hideSummary();
              document.getElementById(_id("chartSummaryToggle"))?.classList.remove("active");
              _updateModeButtonsState();
            }
            switchMode(btn.dataset.mode);
          });
        }

        const rangeToggle = document.getElementById(_id("chartRangeToggle"));
        if (rangeToggle) {
          rangeToggle.addEventListener("click", (e) => {
            const btn = e.target.closest(".chart-range-btn");
            if (btn?.dataset.range) switchRange(btn.dataset.range);
          });
        }

        _initNavigation();
        _controlsBound = true;
      }

      document.querySelectorAll(`#${_id("chartModeToggle")} .chart-mode-btn`).forEach((btn) => btn.classList.toggle("active", btn.dataset.mode === state.mode));
      document.querySelectorAll(`#${_id("chartRangeToggle")} .chart-range-btn`).forEach((btn) => btn.classList.toggle("active", btn.dataset.range === state.range));
      _updateModeButtonsState();

      const historyData = DataStore.get("history");
      if (historyData && Array.isArray(historyData) && historyData.length > 0) {
        drawChart(state.mode, state.range);
      }

      if (!historyUnsubscribe) {
        historyUnsubscribe = DataStore.subscribe("history", (newData) => {
          if (newData && Array.isArray(newData) && newData.length > 0) {
            drawChart(state.mode, state.range);
          }
        });
      }
    },

    destroy() {
      details.cancelDetailsAnimation();
      hc_destroyChart();
      details.hc_destroyDetails(state);
      if (historyUnsubscribe) {
        historyUnsubscribe();
        historyUnsubscribe = null;
      }
    },
  };
}

export const ChartRenderer = {
  listen: createChartRenderer("listen"),
  watch: createChartRenderer("watch"),
};
