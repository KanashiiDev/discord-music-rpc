registerParser({
  domain: "en.anison.fm",
  title: "ANISON.FM",
  urlPatterns: [/.*/],
  fn: function () {

     // Calculate Duration
    return {
      title: getText(".track_info span:last-child"),
      artist: getText(".track_info span:first-child"),
      image: getImage("#current_poster_img"),
      source: "ANISON.FM",
      songUrl: location.href,
      position: 0,
      duration: getText(".on_air_text .time #duration"),
      progress: 0,
    };
  },
});
