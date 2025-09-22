registerParser({
  domain: "radio.wapchan.org",
  homepage: "https://radio.wapchan.org/public/wapfm",
  title: "Wap-FM",
  urlPatterns: [/public\/wapfm/],
  fn: function () {
    return {
      title: getText(".now-playing-title"),
      artist: getText(".now-playing-artist"),
      image: getImage("img.album_art"),
      timePassed: getText(".time-display-played"),
      duration: getText(".time-display-total"),
      source: "wap-fm",
      songUrl: "https://radio.wapchan.org/public/wapfm",
    };
  },
});
