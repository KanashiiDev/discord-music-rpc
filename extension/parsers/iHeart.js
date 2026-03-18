registerParser({
  domain: "iheart.com",
  title: "iHeart",
  urlPatterns: [/.*/],
  description: "Aggregator for live radio stations, custom music channels, and podcasts.",
  category: "aggregator",
  tags: ["music", "podcast", "radio"],
  fn: function () {
    const player = document.querySelector("body > div > div > div:last-child");
    if (!player) return null;
    const titleElem = player.querySelector("div > div > div > div > div > div:nth-child(2) > span")?.textContent;
    const artistElem = player.querySelector("div > div > div > div > div > div:nth-child(3) > div")?.textContent;
    const coverElem = player.querySelector("div > div > div > div > div > div:nth-child(1) > img")?.src;
    const timeElem = player.querySelectorAll("div > div > div > div > div > div:nth-child(1) > span")[2]?.textContent;
    const timePassedElem = player.querySelectorAll("div > div > div > div > div > div:nth-child(1) > span")[1]?.textContent;

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
      timePassed: timePassedElem,
      duration: timeElem,
      isPlaying: Boolean(document.querySelector("[data-test='player-play-button'] svg[aria-label='Pause']")),
    };
  },
});
