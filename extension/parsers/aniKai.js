registerParser({
  domain: "anikai.to",
  title: "AnimeKAI",
  urlPatterns: [/\/watch\//],
  description: "AnimeKAI is a free anime streaming site where you can watch anime in HD quality with both subbed and dubbed options.",
  category: "video",
  tags: ["anime"],
  mode: "watch",
  fn: function ({ iframeData }) {
    const titleElem = getText("p:nth-child(1) > b:nth-child(1)");
    const artistElem = getText("#main-entity h1");
    const coverElem = getImage(".poster > div > img");
    const { duration, currentTime, playing } = iframeData || {};

    return {
      title: titleElem,
      artist: artistElem,
      image: coverElem,
      source: "AnimeKAI",
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
