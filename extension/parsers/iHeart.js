registerParser({
  domain: "iheart.com",
  title: "iHeart",
  urlPatterns: [/.*/],
  fn: function () {
    const player = document.querySelector("[data-test='player-container']");
    if (!player) return null;
    let titleElem = player.querySelector("[data-test='player-text'] [data-test='line-text']:nth-child(2)")?.textContent;
    let artistElem = player.querySelector("[data-test='player-text'] [data-test='line-text']:nth-child(3)")?.textContent;
    const coverElem = player.querySelector("[data-test='player-artwork-image'] img")?.src;
    const sourceElem = player.querySelector("[data-test='player-text'] [data-test='line-text']:nth-child(2) a")?.href;
    const timeElem = player.querySelector("[aria-label='Seekbar Duration']")?.textContent;
    const timePassedElem = player.querySelector("[aria-label='Seekbar Position']")?.textContent;

    if (!artistElem) {
      titleElem = player.querySelector("[data-test='player-text'] [data-test='line-text']:nth-child(2)")?.textContent;
      artistElem = player.querySelector("[data-test='player-text'] [data-test='line-text']:nth-child(1)")?.textContent;
    }

    function decodeCoverImage(url, size = "small") {
      try {
        let finalUrl = url;

        if (url.includes("/url/")) {
          const base64Part = url.split("/url/")[1].split("?")[0];
          const base64Regex = /^[A-Za-z0-9+/=]+$/;

          if (base64Regex.test(base64Part)) {
            finalUrl = atob(base64Part);
          } else {
            finalUrl = decodeURIComponent(base64Part);
          }
        }

        finalUrl = finalUrl.replace(/(&|\?)size=\w+/i, `$1size=${size}`);

        return finalUrl;
      } catch (err) {
        return url;
      }
    }

    return {
      title: titleElem,
      artist: artistElem,
      image: decodeCoverImage(coverElem),
      source: "iHeart",
      songUrl: sourceElem,
      timePassed: timePassedElem,
      duration: timeElem,
    };
  },
});
