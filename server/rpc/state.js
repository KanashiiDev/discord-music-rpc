const CLIENT_ID = "1366752683628957767";
const RETRY_DELAY = 10000;
const CLIENT_TIMEOUT = 30000;
const AUTO_CLEAR_TIMEOUT = 24000;
const STUCK_TIMEOUT = 12000;
const MAX_CLEAR_RETRIES = 3;
const HISTORY_SAVE_TIMEOUT = 27000;

// State for reconnect management
const reconnectState = {
  isReconnecting: false,
  scheduled: false,
  timer: null,
  lastReconnectAt: 0,
  minReconnectInterval: 5000,
  reason: null,

  // Cancel the timer
  cancel() {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    this.scheduled = false;
    this.isReconnecting = false;
  },

  // Check if reconnection can be done
  canReconnect() {
    const now = Date.now();
    if (this.isReconnecting || this.scheduled) return false;
    if (this.lastReconnectAt && now - this.lastReconnectAt < this.minReconnectInterval) return false;
    return true;
  },

  // Restart reconnecting
  start(reason) {
    if (!this.canReconnect()) return false;

    this.scheduled = true;
    this.reason = reason;
    console.log(`[RPC] Scheduling reconnect: ${reason}`);
    return true;
  },

  // Complete reconnecting
  complete() {
    this.cancel();
    this.lastReconnectAt = Date.now();
  },

  // Reconnecting started
  begin() {
    this.isReconnecting = true;
    this.scheduled = false;
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  },

  // Reconnection finished
  end() {
    this.isReconnecting = false;
  },
};

const state = {
  rpcClient: null,
  isRpcConnected: false,
  isConnecting: false,
  connectPromise: null,
  isShuttingDown: false,
  shutdownPromise: null,
  currentActivity: null,
  lastActiveClient: null,
  isHistorySaveEnabled: true,
  lastSavedHistoryEntry: null,
  lastUpdateAt: null,
  healthCheckInterval: null,
  serverInstance: null,
  hasLoggedRpcFailure: false,
  lastUpdateRequest: null,
  lastClearRpcResult: null,
  historySaveLock: false,
  listeningStartTime: null,
  historyTimeout: null,
  serverSettings: {
    showSmallIcon: false,
    logSongUpdate: false,
  },
};

module.exports = {
  state,
  reconnectState,
  CLIENT_ID,
  RETRY_DELAY,
  CLIENT_TIMEOUT,
  AUTO_CLEAR_TIMEOUT,
  STUCK_TIMEOUT,
  MAX_CLEAR_RETRIES,
  HISTORY_SAVE_TIMEOUT,
};
