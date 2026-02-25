import { DataStore } from "./dataStore.js";

export const FetchManager = {
  intervals: {
    activity: null,
    status: null,
    logs: null,
    history: null,
  },

  config: {
    activity: {
      url: "/activity",
      interval: 1000,
      storeKey: "activity",
    },
    status: {
      url: "/status",
      interval: 3000,
      storeKey: "status",
    },
    logs: {
      url: "/logs",
      interval: 3000,
      storeKey: "logs",
    },
    history: {
      url: "/history",
      interval: 10000,
      storeKey: "history",
    },
  },

  // Fetch operation for a single endpoint
  async fetchEndpoint(name) {
    const cfg = this.config[name];
    if (!cfg) {
      console.warn(`FetchManager: Unknown endpoint "${name}"`);
      return;
    }

    try {
      const response = await fetch(cfg.url);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const data = await response.json();
      DataStore.update(cfg.storeKey, data);
    } catch (err) {
      console.error(`FetchManager: Error fetching "${name}":`, err);
    }
  },

  // Start polling for a specific endpoint
  startPolling(name) {
    const cfg = this.config[name];
    if (!cfg) {
      console.warn(`FetchManager: Cannot start polling for unknown endpoint "${name}"`);
      return;
    }

    this.stopPolling(name);
    this.fetchEndpoint(name);

    this.intervals[name] = setInterval(() => {
      this.fetchEndpoint(name);
    }, cfg.interval);
  },

  // Stop polling for a specific endpoint
  stopPolling(name) {
    if (this.intervals[name]) {
      clearInterval(this.intervals[name]);
      this.intervals[name] = null;
    }
  },

  // Start polling for all endpoints
  startAll() {
    Object.keys(this.config).forEach((name) => {
      this.startPolling(name);
    });
  },

  // Stop all polling
  stopAll() {
    Object.keys(this.intervals).forEach((name) => {
      this.stopPolling(name);
    });
  },

  // Manual refresh (fetch immediately)
  refresh(name) {
    if (name) {
      return this.fetchEndpoint(name);
    } else {
      // Refresh all endpoints
      return Promise.all(Object.keys(this.config).map((n) => this.fetchEndpoint(n)));
    }
  },

  // Change the interval duration
  setInterval(name, newInterval) {
    const cfg = this.config[name];
    if (!cfg) {
      console.warn(`FetchManager: Cannot set interval for unknown endpoint "${name}"`);
      return;
    }

    cfg.interval = newInterval;

    if (this.intervals[name]) {
      this.startPolling(name);
    }
  },
};
