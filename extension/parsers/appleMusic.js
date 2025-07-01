registerParser({
  domain: "music.apple.com",
  title: "Apple Music",
  urlPatterns: [/.*/],
  fn: function getSongInfo() {
    try {
      // Element selectors
      const lcd = document.querySelector("amp-lcd")?.shadowRoot;
      const titleElem = lcd?.querySelector(".lcd-meta-line__string-container")?.innerText ?? "";
      const artistElem = lcd?.querySelector(".lcd-meta__secondary .lcd-meta-line__text-content")?.innerText.split("—")[0].trim();
      const imageElem = lcd?.querySelector(".lcd__artwork-img")?.src;
      const times = lcd?.querySelectorAll(".lcd-progress__time");

      return {
        title: titleElem,
        artist: artistElem,
        image: imageElem,
        source: "Apple Music",
        songUrl: "https://www.music.apple.com/",
        timePassed: times?.[0],
        duration: times?.[1],
      };
    } catch (e) {
      console.error("Apple Music parser error:", e);
      return null;
    }
  },
});
