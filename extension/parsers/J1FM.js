registerParser({
  domain: "j1fm.tokyo",
  title: "J1FM",
  urlPatterns: [/player.*/],
  fn: function () {
    const title = getText("strong[data-station-metadata-target=playBarSecondaryTitle]");
    const artist = getText("span[data-station-metadata-target=playBarSecondarySubtitle]");
    const image = getImage("img[data-station-metadata-target=playBarSecondaryImage]");
    const stationName = getText('strong[data-player-target="playBarPrimaryTitle"]') || "J1FM";

    return {
      title,
      artist,
      image,
      source: stationName,
      songUrl: location.href,
    };
  },
});
