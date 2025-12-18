registerParser({
  domain: "gensokyoradio.net",
  title: "Gensokyo Radio",
  homepage: "https://gensokyoradio.net/playing/",
  urlPatterns: [/\/playing\//],
  fn: function () {
    const title = getText("#playerTitle");
    const artist = getText("#playerArtist");
    const image = getImage("#playerArt");

    const counter = getText("#playerCounter");
    const [timePassed, duration] = counter.split("/").map((s) => s.trim());

    return {
      title,
      artist,
      image,
      timePassed,
      duration,
      source: "Gensokyo Radio",
      songUrl: "https://gensokyoradio.net/playing/",
    };
  },
});
