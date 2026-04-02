import { HC_RANGES, chartState } from "./chart.js";
import { HistoryState } from "../history/history.js";
import { ScrollManager } from "../../manager/scrollManager.js";
import { createSVG, svg_paths, updateSimpleBarPadding, relativeTime, fullDateTime, loadImage } from "../../utils.js";

// Build a single DOM node
function hc_buildSongNode(item) {
  const wrap = document.createElement("div");
  wrap.className = "song hc-song";

  // Image link
  if (item.songUrl) {
    const a = document.createElement("a");
    a.href = item.songUrl;
    a.target = "_blank";
    a.rel = "noopener noreferrer";
    a.title = "Go to the song";

    const imgContainer = document.createElement("div");
    imgContainer.className = "history-image-container spinner";

    const img = document.createElement("img");
    img.className = "song-image";
    img.alt = item.title || "";
    img.loading = "lazy";
    img.decoding = "async";

    imgContainer.appendChild(img);

    a.appendChild(imgContainer);
    wrap.appendChild(a);
    loadImage({ target: img, src: item.image });
  }

  // Info block
  const info = document.createElement("div");
  info.className = "song-info";

  const dateP = document.createElement("p");
  dateP.className = "date";
  if (item.date) {
    dateP.title = fullDateTime(item.date);
    dateP.textContent = relativeTime(item.date);
  }

  const titleH = document.createElement("h2");
  titleH.className = "title";
  titleH.textContent = item.title || "Unknown title";

  const artistP = document.createElement("p");
  artistP.className = "artist";
  artistP.textContent = item.artist || "";

  const sourceP = document.createElement("p");
  sourceP.className = "source";
  sourceP.textContent = item.source || "";

  info.appendChild(dateP);
  info.appendChild(titleH);
  info.appendChild(artistP);
  info.appendChild(sourceP);
  wrap.appendChild(info);

  return wrap;
}

// Toggle the song list for a platform row
async function hc_toggleSongList(platformRow, songs, platName) {
  // Close existing open list
  if (chartState.expandedPlatform && chartState.expandedPlatform !== platName) {
    const open = document.querySelector(".chart-detail-row.hc-expanded");
    if (open) {
      open.classList.remove("hc-expanded");
      const existing = open.nextElementSibling;
      if (existing?.classList.contains("hc-song-list")) {
        ScrollManager.cleanups.get(`hcSong_${chartState.expandedPlatform}`)?.();
        ScrollManager.cleanups.delete(`hcSong_${chartState.expandedPlatform}`);
        ScrollManager.activeIntervals.delete(`hcSong_${chartState.expandedPlatform}`);
        existing.classList.remove("hc-open");
        await new Promise((resolve) => {
          existing.addEventListener(
            "transitionend",
            () => {
              existing.remove();
              resolve();
            },
            { once: true },
          );
        });
      }
    }
  }

  // Toggle current
  const isOpen = platformRow.classList.contains("hc-expanded");

  if (isOpen) {
    platformRow.classList.remove("hc-expanded");
    ScrollManager.cleanups.get(`hcSong_${platName}`)?.();
    ScrollManager.cleanups.delete(`hcSong_${platName}`);
    ScrollManager.activeIntervals.delete(`hcSong_${platName}`);
    chartState.expandedPlatform = null;
    const listEl = platformRow.nextElementSibling;
    if (listEl?.classList.contains("hc-song-list")) {
      listEl.classList.remove("hc-open");
      listEl.addEventListener("transitionend", () => listEl.remove(), { once: true });
    }
    return;
  }

  platformRow.classList.add("hc-expanded");
  chartState.expandedPlatform = platName;

  // Build list container
  const listWrap = document.createElement("div");
  listWrap.className = "hc-song-list";
  listWrap.id = "hcSongList";

  const inner = document.createElement("div");
  inner.className = "hc-song-list-inner";
  inner.id = "hcSongListInner";
  listWrap.appendChild(inner);
  platformRow.insertAdjacentElement("afterend", listWrap);

  // SimpleBar init
  let sbInstance = null;
  if (typeof SimpleBar !== "undefined") {
    sbInstance = new SimpleBar(listWrap, { autoHide: false });
  }

  const sorted = [...songs].sort((a, b) => new Date(b.date) - new Date(a.date));
  const PAGE = 20;

  const scrollState = {
    fullData: sorted,
    filteredData: [],
    isFiltering: false,
    currentOffset: 0,
    isLoading: false,
  };

  const scrollRenderer = {
    _isRendering: false,
    async render({ reset }) {
      if (reset) {
        inner.textContent = "";
        scrollState.currentOffset = 0;
      }
      const slice = scrollState.fullData.slice(scrollState.currentOffset, scrollState.currentOffset + PAGE);
      for (const item of slice) {
        inner.appendChild(hc_buildSongNode(item));
      }
      scrollState.currentOffset += slice.length;
    },
  };

  await scrollRenderer.render({ reset: true });

  ScrollManager.activate(`hcSong_${platName}`, sbInstance, scrollRenderer, scrollState, "hcSongList", "songs");

  requestAnimationFrame(() => listWrap.classList.add("hc-open"));
  updateSimpleBarPadding("hcSongList");
}

