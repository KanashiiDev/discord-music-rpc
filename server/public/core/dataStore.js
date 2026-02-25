export const DataStore = {
  activity: {
    data: null,
    lastUpdate: 0,
    listeners: new Set(),
  },

  status: {
    data: null,
    lastUpdate: 0,
    listeners: new Set(),
  },

  logs: {
    data: [],
    lastUpdate: 0,
    listeners: new Set(),
  },

  history: {
    data: [],
    lastUpdate: 0,
    listeners: new Set(),
  },

  // Data update method
  update(key, newData) {
    if (!this[key]) {
      console.warn(`DataStore: Unknown key "${key}"`);
      return;
    }

    const store = this[key];
    const hasChanged = JSON.stringify(store.data) !== JSON.stringify(newData);

    if (hasChanged) {
      store.data = newData;
      store.lastUpdate = Date.now();
      store.listeners.forEach((callback) => {
        try {
          callback(newData);
        } catch (err) {
          console.error(`DataStore listener error for "${key}":`, err);
        }
      });
    }

    return hasChanged;
  },

  // Add listener
  subscribe(key, callback) {
    if (!this[key]) {
      console.warn(`DataStore: Cannot subscribe to unknown key "${key}"`);
      return () => {};
    }

    this[key].listeners.add(callback);

    return () => {
      this[key].listeners.delete(callback);
    };
  },

  get(key) {
    return this[key]?.data ?? null;
  },

  clear(key) {
    if (key && this[key]) {
      this[key].data = Array.isArray(this[key].data) ? [] : null;
      this[key].lastUpdate = 0;
    }
  },
};
