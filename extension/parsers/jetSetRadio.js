registerParser({
  domain: "jetsetradio.live",
  title: "Jet Set Radio",
  urlPatterns: [/.*/],
  fn: function () {
    const tvFrame = document.querySelector("#tvFrame")?.style?.visibility !== "hidden";
    if (tvFrame) {
      return null;
    }
    const titleElem = getText("#programInformationText");
    if (titleElem === "Bump" || titleElem === "Loading..." || titleElem === "PAUSED") {
      return null;
    }
    const coverElem = getImage("#graffitiSoulFrame img");
    const sourceElem = "https://jetsetradio.live/";
    const stationLabel = formatLabel(coverElem?.split("/")[5]);
    const stationName = stationLabel ? "Jet Set Radio - " + stationLabel : "Jet Set Radio";
    return {
      title: titleElem,
      artist: titleElem,
      image: coverElem,
      source: stationName,
      songUrl: sourceElem,
    };
  },
});
