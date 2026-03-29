registerParser({
  domain: "bilibili.tv",
  title: "BiliBiliTV",
  urlPatterns: [/\/play\//],
  description: "Southeast Asia's leading anime, comics, and games (ACG) community where people can create, watch and share engaging videos.",
  category: "video",
  tags: ["anime"],
  fn: function ({ iframeData }) {
    const titleElem = getText(".ep-item--active");
    const artistElem = getText("h1.bstar-meta__title > a");
    const coverElem = "https://p.bstarstatic.com/fe-lib/images/web/share-cover.png@500w_500h_1e_1c_1f.png";
    const { duration, currentTime, playing } = iframeData || {};

    return {
      title: titleElem,
      artist: artistElem,
      image: coverElem,
      source: "BiliBiliTV",
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
