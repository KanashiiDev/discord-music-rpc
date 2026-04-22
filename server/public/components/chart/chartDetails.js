import { HC_RANGES, chartState } from "./chart.js";
import { HistoryState } from "../history/history.js";
import { ScrollManager } from "../../manager/scrollManager.js";
import { createSVG, svg_paths, updateSimpleBarPadding, relativeTime, fullDateTime, loadImage } from "../../utils.js";

const _platformItems = new Map();
let _detailsClickController = null;
let _isHiding = false;

// Build a single DOM node
function hc_buildSongNode(item) {
  const wrap = document.createElement("div");
  wrap.className = "song hc-song";

  // Image link
  if (item.songUrl) {
    const a = Object.assign(document.createElement("a"), {
      href: item.songUrl,
      target: "_blank",
      rel: "noopener noreferrer",
      title: i18n.t("history.goToSong"),
    });

    const imgContainer = document.createElement("div");
    imgContainer.className = "history-image-container spinner";

    const img = Object.assign(document.createElement("img"), {
      className: "song-image",
      alt: item.title ?? "",
      loading: "lazy",
      decoding: "async",
    });

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
    const ts = item.date instanceof Date ? item.date.getTime() : item.date;
    dateP.title = fullDateTime(item.date);
    dateP.textContent = relativeTime(item.date);
    dateP.dataset.timestamp = ts;
  }

  const titleH = Object.assign(document.createElement("h2"), {
    className: "title",
    textContent: item.title || "Unknown title",
  });

  const artistP = Object.assign(document.createElement("p"), {
    className: "artist",
    textContent: item.artist ?? "",
  });

  const sourceP = Object.assign(document.createElement("p"), {
    className: "source",
    textContent: item.source ?? "",
  });

  info.append(dateP, titleH, artistP, sourceP);
  wrap.appendChild(info);

  return wrap;
}

// Toggle the song list for a platform row
async function hc_toggleSongList(platformRow, songs, platName) {
  if (platformRow.dataset.animating === "true") return;
  platformRow.dataset.animating = "true";

  const TRANSITION_MS = 350;

  // Close existing open list for a different platform
  if (chartState.expandedPlatform && chartState.expandedPlatform !== platName) {
    const open = document.querySelector(".chart-detail-row.hc-expanded");
    const existing = open?.nextElementSibling;

    if (open) open.classList.remove("hc-expanded");

    if (existing?.classList.contains("hc-song-list")) {
      existing._sbInstance?.unMount();
      existing._sbInstance = null;
      ScrollManager.cleanupType(`hcSong_${chartState.expandedPlatform}`);
      existing.classList.remove("hc-open");

      await new Promise((resolve) => {
        const finish = () => {
          existing.remove();
          existing._sbInstance = null;
          resolve();
        };
        existing.addEventListener("transitionend", finish, { once: true });
        setTimeout(finish, TRANSITION_MS + 50);
      });
    }
  }

  // Toggle current
  const isOpen = platformRow.classList.contains("hc-expanded");

  if (isOpen) {
    platformRow.classList.remove("hc-expanded");
    ScrollManager.cleanupType(`hcSong_${platName}`);
    chartState.expandedPlatform = null;

    const listEl = platformRow.nextElementSibling;
    if (listEl?.classList.contains("hc-song-list")) {
      listEl._sbInstance?.unMount();
      listEl._sbInstance = null;
      listEl.classList.remove("hc-open");
      const finish = () => {
        listEl.remove();
        listEl._sbInstance = null;
        delete platformRow.dataset.animating;
      };
      listEl.addEventListener("transitionend", finish, { once: true });
      setTimeout(finish, TRANSITION_MS + 50);
    } else {
      delete platformRow.dataset.animating;
    }
    return;
  }

  // Open path
  platformRow.classList.add("hc-expanded");
  chartState.expandedPlatform = platName;

  // Build list container
  const listWrap = Object.assign(document.createElement("div"), {
    className: "hc-song-list",
    id: "hcSongList",
  });

  const inner = Object.assign(document.createElement("div"), {
    className: "hc-song-list-inner",
    id: "hcSongListInner",
  });

  listWrap.appendChild(inner);
  platformRow.insertAdjacentElement("afterend", listWrap);

  // SimpleBar init
  if (typeof SimpleBar !== "undefined") {
    listWrap._sbInstance = new SimpleBar(listWrap, { autoHide: false });
  }

  const sorted = [...songs].sort((a, b) => new Date(b.date) - new Date(a.date));
  const PAGE = 8;

  const scrollState = {
    fullData: sorted,
    filteredData: [],
    isFiltering: false,
    currentOffset: 0,
    isLoading: false,
  };

  const scrollRenderer = {
    async render({ reset }) {
      if (reset) {
        inner.textContent = "";
        scrollState.currentOffset = 0;
      }
      const slice = scrollState.fullData.slice(scrollState.currentOffset, scrollState.currentOffset + PAGE);
      const frag = document.createDocumentFragment();
      for (const item of slice) frag.appendChild(hc_buildSongNode(item));
      inner.appendChild(frag);
      scrollState.currentOffset += slice.length;
    },
  };

  try {
    await scrollRenderer.render({ reset: true });
    ScrollManager.activate(`hcSong_${platName}`, listWrap._sbInstance ?? null, scrollRenderer, scrollState, "hcSongList", "songs");
  } catch (err) {
    listWrap._sbInstance?.unMount();
    listWrap._sbInstance = null;
    listWrap.remove();
    scrollState.fullData = [];
    scrollState.filteredData = [];
    platformRow.classList.remove("hc-expanded");
    chartState.expandedPlatform = null;
    delete platformRow.dataset.animating;
    throw err;
  }

  requestAnimationFrame(() => listWrap.classList.add("hc-open"));
  updateSimpleBarPadding("hcSongList");

  delete platformRow.dataset.animating;
}

