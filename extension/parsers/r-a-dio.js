registerParser({
  domain: "r-a-d.io",
  title: "R/a/dio",
  urlPatterns: [/.*/],
  description: "Community-driven 24/7 online radio streaming anime, Japanese, J-pop, and related music with song requests and occasional live DJs.",
  category: "radio",
  tags: ["anime", "japan", "community"],
  fn: function () {
    const titleElem = getText("#metadata");
    const artistElem = getText("#metadata");
    const coverElem = getImage("div:nth-of-type(2)#content > section > div > div.is-desktop > div > img");
    const sourceElem = "https://r-a-d.io/";
    const timePassedElem = getText("#progress-current");
    const timeElem = getText("#progress-max");
    const isPlaying = Boolean(
      document.querySelector("#stream-play-pause")?.textContent.startsWith("Stop") ||
      navigator?.mediaSession?.playbackState === "playing" ||
      (document.querySelector("audio") && !document.querySelector("audio").paused),
    );

    return {
      title: titleElem,
      artist: artistElem,
      image: coverElem,
      source: "R/a/dio",
      songUrl: sourceElem,
      timePassed: timePassedElem,
      duration: timeElem,
      isPlaying,
    };
  },
});
