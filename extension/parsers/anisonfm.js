registerParser({
  domain: ["anison.fm", "en.anison.fm", "cn.anison.fm"],
  title: "ANISON.FM",
  urlPatterns: [/.*/],
  fn: function () {
    const titleText = getText(".player-wrapper .player-item .song-box__subtitle");
    if (titleText === "Отбивочка") return;
    return {
      title: titleText,
      artist: getText(".player-wrapper .player-item .song-box__title"),
      image: getImage(".player-wrapper .player-item .song-item__img--title"),
      source: "ANISON.FM",
      songUrl: location.href,
      position: 0,
      isPlaying: document.querySelector("svg.song-play__start")?.classList.contains("hide"),
      duration: getText(".player-wrapper .player-item .song-item__time"),
      progress: 0,
    };
  },
});
