registerParser({
  domain: "danceradio.show",
  title: "Dance Radio",
  urlPatterns: [/.*/],
  description: "Online dance music radio station streaming current hits and '00s/'90s throwbacks 24/7.",
  category: "radio",
  tags: [],
  iframeOrigins: ["embed.radio.co"],
  fn: async function ({ iframeData }) {
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
