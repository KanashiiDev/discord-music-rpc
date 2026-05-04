const WebSocket = require("ws");
const { state } = require("../rpc/state");

const WNP_ADAPTERS = [
  { name: "Rainmeter", key: "WNP_RAINMETER_SUPPORT", port: 8974 },
  { name: "OBS", key: "WNP_OBS_SUPPORT", port: 6534 },
];

const FIELD_MAP = {
  name: "PLAYER_NAME",
  cover: "COVER_URL",
  position: "POSITION_SECONDS",
  duration: "DURATION_SECONDS",
  repeat: "REPEAT_MODE",
  shuffle: "SHUFFLE_ACTIVE",
};

const PLAYER_CONTROLS = JSON.stringify({
  supports_play_pause: false,
  supports_skip_previous: false,
  supports_skip_next: false,
  supports_set_position: false,
  supports_set_volume: false,
  supports_toggle_repeat_mode: false,
  supports_toggle_shuffle_active: false,
  supports_set_rating: false,
  rating_system: "NONE",
});

class WNPConnection {
  constructor(adapter) {
    this.adapter = adapter;
    this.ws = null;
    this.cache = new Map();
    this.stopped = false;
    this._hasHadActivity = false;
  }

  connect() {
    if (this.stopped) return;

    // If it is already connected or is connecting, do not reconnect
    if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) return;

    this.cache = new Map();
    this._hasHadActivity = false;
    this.ws = new WebSocket(`ws://127.0.0.1:${this.adapter.port}`);

    this.ws.on("open", () => {
      this.sendUpdate();
    });

    this.ws.on("close", () => {
      if (this.stopped || !this.ws) return;
      this.ws = null;
      setTimeout(() => this.connect(), 3000);
    });

    this.ws.on("error", (err) => {
      if (err.code !== "ECONNREFUSED") {
        console.error(`[WNP:${this.adapter.name}] Error:`, err.message);
      }
    });
  }

  stop() {
    this.stopped = true;
    if (this.ws) {
      this.ws.removeAllListeners();
      this.ws.close();
      this.ws = null;
    }
  }

  sendUpdate() {
    const activity = state.currentActivity;

    if (!activity?.details || (activity && activity.type === 3)) {
      // No activity - if connected, send STATE STOPPED and disconnect
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        this.clearActivity();
      }
      return;
    }

    // There is an activity but it is not connected - connect
    if (!this.ws || this.ws.readyState === WebSocket.CLOSED || this.ws.readyState === WebSocket.CLOSING) {
      this.connect();
      return;
    }

    if (this.ws.readyState !== WebSocket.OPEN) return;

    this._hasHadActivity = true;

    const now = Math.floor(Date.now() / 1000);
    let position = 0;
    let duration = 0;

    if (activity.startTimestamp) {
      position = now - activity.startTimestamp;
    }
    if (activity.startTimestamp && activity.endTimestamp) {
      duration = activity.endTimestamp - activity.startTimestamp;
      if (position > duration) position = duration;
    }

    const cover = this._resolveCover(activity.largeImageKey, activity._cover);

    const fields = {
      name: "Discord Music RPC",
      state: "PLAYING",
      title: activity.details ?? "",
      artist: activity._artist ?? activity.state ?? "",
      album: activity.largeImageText ?? "",
      cover: cover,
      position: position,
      duration: duration,
      volume: 100,
      repeat: "NONE",
      shuffle: false,
      canSetState: true,
    };

    for (const [key, value] of Object.entries(fields)) {
      if (key === "canSetState") {
        this._sendIfChanged("PLAYER_CONTROLS", PLAYER_CONTROLS);
        continue;
      }

      const wireKey = FIELD_MAP[key] ?? key.replace(/([a-z])([A-Z])/g, "$1_$2").toUpperCase();
      const wireValue = key === "shuffle" ? (value ? "true" : "false") : String(value);

      this._sendIfChanged(wireKey, wireValue);
    }
  }

  clearActivity() {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    this.ws.send("STATE STOPPED");
    this.ws.send("TITLE ");
    this.ws.send("ARTIST ");
    this.ws.send("ALBUM ");
    this.ws.send("COVER_URL ");
    this.ws.send("POSITION_SECONDS 0");
    this.ws.send("DURATION_SECONDS 0");

    this.cache.set("STATE", "STOPPED");
    this.cache.set("TITLE", "");
    this.cache.set("ARTIST", "");
    this.cache.set("ALBUM", "");
    this.cache.set("COVER_URL", "");
    this.cache.set("POSITION_SECONDS", "0");
    this.cache.set("DURATION_SECONDS", "0");

    this._disconnectIdle();
  }

  _disconnectIdle() {
    if (!this.ws) return;
    const ws = this.ws;
    this.ws = null;
    this.cache = new Map();
    ws.removeAllListeners();
    ws.close();
  }

  _sendIfChanged(key, value) {
    if (this.cache.get(key) === value) return;
    this.ws.send(`${key} ${value}`);
    this.cache.set(key, value);
  }

  _resolveCover(largeImageKey, rawCover) {
    if (rawCover && rawCover.startsWith("http")) return rawCover;
    if (!largeImageKey) return "";
    if (largeImageKey.startsWith("http")) return largeImageKey;
    return "";
  }
}

class WNPClient {
  constructor() {
    this.connections = [];
    this.interval = null;
  }

  start(activeKeys) {
    const activeAdapters = WNP_ADAPTERS.filter((adapter) => activeKeys.includes(adapter.key));
    this.connections = [];

    for (const adapter of activeAdapters) {
      const conn = new WNPConnection(adapter);
      this.connections.push(conn);
    }

    this.interval = setInterval(() => {
      for (const conn of this.connections) {
        conn.sendUpdate();
      }
    }, 1000);
  }

  stop() {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
    for (const conn of this.connections) {
      conn.stop();
    }
    this.connections = [];
  }

  clearActivity() {
    for (const conn of this.connections) {
      conn.clearActivity();
    }
  }
}

module.exports = new WNPClient();
