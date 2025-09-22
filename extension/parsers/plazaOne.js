registerParser({
  domain: "plaza.one",
  title: "Nightwave Plaza",
  urlPatterns: [/.*/],
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
    };
  },
});
