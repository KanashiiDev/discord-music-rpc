registerParser({
  domain: "plaza.one",
  title: "Nightwave Plaza",
  urlPatterns: [/.*/],
  description: "24/7 online radio focused on vaporwave and retro aesthetic music.",
  category: "radio",
  tags: ["vaporwave", "retro"],
  fn: function () {
    const titleElem = getText(".track-title");
    const artistElem = getText(".track-artist");
    const coverElem = getImage(".cover img");
    const sourceElem = "https://plaza.one/";
    const timeElem = getText(".player-time");

    return {
      title: titleElem,
      artist: artistElem,
      image: coverElem,
      source: "Nightwave Plaza",
      songUrl: sourceElem,
      timePassed: timeElem,
      duration: timeElem,
      isPlaying: Boolean(document.querySelector(".col-3") || navigator?.mediaSession?.playbackState === "playing"),
    };
  },
});
