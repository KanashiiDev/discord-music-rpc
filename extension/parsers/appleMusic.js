registerParser({
  domain: "music.apple.com",
  title: "Apple Music",
  urlPatterns: [/.*/],
  description: "Subscription-based music streaming service with on-demand playback, curated playlists, and Apple ecosystem integration.",
  category: "platform",
  tags: [],
  fn: function () {
    const lcd = document.querySelector("amp-lcd")?.shadowRoot;
    const titleElem = lcd?.querySelector(".lcd-meta-line__string-container")?.innerText ?? "";
    const artistElem = lcd?.querySelector(".lcd-meta__secondary .lcd-meta-line__text-content")?.innerText.split("—")[0].trim();
    const imageElem = lcd?.querySelector(".lcd__artwork-img")?.src;
    const times = lcd?.querySelectorAll(".lcd-progress__time");
    const playing = document.querySelector("amp-lcd .playback-play__play")?.ariaHidden === "true";

    return {
      title: titleElem,
      artist: artistElem,
      image: imageElem,
      source: "Apple Music",
      songUrl: "https://www.music.apple.com/",
      timePassed: times?.[0]?.textContent?.trim() ?? "0",
      duration: times?.[1]?.textContent?.trim() ?? "0",
      isPlaying: playing,
    };
  },
});
