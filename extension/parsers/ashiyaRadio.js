registerParser({
  domain: "ashiya.radio",
  title: "Ashiya Radio",
  urlPatterns: [/.*/],
  description: "Japanese online radio station featuring jazz and international music.",
  category: "radio",
  tags: ["jazz", "japan"],
  iframeOrigins: ["embed.radio.co"],
  fn: async function ({ iframeData }) {
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
    const fetchedData = await getStatus();
    const titleElem = fetchedData?.title;
    const artistElem = fetchedData?.title;
    const coverElem = fetchedData?.artwork_url;

    return {
      title: titleElem,
      artist: artistElem,
      image: coverElem,
      source: "Ashiya Radio",
      songUrl: "https://www.ashiya.radio/",
      isPlaying: Boolean(iframeData?.playing),
    };
  },
  iframeFn: function () {
    const btn = document.querySelector(".radioco-player #playButton.play-button.icon.icon-playerstop");
    return {
      playing: Boolean(btn),
    };
  },
});