let _detailsAnimTimer = null;
export function cancelDetailsAnimation() {
  clearTimeout(_detailsAnimTimer);
  _detailsAnimTimer = null;
}

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

  _detailsAnimTimer = setTimeout(() => {
    _detailsAnimTimer = null;
    if (document.body.contains(panel)) {
      onComplete();
    }
  }, 300);
}

// One-time click delegation on the panel
export function initDetailsClickHandler() {
  _detailsClickController?.abort();
  _detailsClickController = new AbortController();

  const panel = document.getElementById("chartDetails");
  if (!panel) return;

  panel.addEventListener(
    "click",
    (e) => {
      if (_isHiding) return;
      const row = e.target.closest(".chart-detail-row[data-platform]");
      if (!row) return;
      const items = _platformItems.get(row.dataset.platform);
      if (items) hc_toggleSongList(row, items, row.dataset.platform);
    },
    { signal: _detailsClickController.signal },
  );
}

export function destroyDetailsClickHandler() {
  _detailsClickController?.abort();
  _detailsClickController = null;
}

// Tear down any open song list + its scroll/SimpleBar state
function _cleanupOpenSongList() {
  const orphan = document.querySelector(".hc-song-list");
  if (orphan) {
    orphan._sbInstance?.unMount();
    orphan._sbInstance = null;
    orphan.remove();
  }

  if (chartState.expandedPlatform) {
    ScrollManager.cleanupType(`hcSong_${chartState.expandedPlatform}`);
  }

  const expandedRow = document.querySelector(".chart-detail-row.hc-expanded");
  if (expandedRow) {
    expandedRow.classList.remove("hc-expanded");
    delete expandedRow.dataset.animating;
  }
}

