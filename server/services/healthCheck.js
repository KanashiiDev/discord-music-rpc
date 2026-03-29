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

// It verifies whether Discord is really live.
const _timeoutSymbol = Symbol("timeout");
let _pingPromise = null;

async function pingRpcConnection(timeoutMs = 4000) {
  if (_pingPromise) return _pingPromise;

  _pingPromise = (async () => {
    const client = state.rpcClient;
    if (!client || client.destroyed || !client.user) return false;

    let timer = null;
    const userId = client.user.id;
    const request = client.request("GET_USER", { id: userId });

    try {
      await Promise.race([
        request,
        new Promise((_, reject) => {
          timer = setTimeout(() => reject(_timeoutSymbol), timeoutMs);
        }),
      ]);

      return true;
    } catch (err) {
      if (err === _timeoutSymbol) return false;

      const code = err?.code ?? err?.data?.code;
      if (typeof code === "number") return true;

      return false;
    } finally {
      clearTimeout(timer);
      request.catch(() => {});
      _pingPromise = null;
    }
  })();

  return _pingPromise;
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

      if (!cleared) {
        console.log("[HEALTH] Force-reconnecting after failed auto-clear...");
        await _forceReconnect();
      } else {
        console.log("[HEALTH] Activity auto-cleared successfully");
      }

      resetActivityState(historyFilePath);
      return;
    }

    // Client timeout
    if (state.lastActiveClient?.timestamp && now - state.lastActiveClient.timestamp > CLIENT_TIMEOUT) {
      const inactiveSeconds = Math.floor((now - state.lastActiveClient.timestamp) / 1000);
      console.log(`[HEALTH] Client inactive for ${inactiveSeconds}s - clearing...`);

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
        notifyRpcStatus(false);
        await connectRPC();
      }
      return;
    }

    // Connection state drift
    const clientLooksAlive = Boolean(state.rpcClient && !state.rpcClient.destroyed && state.rpcClient.user);

    if (state.isRpcConnected && !clientLooksAlive) {
      console.log("[HEALTH] Connection state mismatch - correcting...");
      state.isRpcConnected = false;
      notifyRpcStatus(false);
      await connectRPC();
      return;
    }

    // Connection ping
    if (state.isRpcConnected && clientLooksAlive && !state.isConnecting) {
      const alive = await pingRpcConnection(4000);

      if (!alive) {
        console.warn("[HEALTH] Ping failed - IPC connection is dead");
        console.log("[HEALTH] Force-reconnecting...");
        state.isRpcConnected = false;
        notifyRpcStatus(false);
        await _forceReconnect();
      }
    }
  } catch (err) {
    console.error("[HEALTH] Unexpected error:", err.message);
    if (!state.isConnecting && !state.isShuttingDown) {
      state.isRpcConnected = false;
      notifyRpcStatus(false);
      await connectRPC();
    }
  }
}

// Cleans the current client and reconnects.
async function _forceReconnect() {
  if (state.isShuttingDown) return;
  state.reconnectScheduled = false;
  const old = state.rpcClient;
  state.rpcClient = null;
  state.isRpcConnected = false;
  state.isConnecting = false;
  await destroyClient(old);
  await connectRPC();
}

module.exports = { startHealthCheckTimer };
