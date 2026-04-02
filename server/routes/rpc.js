const { Router } = require("express");
const { getCurrentTime } = require("../../shared/utils.js");
const { state, CLIENT_TIMEOUT, MAX_CLEAR_RETRIES } = require("../rpc/state.js");
const { isSameActivity } = require("../utils.js");
const { connectRPC, scheduleReconnect } = require("../rpc/client.js");
const { buildActivity, setRpcActivity, clearRpcActivity, resetActivityState, handleHistoryUpdate } = require("../rpc/activity.js");

function createRpcRouter(historyFilePath) {
  const router = Router();

  //  POST /update-rpc
  router.post("/update-rpc", async (req, res) => {
    const now = Date.now();

    // Rate-limit: 2s between updates
    if (state.lastUpdateAt && now - state.lastUpdateAt < 2000) {
      return res.status(429).json({ error: "Too many updates" });
    }

    try {
      const { data, clientId } = req.body ?? {};
      if (!data || typeof data !== "object") {
        return res.status(400).json({ error: "Invalid data object" });
      }

      state.lastUpdateRequest = data;

      //  Client ownership check
      if (state.lastActiveClient && state.lastActiveClient.clientId !== String(clientId ?? "unknown") && now - (state.lastActiveClient.timestamp ?? 0) < CLIENT_TIMEOUT) {
        return res.json({ success: true, message: "Another Client is Active" });
      }

      state.lastActiveClient = { clientId: String(clientId ?? "unknown"), timestamp: now };

      //  Ensure RPC is connected
      if (!(await connectRPC())) {
        return res.status(500).json({ error: "RPC connection failed" });
      }

      //  Clear activity
      if (!data.status) {
        try {
          await clearRpcActivity({ maxRetries: 1, timeoutMs: 5000 });
        } catch (err) {
          console.warn("[UPDATE-RPC] Failed to clear activity:", err.message);
          state.isRpcConnected = false;
        }
        resetActivityState(historyFilePath);
        return res.json({ success: true, action: "cleared" });
      }

      //  Build & set activity
      const { activity, activitySettings } = buildActivity(data, now);

      // Sync showSmallIcon to server settings so health-check and other modules can read it without re-parsing activitySettings.
      state.serverSettings.showSmallIcon = Boolean(activitySettings.showFavIcon);
      state.isHistorySaveEnabled = activitySettings.saveHistory ?? true;

      // Log on change if enabled
      if (state.serverSettings.logSongUpdate && !isSameActivity(activity, state.currentActivity)) {
        console.log(`[RPC] Updated: ${activity.details} — ${getCurrentTime()}`);
      }

      // History (only for music, not "watch" mode)
      if (activity.type !== 3) {
        handleHistoryUpdate(activity, historyFilePath);
      }

      // Deduplicate identical consecutive activities
      const isSame = isSameActivity(activity, state.currentActivity);

      if (!isSame) {
        const ok = await setRpcActivity(activity);
        if (!ok) return res.status(503).json({ error: "RPC client not ready" });
      }

      state.lastUpdateAt = now;
      return res.json({ success: true, action: "updated" });
    } catch (err) {
      console.error("[UPDATE-RPC] Error:", err);
      return res.status(500).json({ error: "Internal server error", details: err.message });
    }
  });

  //  GET /update-rpc
  router.get("/update-rpc", (_req, res) => {
    if (!state.lastUpdateRequest) {
      return res.json({ message: "No update-rpc request has been made yet." });
    }
    res.json({ ...state.lastUpdateRequest });
  });

  //  POST /clear-rpc
  let clearRpcInProgress = false;

  router.post("/clear-rpc", async (req, res) => {
    try {
      if (!req.body || typeof req.body !== "object") {
        return res.status(400).json({ error: "Invalid request body" });
      }
      const { clientId } = req.body;
      if (!clientId || typeof clientId !== "string") {
        return res.status(400).json({ error: "clientId is required and must be a string" });
      }

      if (clearRpcInProgress) {
        const cached = state.lastClearRpcResult ?? { success: true, cleared: true, reconnected: false };
        return res.json({ ...cached, deduplicated: true });
      }

      clearRpcInProgress = true;

      try {
        const hadActivity = state.currentActivity !== null;
        resetActivityState(historyFilePath);

        let clearSuccess = false;

        if (await connectRPC()) {
          if (hadActivity || state.rpcClient?.user) {
            clearSuccess = await clearRpcActivity({ maxRetries: MAX_CLEAR_RETRIES, timeoutMs: 5000 });

            if (!clearSuccess) {
              console.error("[CLEAR-RPC] All retries failed — scheduling reconnect...");
              state.isRpcConnected = false;
              scheduleReconnect(1000, "clear-rpc: all retries failed");
            }
          } else {
            clearSuccess = true;
          }
        }

        state.currentActivity = null;
        state.lastActiveClient = null;
        state.lastUpdateAt = null;
        state.listeningStartTime = null;

        const response = { success: true, cleared: clearSuccess, reconnected: !clearSuccess };
        state.lastClearRpcResult = response;
        return res.json(response);
      } finally {
        clearRpcInProgress = false;
      }
    } catch (err) {
      console.error("[CLEAR-RPC] Error:", err);
      const errorResp = { error: "Internal server error", details: err.message };
      state.lastClearRpcResult = errorResp;
      return res.status(500).json(errorResp);
    }
  });

  //  GET /clear-rpc
  router.get("/clear-rpc", (_req, res) => {
    if (!state.lastClearRpcResult) {
      return res.json({ message: "No clear-rpc request has been made yet." });
    }
    res.json(state.lastClearRpcResult);
  });

  //  GET /activity
  router.get("/activity", (_req, res) => {
    res.json({
      activity: state.currentActivity,
      rpcConnected: state.isRpcConnected,
      lastUpdateRequest: state.lastUpdateRequest,
    });
  });

  return router;
}

module.exports = { createRpcRouter };
