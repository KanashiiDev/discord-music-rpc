async function toggleSettingAccordion(header, content) {
  if (!header || !content) return;

  const scrollEl = simpleBarInstances.get(document.getElementById("siteList"))?.getScrollElement();
  if (!scrollEl) return;

  const icon = header.querySelector("svg");
  const isOpen = !content.classList.contains("close");

  if (isOpen) {
    content.classList.add("close");
    if (icon) icon.style.transform = "rotate(90deg)";

    const allAccordions = [...(header.closest(".parser-options-inner")?.querySelectorAll(".accordion-content") ?? [])];
    const hasOpenAbove = allAccordions.slice(0, allAccordions.indexOf(content)).some((el) => !el.classList.contains("close"));

    if (!hasOpenAbove) {
      const entryEl = header.closest(".parser-entry");
      if (entryEl) {
        const relativeTop = entryEl.getBoundingClientRect().top - scrollEl.getBoundingClientRect().top;
        await smoothScrollTo(scrollEl, scrollEl.scrollTop + relativeTop);
        await waitForTransitionEnd(content, "grid-template-rows", content.querySelector(".parser-options-inner, .accordion-inner"));
        await activateSimpleBar("siteList");
        stickyInstance?.recalculate();
      }
    }
  } else {
    content.classList.remove("close");
    if (icon) icon.style.transform = "rotate(270deg)";

    await waitForTransitionEnd(content, "grid-template-rows", content.querySelector(".parser-options-inner, .accordion-inner"));
    await activateSimpleBar("siteList");
    stickyInstance?.recalculate();
    requestAnimationFrame(() => scrollToAccordion(header, content, scrollEl));
  }
}

async function scrollToAccordion(header, content, scrollEl) {
  const PADDING = 16;
  const STICKY_OFFSET = -45;

  const containerRect = scrollEl.getBoundingClientRect();
  const headerTop = header.getBoundingClientRect().top - containerRect.top + scrollEl.scrollTop;
  const contentBottom = content.getBoundingClientRect().bottom - containerRect.top + scrollEl.scrollTop;
  const visibleBottom = scrollEl.scrollTop + scrollEl.clientHeight;

  if (content.scrollHeight > 360) {
    await smoothScrollTo(scrollEl, Math.round(headerTop + STICKY_OFFSET));
    return;
  }

  if (contentBottom + PADDING > visibleBottom) {
    const target = Math.min(Math.round(contentBottom - scrollEl.clientHeight + PADDING), scrollEl.scrollHeight - scrollEl.clientHeight);
    await smoothScrollTo(scrollEl, target);
  }
}
