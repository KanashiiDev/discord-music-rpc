registerParser({
  domain: "accuradio.com",
  title: "AccuRadio",
  urlPatterns: [/.*/],
  fn: function () {
    const player = document.querySelector("#playerContents");
    if (!player) return null;
    const titleElem = player.querySelector("#songtitle")?.textContent;
    const artistElem = player.querySelector("#songartist")?.textContent;
    const coverElem = player.querySelector("#albumArtImg")?.src;
    const sourceElem = player.querySelector("#playerName")?.href;
    const timeElem = player.querySelector("#progressWrapper")?.textContent;

    return {
      title: titleElem,
      artist: artistElem,
      image: coverElem,
      source: "AccuRadio",
      songUrl: sourceElem,
      timePassed: timeElem,
      duration: timeElem,
    };
  },
});
