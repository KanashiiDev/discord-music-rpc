const { Client } = require("@xhayper/discord-rpc");
const { notifyRpcStatus } = require("../utils.js");
const { state, reconnectState, CLIENT_ID, RETRY_DELAY } = require("./state.js");

// Returns true only when the RPC client is fully operational.
function isRpcReady(client) {
  return Boolean(state.isRpcConnected && client && !client.destroyed && client.user && typeof client.user.setActivity === "function");
}

// Destroys a client instance gracefully, ignoring any errors.
async function destroyClient(client) {
  if (!client) return;

  try {
    client.removeAllListeners();
    await Promise.race([client.destroy(), new Promise((_, reject) => setTimeout(() => reject(new Error("Destroy timeout")), 5000))]);
  } catch (err) {
    console.warn("[RPC] Error destroying client:", err.message);
  }

  if (state.rpcClient === client) {
    state.rpcClient = null;
  }
}

async function executeReconnect() {
  if (state.isShuttingDown) return false;
  if (!reconnectState.canReconnect()) return false;

  reconnectState.begin();

  try {
    console.log(`[RPC] Executing reconnect: ${reconnectState.reason || "unknown reason"}`);

    const oldClient = state.rpcClient;
    state.rpcClient = null;
    state.isRpcConnected = false;
    state.isConnecting = false;
    await destroyClient(oldClient);
    await connectRPC();
    console.log("[RPC] Reconnect completed successfully");
    return true;
  } catch (err) {
    console.error("[RPC] Reconnect failed:", err.message);
    return false;
  } finally {
    reconnectState.complete();
    reconnectState.end();
  }
}

// Schedule reconnect with debounce
function scheduleReconnect(delayMs = 3000, reason = "unknown") {
  if (state.isShuttingDown) return;

  if (reconnectState.scheduled || reconnectState.isReconnecting) {
    return;
  }

  if (reconnectState.lastReconnectAt && Date.now() - reconnectState.lastReconnectAt < reconnectState.minReconnectInterval) {
    console.log(`[RPC] Reconnect throttled - last reconnect was ${Math.floor((Date.now() - reconnectState.lastReconnectAt) / 1000)}s ago`);
    return;
  }

  if (!reconnectState.start(reason)) return;

  reconnectState.timer = setTimeout(async () => {
    await executeReconnect();
  }, delayMs);
}

// Cancel any pending reconnect
function cancelReconnect() {
  reconnectState.cancel();
}

// Event Setup
function setupClientEvents(client) {
  client.setMaxListeners(20);

  client.once("ready", () => {
    state.isRpcConnected = true;
    state.isConnecting = false;
    reconnectState.cancel();
    state.hasLoggedRpcFailure = false;
    notifyRpcStatus(true);
  });

  client.on("disconnected", () => {
    if (client !== state.rpcClient) return;

    state.isRpcConnected = false;
    state.isConnecting = false;
    notifyRpcStatus(false);

    if (state.isShuttingDown) return;
    console.warn("[RPC] Disconnected - scheduling reconnect...");
    scheduleReconnect(3000, "disconnected");
  });

  client.on("error", (err) => {
    if (client !== state.rpcClient) return;

    console.error("[RPC] Client error:", err.message);

    const isSocketError =
      err.message?.includes("ENOENT") ||
      err.message?.includes("ECONNRESET") ||
      err.message?.includes("EPIPE") ||
      err.message?.includes("socket") ||
      err.message?.includes("ECONNREFUSED");

    if (isSocketError) {
      console.error("[RPC] IPC socket error - Discord may have closed or restarted");
      state.isRpcConnected = false;
      notifyRpcStatus(false);

      if (!state.isShuttingDown) {
        scheduleReconnect(3000, "socket error");
      }
    }
  });
}

// It creates a new client.
async function createClient() {
  if (state.rpcClient) {
    const old = state.rpcClient;
    state.rpcClient = null;
    await destroyClient(old);
  }

  state.rpcClient = new Client({
    clientId: CLIENT_ID,
    transport: "ipc",
    useSteam: false,
    reconnect: false,
  });

  setupClientEvents(state.rpcClient);
  return state.rpcClient;
}

// Connects the RPC client. Retries indefinitely until shutdown.
async function connectRPC() {
  // Already connected
  if (state.isRpcConnected && isRpcReady(state.rpcClient)) return true;

  // Deduplicate concurrent callers
  if (state.connectPromise) return state.connectPromise;

  state.connectPromise = _connect();
  try {
    return await state.connectPromise;
  } finally {
    state.connectPromise = null;
    state.isConnecting = false;
  }
}

async function _connect() {
  if (state.isConnecting) return false;
  state.isConnecting = true;

  let attempt = 0;

  while (!state.isRpcConnected && !state.isShuttingDown) {
    attempt++;
    try {
      const client = await createClient();

      if (attempt === 1) console.log("[RPC] Connecting to Discord...");

      await Promise.race([client.login(), new Promise((_, reject) => setTimeout(() => reject(new Error("Login timed out")), RETRY_DELAY))]);
      await new Promise((r) => setTimeout(r, 200));

      state.hasLoggedRpcFailure = false;
      console.log("[RPC] Connected successfully");
      return true;
    } catch (err) {
      state.isRpcConnected = false;

      // Clear the client on a failed attempt
      if (state.rpcClient) {
        const dead = state.rpcClient;
        state.rpcClient = null;
        dead.removeAllListeners();
        await destroyClient(dead);
      }

      if (!state.hasLoggedRpcFailure) {
        console.error(`[RPC] Connection failed: ${err.message}`);

        if (err.message?.includes("ENOENT")) console.error("[RPC] Discord IPC socket not found - is Discord running?");
        else if (err.message?.includes("EACCES")) console.error("[RPC] Permission denied accessing IPC socket");
        else if (err.message?.includes("ECONNREFUSED")) console.error("[RPC] Discord refused connection - try restarting Discord");
        else if (err.message?.includes("timed out")) console.error("[RPC] Login timed out - Discord may be busy");

        console.log("[RPC] Waiting for connection...");
        state.hasLoggedRpcFailure = true;
      }

      await new Promise((r) => setTimeout(r, RETRY_DELAY));
    }
  }

  return false;
}

module.exports = {
  isRpcReady,
  createClient,
  connectRPC,
  scheduleReconnect,
  cancelReconnect,
  destroyClient,
  executeReconnect,
};
