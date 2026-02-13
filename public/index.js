import { AppState } from "./core/state.js";
import { handleCollapsible } from "./utils.js";
import { simpleBars } from "./core/dom.js";
import { initTheme, handleThemeToggle } from "./components/theme/theme.js";
import { initSettingsUI } from "./components/settings/settings.js";
import { initializeHistory } from "./components/history/history.js";
import { initializeLogs } from "./components/logs/logs.js";
import { updateDashboard } from "./components/dashboard/dashboard.js";
import { updateMusicCard } from "./components/musicCard/musicCard.js";
import { updateHistoryChart } from "./components/chart/chartRenderer.js";

// EVENT DELEGATION
function initEventListeners() {
  if (AppState.isInitialized) return;

  document.addEventListener("click", (e) => {
    const header = e.target.closest("h2.collapsible");
    if (header && !["SELECT", "INPUT", "OPTION"].includes(e.target.tagName)) {
      handleCollapsible(header, AppState, simpleBars);
      return;
    }

    if (e.target.closest("#toggleContainer")) {
      handleThemeToggle();
      return;
    }
  });

  AppState.isInitialized = true;
}

// LIFECYCLE CONTROLS
export function startAutoUpdate() {
  stopAutoUpdate();
  AppState.updateInterval = setInterval(updateMusicCard, 1000);
  AppState.dashboardUpdateInterval = setInterval(updateDashboard, 3000);
}

export function stopAutoUpdate() {
  if (AppState.updateInterval) {
    clearInterval(AppState.updateInterval);
    AppState.updateInterval = null;
  }
  if (AppState.dashboardUpdateInterval) {
    clearInterval(AppState.dashboardUpdateInterval);
    AppState.dashboardUpdateInterval = null;
  }
}

window.onload = async () => {
  initTheme();
  initEventListeners();
  initSettingsUI();
  await Promise.allSettled([initializeHistory().catch(console.error), initializeLogs().catch(console.error)]);
  await Promise.allSettled([updateDashboard(), updateMusicCard()]);
  await updateHistoryChart();
  startAutoUpdate();
};
