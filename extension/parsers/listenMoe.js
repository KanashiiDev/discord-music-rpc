registerParser({
  domain: "listen.moe",
  title: "LISTEN.moe",
  urlPatterns: [/.*/],
  description: "Fan-operated 24/7 streaming radio for anime, Japanese idol, vocaloid, and related tracks.",
  category: "radio",
  tags: ["anime", "japan", "community"],
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
      isPlaying: document.querySelector(".playerContainer .shadow > svg > g > path")?.getAttribute("d")?.startsWith("M9.5"),
    };
  },
});
