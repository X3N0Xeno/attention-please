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

  function executePlaybackAction() {
    lastActionTimestamp = Date.now();
    const video = document.querySelector('video');
    if (!video) return;
    if (video.paused) {
      video.play().catch(() => {});
    } else {
      video.pause();
    }
  }

  function handlePlaybackToggle(e, isKeyRepeat = false) {
    const video = document.querySelector('video');
    const commitment = window.AP_State.getCommitment();
    if (!video || !window.AP_State.getVideoIdFromUrl(location.href) || !commitment) return;

    if (!commitment.controls.playback) {
      commitment.controls.playback = { usesRemaining: 1, exhausted: false, session: null };
    }
    const state = commitment.controls.playback;

    if (window.AP_Modals.isOpen() || isKeyRepeat) {
      blockEventCompletely(e);
      return;
    }

    const now = Date.now();
    if (now - lastActionTimestamp < 400) {
      blockEventCompletely(e);
      return;
    }

    if (state.usesRemaining > 0) {
      lastActionTimestamp = now;
      state.usesRemaining--;
      window.AP_State.saveCommitment();
      return;
    }

    blockEventCompletely(e);
    window.AP_Modals.open('playback', executePlaybackAction);
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
          const videoMeta = window.AP_State.scrapeCurrentVideoMetadata();
          window.AP_State.releaseCurrentCommitment(finishedId);
          window.AP_Modals.showNutritionFacts(videoMeta, finishedId);
        }
      });
    }
  }, 500);

  // Mouse & Keyboard Playback Gates + Modal Isolation
  window.addEventListener(
    'click',
    (e) => {
      if (window.AP_Modals.isOpen() || !(e.target instanceof Element)) return;
      if (e.target.closest('.ytp-play-button, video.html5-main-video')) {
        handlePlaybackToggle(e, false);
      }
    },
    true
  );

  ['keydown', 'keypress', 'keyup'].forEach((evtType) => {
    window.addEventListener(
      evtType,
      (e) => {
        if (window.AP_Modals.isOpen()) {
          const hostEl = window.AP_Modals.getHost();
          const path = e.composedPath ? e.composedPath() : [];
          if (hostEl && path.includes(hostEl)) return;
          blockEventCompletely(e);
          return;
        }

        const commitment = window.AP_State.getCommitment();
        if (isUserTyping(e) || !commitment) return;

        if (e.code === 'Space' || e.key.toLowerCase() === 'k') {
          if (evtType === 'keydown') {
            handlePlaybackToggle(e, e.repeat);
          } else if ((commitment.controls.playback?.usesRemaining ?? 0) <= 0) {
            blockEventCompletely(e);
          }
        }
      },
      true
    );
  });

  // Public Bridge for Laptop 3 (lockouts.js)
  window.AP_Modal = {
    open: (controlName, onGranted) => window.AP_Modals.open(controlName, onGranted),
    isOpen: () => window.AP_Modals.isOpen(),
    getCommitment: () => window.AP_State.getCommitment(),
    saveCommitment: () => window.AP_State.saveCommitment()
  };
})();