registerParser({
  domain: "gensokyoradio.net",
  title: "Gensokyo Radio",
  homepage: "https://gensokyoradio.net/playing/",
  urlPatterns: [/\/playing\//],
  description: "Fan-run 24/7 radio station dedicated to Touhou Project fan arrangements and related music.",
  category: "radio",
  tags: ["anime", "japan", "community"],
  fn: function () {
    const title = getText("#playerTitle");
    const artist = getText("#playerArtist");
    const image = getImage("#playerArt");

    const counter = getText("#playerCounter");
    const [timePassed, duration] = counter.split("/").map((s) => s.trim());
    const playButton = document.getElementById("shape")?.animatedPoints;

    return {
      title,
      artist,
      image,
      timePassed,
      duration,
      source: "Gensokyo Radio",
      songUrl: "https://gensokyoradio.net/playing/",
      isPlaying: Boolean(playButton?.getItem(0).x === 45),
    };
  },
});
