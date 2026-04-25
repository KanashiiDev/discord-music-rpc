registerParser({
  domain: ["animepahe.pw", "animepahe.com", "animepahe.org"],
  title: "animepahe",
  urlPatterns: [/\/anime\//],
  description: "Animepahe lets you watch anime online with fast streaming servers.",
  category: "video",
  tags: ["anime"],
  mode: "watch",
  fn: function ({ iframeData }) {
    const titleElem = getText("#episodeMenu");
    const artistElem = getText("h1:nth-child(2) > a:nth-child(2)");
    const coverElem = getImage(".poster > div > img");
    const { duration, currentTime, playing } = iframeData || {};

    return {
      title: titleElem,
      artist: artistElem,
      image: coverElem,
      source: "animepahe",
      songUrl: location.href,
      timePassed: currentTime,
      duration: duration,
      isPlaying: playing,
    };
  },
  iframeFn: function () {
    return getVideoInfo();
  },
});
