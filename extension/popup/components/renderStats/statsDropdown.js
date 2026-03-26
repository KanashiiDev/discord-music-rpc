let statsTomSelect = null;

const statsOptions = [
  { value: "day", label: "Today" },
  { value: "yesterday", label: "Yesterday" },
  { value: "week", label: "This Week" },
  { value: "month", label: "This Month" },
  { value: "year", label: "This Year" },
  { value: "all", label: "All Time" },
  { value: "custom", label: "Custom" },
];

function initStatsDropdown() {
  const historyPanel = document.getElementById("historyStatsPanel");
  const datePicker = document.querySelector(".date-range-picker");
  const select = document.getElementById("dropdownToggle");
  select.replaceChildren();

  statsOptions.forEach(({ value, label }) => {
    const option = new Option(label, value);
    select.add(option);
  });

  if (statsTomSelect) {
    statsTomSelect.destroy();
    statsTomSelect = null;
  }

  if (select._statsChangeListener) {
    select.removeEventListener("change", select._statsChangeListener);
    select._statsChangeListener = null;
  }

  statsTomSelect = new TomSelect(select, {
    controlInput: null,
    sortField: false,
  });

  select._statsChangeListener = async (e) => {
    const range = e.target.value;

    historyPanel.classList.remove("custom");
    datePicker.style.display = "none";
    statsModule.currentCustomStart = null;
    statsModule.currentCustomEnd = null;

    if (range === "custom") {
      datePicker.style.display = "block";
      await activateSimpleBar("historyStatsPanel");
      return;
    }

    const cacheKey = `${range}-null-null`;
    if (restoreFromCache(cacheKey)) {
      clearFlatpickr();
      await activateSimpleBar("historyStatsPanel");
      return;
    }

    const container = document.getElementById("statsEntries");
    container.replaceChildren();
    const spinner = document.createElement("div");
    spinner.className = "spinner";
    container.appendChild(spinner);

    await renderTopStats(historyState.fullHistory, range);
    saveToCache(cacheKey, container);
    spinner.remove();

    clearFlatpickr();
    await activateSimpleBar("historyStatsPanel");
  };

  select.addEventListener("change", select._statsChangeListener);
}

function resetStatsDropdown() {
  if (statsTomSelect) {
    statsTomSelect.setValue("day");
  }
}
