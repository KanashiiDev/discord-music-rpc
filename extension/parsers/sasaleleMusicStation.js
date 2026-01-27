registerParser({
  domain: "basic.pp.ua",
  title: "Sasalele Music Station",
  urlPatterns: [/^\/$/],
  fn: async function () {
    const meta = getText("#metadataDisplay").split(" - ");
    let artist = meta[0] || "";
    let title = meta[1] || "";
    let image = getImage(".playing-info #ip");
    let stationName = getText(".playing-info #nowPlaying .homepagelink") || "Sasalele Music Station";
    const stationLink = getText(".playing-info #nowPlaying .homepagelink", { attr: "href" }) || "";

    if (!title) {
      title = stationName || "Listening..";
      stationName = "Sasalele Music Station";
    }
    if (artist === "Visit radio's homepage for playing info" || artist === "Stream not active" || artist === "Unknown" || artist === "Loading...") {
      artist = -1;
    }

    if (/\.webp(\?.*)?$/i.test(image)) {
      image = "https://favicons.seadfeng.workers.dev/basic.pp.ua.ico";
    }

    return {
      title,
      artist,
      image,
      source: stationName,
      songUrl: stationLink,
      buttons: [
        {
          link: "https://basic.pp.ua/",
          text: "Sasalele Music Station",
        },
      ],
    };
  },
});
