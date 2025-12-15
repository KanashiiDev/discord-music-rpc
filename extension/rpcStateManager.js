window.RPCStateManager = class {
  constructor() {
    this.lastActivity = null;
    this.lastKnownPosition = 0;
    this.lastPosition = 0;
    this.isCurrentlySeeking = false;
    this.seekTimeout = null;
    this.errorCount = 0;
    this.isRecovering = false;
    this.lastTabId = null;
    this.durationTimer = 0;
    this.durationTimerInterval = null;
    this.hasOnlyDuration = null;
    this.lastCheckTime = null;
  }

  setActiveTab(tabId) {
    this.lastTabId = tabId;
  }

  isSeekDetected(currentPosition, duration = 0) {
    if (duration === 0) return false;
    if (this.hasOnlyDuration) return false;
    if (this.lastKnownPosition === currentPosition) return false;
    const now = Date.now();

    if (this.lastCheckTime === null) {
      this.lastCheckTime = now;
      this.lastKnownPosition = currentPosition;
      return false;
    }

    const elapsedTime = (now - this.lastCheckTime) / 1000;
    const expectedPosition = this.lastKnownPosition + elapsedTime;
    const drift = Math.abs(currentPosition - expectedPosition);
    const minSeekThreshold = 6;
    const threshold = Math.min(minSeekThreshold, duration / 3);

    this.lastCheckTime = now;
    this.lastKnownPosition = currentPosition;
    return drift >= threshold;
  }

  isSongChanged(newSong) {
    const prev = this.lastActivity;
    if (!prev) {
      this.lastActivity = { ...newSong, lastUpdated: Date.now() };
      return false;
    }

    const changed = (newSong.title || "").trim() !== (prev.title || "").trim() || (newSong.artist || "").trim() !== (prev.artist || "").trim();

    if (changed) {
      this.reset();
      if (this.hasOnlyDuration) this.startDurationTimer();
      return true;
    }

    return false;
  }

  updateLastActivity(song, progress) {
    this.lastActivity = { ...song, progress, lastUpdated: Date.now() };
  }

  setSeekTimeout(callback, delay) {
    clearTimeout(this.seekTimeout);
    this.seekTimeout = setTimeout(callback, delay);
  }

  incrementError() {
    return ++this.errorCount;
  }

  clearError() {
    this.errorCount = 0;
  }

  hasExceededErrorLimit(limit = 5) {
    return this.errorCount >= limit;
  }

  isStuck(threshold = 20000) {
    return this.lastActivity && Date.now() - this.lastActivity.lastUpdated > threshold;
  }

  reset() {
    this.lastActivity = null;
    this.lastKnownPosition = 0;
    this.isCurrentlySeeking = false;
    clearTimeout(this.seekTimeout);
    this.errorCount = 0;
    this.resetDurationTimer();
  }

  startDurationTimer() {
    this.durationTimer = 0;
    clearInterval(this.durationTimerInterval);
    this.durationTimerInterval = setInterval(() => {
      this.durationTimer++;
    }, 1000);
  }

  resetDurationTimer() {
    clearInterval(this.durationTimerInterval);
    this.durationTimer = 0;
  }

  getDurationTimer() {
    const minutes = Math.floor(this.durationTimer / 60);
    const seconds = this.durationTimer % 60;
    return `${minutes}:${seconds.toString().padStart(2, "0")}`;
  }
};
