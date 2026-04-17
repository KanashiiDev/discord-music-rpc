import { AppState } from "./core/state.js";
import { handleCollapsible } from "./utils.js";
import { simpleBars } from "./core/dom.js";
import { initTheme, handleThemeToggle } from "./components/theme/theme.js";
import { initSettingsUI } from "./components/settings/settings.js";
import { initializeHistory } from "./components/history/history.js";
import { initializeLogs } from "./components/logs/logs.js";
import { initDashboard } from "./components/dashboard/dashboard.js";
import { initMusicCard } from "./components/musicCard/musicCard.js";
import { updateHistoryChart } from "./components/chart/chartRenderer.js";
import { FetchManager } from "./core/fetchManager.js";
import { initVisibilityRefresh } from "./utils.js";

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
  FetchManager.startAll();
}

export function stopAutoUpdate() {
  FetchManager.stopAll();
}

window.onload = async () => {
  await i18n.load("server");
  applyTranslations();
  initTheme();
  initEventListeners();
  initVisibilityRefresh();
  initSettingsUI();
  await initDashboard();
  initMusicCard();
  await Promise.allSettled([initializeHistory().catch(console.error), initializeLogs().catch(console.error)]);
  await updateHistoryChart();
  applyTranslations();
  startAutoUpdate();
};
