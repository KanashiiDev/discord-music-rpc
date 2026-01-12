registerParser({
  domain: "danceradio.show",
  title: "Dance Radio",
  urlPatterns: [/.*/],
  fn: async function getSongInfo() {
    async function getStatus() {
      try {
        const res = await fetch("https://public.radio.co/stations/s3dccdde7b/status");
        const data = await res.json();
        const { title, artwork_url } = data.current_track;

        return { title, artwork_url };
      } catch (err) {
        console.error("Error:", err);
      }
    }
    const fetchedData = await getStatus();
    const titleElem = fetchedData?.title;
    const artistElem = fetchedData?.title;
    const coverElem = fetchedData?.artwork_url;

    return {
      title: titleElem,
      artist: artistElem,
      image: coverElem,
      source: "Dance Radio",
      songUrl: "https://danceradio.show/",
    };
  },
});
