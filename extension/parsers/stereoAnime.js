registerParser({
  domain: "stereoanime.net",
  title: "Stereo Anime",
  urlPatterns: [/.*/],
  fn: async function () {
    try {
      const response = await fetch("https://server.stereoanime.net/api/nowplaying/stereoanime");
      if (!response.ok) throw new Error(`HTTP Error: ${response.status}`);

      const data = await response.json();
      const { title, artist, art } = data?.now_playing.song || {};
      const { elapsed, duration } = data?.now_playing || {};

      return {
        title,
        artist,
        image: art,
        source: "Stereo Anime",
        songUrl: "https://www.stereoanime.net/",
        timePassed: elapsed,
        duration,
      };
    } catch (e) {
      console.error("Stereo Anime parse error:", e);
      return null;
    }
  },
});
