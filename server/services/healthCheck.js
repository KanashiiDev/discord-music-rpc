const { state, reconnectState, AUTO_CLEAR_TIMEOUT, CLIENT_TIMEOUT, STUCK_TIMEOUT } = require("../rpc/state.js");
const { scheduleReconnect } = require("../rpc/client.js");
const { clearRpcActivity, resetActivityState } = require("../rpc/activity.js");

// Client health check
const clientLooksAlive = () => {
  const client = state.rpcClient;
  return !!(client && !client.destroyed && state.isRpcConnected);
};

// Health-check timer
function startHealthCheckTimer(historyFilePath) {
  if (state.healthCheckInterval) {
    clearInterval(state.healthCheckInterval);
  }

  state.healthCheckInterval = setInterval(() => _tick(historyFilePath), STUCK_TIMEOUT);
}

// Stop health-check timer
function stopHealthCheckTimer() {
  if (state.healthCheckInterval) {
    clearInterval(state.healthCheckInterval);
    state.healthCheckInterval = null;
  }
}

async function _tick(historyFilePath) {
  if (state.isShuttingDown) return;

  try {
    const now = Date.now();

    // Auto-clear stale activity
    if (state.currentActivity !== null && state.lastUpdateAt && now - state.lastUpdateAt > AUTO_CLEAR_TIMEOUT) {
      const staleSeconds = Math.floor((now - state.lastUpdateAt) / 1000);
      console.log(`[HEALTH] No update for ${staleSeconds}s - auto-clearing activity...`);

      const cleared = await clearRpcActivity({ maxRetries: 2, timeoutMs: 5000 });

      if (!cleared && clientLooksAlive()) {
        console.warn(`[HEALTH] Auto-clear failed after ${staleSeconds}s, client may be stuck. RPC connected: ${state.isRpcConnected}`);
      }

      resetActivityState(historyFilePath);

      // If client is also dead, schedule reconnect instead of just returning
      if (!clientLooksAlive() && !state.isConnecting && !reconnectState.scheduled && !reconnectState.isReconnecting) {
        console.log("[HEALTH] Client dead after auto-clear - scheduling reconnect...");
        scheduleReconnect(1000, "health check: dead after auto-clear");
      }
      return;
    }

    // Client timeout
    if (state.lastActiveClient?.timestamp && now - state.lastActiveClient.timestamp > CLIENT_TIMEOUT) {
      const inactiveSeconds = Math.floor((now - state.lastActiveClient.timestamp) / 1000);
      console.log(`[HEALTH] Client inactive for ${inactiveSeconds}s - clearing...`);

      const cleared = await clearRpcActivity({ maxRetries: 1, timeoutMs: 5000 });

      if (!cleared && clientLooksAlive()) {
        console.warn(`[HEALTH] Client timeout clear failed after ${inactiveSeconds}s inactivity`);
      }

      resetActivityState(historyFilePath);

      // If client is also dead, schedule reconnect
      if (!clientLooksAlive() && !state.isConnecting && !reconnectState.scheduled && !reconnectState.isReconnecting) {
        console.log("[HEALTH] Client dead after timeout clear - scheduling reconnect...");
        scheduleReconnect(1000, "health check: dead after client timeout");
      }
      return;
    }

    // RPC client health check - only schedule if client is truly dead
    const isClientDead = !clientLooksAlive();
    const canScheduleReconnect = !state.isConnecting && !reconnectState.scheduled && !reconnectState.isReconnecting;

    if (isClientDead && canScheduleReconnect) {
      console.log("[HEALTH] RPC client not ready - scheduling reconnect...");
      scheduleReconnect(1000, "health check: client not alive");
    }
  } catch (err) {
    console.error("[HEALTH] Unexpected error:", err.message);

    if (!state.isConnecting && !reconnectState.scheduled && !reconnectState.isReconnecting) {
      console.log("[HEALTH] Scheduling reconnect due to unexpected error");
      scheduleReconnect(3000, "health check error");
    }
  }
}

module.exports = {
  startHealthCheckTimer,
  stopHealthCheckTimer,
};
