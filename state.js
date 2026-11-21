(() => {
  let stateLoaded = false;
  let ignoreNextStorageSync = false;
  let commitment = null;
  let lastReleasedVideoId = null;

  function createDefaultControls() {
    return {
      playback: { usesRemaining: 1, exhausted: false, session: null },
      volume: { usesRemaining: 1, exhausted: false, session: null },
      seek: { usesRemaining: 1, exhausted: false, session: null },
      fullscreen: { usesRemaining: 1, exhausted: false, session: null },
      settings: { usesRemaining: 1, exhausted: false, session: null },
      freedom: { usesRemaining: 0, exhausted: false, session: null }
    };
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
    lastReleasedVideoId = videoIdToExclude || null;
    window.AP_Modals?.close();
    saveState({
      commitmentState: null,
      lastReleasedVideoId
    });
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
    }
  }

  function scrapeCurrentVideoMetadata() {
    const titleEl =
      document.querySelector('ytd-watch-metadata h1 yt-formatted-string') ||
      document.querySelector('meta[name="title"]');
    const channelEl =
      document.querySelector('ytd-watch-metadata #channel-name a') ||
      document.querySelector('link[itemprop="name"]');
    const descEl =
      document.querySelector('ytd-watch-metadata #description-inline-expander') ||
      document.querySelector('meta[name="description"]');
    const durationEl = document.querySelector('.ytp-time-duration');

    return {
      title: (titleEl?.textContent || titleEl?.getAttribute('content') || document.title.replace(' - YouTube', '')).trim(),
      channel: (channelEl?.textContent || channelEl?.getAttribute('content') || 'Unknown Creator').trim(),
      description: (descEl?.textContent || descEl?.getAttribute('content') || '').trim().slice(0, 300),
      duration: (durationEl?.textContent || '0:00').trim()
    };
  }

  function init(onVisualChange) {
    chrome.storage.local.get(
      { mysteryShelfEnabled: false, commitmentState: null, lastReleasedVideoId: null },
      (data) => {
        onVisualChange(data.mysteryShelfEnabled, false);
        if (data.commitmentState && !data.commitmentState.controls?.playback) {
          data.commitmentState.controls = createDefaultControls();
        }
        commitment = data.commitmentState;
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
        const nextCommitment = changes.commitmentState.newValue || null;
        if (!nextCommitment && commitment?.activeVideoId && !lastReleasedVideoId) {
          lastReleasedVideoId = commitment.activeVideoId;
        }
        commitment = nextCommitment;
        if (!commitment) {
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
    scrapeCurrentVideoMetadata
  };
})();