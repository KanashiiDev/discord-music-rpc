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
    await client.destroy();
  } catch (err) {
    console.warn("[RPC] Error destroying client:", err.message);
  }
}

// Event Setup
function setupClientEvents(client) {
  client.setMaxListeners(20);

  client.once("ready", () => {
    state.isRpcConnected = true;
    state.isConnecting = false;
    state.hasLoggedRpcFailure = false;
    notifyRpcStatus(true);
  });

  client.on("disconnected", async () => {
    console.log("[RPC] Disconnected event triggered");
    state.isRpcConnected = false;
    state.isConnecting = false;
    notifyRpcStatus(false);

    if (state.isShuttingDown) return;

    console.warn("[RPC] Attempting reconnect in 2 seconds...");
    const old = state.rpcClient;
    state.rpcClient = null;
    await destroyClient(old);
    await new Promise((r) => setTimeout(r, 2000));
    await connectRPC();
  });

  client.on("error", (err) => {
    console.error("[RPC] Client error:", err.message);
    if (err.message?.includes("ENOENT") || err.message?.includes("socket")) {
      console.error("[RPC] IPC socket error — Discord may not be running");
    }
  });
}

// Returns the existing live client or creates a fresh one.
function createClient() {
  if (state.rpcClient && !state.rpcClient.destroyed) return state.rpcClient;

  console.log("[RPC] Creating new client...");
  state.rpcClient?.removeAllListeners();

  state.rpcClient = new Client({
    clientId: CLIENT_ID,
    transport: "ipc",
    useSteam: false,
    reconnect: false,
  });

  setupClientEvents(state.rpcClient);
  console.log("[RPC] Client ready");
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
      const client = createClient();
      client.removeAllListeners("connected");

      await Promise.race([client.login(), new Promise((_, reject) => setTimeout(() => reject(new Error("Login timed out")), RETRY_DELAY))]);

      if (attempt === 1) console.log("[RPC] Connecting...");

      state.isRpcConnected = isRpcReady(client);
      state.hasLoggedRpcFailure = false;
      state.isConnecting = false;
      notifyRpcStatus(state.isRpcConnected);
      console.log("[RPC] Connected successfully");
      return true;
    } catch (err) {
      state.isRpcConnected = false;
      state.isConnecting = false;

      if (!state.hasLoggedRpcFailure) {
        console.error(`[RPC] Connection failed: ${err.message}`);

        if (err.message?.includes("ENOENT")) console.error("[RPC] Discord IPC socket not found. Is Discord running?");
        else if (err.message?.includes("EACCES")) console.error("[RPC] Permission denied accessing IPC socket");
        else if (err.message?.includes("ECONNREFUSED")) console.error("[RPC] Discord refused connection. Try restarting Discord.");

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
