import { dom } from "../../core/dom.js";
import { AppState } from "../../core/state.js";
import { shallowEqual } from "../../utils.js";
import { HistoryState } from "../history/history.js";
import { HistoryRenderer } from "../history/historyRenderer.js";
import { LogState } from "../logs/logs.js";
import { LogRenderer } from "../logs/logsRenderer.js";

export async function updateDashboard() {
  if (AppState.dashboardUpdatePending) return;
  AppState.dashboardUpdatePending = true;

  try {
    const [status, activity, logs, history] = await Promise.all([
      fetch("/status").then((r) => r.json()),
      fetch("/activity").then((r) => r.json()),
      fetch("/logs").then((r) => r.json().catch(() => [])),
      fetch("/history").then((r) => r.json().catch(() => [])),
    ]);

    const rpcText = status.rpcConnected ? "Connected" : "Not Connected";
    if (AppState.previousRpcStatus !== rpcText) {
      AppState.previousRpcStatus = rpcText;
      dom.rpcStatus.textContent = rpcText;
      dom.rpcStatus.className = status.rpcConnected ? "connected" : "disconnected";
    }

    const currentActivity = activity.activity || {};
    const currentLastRequest = activity.lastUpdateRequest || {};

    let activityChanged = false;
    let lastRequestChanged = false;

    if (!shallowEqual(currentActivity, AppState.previousActivity || {})) {
      activityChanged = true;
      AppState.previousActivity = currentActivity;
      dom.activityJson.textContent = JSON.stringify(currentActivity, null, 2);
    }

    if (!shallowEqual(currentLastRequest, AppState.previousLastRequest || {})) {
      lastRequestChanged = true;
      AppState.previousLastRequest = currentLastRequest;
      dom.lastActivityJson.textContent = JSON.stringify(currentLastRequest, null, 2);
    }

    if (!dom.main || dom.main.offsetParent === null) return;

    const curHistoryHash = history?.length > 0 ? history[history.length - 1]?.date : "";
    if (HistoryState.previousHash === "" || (curHistoryHash && HistoryState.previousHash !== curHistoryHash)) {
      const isFirstLoad = HistoryState.previousHash === "";
      HistoryState.previousHash = curHistoryHash;
      if (isFirstLoad) {
        await HistoryRenderer.render({ reset: true });
      } else {
        await HistoryRenderer.prependNewHistory(history);
      }
    }

    const curLogsHash = logs?.length > 0 ? logs[logs.length - 1]?.timestamp : "";
    if (LogState.previousHash === "" || (curLogsHash && LogState.previousHash !== curLogsHash)) {
      const isFirstLoad = LogState.previousHash === "";
      LogState.previousHash = curLogsHash;
      if (isFirstLoad) {
        await LogRenderer.render({ reset: true, filter: dom.errorFilter.value });
      } else {
        await LogRenderer.prependNewLogs(logs);
      }
    }
  } catch (err) {
    console.error("Dashboard Sync Error:", err);
  } finally {
    AppState.dashboardUpdatePending = false;
  }
}
