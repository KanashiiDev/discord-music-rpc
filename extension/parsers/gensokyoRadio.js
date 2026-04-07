registerParser({
  domain: "gensokyoradio.net",
  title: "Gensokyo Radio",
  homepage: "https://gensokyoradio.net/playing/",
  urlPatterns: [/\/playing\//],
  description: "Fan-run 24/7 radio station dedicated to Touhou Project fan arrangements and related music.",
  category: "radio",
  tags: ["anime", "japan", "community"],

  fn: async function () {
    let data = null;

    try {
      const res = await fetch("https://gensokyoradio.net/api/station/playing/");
      if (res.ok) data = await res.json();
    } catch (_) {}

    const title = data?.SONGINFO?.TITLE || getText("#playerTitle");
    const artist = data?.SONGINFO?.ARTIST || getText("#playerArtist");

    let image = data?.MISC?.ALBUMART ? `https://gensokyoradio.net/images/albums/500/${data.MISC.ALBUMART}` : "";
    const imgRes = image ? await fetch(image) : false;
    if (!imgRes?.ok) image = getImage("#playerArt");

    let timePassed = data?.SONGTIMES?.PLAYED || null;
    let duration = data?.SONGTIMES?.DURATION || null;

    if (!timePassed || !duration) {
      const counter = getText("#playerCounter");
      if (counter.includes("/")) {
        [timePassed, duration] = counter.split("/").map((s) => s.trim());
      }
    }

    const playButton = document.getElementById("shape")?.animatedPoints;
    const isPlaying = playButton ? playButton.getItem(0).x === 45 : false;

    return {
      title,
      artist,
      image,
      timePassed,
      duration,
      source: "Gensokyo Radio",
      songUrl: "https://gensokyoradio.net/playing/",
      isPlaying,
    };
  },
});
