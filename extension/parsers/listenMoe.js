registerParser({
  domain: "listen.moe",
  title: "LISTEN.moe",
  urlPatterns: [/.*/],
  fn: function () {
    const title = getText(".player-song-title");
    const artist = getText("span.player-song-artist a");
    const image = getImage(".albumContainer img");

    return {
      title,
      artist,
      image,
      source: "LISTEN.moe",
      songUrl: "https://listen.moe/",
    };
  },
});
