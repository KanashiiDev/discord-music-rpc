const CLIENT_ID = "1366752683628957767";
const RETRY_DELAY = 10000;
const CLIENT_TIMEOUT = 30000;
const AUTO_CLEAR_TIMEOUT = 24000;
const STUCK_TIMEOUT = 12000;
const MAX_CLEAR_RETRIES = 3;
const HISTORY_SAVE_TIMEOUT = 27000;

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
  reconnectScheduled: false,
  historyTimeout: null,
  serverSettings: {
    showSmallIcon: false,
    logSongUpdate: false,
  },
};

module.exports = {
  state,
  CLIENT_ID,
  RETRY_DELAY,
  CLIENT_TIMEOUT,
  AUTO_CLEAR_TIMEOUT,
  STUCK_TIMEOUT,
  MAX_CLEAR_RETRIES,
  HISTORY_SAVE_TIMEOUT,
};
