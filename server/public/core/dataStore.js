function cheapHasChanged(prev, next) {
  if (prev === next) return false;
  if (prev == null || next == null) return true;
  const type = typeof prev;
  if (type !== typeof next) return true;
  if (type !== "object") return prev !== next;

  if (Array.isArray(prev)) {
    if (!Array.isArray(next)) return true;
    if (prev.length !== next.length) return true;
    if (prev.length === 0) return false;

    const checkItem = (a, b) => {
      if (a == null || b == null) return a !== b;
      return a.id !== b.id || a.date !== b.date || a.timestamp !== b.timestamp || a.status !== b.status;
    };

    return checkItem(prev[0], next[0]) || checkItem(prev[prev.length - 1], next[next.length - 1]);
  }

  // Plain object
  const keysP = Object.keys(prev);
  const keysN = Object.keys(next);
  if (keysP.length !== keysN.length) return true;
  for (const k of keysP) {
    if (prev[k] !== next[k]) return true;
  }
  return false;
}

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
    const hasChanged = cheapHasChanged(store.data, newData);

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
