registerParser({
  domain: "radioparadise.com",
  title: "Radio Paradise",
  urlPatterns: [/.*/],
  fn: function () {
    const titleElem = getText(".player-title");
    const artistElem = getText(".player-artist");
    const coverElem = getImage(".player-cover");
    const currentChannel = getText(".channel-selector div");
    const channelMap = {
      "The Main Mix": "main-mix",
      "The Mellow Mix": "mellow-mix",
      "RP Rock Mix": "rock-mix",
      "RP Global Mix": "global-mix",
      "Beyond...": "beyond",
      Serenity: "serenity",
    };

    let sourceElem = "https://radioparadise.com/listen/channels/";
    sourceElem += channelMap[currentChannel] || "";

    return {
      title: titleElem,
      artist: artistElem,
      image: coverElem,
      source: "Radio Paradise",
      songUrl: sourceElem,
    };
  },
});