let _detailsAnimTimer = null;

function _animatePanel(panel, { fromHeight, toHeight, fromOpacity, toOpacity, onComplete }) {
  clearTimeout(_detailsAnimTimer);

  panel.style.height = typeof fromHeight === "number" ? `${fromHeight}px` : fromHeight;
  panel.style.opacity = String(fromOpacity);

  // Force reflow
  panel.offsetHeight;

  requestAnimationFrame(() => {
    panel.style.height = typeof toHeight === "number" ? `${toHeight}px` : toHeight;
    panel.style.opacity = String(toOpacity);
  });

  _detailsAnimTimer = setTimeout(onComplete, 300);
}

// Populate and reveal the detail panel for the clicked bar
export function hc_showDetails(barIndex, chartData, mode, range) {
  const panel = document.getElementById("chartDetails");
  const titleEl = document.getElementById("chartDetailsTitle");
  const totalEl = document.getElementById("chartDetailsTotal");
  const platformEl = document.getElementById("chartDetailsPlatforms");
  if (!panel || !titleEl || !totalEl || !platformEl) return;

  chartState.expandedPlatform = null;
  titleEl.textContent = chartData.labels[barIndex] ?? "";
  totalEl.textContent = "";
  platformEl.textContent = "";

  const cfg = HC_RANGES[range];
  const periodStart = new Date(cfg.getStart(chartState.offset));
  const isYear = range === "year";
  const targetMonth = isYear ? barIndex : null;

  if (!isYear) {
    periodStart.setDate(periodStart.getDate() + barIndex);
    periodStart.setHours(0, 0, 0, 0);
  }

  const periodTime = periodStart.getTime();
  const periodYear = periodStart.getFullYear();

  let totalCount = 0;
  let totalMs = 0;
  const byPlatform = {};

  for (const item of HistoryState.fullData ?? []) {
    if (!item.date) continue;

    const src = item.source || "Unknown";
    if (src === "Unknown") continue;

    if (mode === "minutes" && !(item.total_listened_ms > 0)) continue;

    const d = new Date(item.date);
    d.setHours(0, 0, 0, 0);

    const hit = isYear ? d.getFullYear() === periodYear && d.getMonth() === targetMonth : d.getTime() === periodTime;

    if (!hit) continue;

    const plat = (byPlatform[src] ??= { count: 0, ms: 0, items: [] });
    plat.count += 1;
    plat.items.push(item);
    totalCount += 1;

    if (item.total_listened_ms > 0) {
      plat.ms += item.total_listened_ms;
      totalMs += item.total_listened_ms;
    }
  }

  if (totalCount === 0) {
    totalEl.textContent = "No records for this period.";
    panel.classList.remove("hidden");
    return;
  }

  totalEl.textContent = mode === "songs" ? `${totalCount} song${totalCount !== 1 ? "s" : ""}` : `${Math.round(totalMs / 60_000)} min total`;

  const fragment = document.createDocumentFragment();

  for (const [plat, stat] of Object.entries(byPlatform).sort((a, b) => b[1].count - a[1].count)) {
    const row = document.createElement("div");
    row.className = "chart-detail-row";

    const name = document.createElement("span");
    name.className = "chart-detail-platform";
    name.textContent = plat;

    const val = document.createElement("span");
    val.className = "chart-detail-value";
    val.textContent = mode === "songs" ? `${stat.count} song${stat.count !== 1 ? "s" : ""}` : `${stat.count} tracks · ${Math.round(stat.ms / 60_000)} min`;

    const chevron = document.createElement("span");
    chevron.className = "chart-detail-chevron";
    chevron.append(createSVG(svg_paths.expand));

    row.append(name, val, chevron);

    const items = stat.items.slice();
    row.addEventListener("click", () => hc_toggleSongList(row, items, plat));

    fragment.appendChild(row);
  }

  platformEl.appendChild(fragment);

  const wasOpen = !panel.classList.contains("hidden");
  panel.classList.remove("hidden");

  _animatePanel(panel, {
    fromHeight: wasOpen ? panel.offsetHeight : 0,
    toHeight: panel.scrollHeight,
    fromOpacity: wasOpen ? 1 : 0,
    toOpacity: 1,
    onComplete: () => {
      panel.style.height = "auto";
    },
  });
}

// Collapse the detail panel and any open song list
export function hc_hideDetails() {
  const panel = document.getElementById("chartDetails");
  if (!panel) return;

  _animatePanel(panel, {
    fromHeight: panel.offsetHeight,
    toHeight: 0,
    fromOpacity: 1,
    toOpacity: 0,
    onComplete: () => {
      panel.classList.add("hidden");
      panel.style.height = "";
      panel.style.opacity = "";
    },
  });

  chartState.lastClickedBarIndex = null;
  chartState.expandedPlatform = null;
}
