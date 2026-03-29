registerParser({
  domain: "kick.com",
  title: "Kick",
  urlPatterns: [/\/\w+/],
  description: "Kick is a streaming platform that makes it easy for you to find and watch your favorite content.",
  category: "platform",
  tags: ["streaming"],
  fn: function () {
    const titleElem = getText("[data-testid='livestream-title']");
    const artistElem = getText("#channel-username");
    const coverElem = getImage("div:nth-child(1) > #channel-avatar") || "https://www.google.com/s2/favicons?domain=kick.com&size=64";
    const video = document.querySelector("video");
    const currentTime = Number.isFinite(video?.currentTime) && video.currentTime > 0 ? video.currentTime : 0;
    const duration = Number.isFinite(video?.duration) && video.duration > 0 ? video.duration : 0;
    const playing = !video?.paused && currentTime > 0;

    return {
      title: titleElem,
      artist: artistElem,
      image: coverElem,
      source: "Kick",
      songUrl: location.href,
      timePassed: currentTime,
      duration: duration,
      isPlaying: playing,
      mode: "watch",
    };
  },
});
