registerParser({
  domain: "youtube.com",
  title: "YouTube",
  urlPatterns: [/.*/],
  description: "Video-sharing platform hosting music, live streams, and other content.",
  category: "platform",
  tags: ["video"],
  fn: async function () {
    if (location.pathname.includes("shorts")) return;
    const url = window.location.href;
    const title = getText("#title > h1 > yt-formatted-string");
    const artist = getText("#upload-info #text > a");
    const video = document.querySelector("video");
    const isLive = Boolean(document.querySelector("button.ytp-live-badge")?.offsetParent);
    const isWatchingBtn = Boolean(document.querySelector(".ytp-left-controls > button > svg > path")?.getAttribute("d").startsWith("M 12"));
    let timePassed = "",
      duration = "",
      isWatching = 0;

    if (video) {
      isWatching = !video.paused;
      timePassed = isLive ? "" : video.currentTime;
      duration = isLive ? "" : video.duration;
    }

    const vid = url && new URL(url).searchParams.get("v");
    const image = vid ? `https://i.ytimg.com/vi/${vid}/mqdefault.jpg` : null;

    return {
      title,
      artist,
      image,
      source: "YouTube",
      songUrl: url,
      mode: "watch",
      isPlaying: isWatching || isWatchingBtn,
      timePassed,
      duration,
    };
  },
});
