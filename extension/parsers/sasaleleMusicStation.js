registerParser({
  domain: "basic.pp.ua",
  title: "Sasalele Music Station",
  urlPatterns: [/^\/$/],
  fn: function () {
    const meta = getText("#metadataDisplay").split(" - ");
    const artist = meta[0] || "";
    const title = meta[1] || "";
    const image = getImage(".playing-info #ip");
    const stationName = getText(".playing-info #nowPlaying .homepagelink") || "Sasalele Music Station";
    const stationLink = getText(".playing-info #nowPlaying .homepagelink", { attr: "href" }) || "";

    return {
      title,
      artist,
      image,
      source: stationName,
      songUrl: stationLink,
    };
  },
});
