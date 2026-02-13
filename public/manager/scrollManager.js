export const ScrollManager = {
  cleanups: new Map(),
  activeIntervals: new Map(),

  activate(type, sbInstance, renderer, state, containerId, label) {
    this.cleanupType(type);

    const panel = document.getElementById(containerId);
    const scrollElement = sbInstance?.getScrollElement();

    if (!panel || !scrollElement || panel.offsetParent === null) {
      return;
    }

    let lastScrollTop = scrollElement.scrollTop;
    let isDragging = false;
    let dragStartTime = 0;
    let popupShown = false;

    const hasMoreData = () => {
      const data = state.isFiltering ? state.filteredData : state.fullData;
      return state.currentOffset < data.length;
    };

    const checkNearBottom = (tolerance = 50) => {
      return scrollElement.scrollTop + scrollElement.clientHeight >= scrollElement.scrollHeight - tolerance;
    };

    const tryLoad = async () => {
      if (state.isLoading || renderer._isRendering || isDragging) return;
      if (!hasMoreData() || !checkNearBottom()) return;

      state.isLoading = true;
      try {
        await renderer.render({ reset: false });
      } catch (err) {
        console.error(`Scroll load error for ${type}:`, err);
      } finally {
        setTimeout(() => {
          state.isLoading = false;
        }, 200);
      }
    };

    const updateDraggingState = () => {
      const wasDragging = isDragging;
      isDragging = panel.classList.contains("simplebar-dragging");

      if (isDragging && !wasDragging) {
        dragStartTime = Date.now();
        popupShown = false;

        if (this.activeIntervals.has(type)) {
          clearInterval(this.activeIntervals.get(type));
        }

        const interval = setInterval(() => {
          if (!isDragging) {
            clearInterval(this.activeIntervals.get(type));
            this.activeIntervals.delete(type);
            return;
          }

          if (checkNearBottom() && hasMoreData()) {
            if (Date.now() - dragStartTime >= 500 && !popupShown) {
              this.showHint(panel, type, label);
              popupShown = true;
            }
          } else if (popupShown) {
            this.hideHint(type);
            popupShown = false;
          }
        }, 100);

        this.activeIntervals.set(type, interval);
      } else if (!wasDragging && !isDragging) {
        if (popupShown) {
          this.hideHint(type);
          popupShown = false;
        }
        setTimeout(tryLoad, 150);
      }
    };

    const scrollListener = () => {
      if (isDragging || scrollElement.scrollTop === lastScrollTop) return;
      lastScrollTop = scrollElement.scrollTop;

      if (!state.isLoading) {
        requestAnimationFrame(tryLoad);
      }
    };

    scrollElement.addEventListener("scroll", scrollListener, { passive: true });

    const observer = new MutationObserver(updateDraggingState);
    observer.observe(panel, { attributes: true, attributeFilter: ["class"] });

    this.cleanups.set(type, () => {
      scrollElement.removeEventListener("scroll", scrollListener);
      observer.disconnect();

      if (this.activeIntervals.has(type)) {
        clearInterval(this.activeIntervals.get(type));
        this.activeIntervals.delete(type);
      }

      this.hideHint(type);
      popupShown = false;
    });
  },

  cleanupType(type) {
    if (this.cleanups.has(type)) {
      try {
        this.cleanups.get(type)();
      } catch (e) {
        console.warn(`Cleanup failed for ${type}:`, e);
      }
      this.cleanups.delete(type);
      this.activeIntervals.delete(type);
    }
  },

  showHint(container, type, label) {
    const id = `${type}ReleaseHint`;
    if (document.getElementById(id)) return;

    const hint = document.createElement("div");
    hint.id = id;
    hint.className = "history-release-hint";
    hint.textContent = `Release to load more ${label}`;
    container.appendChild(hint);
  },

  hideHint(type) {
    const id = `${type}ReleaseHint`;
    const hint = document.getElementById(id);
    if (!hint) return;

    if (!hint.classList.contains("close")) {
      hint.classList.add("close");
      setTimeout(() => {
        if (hint && hint.parentNode) {
          hint.remove();
        }
      }, 300);
    }
  },

  destroy() {
    this.cleanups.forEach((cleanupFn, type) => {
      try {
        cleanupFn();
      } catch (e) {
        console.warn(`Destroy cleanup failed for ${type}:`, e);
      }
    });
    this.cleanups.clear();
    this.activeIntervals.forEach(clearInterval);
    this.activeIntervals.clear();
  },
};
