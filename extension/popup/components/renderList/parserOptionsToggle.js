let stickyInstance = null;

const openParserOptions = async ({ container, wrapper, optionsContainer, siteList, searchBox }) => {
  const scrollEl = simpleBarInstances.get(siteList)?.getScrollElement();
  const scrollBar = simpleBarInstances.get(document.querySelector("#siteList")).el.children[2];
  if (!scrollEl) return;

  stickyInstance = stickyParserHeader(wrapper, scrollEl);
  stickyInstance.enable();
  wrapper.dataset.originalScrollTop ??= scrollEl.scrollTop;

  const scrollRect = scrollEl.getBoundingClientRect();
  const wrapperTop = wrapper.getBoundingClientRect().top - scrollRect.top + scrollEl.scrollTop;
  const maxScrollTop = scrollEl.scrollHeight - scrollEl.clientHeight;
  const neededScroll = wrapperTop - scrollEl.scrollTop;

  if (neededScroll > 0 && scrollEl.scrollTop + neededScroll > maxScrollTop) {
    scrollEl.style.paddingBottom = `${neededScroll - (maxScrollTop - scrollEl.scrollTop)}px`;
  }

  // Scroll
  scrollEl?.classList.add("locked");
  scrollBar?.classList.add("smooth");
  await smoothScrollTo(scrollEl, wrapperTop);

  // DOM mutation
  document.body.classList.add("parser-options-open");
  if (wrapper.querySelector(".userscript")) document.body.classList.add("parser-is-userscript");

  optionsContainer.classList.add("open");
  const parserCount = document.querySelectorAll(".parser-entry").length;
  if (parserCount < 2) optionsContainer.style.marginBottom = "0";

  for (const el of container.querySelectorAll(".parser-entry")) {
    if (el !== wrapper) el.classList.add("fading");
  }
  searchBox?.classList.add("fading");

  // Wait for transition - measure after mutation
  const inner = optionsContainer.querySelector(".parser-options-inner");
  const totalHeight = inner?.scrollHeight ?? optionsContainer.scrollHeight;
  const duration = getTransitionDuration(optionsContainer, "grid-template-rows") || 300;
  const adaptiveTimeout = !shouldAnimate() ? 0 : Math.max(duration, totalHeight) + 25;
  await new Promise((resolve) => setTimeout(resolve, adaptiveTimeout));

  // Cleanup
  scrollEl.style.paddingBottom = "";
  scrollEl?.classList.remove("locked");
  await activateSimpleBar("siteList");
  stickyInstance?.recalculate();
  updateMinHeight();
  await new Promise((resolve) => setTimeout(resolve, adaptiveTimeout));
  scrollBar?.classList.remove("smooth");
};

const closeParserOptions = async (optionsContainer) => {
  const siteList = document.querySelector("#siteList");
  const scrollEl = simpleBarInstances.get(siteList)?.getScrollElement();
  const wrapper = optionsContainer.closest(".parser-entry");
  const savedScrollTop = wrapper?.dataset.originalScrollTop;
  const inner = optionsContainer.querySelector(".parser-options-inner");

  // Read heights before any mutations
  const openAccordions = [...optionsContainer.querySelectorAll(".accordion-content:not(.close)")];
  const optionsHeight = optionsContainer.querySelector(".options-container")?.scrollHeight ?? 0;
  const parserIsSticky = wrapper.querySelector(".parser-span").style.transform.trim() !== "";

  const adaptiveTimeout = () => (!shouldAnimate() ? 0 : Math.max(openAccordions.length ? (inner?.scrollHeight ?? 0) - optionsHeight : (inner?.scrollHeight ?? 0), 325));

  const scrollToParser = async () => {
    if (scrollEl && savedScrollTop !== undefined) {
      await smoothScrollTo(scrollEl, Number(savedScrollTop));
    }
  };

  scrollEl.classList.add("locked");

  // If the accordion is open or the header is sticky, scroll to the parser first
  if (openAccordions.length || parserIsSticky) {
    await scrollToElementPosition(wrapper, scrollEl);
  }

  // Close options
  optionsContainer.classList.remove("open");
  await new Promise((resolve) => setTimeout(resolve, adaptiveTimeout()));

  // Scroll back
  await scrollToParser();

  // Cleanup
  document.body.classList.remove("parser-options-open", "parser-is-userscript");
  stickyInstance?.disable();
  stickyInstance = null;
  document.querySelector("#searchBox")?.classList.remove("fading");
  document.querySelectorAll(".parser-entry").forEach((el) => el.classList.remove("fading"));
  scrollEl.classList.remove("locked");
  await activateSimpleBar("siteList");

  // Close accordions
  for (const cnt of openAccordions) {
    cnt.classList.add("close");
    const icon = cnt.previousElementSibling?.querySelector("svg");
    if (icon) icon.style.transform = "rotate(90deg)";
  }

  updateMinHeight();
};
