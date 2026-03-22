// Open Parser Options
const openParserOptions = async ({ container, wrapper, optionsContainer, siteList }) => {
  const simpleBar = simpleBarInstances.get(siteList);
  const scrollEl = simpleBar?.getScrollElement();
  const scrollBar = simpleBar?.el?.children[2];
  if (!scrollEl) return;

  wrapper.querySelector(".parser-span")?.classList.add("sticky");
  wrapper.dataset.originalScrollTop = scrollEl.scrollTop;

  // Get required transition duration
  const duration = getTransitionDuration(optionsContainer, "grid-template-rows") || 200;
  const adaptiveTimeout = shouldAnimate() ? duration + 25 : 0;
  const rAF = () => new Promise(requestAnimationFrame);

  // If the parser entry is the last entry in the list, remove margin-bottom from options container
  const parserEntries = [...container.querySelectorAll(".parser-entry")];
  if (parserEntries.length < 2) optionsContainer.style.marginBottom = "0";

  // If the parser is open or a userscript, add a class to the body
  document.body.classList.add("parser-options-open");
  wrapper.querySelector(".userscript") && document.body.classList.add("parser-is-userscript");

  // Add fading to other parser entries
  for (const el of parserEntries) {
    if (el !== wrapper) el.classList.add("fading");
  }

  // Lock the scrollbar and add smooth class to it
  document.body.classList.remove("scrollbar-visible");
  scrollEl.classList.add("locked");
  scrollBar?.classList.add("smooth");

  // Calculate required height and scroll to parser entry
  await delay(adaptiveTimeout);
  await rAF();
  await scrollToParser({ wrapper, simpleBar });

  // Open parser options
  optionsContainer.classList.add("open");

  // Unlock the scrollbar and remove smooth class from it
  scrollEl.classList.remove("locked");
  scrollBar?.classList.remove("smooth");
  await refreshScrollbar(scrollBar);
};

// Close Parser Options
const closeParserOptions = async (optionsContainer) => {
  const siteList = document.querySelector("#siteList");
  const simpleBar = simpleBarInstances.get(siteList);
  const scrollEl = simpleBar?.getScrollElement();
  const scrollBar = simpleBar?.el?.children[2];
  if (!scrollEl || !optionsContainer) return;

  const wrapper = optionsContainer.closest(".parser-entry");
  const parserSpan = wrapper?.querySelector(".parser-span");
  const openAccordions = [...optionsContainer.querySelectorAll(".accordion-content:not(.close)")];
  const parserIsSticky = parserSpan != null && getComputedStyle(parserSpan).transform !== "none";
  const hadPadding = parseFloat(scrollEl.style.paddingBottom) > 0;
  const originalScrollTop = Number(wrapper?.dataset.originalScrollTop);
  const duration = shouldAnimate() ? getTransitionDuration(optionsContainer, "grid-template-rows") || 300 : 0;

  // Lock the scrollbar and add smooth class to it
  scrollEl.classList.add("locked");
  scrollBar?.classList.add("smooth");

  // If the accordion is open or the header is sticky, scroll to the parser first
  if (openAccordions.length || parserIsSticky) {
    await scrollToElementPosition(wrapper, scrollEl);
  }

  // Close parser options
  optionsContainer.classList.remove("open");
  await delay(duration);

  // Reset bottom padding
  if (hadPadding) {
    scrollEl.style.overflowAnchor = "none";
    scrollEl.style.paddingBottom = "0px";
    scrollEl.style.overflowAnchor = "";
  }

  // Close the accordions
  for (const cnt of openAccordions) {
    cnt.classList.add("close");
    cnt.previousElementSibling?.querySelector("svg")?.style.setProperty("transform", "rotate(90deg)");
  }

  parserSpan?.classList.remove("sticky");
  await new Promise(requestAnimationFrame);

  // Calculate the scroll target
  const scrollRect = scrollEl.getBoundingClientRect();
  const wrapperTop = wrapper.getBoundingClientRect().top - scrollRect.top + scrollEl.scrollTop;
  const scrollTarget = hadPadding ? Math.min(wrapperTop, scrollEl.scrollHeight - scrollEl.clientHeight) : originalScrollTop;

  // Return the layout to its previous state
  document.body.classList.remove("parser-options-open", "parser-is-userscript");

  // Scroll to the parser entry
  if (hadPadding) await delay(duration);
  await smoothScrollTo(scrollEl, hadPadding ? Math.min(wrapperTop, scrollEl.scrollHeight - scrollEl.clientHeight) : scrollTarget);

  // Remove fading from other parser entries
  document.querySelectorAll(".parser-entry").forEach((el) => el.classList.remove("fading"));

  // Remove spacer
  const spacer = document.querySelector(".sb-scroll-spacer");

  if (spacer) {
    if (spacer.offsetHeight > 0) {
      spacer.style.transition = "height var(--transition-reduced) ease";
      spacer.style.height = "0px";
      await waitForTransitionEnd(spacer, "height");
      spacer.remove();
    } else {
      spacer.remove();
    }
  }

  // Unlock the scrollbar and remove smooth class from it
  scrollEl.classList.remove("locked");
  scrollBar?.classList.remove("smooth");
  await refreshScrollbar(scrollBar);
};
