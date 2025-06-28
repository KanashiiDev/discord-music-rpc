registerParser({
  domain: "listen.moe",
  title: "Listen Moe",
  urlPatterns: [/.*/],
  fn: function () {
    const title = getText(".player-song-title");
    const artist = getText("span.player-song-artist a");
    const image = getImage(".albumContainer img");

    return {
      title,
      artist,
      image,
      source: "Listen Moe",
      songUrl: "https://listen.moe/",
    };
  },
});
