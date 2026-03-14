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
        if (node.nodeType === Node.ELEMENT_NODE) {
          if (node.tagName === "A") {
            artistNames.push(node.textContent.trim());
          } else if (node.tagName === "SPAN" && !node.textContent.includes("•")) {
            const spanText = node.textContent.trim();
            if (spanText) artistNames.push(spanText);
          }
        }
      }
      artist = artistNames.join(" & ");
    }
    const video = document.querySelector("video");
    let timePassed = getText("#left-controls .time-info") || "";
    let duration = getText("#left-controls .time-info") || "";
    const isWatchingBtn = Boolean(document.querySelectorAll(".ytmusic-player-bar #button > yt-icon > span > div > svg > path")[2]?.getAttribute("d").startsWith("M6.5"));
    let isWatching = 0;

    if (video) {
      isWatching = !video.paused;
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
      isPlaying: isWatching || isWatchingBtn,
      timePassed,
      duration,
    };
  },
});
