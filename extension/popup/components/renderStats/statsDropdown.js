const handleDropdownToggleClick = (e) => {
  e.stopPropagation();
  const dropdownToggle = document.getElementById("dropdownToggle");
  const dropdownMenu = document.getElementById("dropdownMenu");
  const historyPanel = document.getElementById("historyStatsPanel");
  const datePicker = document.querySelector(".date-range-picker");

  const isOpen = dropdownMenu.classList.toggle("open");
  dropdownToggle.classList.toggle("open", isOpen);
  historyPanel.classList.remove("custom");
  datePicker.style.display = "none";
  historyPanel.style.minHeight = isOpen ? "310px" : "";
  dropdownToggle.querySelector(".arrow").style.transform = isOpen ? "rotate(180deg)" : "rotate(0deg)";
};

const handleDropdownMenuClick = async (e) => {
  const li = e.target.closest("li[data-range]");
  if (!li) return;

  const dropdownToggle = document.getElementById("dropdownToggle");
  const dropdownMenu = document.getElementById("dropdownMenu");
  const historyPanel = document.getElementById("historyStatsPanel");
  const datePicker = document.querySelector(".date-range-picker");
  const range = li.dataset.range;

  // Update toggle label & collapse menu
  dropdownToggle.childNodes[0].textContent = li.textContent;
  dropdownToggle.classList.remove("open");
  dropdownMenu.classList.remove("open");
  historyPanel.style.minHeight = "";
  dropdownToggle.querySelector(".arrow").style.transform = "rotate(0deg)";

  if (range === "custom") {
    historyPanel.classList.add("custom");
    datePicker.style.display = "block";
    await activateSimpleBar("historyStatsPanel");
    return;
  }

  historyPanel.classList.remove("custom");
  datePicker.style.display = "none";
  statsModule.currentCustomStart = null;
  statsModule.currentCustomEnd = null;

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
