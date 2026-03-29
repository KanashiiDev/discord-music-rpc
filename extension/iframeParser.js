// Works only in iframe frames.
// Looks at window.iframeParsers defined by compiledIframeParsers.js,
// runs the matching parser, and transmits the data to the main frame via the background.

function getVideoInfo() {
  const players = {
    jwplayer: () => {
      try {
        const player = window.jwplayer?.();
        if (!player?.getState) return null;

        const state = player.getState();
        if (state === "idle") return null;

        const duration = player.getDuration?.();
        return {
          duration: isValidDuration(duration) ? duration : null,
          currentTime: player.getPosition?.() ?? null,
          paused: state !== "playing",
          source: "jwplayer",
        };
      } catch (e) {
        console.warn("JWPlayer error:", e);
        return null;
      }
    },

    videojs: () => {
      try {
        const vjsPlayers = window.videojs?.players;
        if (!vjsPlayers) return null;

        for (const id in vjsPlayers) {
          const player = vjsPlayers[id];
          if (player?.readyState?.() > 0) {
            const duration = player.duration?.();
            return {
              duration: isValidDuration(duration) ? duration : null,
              currentTime: player.currentTime?.() ?? null,
              paused: player.paused?.() ?? true,
              source: "videojs",
            };
          }
        }
        return null;
      } catch (e) {
        console.warn("VideoJS error:", e);
        return null;
      }
    },

    plyr: () => {
      try {
        const plyrPlayers = window.Plyr?.setup?.() || window.plyrPlayers || [];
        for (const player of plyrPlayers) {
          if (!player || typeof player !== "object") continue;

          const duration = player.duration;
          const currentTime = player.currentTime;
          const paused = player.paused;

          if (duration == null && currentTime == null) continue;

          return {
            duration: isValidDuration(duration) ? duration : null,
            currentTime: currentTime ?? null,
            paused: paused,
            source: "plyr",
          };
        }
        return null;
      } catch (e) {
        console.warn("Plyr error:", e);
        return null;
      }
    },

    flowplayer: () => {
      try {
        const players = document.querySelectorAll(".flowplayer");
        for (const container of players) {
          const player = window.flowplayer?.(container);
          if (!player) continue;

          const duration = player.video?.duration;
          const currentTime = player.video?.time;
          const paused = !player.playing;

          if (duration == null && currentTime == null) continue;

          return {
            duration: isValidDuration(duration) ? duration : null,
            currentTime: currentTime ?? null,
            paused: paused,
            source: "flowplayer",
          };
        }
        return null;
      } catch (e) {
        console.warn("Flowplayer error:", e);
        return null;
      }
    },

    html5: () => {
      try {
        const videos = document.querySelectorAll("video");
        let bestVideo = null;
        let bestScore = -1;

        videos.forEach((video) => {
          if (!(video instanceof HTMLVideoElement)) return;

          const rect = video.getBoundingClientRect();
          const area = rect.width * rect.height;
          let score = area > 0 ? area : 0;

          if (!video.paused) score += 1000;
          if (video.currentTime > 0) score += 100;
          if (video.readyState >= 2) score += 50;

          if (score > bestScore) {
            bestScore = score;
            bestVideo = video;
          }
        });

        if (!bestVideo) return null;

        return {
          duration: isValidDuration(bestVideo.duration) ? bestVideo.duration : null,
          currentTime: bestVideo.currentTime,
          paused: bestVideo.paused,
          source: "html5",
        };
      } catch (e) {
        console.warn("HTML5 video error:", e);
        return null;
      }
    },
  };

  const isValidDuration = (d) => Number.isFinite(d) && d > 0;

  const playerOrder = ["jwplayer", "videojs", "plyr", "flowplayer", "html5"];

  for (const name of playerOrder) {
    try {
      const result = players[name]?.();
      if (result && (result.duration !== null || result.currentTime !== null)) {
        if (result.currentTime !== null && result.duration !== null) {
          result.currentTime = Math.min(Math.max(0, result.currentTime), result.duration);
        }

        getVideoInfo._lastSuccess = { result, timestamp: Date.now(), source: name };
        return result;
      }
    } catch (e) {
      console.warn(`Player ${name} failed:`, e);
    }
  }

  if (getVideoInfo._lastSuccess && Date.now() - getVideoInfo._lastSuccess.timestamp < 6000) {
    console.warn("Using cached video info from", getVideoInfo._lastSuccess.source);
    return structuredClone(getVideoInfo._lastSuccess.result);
  }

  return null;
}

browser.runtime.onMessage.addListener(async (msg) => {
  if (msg?.type === "FETCH_IFRAME_DATA" && msg.key) {
    const { key } = msg;
    const entry = window.iframeParsers?.[key];
    if (!entry?.fn) return;

    const iframeHostname = location.hostname.replace(/^www\./i, "").toLowerCase();

    if (entry.match) {
      const matches = [entry.match].flat();
      if (!matches.some((h) => iframeHostname.includes(h.toLowerCase()))) return;
    }

    const data = await entry.fn();
    if (data == null) return;

    browser.runtime
      .sendMessage({
        type: "IFRAME_DATA",
        key,
        origin: iframeHostname,
        href: location.href,
        data,
      })
      .catch(() => {});
  }
});
