import { dom } from "../../core/dom.js";
import { AppState } from "../../core/state.js";
import { DataStore } from "../../core/dataStore.js";
import { shallowEqual } from "../../utils.js";
import { HistoryState } from "../history/history.js";
import { HistoryRenderer } from "../history/historyRenderer.js";
import { LogState } from "../logs/logs.js";
import { LogRenderer } from "../logs/logsRenderer.js";
const _unsubs = [];

export async function initDashboard() {
  // Listen to status changes
  _unsubs.push(
    DataStore.subscribe("status", (status) => {
      if (!status) return;

      const rpcText = status.rpcConnected ? i18n.t("rpc.connected") : i18n.t("rpc.disconnected");
      if (AppState.previousRpcStatus !== rpcText) {
        AppState.previousRpcStatus = rpcText;
        dom.rpcStatus.textContent = rpcText;
        dom.rpcStatus.className = status.rpcConnected ? "connected" : "disconnected";
      }
    }),
  );

  // Listen to activity changes
  _unsubs.push(
    DataStore.subscribe("activity", (activity) => {
      if (!activity) return;

      const currentActivity = activity.activity || {};
      const currentLastRequest = activity.lastUpdateRequest || {};

      if (!shallowEqual(currentActivity, AppState.previousActivity || {})) {
        AppState.previousActivity = currentActivity;
        dom.activityJson.textContent = JSON.stringify(currentActivity, null, 2);
      }

      if (!shallowEqual(currentLastRequest, AppState.previousLastRequest || {})) {
        AppState.previousLastRequest = currentLastRequest;
        dom.lastActivityJson.textContent = JSON.stringify(currentLastRequest, null, 2);
      }
    }),
  );

  // Listen to history changes
  _unsubs.push(
    DataStore.subscribe("history", async (history) => {
      if (!history || !Array.isArray(history)) return;
      if (!dom.main || dom.main.offsetParent === null) return;

      const curHistoryHash = history.length > 0 ? history[history.length - 1]?.date : "";
      if (HistoryState.previousHash === "" || (curHistoryHash && HistoryState.previousHash !== curHistoryHash)) {
        const isFirstLoad = HistoryState.previousHash === "";
        HistoryState.previousHash = curHistoryHash;

        if (isFirstLoad) {
          HistoryRenderer.destroy();
          await HistoryRenderer.render({ reset: true });
        } else {
          await HistoryRenderer.prependNewHistory(history);
        }
      }
    }),
  );

  // Listen to log changes
  _unsubs.push(
    DataStore.subscribe("logs", async (logs) => {
      if (!logs || !Array.isArray(logs)) return;
      if (!dom.main || dom.main.offsetParent === null) return;

      const curLogsHash = logs.length > 0 ? logs[logs.length - 1]?.timestamp : "";
      if (LogState.previousHash === "" || (curLogsHash && LogState.previousHash !== curLogsHash)) {
        const isFirstLoad = LogState.previousHash === "";
        LogState.previousHash = curLogsHash;

        if (isFirstLoad) {
          await LogRenderer.render({ reset: true, filter: dom.errorFilter.value });
        } else {
          await LogRenderer.prependNewLogs(logs);
        }
      }
    }),
  );
}

export function destroyDashboard() {
  _unsubs.forEach((fn) => fn());
  _unsubs.length = 0;
}
