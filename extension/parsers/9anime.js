registerParser({
  domain: "9animetv.to",
  title: "9Anime",
  urlPatterns: [/\/watch\//],
  description: "9anime is a free anime website where millions visit to watch anime online.",
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
      source: "9Anime",
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