// Populate and reveal the detail panel for the clicked bar
export function hc_showDetails(barIndex, chartData, mode, range) {
  const panel = document.getElementById("chartDetails");
  const titleEl = document.getElementById("chartDetailsTitle");
  const totalEl = document.getElementById("chartDetailsTotal");
  const platformEl = document.getElementById("chartDetailsPlatforms");
  if (!panel || !titleEl || !totalEl || !platformEl) return;

  _isHiding = false;
  panel.style.pointerEvents = "";
  cancelDetailsAnimation();

  _cleanupOpenSongList();
  chartState.expandedPlatform = null;
  _platformItems.clear();
  totalEl.textContent = "";
  platformEl.textContent = "";
  let titleText = "";

  const locale = navigator.language || "en-US";
  const cfg = HC_RANGES[range];
  const baseDate = new Date(cfg.getStart(chartState.offset));

  if (range === "year") {
    const d = new Date(baseDate);
    d.setMonth(barIndex);
    d.setDate(1);

    titleText = d.toLocaleDateString(locale, {
      month: "long",
      year: "numeric",
    });
  } else if (range === "month") {
    const d = new Date(baseDate);
    d.setDate(d.getDate() + barIndex);

    titleText = d.toLocaleDateString(locale, {
      day: "numeric",
      month: "long",
    });
  } else {
    const d = new Date(baseDate);
    d.setDate(d.getDate() + barIndex);

    titleText = d.toLocaleDateString(locale, {
      weekday: "long",
    });
  }

  titleEl.textContent = titleText;

  initDetailsClickHandler();

  const periodStart = new Date(cfg.getStart(chartState.offset));
  const isYear = range === "year";
  const targetMonth = isYear ? barIndex : null;

  if (!isYear) {
    periodStart.setDate(periodStart.getDate() + barIndex);
    periodStart.setHours(0, 0, 0, 0);
  }

  const periodTime = isYear ? null : periodStart.getTime();
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
    totalEl.textContent = i18n.t("chart.summary.empty");
    panel.classList.remove("hidden");
    return;
  }

  const minutes = Math.round(totalMs / 60_000);

  totalEl.textContent =
    mode === "songs" ? i18n.t(totalCount === 1 ? "chart.songs" : "chart.songs_plural", { count: totalCount }) : i18n.t("chart.total.duration", { minutes });

  const fragment = document.createDocumentFragment();

  for (const [plat, stat] of Object.entries(byPlatform).sort((a, b) => b[1].count - a[1].count)) {
    const row = document.createElement("div");
    row.className = "chart-detail-row";
    row.dataset.platform = plat;

    const name = Object.assign(document.createElement("span"), {
      className: "chart-detail-platform",
      textContent: plat,
    });

    const rowMinutes = Math.round(stat.ms / 60_000);
    const val = Object.assign(document.createElement("span"), {
      className: "chart-detail-value",
      textContent:
        mode === "songs"
          ? i18n.t(stat.count === 1 ? "chart.songs" : "chart.songs_plural", { count: stat.count })
          : i18n.t("chart.tracks", { count: stat.count, minutes: rowMinutes }),
    });

    const chevron = document.createElement("span");
    chevron.className = "chart-detail-chevron";
    chevron.append(createSVG(svg_paths.expand));

    row.append(name, val, chevron);
    _platformItems.set(plat, stat.items.slice());
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

  _isHiding = true;
  panel.style.pointerEvents = "none";

  _cleanupOpenSongList();
  _platformItems.clear();

  _animatePanel(panel, {
    fromHeight: panel.offsetHeight,
    toHeight: 0,
    fromOpacity: 1,
    toOpacity: 0,
    onComplete: () => {
      panel.classList.add("hidden");
      panel.style.cssText = "";
      _isHiding = false;
    },
  });

  chartState.lastClickedBarIndex = null;
  chartState.expandedPlatform = null;
}

export function hc_destroyDetails() {
  cancelDetailsAnimation();
  destroyDetailsClickHandler();
  _cleanupOpenSongList();
  _platformItems.clear();
  chartState.expandedPlatform = null;
  chartState.lastClickedBarIndex = null;
}
