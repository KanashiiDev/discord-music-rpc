registerParser({
  domain: ["miruro.to", "miruro.tv", "miruro.online", "miruro.bz"],
  title: "Miruro",
  urlPatterns: [/\/watch\//],
  description: "Miruro is a free anime streaming site where you can watch anime in HD quality with both subbed and dubbed options.",
  category: "video",
  tags: ["anime"],
  mode: "watch",
  fn: function ({ iframeData }) {
    const titleElem = getText(".ep-title");
    const artistElem = getText(".title");
    const coverElem = getImage("._infoLink_ ._image_");
    const video = document.querySelector("[data-media-provider] video");

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
      source: "Miruro",
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
