const { Client } = require("@xhayper/discord-rpc");
const { notifyRpcStatus } = require("../utils.js");
const { state, CLIENT_ID, RETRY_DELAY } = require("./state.js");

// Returns true only when the RPC client is fully operational.
function isRpcReady(client) {
  return Boolean(state.isRpcConnected && client && !client.destroyed && client.user && typeof client.user.setActivity === "function");
}

// Destroys a client instance gracefully, ignoring any errors.
async function destroyClient(client) {
  if (!client) return;
  try {
    client.removeAllListeners();
    await client.destroy();
  } catch (err) {
    console.warn("[RPC] Error destroying client:", err.message);
  }
}

// Schedules a single reconnect attempt, debounced to avoid duplicate calls.
function scheduleReconnect(delayMs = 2000) {
  if (state.reconnectScheduled || state.isConnecting || state.isShuttingDown) return;
  state.reconnectScheduled = true;

  setTimeout(async () => {
    state.reconnectScheduled = false;
    if (state.isConnecting || state.isShuttingDown) return;

    const old = state.rpcClient;
    state.rpcClient = null;
    state.isRpcConnected = false;
    state.isConnecting = false;
    await destroyClient(old);
    await connectRPC();
  }, delayMs);
}

// Event Setup
function setupClientEvents(client) {
  client.setMaxListeners(20);

  client.once("ready", () => {
    state.isRpcConnected = true;
    state.isConnecting = false;
    state.reconnectScheduled = false;
    state.hasLoggedRpcFailure = false;
    notifyRpcStatus(true);
  });

  client.on("disconnected", () => {
    if (client !== state.rpcClient) return;

    state.isRpcConnected = false;
    state.isConnecting = false;
    notifyRpcStatus(false);

    if (state.isShuttingDown) return;
    console.warn("[RPC] Attempting reconnect...");
    scheduleReconnect(2000);
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
        scheduleReconnect(3000);
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
      state.isConnecting = false;
      console.log("[RPC] Connected successfully");
      return true;
    } catch (err) {
      state.isRpcConnected = false;
      state.isConnecting = false;

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

  if (!state.isRpcConnected && !state.isShuttingDown) {
    console.error("[RPC] Could not connect.");
  }
  return false;
}

module.exports = { isRpcReady, createClient, connectRPC, destroyClient };
