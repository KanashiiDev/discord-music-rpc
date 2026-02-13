window.registerParser({
  domain: "vk.com",
  title: "VK",
  urlPatterns: [/.*/],
  fn: async ({ accessWindow }) => {
    const ap = await accessWindow("ap.getCurrentAudio");
    if (!ap) return null;
    const progressResult = await accessWindow("ap.getCurrentProgress");
    const progress = progressResult && !progressResult.__error ? progressResult : 0;

    return {
      title: ap[3],
      artist: ap[4],
      duration: ap[5] || 0,
      timePassed: Math.floor(progress * (ap[5] || 0)),
      image: ap[14]?.split(",")[0] || null,
      songUrl: `https://vk.com/audio${ap[26]}`,
      source: "VK",
    };
  },
});
