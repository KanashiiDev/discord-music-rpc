registerParser({
  domain: "radio.net",
  title: "radio.net",
  urlPatterns: [/.*/],
  fn: function () {
    function getStemFromUrl(input) {
      if (typeof input !== "string") return "";
      let url;
      try {
        url = new URL(input, "http://dummy-base");
      } catch {
        return "";
      }
      const segments = url.pathname.split("/").filter(Boolean);
      if (segments.length === 0) return "";

      const last = segments[segments.length - 1];
      const dot = last.lastIndexOf(".");
      const stem = dot > 0 ? last.slice(0, dot) : last;
      return decodeURIComponent(stem);
    }
    const root = document.querySelector("[data-testid='player-display-area']");
    let title = root?.querySelector("[data-testid='status-display']")?.textContent;
    let artist = root?.querySelector("[data-testid='status-display']")?.textContent;
    const image = document.querySelector("[data-testid='logo-in-player']")?.src;
    const sourceTitle = root?.querySelector("[data-testid='broadcast-name']")?.textContent ?? "radio.net";
    const sourceUrl = location.origin && getStemFromUrl(image) ? `${location.origin}/s/${getStemFromUrl(image)}` : "https://www.radio.net";

    if (!title && !artist && sourceTitle) {
      title = sourceTitle;
      artist = sourceTitle;
    }

    return {
      title,
      artist,
      image,
      source: sourceTitle,
      songUrl: sourceUrl,
    };
  },
});
