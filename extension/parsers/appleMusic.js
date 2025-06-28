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
      const timePassed = times?.[0]?.innerText ?? "0:00";
      const remaining = times?.[1]?.innerText?.replace("-", "") ?? "0:05";

      // Calculate Duration
      const durationInSeconds = parseTime(timePassed) + parseTime(remaining);
      const duration = formatTime(durationInSeconds);

      return {
        title: titleElem,
        artist: artistElem,
        image: imageElem,
        source: "Apple Music",
        songUrl: "https://www.music.apple.com/",
        timePassed,
        duration,
      };
    } catch (e) {
      console.error("Apple Music parser error:", e);
      return null;
    }
  },
});
