class KeepAliveManager {
  constructor() {
    this.initialized = false;
    this.intervals = [];
    this.oscillators = [];
    this.wakeLock = null;
    this.audioContext = null;
    this.videoElement = null;
    this.peerConnection = null;
    this.rafId = null;
    this.canvasRafId = null;
    this.broadcastChannel = null;
  }

  log = async (...args) => {
    const stored = await browser.storage.local.get("debugMode");
    const debugMode = stored.debugMode === 1 ? true : typeof CONFIG !== "undefined" ? CONFIG.debugMode : false;

    if (!debugMode) return;

    const prefix = "[DISCORD-MUSIC-RPC - Keep Alive Manager]";
    if (typeof args[0] === "string" && args[0].includes("%c")) {
      console.info(`%c${prefix}%c ${args[0]}`, "color:#2196f3; font-weight:bold;", "color:#fff;", ...args.slice(1));
    } else {
      console.info(`%c${prefix}`, "color:#2196f3; font-weight:bold;", ...args);
    }
  };

  init() {
    if (this.initialized) return;
    this.initialized = true;

    this.initWebRTC();
    this.initAudioContext();
    this.initCanvasVideo();
    this.requestWakeLock();
    this.startRAFLoop();
    this.initBroadcastChannel();
    this.createIndexedDBActivity();

    this.log("Keep alive initialized");
  }

  async initWebRTC() {
    try {
      if (!window.RTCPeerConnection) {
        return;
      }

      this.peerConnection = new RTCPeerConnection({
        iceServers: [{ urls: "stun:stun.l.google.com:19302" }, { urls: "stun:stun1.l.google.com:19302" }],
      });

      this.peerConnection.createDataChannel("keepalive", {
        ordered: false,
        maxRetransmits: 0,
      });

      const keepAlive = async () => {
        if (!this.peerConnection || this.peerConnection.connectionState === "closed") return;
        try {
          const offer = await this.peerConnection.createOffer({
            offerToReceiveAudio: false,
            offerToReceiveVideo: false,
          });
          await this.peerConnection.setLocalDescription(offer);
        } catch (e) {
          this.log("WebRTC offer error:", e.message);
        }
      };

      await keepAlive();
      const webRTCInterval = setInterval(keepAlive, 12000);
      this.intervals.push(webRTCInterval);

      const reconnectTimer = setInterval(() => {
        if (!this.peerConnection || this.peerConnection.connectionState === "closed" || this.peerConnection.connectionState === "failed") {
          this.peerConnection?.close();
          this.peerConnection = new RTCPeerConnection({
            iceServers: [{ urls: "stun:stun.l.google.com:19302" }, { urls: "stun:stun1.l.google.com:19302" }],
          });

          this.peerConnection.createDataChannel("keepalive", {
            ordered: false,
            maxRetransmits: 0,
          });

          keepAlive().catch((e) => this.log("Reconnect error:", e));
        }
      }, 30000);
      this.intervals.push(reconnectTimer);
    } catch (e) {
      this.log("WebRTC initialization error:", e);
    }
  }

  initAudioContext() {
    try {
      this.audioContext = new (window.AudioContext || window.webkitAudioContext)();

      const oscillator = this.audioContext.createOscillator();
      const gainNode = this.audioContext.createGain();

      oscillator.frequency.value = 1;

      gainNode.gain.value = 0.000001;

      oscillator.connect(gainNode);
      gainNode.connect(this.audioContext.destination);

      oscillator.start();
      this.oscillators.push(oscillator);
    } catch (e) {
      this.log("AudioContext error:", e);
    }
  }

  initCanvasVideo() {
    try {
      this.videoElement = document.createElement("video");
      Object.assign(this.videoElement.style, {
        position: "fixed",
        top: "-1000px",
        left: "-1000px",
        width: "1px",
        height: "1px",
        opacity: "0",
        pointerEvents: "none",
      });

      this.videoElement.muted = true;
      this.videoElement.loop = true;
      this.videoElement.disablePictureInPicture = true;
      this.videoElement.setAttribute("disablePictureInPicture", "true");

      const exitPiP = () => {
        if (document.pictureInPictureElement === this.videoElement) {
          document.exitPictureInPicture().catch(() => {});
        }
      };

      this.videoElement.addEventListener(
        "enterpictureinpicture",
        (e) => {
          e.preventDefault();
          e.stopImmediatePropagation();
          exitPiP();
        },
        true,
      );

      this.videoElement.addEventListener(
        "leavepictureinpicture",
        (e) => {
          e.preventDefault();
          e.stopImmediatePropagation();
        },
        true,
      );

      const canvas = document.createElement("canvas");
      canvas.width = canvas.height = 1;
      const ctx = canvas.getContext("2d");

      const draw = () => {
        ctx.fillStyle = `rgb(${Math.random() * 255},${Math.random() * 255},${Math.random() * 255})`;
        ctx.fillRect(0, 0, 1, 1);
        this.canvasRafId = requestAnimationFrame(draw);
      };
      draw();

      this.videoElement.srcObject = canvas.captureStream(4);
      this.videoElement.play().catch(() => {});

      const target = document.body || document.documentElement;
      if (target) {
        target.appendChild(this.videoElement);
      } else {
        document.addEventListener(
          "DOMContentLoaded",
          () => {
            const target = document.body || document.documentElement;
            target?.appendChild(this.videoElement);
          },
          { once: true },
        );
      }

      const pipInterval = setInterval(() => exitPiP(), 100);
      this.intervals.push(pipInterval);
    } catch (e) {
      this.log("Canvas video error:", e);
    }
  }

