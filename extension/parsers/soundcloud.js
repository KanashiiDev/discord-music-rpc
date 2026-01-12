registerParser({
  domain: "soundcloud.com",
  title: "Soundcloud",
  urlPatterns: [/.*/],
  fn: async function () {
    if (document.querySelector(".fullScreenOverlay")) return;
    async function getValidImageUrl(baseUrl, timeoutMs = 3000) {
      const tryImageSizes = ["t120x120", "t200x200", "t50x50", "t500x500", "original"];
      const urlPattern = /-(t\d+x\d+|original)\.(jpg|png)$/;
      if (!baseUrl) return null;

      for (const size of tryImageSizes) {
        const imgUrl = baseUrl.replace(urlPattern, `-${size}.jpg`);
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), timeoutMs);

        try {
          const res = await fetch(imgUrl, {
            method: "HEAD",
            signal: controller.signal,
          });

          clearTimeout(timeout);

          if (res.ok) return imgUrl;
        } catch (_) {
          clearTimeout(timeout);
        }
      }

      return null;
    }
    const title = getText(".playbackSoundBadge__titleLink span:last-child");
    let artist = document.querySelector(".playbackSoundBadge__lightLink")?.getAttribute("title");
    if (!artist || artist.length < 2) {
      artist = document.querySelector(".playbackSoundBadge__lightLink")?.getAttribute("href")?.substring(1);
    }

    const url = document.querySelector(".playbackSoundBadge__titleLink")?.href;
    const imageBaseUrl = getImage(".playbackSoundBadge span");
    const image = await getValidImageUrl(imageBaseUrl);

    const timePassed = getText(".playbackTimeline__timePassed span:nth-child(2)");
    const duration = getText(".playbackTimeline__duration span:nth-child(2)");

    return {
      title,
      artist,
      image,
      timePassed,
      duration,
      source: "SoundCloud",
      songUrl: url,
    };
  },
});
