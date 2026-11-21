(() => {
  let lastActionTimestamp = 0;

  function isUserTyping(e) {
    const path = e.composedPath ? e.composedPath() : [e.target];
    return path.some((el) => {
      if (!el || !el.tagName) return false;
      const tag = el.tagName.toUpperCase();
      return tag === 'INPUT' || tag === 'TEXTAREA' || el.isContentEditable;
    });
  }

  function blockEventCompletely(e) {
    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation();
  }

  // Boot Modules
  window.AP_Feed.init();
  window.AP_State.init((enabled, withWave) => {
    window.AP_Feed.applyVisualState(enabled, withWave);
  });

  function clampSeekToHalfway(vid) {
    if (!vid || !vid.duration || !Number.isFinite(vid.duration)) return;
    const commitment = window.AP_State?.getCommitment();
    if (!commitment || !commitment.activeVideoId) return;

    const maxHalfway = vid.duration / 2;
    if (vid.currentTime > maxHalfway) {
      vid.currentTime = maxHalfway;
    }
  }

  // Watch SPA route changes & video completion
  let lastCheckedHref = location.href;
  setInterval(() => {
    if (location.href !== lastCheckedHref) {
      lastCheckedHref = location.href;
      window.AP_State.enforceCommitmentOnRoute();
    }

    const video = document.querySelector('video');
    if (video) {
      if (!video.dataset.apSeekBound) {
        video.dataset.apSeekBound = 'true';
        let lastKnownTime = video.currentTime || 0;

        video.addEventListener('seeking', () => {
          clampSeekToHalfway(video);
        });

        video.addEventListener('seeked', () => {
          clampSeekToHalfway(video);
        });

        video.addEventListener('timeupdate', () => {
          const commitment = window.AP_State?.getCommitment();
          if (commitment && commitment.activeVideoId && video.duration && Number.isFinite(video.duration)) {
            const maxHalfway = video.duration / 2;
            if (video.currentTime > maxHalfway && (video.seeking || video.currentTime - lastKnownTime > 2.5)) {
              video.currentTime = maxHalfway;
            }
          }
          lastKnownTime = video.currentTime;
        });
      }

      if (!video.dataset.apEndedBound) {
        video.dataset.apEndedBound = 'true';
        video.addEventListener('ended', () => {
          const commitment = window.AP_State.getCommitment();
          if (commitment) {
            const finishedId = commitment.activeVideoId;
            const videoMeta = window.AP_State.getCachedVideoContext();
            window.AP_State.releaseCurrentCommitment(finishedId);
            window.AP_Modals.showNutritionFacts(videoMeta, finishedId);
          }
        });
      }
    }
  }, 500);

  // Bridge for Laptop 3 (lockouts.js)
  window.__apContent = {
    getCommitment: () => window.AP_State.getCommitment(),
    isModalOpen: () => window.AP_Modals.isOpen(),
    openBegModal: (controlKey, context) => window.AP_Modals.open(controlKey, context),
    blockEvent: blockEventCompletely,
    saveCommitment: () => window.AP_State.saveCommitment(),
    getLastActionTs: () => lastActionTimestamp,
    setLastActionTs: (ts) => { lastActionTimestamp = ts; },
    isUserTyping,
    clampSeekToHalfway
  };
})();