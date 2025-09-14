registerParser({
  domain: "ashiya.radio",
  title: "Ashiya Radio",
  urlPatterns: [/.*/],
  fn: async function getSongInfo() {
    async function getStatus() {
      try {
        const res = await fetch("https://public.radio.co/stations/sc8d895604/status");
        const data = await res.json();
        const { title, artwork_url } = data.current_track;

        return { title, artwork_url };
      } catch (err) {
        console.error("Error:", err);
      }
    }
    let fetchedData = await getStatus();
    const titleElem = fetchedData?.title;
    const artistElem = fetchedData?.title;
    const coverElem = fetchedData?.artwork_url;

    return {
      title: titleElem,
      artist: artistElem,
      image: coverElem,
      source: "Ashiya Radio",
      songUrl: "https://www.ashiya.radio/",
    };
  },
});
