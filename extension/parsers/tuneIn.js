registerParser({
  domain: "tunein.com",
  title: "TuneIn",
  urlPatterns: [/.*/],
  description: "Aggregator for live radio, music streams, podcasts, and news audio.",
  category: "aggregator",
  tags: [],
  fn: function () {
    const title = getText("#playerTitle");
    const artist = getText("#playerTitle");
    const image = getImage("#playerArtwork");
    const sourceTitle = getText("#playerSubtitle") ?? "TuneIn";
    const sourceUrl = document.querySelector('a[class*="nowPlaying-module__link"]')?.href || "https://tunein.com";

    return {
      title,
      artist,
      image,
      source: sourceTitle,
      songUrl: sourceUrl,
      isPlaying: Boolean(document.querySelector("svg[data-testid='player-status-playing']")),
    };
  },
});
