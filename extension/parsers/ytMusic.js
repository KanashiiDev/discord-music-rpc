registerParser({
  domain: "music.youtube.com",
  title: "YouTube Music",
  urlPatterns: [/.*/],
  fn: async function () {
    const songLink = document.querySelector("#movie_player .ytp-title a")?.href;
    const title = getText(".ytmusic-player-bar yt-formatted-string:nth-of-type(1)");
    const artist = getText(
      "ytmusic-app > ytmusic-app-layout#layout > ytmusic-player-bar > div:nth-of-type(2).middle-controls > div:nth-of-type(2).content-info-wrapper > span > span:nth-of-type(2) > yt-formatted-string > a"
    );
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
