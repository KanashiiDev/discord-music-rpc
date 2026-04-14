registerParser({
  domain: "twitch.tv",
  title: "Twitch",
  urlPatterns: [/\/\w+/],
  description: "Twitch is an interactive livestreaming service for content spanning gaming, entertainment, sports, music, and more.",
  category: "platform",
  tags: ["streaming"],
  fn: function () {
    const titleElem = getText("#live-channel-stream-information [data-a-target='stream-title']");
    const artistElem = getText("#live-channel-stream-information h1.tw-title");
    const coverElem = getImage("#live-channel-stream-information")?.replace(/-\d{1,2}x\d{1,2}/, "-300x300") || "https://www.twitch.tv/favicon.ico";
    const video = document.querySelector("video");
    const currentTime = Number.isFinite(video?.currentTime) && video.currentTime > 0 ? video.currentTime : 0;
    const duration = Number.isFinite(video?.duration) && video.duration > 0 ? video.duration : 0;
    const isPlayingButton = Boolean(document.querySelector("[data-a-player-state='playing']"));
    const playing = (!video?.paused && currentTime > 0) || isPlayingButton;

    return {
      title: titleElem,
      artist: artistElem,
      image: coverElem,
      source: "Twitch",
      songUrl: location.href,
      timePassed: currentTime,
      duration: duration,
      isPlaying: playing,
      mode: "watch",
    };
  },
});
