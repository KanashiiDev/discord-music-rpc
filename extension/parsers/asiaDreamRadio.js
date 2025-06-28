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
      const iframe = document.querySelector("iframe");
      if (!iframe) return;

      const iframeSrc = iframe.src;
      const params = new URLSearchParams(iframeSrc.split("?")[1]);
      const sid = params.get("sid");
      const token = params.get("token");

      if (!sid || !token) return;

      const url = `https://listen.samcloud.com/webapi/station/${sid}/history/npe?token=${token}&format=json`;

      try {
        const response = await fetch(url);
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
        console.error("Fetch failed:", error.message);
        return null;
      }
    }

    try {
      const isPlaying = document.querySelector("#button_play_stop-1.active");
      if (!isPlaying) {
        return;
      }
      const data = await fetchSongInfo();
      if (!data) {
        return;
      }
      const durationText = data.duration?.trim();

      return {
        title: data.title,
        artist: data.artist,
        image: data.cover,
        source: "Asia Dream Radio",
        songUrl: location.href,
        duration: durationText,
      };
    } catch (e) {
      console.error("Asia Dream Radio parser error:", e);
      return null;
    }
  },
});
