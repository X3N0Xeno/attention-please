(() => {
  let stateLoaded = false;
  let ignoreNextStorageSync = false;
  let commitment = null;
  let lastReleasedVideoId = null;
  let cachedVideoContext = null;
  let cachingForVideoId = null;

  function createDefaultControls() {
    return {
      playback:   { usesRemaining: 1, exhausted: false, session: null, isPremium: false },
      volume:     { usesRemaining: 1, exhausted: false, session: null, isPremium: false },
      seek:       { usesRemaining: 1, exhausted: false, session: null, isPremium: false },
      fullscreen: { usesRemaining: 1, exhausted: false, session: null, isPremium: false },
      theater:    { usesRemaining: 1, exhausted: false, session: null, isPremium: false },
      settings:   { usesRemaining: 1, exhausted: false, session: null, isPremium: false },
      freedom:    { usesRemaining: 0, exhausted: false, session: null, isPremium: false }
    };
  }

  function migrateControls(savedState) {
    if (!savedState) return null;
    const defaults = createDefaultControls();
    if (!savedState.controls) {
      savedState.controls = defaults;
    } else {
      for (const key of Object.keys(defaults)) {
        if (!savedState.controls[key]) {
          savedState.controls[key] = defaults[key];
        }
      }
    }
    return savedState;
  }

  function getVideoIdFromUrl(urlStr) {
    try {
      const u = new URL(urlStr, location.origin);
      if (u.pathname === '/watch') return u.searchParams.get('v');
      if (u.pathname.startsWith('/shorts/')) {
        return u.pathname.split('/shorts/')[1]?.split('/')[0] || null;
      }
    } catch (_) {}
    return null;
  }

  function saveState(updates) {
    ignoreNextStorageSync = true;
    const payload = JSON.parse(JSON.stringify(updates));
    chrome.storage.local.set(payload, () => {
      setTimeout(() => { ignoreNextStorageSync = false; }, 120);
    });
  }

  function releaseCurrentCommitment(videoIdToExclude) {
    commitment = null;
    cachedVideoContext = null;
    cachingForVideoId = null;
    lastReleasedVideoId = videoIdToExclude || null;
    window.AP_Modals?.close();
    saveState({
      commitmentState: null,
      lastReleasedVideoId
    });
  }

  function ensureVideoContextCached(videoId) {
    if (!videoId) return;
    if (cachedVideoContext?.videoId === videoId || cachingForVideoId === videoId) return;
    cachingForVideoId = videoId;
    const scrape = typeof getVideoContext === 'function'
      ? getVideoContext()
      : Promise.resolve({
          videoId,
          title: document.title.replace(/\s*-\s*YouTube\s*$/, '').trim(),
          channel: 'Unknown Creator',
          description: '',
          comments: []
        });
    scrape.then((ctx) => {
      if (cachingForVideoId !== videoId) return;
      const duration = (document.querySelector('.ytp-time-duration')?.textContent || '0:00').trim();
      cachedVideoContext = {
        videoId: ctx.videoId || videoId,
        title: ctx.title || document.title.replace(/\s*-\s*YouTube\s*$/, '').trim(),
        channel: ctx.channel || 'Unknown Creator',
        description: ctx.description || '',
        comments: Array.isArray(ctx.comments) ? ctx.comments : [],
        duration
      };
    }).catch(() => {
      if (cachingForVideoId === videoId) cachingForVideoId = null;
    });
  }

  function getCachedVideoContext() {
    const currentVideoId = getVideoIdFromUrl(location.href) || '';
    const duration = (document.querySelector('.ytp-time-duration')?.textContent || '').trim();
    if (cachedVideoContext && (!currentVideoId || cachedVideoContext.videoId === currentVideoId)) {
      if (duration && (!cachedVideoContext.duration || cachedVideoContext.duration === '0:00')) {
        cachedVideoContext.duration = duration;
      }
      return { ...cachedVideoContext };
    }
    return {
      videoId: currentVideoId,
      title: document.title.replace(/\s*-\s*YouTube\s*$/, '').trim(),
      channel: 'Unknown Creator',
      description: '',
      comments: [],
      duration: duration || '0:00'
    };
  }

  function enforceCommitmentOnRoute() {
    if (!stateLoaded) return;
    const currentVideoId = getVideoIdFromUrl(location.href);

    if (currentVideoId && lastReleasedVideoId && currentVideoId !== lastReleasedVideoId) {
      lastReleasedVideoId = null;
      saveState({ lastReleasedVideoId: null });
    }

    if (commitment && commitment.activeVideoId) {
      if (currentVideoId !== commitment.activeVideoId) {
        location.replace(`https://www.youtube.com/watch?v=${commitment.activeVideoId}`);
      } else {
        ensureVideoContextCached(commitment.activeVideoId);
      }
      return;
    }

    const mysteryOn = document.documentElement.classList.contains('ap-mystery-on');
    const video = document.querySelector('video');
    const isFinished = Boolean(video && video.ended);

    if (mysteryOn && currentVideoId && currentVideoId !== lastReleasedVideoId && !isFinished) {
      commitment = {
        activeVideoId: currentVideoId,
        controls: createDefaultControls()
      };
      saveState({ commitmentState: commitment });
      ensureVideoContextCached(currentVideoId);
    }
  }

  function init(onVisualChange) {
    chrome.storage.local.get(
      { mysteryShelfEnabled: false, commitmentState: null, lastReleasedVideoId: null },
      (data) => {
        onVisualChange(data.mysteryShelfEnabled, false);
        commitment = migrateControls(data.commitmentState);
        lastReleasedVideoId = data.lastReleasedVideoId || null;
        stateLoaded = true;
        enforceCommitmentOnRoute();
      }
    );

    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== 'local') return;

      if (changes.mysteryShelfEnabled) {
        onVisualChange(changes.mysteryShelfEnabled.newValue, true);
        enforceCommitmentOnRoute();
      }

      if (changes.lastReleasedVideoId && !ignoreNextStorageSync) {
        lastReleasedVideoId = changes.lastReleasedVideoId.newValue || null;
      }

      if (changes.commitmentState && !ignoreNextStorageSync) {
        const nextCommitment = migrateControls(changes.commitmentState.newValue || null);
        if (!nextCommitment && commitment?.activeVideoId && !lastReleasedVideoId) {
          lastReleasedVideoId = commitment.activeVideoId;
        }
        commitment = nextCommitment;
        if (!commitment) {
          cachedVideoContext = null;
          cachingForVideoId = null;
          window.AP_Modals?.close();
        } else {
          enforceCommitmentOnRoute();
        }
      }
    });
  }

  window.AP_State = {
    init,
    getVideoIdFromUrl,
    getCommitment: () => commitment,
    getLastReleasedVideoId: () => lastReleasedVideoId,
    saveCommitment: () => saveState({ commitmentState: commitment }),
    releaseCurrentCommitment,
    enforceCommitmentOnRoute,
    getCachedVideoContext
  };
})();