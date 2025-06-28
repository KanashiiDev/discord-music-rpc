registerParser({
  domain: "youtube.com",
  title: "YouTube",
  urlPatterns: [/.*/],
  fn: async function () {
    const url = window.location.href;
    const title = getText("#title > h1 > yt-formatted-string");
    const artist = getText("#upload-info #text > a");
    const video = document.querySelector("video");
    const isLive = Boolean(document.querySelector("button.ytp-live-badge")?.offsetParent);
    let timePassed = "",
      duration = "",
      isWatching = 0;

    if (video) {
      isWatching = video.paused ? 0 : 1;
      timePassed = isLive ? "" : formatTime(video.currentTime);
      duration = isLive ? "" : formatTime(video.duration);
    }

    const vid = url && new URL(url).searchParams.get("v");
    const image = vid ? `https://i.ytimg.com/vi/${vid}/mqdefault.jpg` : null;

    return {
      title,
      artist,
      image,
      source: "YouTube",
      songUrl: url,
      watching: true,
      playStatus: isWatching,
      timePassed,
      duration,
    };
  },
});
