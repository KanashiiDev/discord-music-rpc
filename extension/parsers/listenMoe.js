registerParser({
  domain: "listen.moe",
  title: "LISTEN.moe",
  urlPatterns: [/.*/],
  description: "Fan-operated 24/7 streaming radio for anime, Japanese idol, vocaloid, and related tracks.",
  category: "radio",
  tags: ["anime", "japan", "community"],
  fn: function () {
    let title = getText(".glass span.text-text-primary");
    const artist = getText(".glass span.text-text-secondary > span");
    const image = getImage("img[alt='Album art']") || "https://listen.moe/images/logo.png";
    const titleExtra = getText(".glass span.text-text-primary > .inline");
    if (titleExtra) title = title.replace(titleExtra, "");

    return {
      title,
      artist,
      image,
      source: "LISTEN.moe",
      songUrl: "https://listen.moe/",
      isPlaying: document.querySelector(".glass svg rect")?.getAttribute("x") === "6",
    };
  },
});
