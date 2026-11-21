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

  // Watch SPA route changes & video completion
  let lastCheckedHref = location.href;
  setInterval(() => {
    if (location.href !== lastCheckedHref) {
      lastCheckedHref = location.href;
      window.AP_State.enforceCommitmentOnRoute();
    }

    const video = document.querySelector('video');
    if (video && !video.dataset.apEndedBound) {
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
    clampSeekToHalfway: (vid) => {
      if (vid && Number.isFinite(vid.duration) && vid.duration > 0 && vid.currentTime > vid.duration * 0.5) {
        vid.currentTime = vid.duration * 0.5;
      }
    },
    isUserTyping
  };
})();