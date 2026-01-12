registerParser({
  domain: "onlineradiobox.com",
  title: "Online Radio Box",
  urlPatterns: [/.*/],
  fn: async function () {
    async function fetchTrackHistory() {
      const stationLink = document.querySelector(".player__station__title a");
      if (!stationLink) {
        return;
      }
      const stationId = stationLink.getAttribute("href")?.split("?")[0];
      const playlistUrl = `${stationId}playlist/`;

      try {
        const response = await fetch(playlistUrl);
        if (!response.ok) {
          throw new Error("Song Info Fetch Error");
        }
        const html = await response.text();
        const parser = new DOMParser();
        const doc = parser.parseFromString(html, "text/html");
        const trackHistoryElement = doc.querySelector(".tablelist-schedule .active .track_history_item");
        if (!trackHistoryElement) {
          return;
        }
        const trackArtist = trackHistoryElement?.textContent.split(" - ")[0] || "OnlineRadioBox";
        const trackTitle = trackHistoryElement?.textContent.split(" - ")[1] || document.querySelector(".player__station__name")?.textContent;
        const trackLink = trackHistoryElement?.querySelector("a")?.href || "";

        return { trackTitle, trackArtist, trackLink };
      } catch (error) {
        logError("Error:", error);
      }
    }
    async function fetchTrackCover(url) {
      try {
        if (!url) {
          return;
        }
        const response = await fetch(url);
        if (!response.ok) {
          throw new Error("Song Cover Fetch Error");
        }
        const html = await response.text();
        const parser = new DOMParser();
        const doc = parser.parseFromString(html, "text/html");
        const coverElement = doc.querySelector(".subject__cover--album img")?.src;
        if (!coverElement) {
          return;
        }
        return coverElement;
      } catch (error) {
        logError("Error", error);
      }
    }
    const isPlaying = document.querySelector("#b_top_play.b-stop") ? 1 : 0;
    if (!isPlaying) {
      return;
    }
    const fetchedData = await fetchTrackHistory();

    const titleElem = fetchedData?.trackTitle;
    const artistElem = fetchedData?.trackArtist;
    const imageElem = fetchedData?.trackLink ? await fetchTrackCover(fetchedData.trackLink) : document.querySelector(".player__station__logo")?.src;
    const stationName = document.querySelector(".player__station__name")?.textContent || "OnlineRadioBox";
    return {
      title: titleElem,
      artist: artistElem,
      image: imageElem,
      source: stationName,
      songUrl: fetchedData?.trackLink || document.querySelector(".player__station__title a")?.href || "https://onlineradiobox.com/",
      position: 0,
    };
  },
});
