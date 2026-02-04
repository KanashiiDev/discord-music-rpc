class KeepAliveManager {
  constructor() {
    this.initialized = false;
    this.intervals = [];
    this.workers = [];
    this.wakeLock = null;
    this.audioContext = null;
    this.videoElement = null;
    this.sharedWorker = null;
    this.loopInterval = 1000;
  }

  log = async (...args) => {
    const stored = await browser.storage.local.get("debugMode");
    const debugMode = stored.debugMode === 1 ? true : CONFIG.debugMode;

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

    this.initAudioContext();
    this.initVideoElement();
    this.requestWakeLock();
    this.startRAFLoop();
    this.initBroadcastChannel();
    this.createIndexedDBActivity();

    this.log("Keep alive initialized");
  }

  initAudioContext() {
    try {
      this.audioContext = new (window.AudioContext || window.webkitAudioContext)();

      // Multiple oscillators - more activity
      for (let i = 0; i < 3; i++) {
        const oscillator = this.audioContext.createOscillator();
        const gainNode = this.audioContext.createGain();

        gainNode.gain.value = 0.0001; // Completely silent
        oscillator.connect(gainNode);
        gainNode.connect(this.audioContext.destination);

        oscillator.frequency.value = 20 + i; // Different frequencies
        oscillator.start();
      }

      this.log("AudioContext with multiple oscillators initialized");
    } catch (e) {
      this.log("AudioContext error:", e);
    }
  }

  initVideoElement() {
    try {
      // Invisible video element
      this.videoElement = document.createElement("video");
      this.videoElement.style.position = "fixed";
      this.videoElement.style.top = "-1000px";
      this.videoElement.style.width = "1px";
      this.videoElement.style.height = "1px";
      this.videoElement.muted = true;
      this.videoElement.loop = true;
      this.videoElement.disablePictureInPicture = true;
      this.videoElement.setAttribute("disablePictureInPicture", "true");

      // Block PiP events
      this.videoElement.addEventListener(
        "enterpictureinpicture",
        (e) => {
          e.preventDefault();
          e.stopImmediatePropagation();
          if (document.pictureInPictureElement) {
            document.exitPictureInPicture();
          }
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

      // Create video stream from canvas
      const canvas = document.createElement("canvas");
      canvas.width = 1;
      canvas.height = 1;
      const ctx = canvas.getContext("2d");

      // Draw something in each frame
      const drawFrame = () => {
        ctx.fillStyle = `rgb(${Math.random() * 255},${Math.random() * 255},${Math.random() * 255})`;
        ctx.fillRect(0, 0, 1, 1);
        requestAnimationFrame(drawFrame);
      };
      drawFrame();

      // Convert the canvas to a video stream
      const stream = canvas.captureStream(10); // 10 FPS
      this.videoElement.srcObject = stream;
      this.videoElement.play();

      document.body.appendChild(this.videoElement);

      // Continuously check PiP
      setInterval(() => {
        if (document.pictureInPictureElement === this.videoElement) {
          document.exitPictureInPicture().catch(() => {});
        }
      }, 100);

      this.log("Video element with canvas stream initialized (PiP disabled)");
    } catch (e) {
      this.log("Video element error:", e);
    }
  }

  async requestWakeLock() {
    if ("wakeLock" in navigator) {
      try {
        // Wake Lock only works when the page is visible
        if (document.visibilityState === "visible") {
          this.wakeLock = await navigator.wakeLock.request("screen");
          this.log("Wake Lock acquired");

          this.wakeLock.addEventListener("release", () => {
            this.log("Wake Lock released");
            this.wakeLock = null;
          });
        } else {
          this.log("Wake Lock skipped (page not visible)");
        }

        // Try again on visibility change
        document.addEventListener("visibilitychange", async () => {
          if (document.visibilityState === "visible" && !this.wakeLock) {
            try {
              this.wakeLock = await navigator.wakeLock.request("screen");
              this.log("Wake Lock re-acquired after visibility change");
            } catch (e) {
              this.log("Wake Lock re-acquire failed:", e.message);
            }
          }
        });
      } catch (e) {
        this.log("Wake Lock error:", e.message);
      }
    }
  }

  initBroadcastChannel() {
    try {
      const channel = new BroadcastChannel("keepalive_channel");

      channel.onmessage = (e) => {
        if (e.data.type === "ping") {
          channel.postMessage({ type: "pong", time: Date.now() });
        }
      };

      setInterval(() => {
        channel.postMessage({ type: "ping", time: Date.now() });
      }, 1500);
    } catch (e) {
      this.log("BroadcastChannel error:", e);
    }
  }

  startRAFLoop() {
    // requestAnimationFrame loop
    const rafLoop = () => {
      // A small calculation in every frame
      let sum = 0;
      for (let i = 0; i < 100; i++) {
        sum += Math.random();
      }

      requestAnimationFrame(rafLoop);
    };

    rafLoop();
    this.log("RAF loop started");
  }

  createIndexedDBActivity() {
    // Continuous IndexedDB operations
    const dbInterval = setInterval(() => {
      if (window.indexedDB) {
        try {
          const request = indexedDB.open("ActivityDB", 1);
          request.onupgradeneeded = (e) => {
            const db = e.target.result;
            if (!db.objectStoreNames.contains("activity")) {
              db.createObjectStore("activity", { keyPath: "id", autoIncrement: true });
            }
          };
          request.onsuccess = (e) => {
            const db = e.target.result;

            // Check if the object store exists
            if (!db.objectStoreNames.contains("activity")) {
              db.close();
              return;
            }

            try {
              const tx = db.transaction(["activity"], "readwrite");
              const store = tx.objectStore("activity");

              // Add data
              store.add({ timestamp: Date.now(), data: Math.random() });

              // Clear old data (keep only the last 10)
              const getAllRequest = store.getAll();
              getAllRequest.onsuccess = () => {
                const records = getAllRequest.result;
                if (records.length > 10) {
                  for (let i = 0; i < records.length - 10; i++) {
                    store.delete(records[i].id);
                  }
                }
              };

              tx.oncomplete = () => {
                db.close();
              };

              tx.onerror = (err) => {
                this.log("Transaction error:", err);
                db.close();
              };
            } catch (txError) {
              this.log("Transaction creation error:", txError);
              db.close();
            }
          };
          request.onerror = (e) => {
            this.log("ActivityDB error:", e.target.error);
          };
        } catch (e) {
          this.log("ActivityDB init error:", e);
        }
      }
    }, 4000);

    this.intervals.push(dbInterval);
  }

  destroy() {
    if (!this.initialized) return;
    this.intervals.forEach((interval) => clearInterval(interval));

    if (this.wakeLock) {
      this.wakeLock.release();
    }

    if (this.audioContext) {
      this.audioContext.close();
    }

    if (this.videoElement) {
      this.videoElement.pause();
      this.videoElement.srcObject = null;
      this.videoElement.remove();
    }
    this.initialized = false;
    this.log("Keep alive stopped");
  }
}
