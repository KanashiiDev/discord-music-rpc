window.registerParser({
  domain: "vk.com",
  title: "VK",
  urlPatterns: [/.*/],
  fn: async ({ executeInMain }) => {
    return await executeInMain(() => {
      const ap = window.ap;
      if (!ap || !ap.getCurrentAudio) return null;

      const audio = ap.getCurrentAudio();
      if (!audio) return null;

      return {
        title: audio[3],
        artist: audio[4],
        duration: audio[5] || 0,
        timePassed: Math.floor((ap.getCurrentProgress?.() || 0) * (audio[5] || 0)),
        image: audio[14]?.split(",")[0] || null,
        songUrl: `https://vk.com/audio${audio[26]}`,
        source: "VK",
      };
    });
  },
});
