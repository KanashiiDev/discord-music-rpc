registerParser({
  domain: "basic.pp.ua",
  title: "Sasalele Music Station",
  urlPatterns: [/^\/$/],
  fn: function () {
    const meta = getText("#metadata").split(" - ");
    const artist = meta[0] || "";
    const title = meta[1] || "";
    const image = getImage(".playing-info #ip");
    const stationName = getText("#stationName") || "Sasalele Music Station";
    const stationLink = document.querySelector("#stationName a")?.href || "";

    return {
      title,
      artist,
      image,
      source: stationName,
      songUrl: stationLink,
    };
  },
});
