registerParser({
  domain: "anicrush.to",
  title: "AniCrush",
  urlPatterns: [/\/watch\//],
  description: "AniCrush is where you can watch anime for free without ads, immersing yourself in the universe of your favorite shows uninterrupted.",
  category: "video",
  tags: ["anime"],
  fn: function ({ iframeData }) {
    const titleElem = getText(".dropdown > a > div > span");
    const artistElem = getText(".about-anime .main .heading-md");
    const coverElem = getImage(".anime-thumbnail");
    const { duration, currentTime, playing } = iframeData || {};

    return {
      title: titleElem,
      artist: artistElem,
      image: coverElem,
      source: "AniCrush",
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
