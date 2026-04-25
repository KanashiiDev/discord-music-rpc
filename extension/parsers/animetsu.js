registerParser({
  domain: ["animetsu.cc", "animetsu.bz", "animetsu.live"],
  title: "Animetsu",
  urlPatterns: [/\/watch\//],
  description: "Animetsu is a free anime streaming site where you can watch anime in HD quality.",
  category: "video",
  tags: ["anime"],
  mode: "watch",
  fn: function ({ iframeData }) {
    const fullTite = getText("head > title");
    const titleElem = fullTite.split("-")[0].trim();
    const artistElem = fullTite.split("-")[1].trim();
    const coverElem = getImage(`a[title='${artistElem}'] img`);
    const video = document.querySelector("[data-media-player] video");

    let { duration, currentTime, playing } = iframeData || {};

    if (video && !duration) {
      playing = !video.paused;
      currentTime = video.currentTime;
      duration = video.duration;
    }

    return {
      title: titleElem,
      artist: artistElem,
      image: coverElem,
      source: "Animetsu",
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
