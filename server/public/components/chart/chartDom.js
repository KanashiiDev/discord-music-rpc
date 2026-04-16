function buildRangeToggle() {
  const group = document.createElement("div");
  group.id = "chartRangeToggle";
  group.className = "btn-group";
  group.setAttribute("role", "group");

  const ranges = [
    { range: "week", label: "Week" },
    { range: "month", label: "Month", active: true },
    { range: "year", label: "Year" },
  ];

  for (const { range, label, active } of ranges) {
    const btn = document.createElement("button");
    btn.className = active ? "chart-range-btn active" : "chart-range-btn";
    btn.dataset.range = range;
    btn.type = "button";
    btn.textContent = label;
    btn.dataset.i18n = `chart.range.${range}`;
    group.appendChild(btn);
  }

  return group;
}

function buildPeriodNav() {
  const nav = document.createElement("div");
  nav.className = "chart-period-nav";

  const prev = document.createElement("button");
  prev.id = "chartPeriodPrev";
  prev.className = "chart-period-nav-btn";

  const label = document.createElement("span");
  label.id = "chartPeriodLabel";
  label.className = "chart-period-nav-label";

  const next = document.createElement("button");
  next.id = "chartPeriodNext";
  next.className = "chart-period-nav-btn";

  nav.appendChild(prev);
  nav.appendChild(label);
  nav.appendChild(next);

  return nav;
}

function buildModeToggle() {
  const group = document.createElement("div");
  group.id = "chartModeToggle";
  group.className = "btn-group";
  group.setAttribute("role", "group");

  const summaryBtn = document.createElement("button");
  summaryBtn.id = "chartSummaryToggle";
  summaryBtn.className = "chart-mode-btn";
  summaryBtn.dataset.mode = "summary";
  summaryBtn.type = "button";
  summaryBtn.dataset.i18n = "chart.tab.summary";
  summaryBtn.textContent = "Summary";

  const minutesBtn = document.createElement("button");
  minutesBtn.className = "chart-mode-btn active";
  minutesBtn.dataset.mode = "minutes";
  minutesBtn.type = "button";
  minutesBtn.dataset.i18n = "chart.tab.time";
  minutesBtn.textContent = "Time";

  const songsBtn = document.createElement("button");
  songsBtn.className = "chart-mode-btn";
  songsBtn.dataset.mode = "songs";
  songsBtn.type = "button";
  songsBtn.dataset.i18n = "chart.tab.songs";
  songsBtn.textContent = "Songs";

  group.appendChild(summaryBtn);
  group.appendChild(minutesBtn);
  group.appendChild(songsBtn);

  return group;
}

function buildCanvasWrap() {
  const wrap = document.createElement("div");
  wrap.className = "chart-canvas-wrap";

  const loading = document.createElement("div");
  loading.id = "historyChartLoading";
  loading.dataset.i18n = "chart.loading";
  loading.textContent = "Loading stats...";

  const canvas = document.createElement("canvas");
  canvas.id = "listeningWaveform";
  canvas.setAttribute("role", "img");

  wrap.appendChild(loading);
  wrap.appendChild(canvas);

  return wrap;
}

function buildDetails() {
  const details = document.createElement("div");
  details.id = "chartDetails";
  details.className = "chart-details hidden";

  const header = document.createElement("div");
  header.className = "chart-details-header";

  const title = document.createElement("span");
  title.id = "chartDetailsTitle";
  title.className = "chart-details-date";

  const total = document.createElement("span");
  total.id = "chartDetailsTotal";
  total.className = "chart-details-total";

  header.appendChild(title);
  header.appendChild(total);

  const platforms = document.createElement("div");
  platforms.id = "chartDetailsPlatforms";
  platforms.className = "chart-details-platforms";

  details.appendChild(header);
  details.appendChild(platforms);

  return details;
}

export function renderChartContainer() {
  const section = document.getElementById("chartContainer");
  if (!section) return;

  while (section.firstChild) section.removeChild(section.firstChild);

  const heading = document.createElement("h2");
  heading.id = "chartHeader";
  heading.dataset.i18n = "chart.title";
  heading.textContent = "Stats";

  const controls = document.createElement("div");
  controls.className = "chart-controls";
  controls.appendChild(buildRangeToggle());
  controls.appendChild(buildPeriodNav());
  controls.appendChild(buildModeToggle());

  const container = document.createElement("div");
  container.className = "chart-container";
  container.appendChild(controls);
  container.appendChild(buildCanvasWrap());
  container.appendChild(buildDetails());

  section.appendChild(heading);
  section.appendChild(container);
}
