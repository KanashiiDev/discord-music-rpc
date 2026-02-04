registerParser({
  domain: "music.amazon.com",
  title: "Amazon Music",
  urlPatterns: [/.*/],
  fn: async function () {
    const main = document.querySelector("music-horizontal-item")?.shadowRoot;
    const title = getText("music-link", { root: main });
    const artist = getText("music-link[kind='secondary']", { root: main });
    const image = getText("music-image", {
      root: main,
      attr: "src",
      transform: (v) => v.replace(/\.jpg$/, "._SX160_SY160_.jpg"),
    });
    const songUrl = main?.querySelector("music-link a")?.href;
    const times = getText("#progress-container", { root: document });
    const [timePassed = "", remaining = ""] = times.split("-").map((s) => s.trim());

    return {
      title,
      artist,
      image,
      source: "Amazon Music",
      songUrl: songUrl || "https://www.music.amazon.com/",
      timePassed,
      duration: remaining,
    };
  },
});
