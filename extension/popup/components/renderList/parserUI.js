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

async function refreshScrollbar(scrollBar) {
  await activateSimpleBar("siteList");
  await new Promise((r) => setTimeout(r, 50));
  document.body.classList.toggle("scrollbar-visible", scrollBar?.style.visibility !== "hidden");
}

const getScrollState = (simpleBar) => {
  const scrollEl = simpleBar.getScrollElement();
  const contentEl = simpleBar.getContentElement();

  if (!scrollEl || !contentEl) return "invalid";

  const contentHeight = contentEl.scrollHeight;
  const containerHeight = scrollEl.clientHeight;

  if (contentHeight === 0) return "empty";
  if (contentHeight <= containerHeight + 1) return "partial";

  return "overflow";
};

const scrollToParser = async ({ wrapper, simpleBar }) => {
  if (!wrapper || !simpleBar) return;

  const scrollEl = simpleBar.getScrollElement();
  const contentEl = simpleBar.getContentElement();
  if (!scrollEl || !contentEl || !scrollEl.offsetParent) return;

  const state = getScrollState(simpleBar);

  switch (state) {
    case "empty": {
      return;
    }

    case "partial": {
      const shouldAddSpacer = (contentEl?.querySelectorAll(".parser-entry")?.length || 0) > 1;
      if (shouldAddSpacer) {
        let spacer = contentEl.querySelector(".sb-scroll-spacer");
        if (!spacer) {
          spacer = document.createElement("div");
          spacer.className = "sb-scroll-spacer";
          contentEl.appendChild(spacer);
        }

        const deficit = scrollEl.clientHeight - contentEl.scrollHeight;
        const extra = deficit + 80;

        if (extra > 0) {
          spacer.style.height = `${extra}px`;
          spacer.offsetHeight;
          simpleBar.recalculate();
          await new Promise(requestAnimationFrame);
          await calcHeightAndScroll(wrapper, scrollEl, true);
        }
      }

      break;
    }

    case "overflow": {
      await calcHeightAndScroll(wrapper, scrollEl, true);
      break;
    }
  }
};

// Calculate the padding bottom and scroll
async function calcHeightAndScroll(wrapper, scrollEl, scroll) {
  if (!wrapper || !scrollEl) return;

  const scrollTop = scrollEl.scrollTop ?? 0;
  const scrollHeight = scrollEl.scrollHeight ?? 0;
  const clientHeight = scrollEl.clientHeight ?? 0;
  const prevPadding = parseFloat(scrollEl.style.paddingBottom) || 0;

  const normalizedScrollHeight = scrollHeight - prevPadding;
  const scrollRectTop = scrollEl.getBoundingClientRect?.().top ?? 0;
  const wrapperRectTop = wrapper.getBoundingClientRect?.().top ?? 0;
  const wrapperTop = wrapperRectTop - scrollRectTop + scrollTop;

  const currentMaxScrollTop = normalizedScrollHeight - clientHeight;
  const neededExtraScroll = wrapperTop - currentMaxScrollTop;

  let nextPadding = prevPadding;
  if (neededExtraScroll > 1) nextPadding = prevPadding + neededExtraScroll;
  else if (neededExtraScroll < -1) nextPadding = Math.max(0, prevPadding + neededExtraScroll);

  if (Math.abs(prevPadding - nextPadding) > 1) {
    scrollEl.style.overflowAnchor = "none";
    scrollEl.style.paddingBottom = nextPadding <= 1 ? "0px" : `${nextPadding}px`;
    scrollEl.style.overflowAnchor = "";
  }

  if (scroll) {
    const target = Math.max(0, Math.min(wrapperTop, normalizedScrollHeight));
    await smoothScrollTo?.(scrollEl, target);
  }
}
