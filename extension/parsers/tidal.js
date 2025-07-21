registerParser({
  domain: "tidal.com",
  title: "Tidal",
  urlPatterns: [/.*/],
  fn: async function () {
    const main = document.querySelector("[data-test='footer-player']");
    const titleElem = main?.querySelector("[data-test='footer-track-title']")?.innerText ?? "";
    const artistElem = main?.querySelector("[data-test='grid-item-detail-text-title-artist']")?.innerText.trim();
    const imageElem = main?.querySelector("div.image img")?.src;
    const musicLink = main?.querySelector("[data-test='footer-track-title'] a")?.href ?? "";
    const times = main?.querySelector("[data-test='play-controls']").parentElement;
    const timePassed = times?.querySelector("[data-test='current-time']")?.textContent ?? "";
    const duration = times?.querySelector("[data-test='duration']")?.textContent ?? "";

    return {
      title: titleElem,
      artist: artistElem,
      image: imageElem,
      source: "Tidal",
      songUrl: musicLink || "https://www.tidal.com/",
      duration,
      timePassed,
    };
  },
});
