registerParser({
  domain: ["anime.nexus"],
  title: "Anime Nexus",
  urlPatterns: [/\/watch\//],
  description: "Anime Nexus is your ultimate destination for discovering, streaming, and discussing all things anime.",
  category: "video",
  tags: ["anime"],
  mode: "watch",
  fn: function ({ iframeData }) {
    const titleElem = getText("[data-media-player] .flex.flex-col h2");
    const artistElem = getText("[data-media-player] .flex.flex-col h1");
    const coverElem = getImage(".group/ep_num.active img");
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
      source: "Anime Nexus",
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
