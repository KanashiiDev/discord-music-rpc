registerParser({
  domain: "deezer.com",
  title: "Deezer",
  urlPatterns: [/.*/],
  fn: function () {
    try {
      // Element selectors
      let titleElem = document.querySelector("[data-testid='item_title']")?.textContent;
      let artistElem = document.querySelector("[data-testid='item_subtitle']")?.textContent;
      let imageElem = document.querySelector("[data-testid='item_cover'] img")?.src;
      const timePassed = document.querySelector("p[data-testid='elapsed_time']")?.textContent.trim() || "";
      const duration = document.querySelector("p[data-testid='remaining_time']")?.textContent.trim() || "";
      const sourceUrl = document.querySelector("[data-testid='item_title'] a")?.href;

      //a second safeguard against any "undefined" error
      if (!titleElem) titleElem = document.querySelector("head title")?.textContent.split(" - ").slice(0, -2).join(" - ");
      if (!artistElem) artistElem = document.querySelector("head title")?.textContent.split(" - ").slice(-2)[0];
      if (!imageElem) imageElem = document.querySelector(`img[alt='${titleElem}']`)?.src.replace("500x500", "200x200");

      return {
        title: titleElem,
        artist: artistElem,
        image: imageElem,
        source: "Deezer",
        songUrl: sourceUrl || "https://www.deezer.com/",
        timePassed,
        duration,
      };
    } catch (e) {
      console.error("Deezer parser error:", e);
      return null;
    }
  },
});
