registerParser({
  domain: "pandora.com",
  title: "Pandora",
  urlPatterns: [/.*/],
  fn: function () {
    const player = document.querySelector(".region-bottomBar");
    if (!player) return null;
    const titleElem = player.querySelector("[data-qa='mini_track_title']")?.textContent;
    const artistElem = player.querySelector("[data-qa='mini_track_artist_name']")?.textContent;
    const coverElem = player.querySelector("[data-qa='mini_track_image']")?.src;
    const sourceElem = player.querySelector("[data-qa='mini_track_title']")?.href;
    const timeElem = player.querySelector("[data-qa='remaining_time']")?.textContent;
    const timePassedElem = player.querySelector("[data-qa='elapsed_time']")?.textContent;

    return {
      title: titleElem,
      artist: artistElem,
      image: coverElem,
      source: "Pandora",
      songUrl: sourceElem,
      timePassed: timePassedElem,
      duration: timeElem,
    };
  },
});
