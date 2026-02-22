function createListenerManager() {
  const listeners = [];

  const addListener = (el, event, handler, options = {}) => {
    if (!el) return;
    el.addEventListener(event, handler, options);
    listeners.push({ el, event, handler, options });
  };

  const removeAll = () => {
    for (const { el, event, handler, options } of listeners) {
      el?.removeEventListener(event, handler, options);
    }
    listeners.length = 0;
  };

  return { addListener, removeAll };
}

function createEntryClickHandler(container, wrapper, optionsContainer) {
  return async (e) => {
    if (e.target.closest(".switch-label, .del-user-parser, .edit-user-script, .parser-icon")) return;
    e.stopPropagation();

    if (parserState.isParserAnimating) return;
    parserState.isParserAnimating = true;

    try {
      if (!parserState.isParserOpen) {
        await openParserOptions({
          container,
          wrapper,
          optionsContainer,
          siteList: document.getElementById("siteList"),
          searchBox: document.getElementById("searchBox"),
        });
        parserState.isParserOpen = true;
      } else {
        await closeParserOptions(optionsContainer);
        parserState.isParserOpen = false;
      }
    } catch (err) {
      console.error(err);
    } finally {
      parserState.isParserAnimating = false;
    }
  };
}

function stickyParserHeader(entry, scrollEl) {
  const span = entry?.querySelector(".parser-span");
  const border = entry?.querySelector(".parser-border");
  if (!span || !scrollEl) return null;

  let entryOffsetTop = 0;
  let entryOffsetHeight = 0;
  let spanOffsetHeight = 0;
  let enabled = false;
  let ticking = false;

  function recalculate() {
    const containerRect = scrollEl.getBoundingClientRect();
    const entryRect = entry.getBoundingClientRect();
    entryOffsetTop = entryRect.top - containerRect.top + scrollEl.scrollTop;
    entryOffsetHeight = entry.offsetHeight;
    spanOffsetHeight = span.offsetHeight;
  }

  function update() {
    if (!enabled) return;

    const scrollTop = scrollEl.scrollTop;
    const topOffset = entryOffsetTop - scrollTop;
    const bottomOffset = topOffset + entryOffsetHeight;

    if (bottomOffset > spanOffsetHeight) {
      const delta = Math.min(Math.max(-topOffset, 0), entryOffsetHeight - spanOffsetHeight);
      span.style.transform = `translateY(${delta}px)`;
      border.style.transform = `translateY(${delta}px)`;
      border.style.display = "block";
    } else {
      span.style.transform = border.style.transform = "";
      border.style.display = "";
    }
  }

  function onScroll() {
    if (!enabled || ticking) return;
    ticking = true;
    requestAnimationFrame(() => {
      update();
      ticking = false;
    });
  }

  return {
    enable() {
      if (enabled) return;
      enabled = true;
      recalculate();
      update();
      scrollEl.addEventListener("scroll", onScroll, { passive: true });
    },
    disable() {
      enabled = false;
      scrollEl.removeEventListener("scroll", onScroll);
      span.style.transform = border.style.transform = "";
      border.style.display = "";
    },
    recalculate,
    update,
  };
}

const updateMinHeight = () => {
  const container = document.getElementById("siteListContainer");
  const { classList } = document.body;
  const minHeight = classList.contains("parser-is-userscript") ? 435 : classList.contains("parser-options-open") ? 408 : 402;
  document.getElementById("siteList").style.minHeight = `${Math.min(container.scrollHeight, minHeight)}px`;
};
