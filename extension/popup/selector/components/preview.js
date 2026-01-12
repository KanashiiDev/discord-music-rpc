// Create Preview Section
function createPreviewSection(root) {
  const preview = document.createElement("div");
  preview.className = "rpc-preview";

  const previewHeader = document.createElement("h3");
  previewHeader.textContent = "Preview";

  const card = document.createElement("div");
  card.className = "card";

  const header = document.createElement("div");
  header.className = "header";
  header.textContent = "Listening to";

  const body = document.createElement("div");
  body.className = "body";

  const imageContainer = document.createElement("div");
  imageContainer.className = "imageContainer";

  const img = document.createElement("img");
  img.src = browser.runtime.getURL("icons/128x128.png");
  img.alt = "Image";

  imageContainer.appendChild(img);

  const details = document.createElement("div");
  details.className = "details";

  const titleEl = document.createElement("h2");
  titleEl.className = "title";
  titleEl.textContent = "Title";

  const artist = document.createElement("div");
  artist.className = "artist";
  artist.textContent = "Artist";

  const source = document.createElement("div");
  source.className = "source";
  source.textContent = "Source";

  const progressContainer = document.createElement("div");
  progressContainer.className = "progress-container";

  const timePassed = document.createElement("span");
  timePassed.className = "timePassed";
  timePassed.textContent = "00:00";

  const progressBar = document.createElement("div");
  progressBar.className = "progress-bar";

  const progress = document.createElement("div");
  progress.className = "progress";

  progressBar.appendChild(progress);

  const duration = document.createElement("span");
  duration.className = "duration";
  duration.textContent = "00:00";

  progressContainer.appendChild(timePassed);
  progressContainer.appendChild(progressBar);
  progressContainer.appendChild(duration);

  const linkContainer = document.createElement("div");
  linkContainer.className = "link-container";

  const link = document.createElement("a");
  link.className = "link";
  link.textContent = "Open on Source";

  const customButton = document.createElement("a");
  customButton.className = "custom-button";
  customButton.id = "customButton";
  customButton.textContent = "Custom Action";

  const customButton2 = document.createElement("a");
  customButton2.className = "custom-button";
  customButton2.id = "customButton2";
  customButton2.textContent = "Custom Action";

  linkContainer.appendChild(link);
  linkContainer.appendChild(customButton);
  linkContainer.appendChild(customButton2);

  details.appendChild(titleEl);
  details.appendChild(artist);
  details.appendChild(source);
  details.appendChild(progressContainer);
  details.appendChild(linkContainer);

  body.appendChild(imageContainer);
  body.appendChild(details);

  card.appendChild(header);
  card.appendChild(body);

  preview.appendChild(previewHeader);
  preview.appendChild(card);

  root.appendChild(preview);
}

// Start preview loop
let previewInterval = null;
function startPreviewLoop(shadow, editMode) {
  previewInterval = setInterval(() => {
    updatePreview(shadow, editMode);
  }, 1000);
}

