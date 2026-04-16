async function activateHistoryScroll() {
  historyState.activeScrollCleanup?.();
  historyState.activeScrollCleanup = null;

  const historyPanel = document.getElementById("historyPanel");
  const sbInstance = simpleBarInstances.get(historyPanel);
  if (!sbInstance) return;

  historyState.scrollElement =
    sbInstance.getScrollElement?.() ?? historyPanel.querySelector(".simplebar-content-wrapper") ?? historyPanel.querySelector(".simplebar-content") ?? historyPanel;

  const scrollElement = historyState.scrollElement;
  historyState.scrollListenerRef = null;

  const BOTTOM_TOLERANCE = 100;
  const POPUP_DELAY = 500;

  let isLoading = false;
  let lastScrollTop = scrollElement.scrollTop;
  let rafId = null;
  let isDragging = false;
  let dragStartTime = 0;
  let popupShown = false;
  let observer = null;

  let draggingIntervalRef = null;

  function isFullyLoaded() {
    const src = historyState.isFiltering ? historyState.filteredHistory : historyState.fullHistory;
    return historyState.currentOffset >= src.length;
  }

  function checkNearBottom(tolerance = BOTTOM_TOLERANCE) {
    return scrollElement.scrollTop + scrollElement.clientHeight >= scrollElement.scrollHeight - tolerance;
  }

  function waitForStableScroll(timeout = 400) {
    return new Promise((resolve) => {
      let lastPos = scrollElement.scrollTop;
      let stableCount = 0;
      const checkStability = setInterval(() => {
        if (scrollElement.scrollTop === lastPos) {
          if (++stableCount >= 3) {
            clearInterval(checkStability);
            resolve();
          }
        } else {
          lastPos = scrollElement.scrollTop;
          stableCount = 0;
        }
      }, 40);
      setTimeout(() => {
        clearInterval(checkStability);
        resolve();
      }, timeout);
    });
  }

  async function tryLoad() {
    if (isFullyLoaded() || !(scrollElement.scrollHeight > scrollElement.clientHeight + 1) || !checkNearBottom() || isLoading || isDragging) return;

    isLoading = true;
    try {
      await renderHistory({
        reset: false,
        query: document.getElementById("historySearchBox")?.value ?? "",
      });
    } catch (e) {
      console.error("renderHistory error:", e);
    } finally {
      setTimeout(() => {
        isLoading = false;
      }, 200);
    }
  }

  function stopDraggingInterval() {
    if (draggingIntervalRef) {
      clearInterval(draggingIntervalRef);
      draggingIntervalRef = null;
    }
  }

  function hidePopupIfShown() {
    if (popupShown) {
      hidePopupMessage();
      popupShown = false;
    }
  }

  function updateDraggingState() {
    const wasDragging = isDragging;
    isDragging = historyPanel.classList.contains("simplebar-dragging") || !!sbInstance.el?.classList?.contains("simplebar-dragging");

    if (isDragging && !wasDragging) {
      dragStartTime = Date.now();
      popupShown = false;
      if (isFullyLoaded()) return;

      draggingIntervalRef = setInterval(() => {
        if (!isDragging || isFullyLoaded()) {
          stopDraggingInterval();
          return;
        }
        if (checkNearBottom()) {
          if (Date.now() - dragStartTime >= POPUP_DELAY && !popupShown) {
            showPopupMessage(i18n.t("popupMessage.releaseToLoadHistory"), "warning");
            popupShown = true;
          }
        } else {
          dragStartTime = Date.now();
          hidePopupIfShown();
        }
      }, 100);
    } else if (!isDragging && wasDragging) {
      stopDraggingInterval();
      hidePopupIfShown();
      if (!isFullyLoaded()) handleDragEnd();
    }
  }

  async function handleDragEnd() {
    await waitForStableScroll(400);
    if (checkNearBottom(50)) await tryLoad();
  }

  historyState.scrollListenerRef = () => {
    updateDraggingState();
    if (isDragging || scrollElement.scrollTop === lastScrollTop) return;
    lastScrollTop = scrollElement.scrollTop;
    if (rafId) return;
    rafId = requestAnimationFrame(async () => {
      rafId = null;
      await tryLoad();
    });
  };

  scrollElement.addEventListener("scroll", historyState.scrollListenerRef, { passive: true });

  observer = new MutationObserver(updateDraggingState);
  observer.observe(historyPanel, { attributes: true, attributeFilter: ["class"] });

  function cleanup() {
    historyState.scrollListenerRef && scrollElement.removeEventListener("scroll", historyState.scrollListenerRef);
    historyState.scrollListenerRef = null;
    stopDraggingInterval();
    if (rafId) {
      cancelAnimationFrame(rafId);
      rafId = null;
    }
    observer?.disconnect();
    observer = null;
    hidePopupIfShown();
  }

  historyState.activeScrollCleanup = cleanup;
  return cleanup;
}
