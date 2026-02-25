const { notifyRpcStatus } = require("../utils.js");
const { state, AUTO_CLEAR_TIMEOUT, CLIENT_TIMEOUT, STUCK_TIMEOUT } = require("../rpc/state.js");
const { connectRPC, destroyClient } = require("../rpc/client.js");
const { clearRpcActivity, resetActivityState } = require("../rpc/activity.js");

// Starts the recurring health-check interval.
function startHealthCheckTimer(historyFilePath) {
  if (state.healthCheckInterval) {
    clearInterval(state.healthCheckInterval);
  }

  state.healthCheckInterval = setInterval(() => _tick(historyFilePath), STUCK_TIMEOUT);
}

async function _tick(historyFilePath) {
  if (state.isShuttingDown) return;

  try {
    const now = Date.now();

    // Auto-clear stale activity
    if (state.currentActivity !== null && state.lastUpdateAt && now - state.lastUpdateAt > AUTO_CLEAR_TIMEOUT) {
      const staleSeconds = Math.floor((now - state.lastUpdateAt) / 1000);
      console.log(`[HEALTH] No update for ${staleSeconds}s — auto-clearing activity...`);

      const cleared = await clearRpcActivity({ maxRetries: 2, timeoutMs: 5000 });

      if (!cleared) {
        console.log("[HEALTH] Force-reconnecting after failed auto-clear...");
        state.isRpcConnected = false;
        const old = state.rpcClient;
        state.rpcClient = null;
        await destroyClient(old);
        await connectRPC();
      } else {
        console.log("[HEALTH] Activity auto-cleared successfully");
      }

      resetActivityState(historyFilePath);
      return;
    }

    // Client timeout
    if (state.lastActiveClient?.timestamp && now - state.lastActiveClient.timestamp > CLIENT_TIMEOUT) {
      const inactiveSeconds = Math.floor((now - state.lastActiveClient.timestamp) / 1000);
      console.log(`[HEALTH] Client inactive for ${inactiveSeconds}s — clearing...`);

      const cleared = await clearRpcActivity({ maxRetries: 1, timeoutMs: 5000 });
      if (!cleared) {
        console.warn("[HEALTH] Failed to clear inactive client activity");
      } else {
        console.log("[HEALTH] Activity cleared due to client timeout");
      }

      resetActivityState(historyFilePath);
      return;
    }

    // RPC client health
    if (!state.rpcClient || state.rpcClient.destroyed || !state.rpcClient.user) {
      if (!state.isConnecting && !state.isShuttingDown) {
        state.isRpcConnected = false;
        await connectRPC();
      }
      return;
    }

    // Connection state drift
    const shouldBeConnected = Boolean(state.rpcClient && !state.rpcClient.destroyed && state.rpcClient.user);

    if (state.isRpcConnected !== shouldBeConnected) {
      console.log("[HEALTH] Connection state mismatch — correcting...");
      state.isRpcConnected = shouldBeConnected;
      notifyRpcStatus(shouldBeConnected);

      if (!shouldBeConnected && !state.isConnecting) {
        await connectRPC();
      }
    }
  } catch (err) {
    console.error("[HEALTH] Unexpected error:", err.message);
    if (!state.isConnecting && !state.isShuttingDown) {
      state.isRpcConnected = false;
      await connectRPC();
    }
  }
}

module.exports = { startHealthCheckTimer };
