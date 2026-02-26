const state = {
  tray: null,
  serverProcess: null,
  serverPid: null,
  serverSpawnTime: null,
  isServerRunning: false,
  isStopping: false,
  isStoppingPromise: null,
  isRestarting: false,
  isRestartingPromise: null,
  restartAttempts: 0,
  serverStartTime: null,
  isRPCConnected: false,
  scheduledRestartTimer: null,
};

module.exports = { state };
