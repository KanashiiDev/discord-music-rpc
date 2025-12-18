registerParser({
  domain: "asiadreamradio.torontocast.stream",
  title: "Asia Dream Radio",
  urlPatterns: [/stations.*/],
  fn: async function getSongInfo() {
    function isoToTimeString(iso) {
      const match = iso?.match(/PT(?:(\d+)M)?(?:(\d+(?:\.\d+)?)S)?/);
      const minutes = match?.[1] ? parseInt(match[1]) : 0;
      const seconds = match?.[2] ? parseFloat(match[2]) : 0;
      const totalSeconds = Math.round(minutes * 60 + seconds);
      const finalMinutes = Math.floor(totalSeconds / 60);
      const finalSeconds = totalSeconds % 60;
      return `${finalMinutes}:${finalSeconds.toString().padStart(2, "0")}`;
    }

    async function fetchSongInfo() {
      const iframeSrc = document.querySelector("iframe[src*=samcloudmedia]")?.src;
      if (!iframeSrc) return;

      const url = new URL(iframeSrc);

      let sid = url.searchParams.get("sid");
      let token = url.searchParams.get("token");

      if (!sid || !token) {
        const hashParams = new URLSearchParams(url.hash.substring(1));
        sid ??= hashParams.get("sid");
        token ??= hashParams.get("token");
      }

      if (!sid || !token) return;

      const fetchUrl = `https://listen.samcloud.com/webapi/station/${sid}/history/npe?token=${token}&format=json`;

      try {
        const response = await fetch(fetchUrl);
        if (!response.ok) throw new Error(`HTTP Error: ${response.status}`);

        const data = await response.json();
        const { Title, Artist, Duration, Picture } = data?.m_Item2 || {};

        if (Title) {
          return {
            title: Title,
            artist: Artist,
            duration: isoToTimeString(Duration),
            cover: Picture,
          };
        } else {
          console.warn("Song Info not found.");
          return null;
        }
      } catch (error) {
        logError("Fetch failed:", error.message);
        return null;
      }
    }

    function getPageSongInfo() {
      const main = document.querySelector(".sc-status-widget");
      if (main) {
        const t = main.querySelector(".track_st_track-meta").textContent;
        const a = main.querySelector(".track_st_track-meta").textContent;
        const c = main.querySelector("img").src;
        const p = main.querySelector(".track_st_progress-text")?.textContent;
        return { title: t, artist: a, cover: c, duration: p };
      }
      return null;
    }

    let data = await fetchSongInfo();
    if (!data) {
      data = getPageSongInfo();
      if (!data) {
        return;
      }
    }

    // Station
    let station = "Asia Dream Radio";
    document.querySelectorAll(".paraWrap").forEach((e) => {
      if (e.textContent.includes("Station")) {
        station = `${station}${e.textContent.replace("Station:", "")}`;
      }
    });

    return {
      title: data.title,
      artist: data.artist,
      image: data.cover,
      source: station,
      songUrl: location.href,
      duration: data.duration?.trim(),
    };
  },
});
