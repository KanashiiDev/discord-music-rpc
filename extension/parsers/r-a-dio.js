registerParser({
  domain: "r-a-d.io",
  title: "R/a/dio",
  urlPatterns: [/.*/],
  fn: function () {
    const titleElem = getText("#metadata");
    const artistElem = getText("#metadata");
    const coverElem = getImage("div:nth-of-type(2)#content > section > div > div.is-desktop > div > img");
    const sourceElem = "https://r-a-d.io/";
    const timePassedElem = getText("#progress-current");
    const timeElem = getText("#progress-max");

    return {
      title: titleElem,
      artist: artistElem,
      image: coverElem,
      source: "R/a/dio",
      songUrl: sourceElem,
      timePassed: timePassedElem,
      duration: timeElem,
    };
  },
});
