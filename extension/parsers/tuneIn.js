registerParser({
  domain: "tunein.com",
  title: "TuneIn",
  urlPatterns: [/.*/],
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
    };
  },
});
