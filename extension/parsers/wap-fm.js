registerParser({
  domain: "radio.wapchan.org",
  homepage: "https://radio.wapchan.org/public/wapfm",
  title: "Wap-FM",
  urlPatterns: [/public\/wapfm/],
  description: "Community-run online radio on the Wapchan anime/manga forum, streaming retro anime soundtracks, otaku music, and user-curated tracks 24/7.",
  category: "radio",
  tags: ["anime", "community"],
  fn: function () {
    return {
      title: getText(".now-playing-title"),
      artist: getText(".now-playing-artist"),
      image: getImage("img.album_art"),
      timePassed: getText(".time-display-played"),
      duration: getText(".time-display-total"),
      source: "wap-fm",
      songUrl: "https://radio.wapchan.org/public/wapfm",
      isPlaying: document.querySelector(".radio-control-play-button")?.title?.includes("Stop"),
    };
  },
});
