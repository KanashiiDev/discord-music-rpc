registerParser({
  domain: "music.youtube.com",
  title: "YouTube Music",
  urlPatterns: [/.*/],
  fn: async function () {
    const songLink = document.querySelector("#movie_player .ytp-title a")?.href;
    const title = getText(".ytmusic-player-bar yt-formatted-string:first-child");
    let artist = "";
    const artistSelector = document.querySelector("ytmusic-player-bar yt-formatted-string.byline");
    if (artistSelector) {
      const artistNames = [];
      for (const node of artistSelector.childNodes) {
        if (node.textContent.includes("•")) break;
        if (node.nodeType === Node.ELEMENT_NODE && node.tagName === "A") {
          artistNames.push(node.textContent.trim());
        }
      }
      artist = artistNames.join(" & ");
    }
    const video = document.querySelector("video");
    let timePassed = getText("#left-controls .time-info") || "";
    let duration = getText("#left-controls .time-info") || "";
    let isWatching = 0;

    if (video) {
      isWatching = video.paused ? 0 : 1;
      if (!timePassed) timePassed = video.currentTime;
      if (!duration) duration = video.duration;
    }

    const vid = songLink && new URL(songLink).searchParams.get("v");
    const image = vid ? `https://i.ytimg.com/vi/${vid}/mqdefault.jpg` : null;

    return {
      title,
      artist,
      image,
      source: "YouTube Music",
      songUrl: songLink || window.location.href,
      playStatus: isWatching,
      timePassed,
      duration,
    };
  },
});
