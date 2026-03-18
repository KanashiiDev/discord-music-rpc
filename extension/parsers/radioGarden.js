registerParser({
  domain: "radio.garden",
  title: "Radio Garden",
  urlPatterns: [/.*/],
  description: "Interactive globe for exploring live radio stations worldwide.",
  category: "aggregator",
  tags: [],
  fn: function () {
    const root = document.querySelector("div[class*='_channelTitle_']");
    const title = root?.querySelector("[class*='_title_']")?.textContent;
    const artist = root?.querySelector("[class*='_subtitle_']")?.textContent;
    const image = "https://radio.garden/icons/icon_60pt@2x.png";

    return {
      title,
      artist,
      image,
      source: "Radio Garden",
      songUrl: "https://radio.garden",
      isPlaying: Boolean(document.querySelector("button[aria-label='stop']")),
    };
  },
});
