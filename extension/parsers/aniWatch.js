registerParser({
  domain: "aniwatchtv.to",
  title: "AniWatch",
  urlPatterns: [/\/watch\//],
  description: "AniWatch is a free site to watch anime and you can even download subbed or dubbed anime in ultra HD quality.",
  category: "video",
  tags: ["anime"],
  fn: function ({ iframeData }) {
    const titleElem = getText("strong:nth-child(1) > b:nth-child(1)");
    const artistElem = getText(".film-name");
    const coverElem = getImage(".film-poster > .film-poster-img");
    const { duration, currentTime, playing } = iframeData || {};

    return {
      title: titleElem,
      artist: artistElem,
      image: coverElem,
      source: "AniWatch",
      songUrl: location.href,
      timePassed: currentTime,
      duration: duration,
      isPlaying: playing,
      mode: "watch",
    };
  },
  iframeFn: function () {
    return getVideoInfo();
  },
});