// Preview Update
function updatePreview(shadow, editMode) {
  const getValue = (id) => shadow.getElementById(id)?.value?.trim();
  const getElement = (selector) => {
    if (!selector) return null;
    try {
      return querySelectorDeep(selector);
    } catch {
      return null;
    }
  };

  const getImageSrc = (el) => {
    if (!el) return null;
    if (el.src) return el.src;
    const bgImage = window.getComputedStyle(el).backgroundImage;
    const match = bgImage?.match(/url\(["']?(.*?)["']?\)/);
    return match?.[1] || null;
  };

  const isValidUrl = (url) => {
    const pattern = /^(https?:\/\/)?(([a-z\d]([a-z\d-]*[a-z\d])*)\.)+[a-z]{2,}|((\d{1,3}\.){3}\d{1,3})(:\d+)?(\/[-a-z\d%_.~+]*)*(\?[;&a-z\d%_.~+=-]*)?(#[-a-z\d_]*)?$/i;
    return pattern.test(url);
  };

  // Get selectors
  const selectors = {
    name: getValue("nameSelector"),
    image: getValue("imageSelector"),
    title: getValue("titleSelector"),
    artist: getValue("artistSelector"),
    timePassed: getValue("timePassedSelector"),
    duration: getValue("durationSelector"),
    link: getValue("linkSelector"),
    buttonText: getValue("buttonTextSelector"),
    buttonLink: getValue("buttonLinkSelector"),
    buttonText2: getValue("buttonText2Selector"),
    buttonLink2: getValue("buttonLink2Selector"),
    source: getValue("sourceSelector"),
    regex: getValue("regexSelector"),
  };

  // Get elements
  const elements = {
    name: getElement(selectors.name),
    image: getElement(selectors.image),
    title: getElement(selectors.title),
    artist: getElement(selectors.artist),
    timePassed: getElement(selectors.timePassed),
    duration: getElement(selectors.duration),
    link: getElement(selectors.link),
    buttonText: getElement(selectors.buttonText),
    buttonLink: getElement(selectors.buttonLink),
    buttonText2: getElement(selectors.buttonText2),
    buttonLink2: getElement(selectors.buttonLink2),
    source: getElement(selectors.source),
  };

  // Text Values
  let texts = {
    name: selectors.name || getCleanHostname() || "name",
    title: elements.title?.textContent || getPlainText(selectors.title) || "title",
    artist: elements.artist?.textContent || getPlainText(selectors.artist) || "artist",
    source: elements.source?.textContent || getPlainText(selectors.source) || getCleanHostname() || "source",
    timePassed: elements.timePassed?.textContent,
    duration: elements.duration?.textContent || undefined,
    buttonText: elements.buttonText?.textContent || getPlainText(selectors.buttonText) || "Custom Action",
    buttonText2: elements.buttonText2?.textContent || getPlainText(selectors.buttonText2) || "Custom Action",
  };

  // Trim texts
  texts = Object.fromEntries(Object.entries(texts).map(([key, value]) => [key, typeof value === "string" ? value.trim() : value]));

  // If artist name contains title, clean it
  if (texts.title && texts.artist) {
    const normalized = normalizeTitleAndArtist(texts.title, texts.artist);
    texts.title = normalized.title;
    texts.artist = normalized.artist;
  }

  // Clean Title
  texts.title = truncate(texts.title, 128, { fallback: "Unknown Song" });
  texts.artist = truncate(texts.artist, 128, { fallback: "Unknown Artist" });

  // If "5:47 / 6:57" style string is found, split into both
  let [tp, dur] = extractTimeParts(texts.timePassed);
  if (tp && dur) {
    texts.timePassed = tp;
    texts.duration = dur;
  } else {
    [tp, dur] = extractTimeParts(texts.duration);
    if (tp && dur) {
      texts.timePassed = tp;
      texts.duration = dur;
    }
  }

  // Preview Elements
  const previewRoot = shadow.querySelector(".rpc-preview");
  if (!previewRoot) return;
  const details = previewRoot.querySelector(".card");

  const setText = (selector, value, maxLength) => {
    const el = details.querySelector(selector);
    if (el) {
      const truncatedValue = truncate(value, maxLength);
      if (el.textContent !== truncatedValue) el.textContent = truncatedValue;
    }
  };

  const setImage = () => {
    const img = previewRoot.querySelector(".imageContainer img");
    const imageSrc = getImageSrc(elements.image) || browser.runtime.getURL("icons/128x128.png");
    const prevImg = img.getAttribute("data-prev-image");
    if (imageSrc !== prevImg) {
      img.setAttribute("data-prev-image", imageSrc);
      img.src = imageSrc;
    }
  };

  const setLink = () => {
    const el = details.querySelector(".link");
    const href = elements.link?.href || (isValidUrl(selectors.link) ? selectors.link : location.origin);
    const linkText = `open on ${texts.source}`;
    if (el) {
      if (el.href !== href) el.href = href;
      if (el.textContent !== linkText) el.textContent = linkText;
    }
  };

  const setButtons = ({ linkElement, fallbackUrl, buttonText, buttonSelector = "#customButton" }) => {
    const el = details.querySelector(buttonSelector);
    const href = linkElement?.href || (isValidUrl(fallbackUrl) ? fallbackUrl : "");

    if (el) {
      if (el.href !== href) el.href = href;
      if (el.textContent !== buttonText) el.textContent = buttonText;
      if (el.textContent !== "Custom Action" && el.href) {
        el.style.display = "block";
      } else {
        el.style.display = "none";
      }
    }
    const buttons = details.querySelectorAll(".custom-button");
    const link = details.querySelector(".link");

    if (buttons) {
      const bothHaveHrefAndText = Array.from(buttons).every((btn) => btn.href && btn.textContent.trim() !== "" && btn.textContent.trim() !== "Custom Action");
      if (link) link.style.display = bothHaveHrefAndText ? "none" : "block";
    } else {
      if (link) link.style.display = "block";
    }

    if (shadow.querySelector(".custom-button[style='display: block;']") && shadow.querySelector(".addButtonsToggle")) {
      shadow.querySelector(".addButtonsToggle").click();
    }
  };

  const regexSelector = shadow.getElementById("regexSelector");
  const regexMark = `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M5 13L9 17L19 7" stroke="green" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
  const regexCross = `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M6 6L18 18M6 18L18 6" stroke="red" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
  function setSvgStatusEl(container, svgString) {
    container.textContent = "";

    const parser = new DOMParser();
    const doc = parser.parseFromString(svgString, "image/svg+xml");

    const svg = doc.documentElement;
    if (svg && svg.tagName.toLowerCase() === "svg") {
      container.appendChild(svg);
    }
  }

  // If the next element is a remove <a>
  if (regexSelector.nextElementSibling && regexSelector.nextElementSibling.tagName === "A") {
    regexSelector.nextElementSibling.remove();
  }

  // If the next element is not a <p>, add <p id = "regexStatus">
  if (!regexSelector.nextElementSibling || regexSelector.nextElementSibling.tagName !== "SPAN") {
    const regexStatus = document.createElement("span");
    regexStatus.id = "regexStatus";
    regexStatus.className = "userRpc-regexStatus";
    regexSelector.insertAdjacentElement("afterend", regexStatus);
  }

  const regexStatus = shadow.getElementById("regexStatus");
  const currentInput = regexSelector.value.trim();
  const prevInput = regexSelector.getAttribute("data-prev-regex") || "";

  // If the input value is the same as before, do nothing
  if (currentInput !== prevInput) {
    // Save the new value as ATTR
    regexSelector.setAttribute("data-prev-regex", currentInput);

    // Continue if the process is to be done
    if (regexStatus && currentInput.length) {
      const regexArray = parseRegexArray(currentInput);
      const isMatch = regexArray.some((rx) => rx.test(location.href));

      const prevMatch = regexStatus.getAttribute("data-prev-match");
      const matchStr = String(isMatch);

      // If same, don't update
      if (matchStr !== prevMatch) {
        regexStatus.setAttribute("data-prev-match", matchStr);
        setSvgStatusEl(regexStatus, isMatch ? regexMark : regexCross);
      }
    } else {
      regexStatus.textContent = "";
      regexSelector.removeAttribute("data-prev-regex");
      regexStatus.removeAttribute("data-prev-match");
    }
  }

  // Progress Update
  const updateProgress = async (details, texts, selectors) => {
    const timeEl = details.querySelector(".timePassed");
    const durEl = details.querySelector(".duration");
    const bar = details.querySelector(".progress-bar");
    const progress = details.querySelector(".progress");
    const getSeconds = (text) => parseTime(text) || 0;
    const setTimeText = (sec) => (timeEl.textContent = formatTime(sec));
    let currentSec = getSeconds(timeEl.textContent);

    // If there is timePassed but no duration, or if timePassed equals duration, hide the duration.
    if ((selectors.timePassed.length > 1 && selectors.duration.length < 1) || (texts.timePassed >= texts.duration && !/^[-–—]/.test(texts.duration.trim()))) {
      durEl.style.opacity = "0";
      if (!timeEl.hasAttribute("reset")) {
        timeEl.textContent = "00:00";
        timeEl.setAttribute("reset", "1");
      } else {
        const sec = parseTime(timeEl.textContent) + 1;
        timeEl.textContent = formatTime(sec);
      }
      if (bar) bar.style.opacity = "0";
      if (progress) progress.style.width = "0%";
      return;
    }
    // If timePassed does not exist and duration does, calculate the remaining time.
    if (!texts.timePassed) {
      if (!timeEl.hasAttribute("reset")) {
        setTimeText(0);
        timeEl.setAttribute("reset", "1");
      } else {
        currentSec++;
      }

      if (texts.duration) {
        const remaining = Math.abs(getSeconds(texts.duration));
        setTimeText(currentSec > remaining ? 0 : currentSec);
      } else {
        setTimeText(currentSec);
      }
    } else {
      timeEl.removeAttribute("reset");
      setTimeText(getSeconds(texts.timePassed));
    }

    // Calculate duration and progress
    if (texts.duration) {
      durEl.style.opacity = "1";
      bar.style.opacity = "1";
      setTimeout(() => {
        durEl.setAttribute("duration-prev", texts.duration);
      }, 2000);

      // Convert the current and previous duration values to numbers
      const currentDurationSec = getSeconds(texts.duration);
      const prevDurationSec = getSeconds(durEl.getAttribute("duration-prev") || texts.duration);

      // Use remaining format if it decreases backward or starts with '-,–,—'.
      const isRemaining = (/^[-–—]/.test(texts.duration.trim()) && currentDurationSec > prevDurationSec) || currentDurationSec < prevDurationSec;

      let totalSec;

      if (isRemaining) {
        const durationInSeconds = getSeconds(timeEl.textContent) + currentDurationSec;
        if (currentDurationSec > 0) {
          const ratio = durationInSeconds / currentDurationSec;
          if (ratio > 1.5 || ratio < 0.5) {
            totalSec = formatTime(currentDurationSec);
          } else {
            totalSec = formatTime(durationInSeconds);
          }
        } else {
          if (durationInSeconds > currentDurationSec * 1.5) {
            totalSec = formatTime(currentDurationSec);
          } else {
            totalSec = formatTime(durationInSeconds);
          }
        }
      }

      durEl.textContent = formatTime(totalSec);

      // Progress bar
      const percent = totalSec > 0 ? Math.min((getSeconds(timeEl.textContent) / totalSec) * 100, 100) : 0;

      if (progress) progress.style.width = `${percent}%`;
    } else {
      durEl.style.opacity = "0";
      bar.style.opacity = "0";
    }
  };

  // Apply updates
  setText(".source", texts.source, 32);
  setText(".title", texts.title, 128);
  setText(".artist", texts.artist, 128);
  setText(".header", `Listening to ${texts.artist}`, 128);
  if (editMode) {
    const header = shadow.querySelector(".userRpc-h4");
    if (header && header.textContent !== texts.name) header.textContent = texts.name;
  }
  setImage();
  setLink();
  setButtons({
    linkElement: elements.buttonLink,
    fallbackUrl: selectors.buttonLink,
    buttonText: truncate(texts.buttonText, 32),
    buttonSelector: "#customButton",
  });

  setButtons({
    linkElement: elements.buttonLink2,
    fallbackUrl: selectors.buttonLink2,
    buttonText: truncate(texts.buttonText2, 32),
    buttonSelector: "#customButton2",
  });

  updateProgress(details, texts, selectors);
}