  async requestWakeLock() {
    if (!("wakeLock" in navigator)) return;

    const acquire = async () => {
      if (document.visibilityState !== "visible") return;
      try {
        this.wakeLock = await navigator.wakeLock.request("screen");
        this.wakeLock.addEventListener("release", () => {
          this.wakeLock = null;
        });
      } catch (e) {
        this.log("Wake Lock error:", e.message);
      }
    };

    await acquire();

    document.addEventListener("visibilitychange", async () => {
      if (document.visibilityState === "visible" && !this.wakeLock) {
        await acquire();
      }
    });
  }

  startRAFLoop() {
    const loop = () => {
      let s = 0;
      for (let i = 0; i < 15; i++) {
        s += Math.random() * 0.1;
      }
      this.rafId = requestAnimationFrame(loop);
    };
    loop();
  }

  initBroadcastChannel() {
    try {
      this.broadcastChannel = new BroadcastChannel("keepalive_channel");

      this.broadcastChannel.onmessage = (e) => {
        if (e.data?.type === "ping") {
          this.broadcastChannel.postMessage({ type: "pong", t: Date.now() });
        }
      };

      const interval = setInterval(() => {
        this.broadcastChannel.postMessage({ type: "ping", t: Date.now() });
      }, 5000);
      this.intervals.push(interval);
    } catch (e) {
      this.log("BroadcastChannel error:", e);
    }
  }

  createIndexedDBActivity() {
    const interval = setInterval(() => {
      if (!window.indexedDB) return;

      const req = indexedDB.open("KeepAliveDB", 1);

      req.onupgradeneeded = (e) => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains("activity")) {
          db.createObjectStore("activity", { keyPath: "id", autoIncrement: true });
        }
      };

      req.onsuccess = (e) => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains("activity")) {
          db.close();
          return;
        }

        try {
          const tx = db.transaction("activity", "readwrite");
          const store = tx.objectStore("activity");

          store.add({ ts: Date.now(), r: Math.random() });

          store.getAll().onsuccess = (ev) => {
            const recs = ev.target.result;
            if (recs.length > 8) {
              for (let i = 0; i < recs.length - 8; i++) {
                store.delete(recs[i].id);
              }
            }
          };

          tx.oncomplete = () => db.close();
          tx.onerror = () => db.close();
        } catch (txError) {
          this.log("IndexedDB transaction error:", txError);
          db.close();
        }
      };

      req.onerror = (e) => this.log("IndexedDB error:", e.target.error);
    }, 12000);

    this.intervals.push(interval);
  }

  destroy() {
    if (!this.initialized) return;
    this.intervals.forEach(clearInterval);
    this.intervals = [];

    if (this.rafId) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }

    if (this.canvasRafId) {
      cancelAnimationFrame(this.canvasRafId);
      this.canvasRafId = null;
    }

    if (this.wakeLock) {
      this.wakeLock.release().catch(() => {});
      this.wakeLock = null;
    }

    this.oscillators.forEach((osc) => {
      try {
        osc.stop();
        osc.disconnect();
      } catch (e) {}
    });
    this.oscillators = [];

    if (this.audioContext) {
      this.audioContext.close().catch(() => {});
      this.audioContext = null;
    }

    if (this.videoElement) {
      this.videoElement.pause();
      this.videoElement.srcObject = null;
      this.videoElement.remove();
      this.videoElement = null;
    }

    if (this.peerConnection) {
      this.peerConnection.close();
      this.peerConnection = null;
    }

    if (this.broadcastChannel) {
      this.broadcastChannel.close();
      this.broadcastChannel = null;
    }

    this.initialized = false;
    this.log("Keep alive stopped");
  }
}
