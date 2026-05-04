const IS_ELECTRON = process.env.ELECTRON_MODE === "true";

// Sends a message to the Electron main process via IPC.
function sendToElectron(message, delay = 0) {
  if (!IS_ELECTRON) return;

  const send = () => {
    if (typeof process.send !== "function") {
      console.error("[FAIL] CRITICAL: process.send is not available!");
      return;
    }
    try {
      process.send(message);
    } catch (err) {
      console.error(`[FAIL] Failed to send "${message}" signal:`, err.message);
    }
  };

  delay > 0 ? setTimeout(send, delay) : send();
}

const sendReady = () => sendToElectron("ready");
const sendRestart = () => sendToElectron("RESTART_SERVER", 1000);
const sendResetConfig = () => sendToElectron("RESET_CONFIG", 1000);
const sendOpenPath = (folderPath) => sendToElectron({ type: "OPEN_PATH", path: folderPath });

module.exports = { sendReady, sendRestart, sendResetConfig, sendOpenPath };
