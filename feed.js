(() => {
  function triggerWipeWave() {
    let wave = document.getElementById('ap-wipe-wave');
    if (!wave) {
      wave = document.createElement('div');
      wave.id = 'ap-wipe-wave';
      document.documentElement.appendChild(wave);
    }
    wave.classList.remove('animate');
    void wave.offsetWidth;
    wave.classList.add('animate');
  }

  function applyVisualState(enabled, withWave = false) {
    if (withWave) triggerWipeWave();
    document.documentElement.classList.toggle('ap-mystery-on', Boolean(enabled));
  }

  function isLiveCard(cardOrAnchor) {
    const container =
      cardOrAnchor.closest(
        'ytd-rich-item-renderer, ytd-video-renderer, ytd-compact-video-renderer, yt-lockup-view-model, ytd-playlist-panel-video-renderer'
      ) || cardOrAnchor;

    if (
      container.querySelector(
        '[badge-style="BADGE_STYLE_TYPE_LIVE_NOW_ALTERNATE"], .badge-style-type-live-now-alternate, ytd-thumbnail-overlay-time-status-renderer[overlay-style="LIVE"]'
      )
    ) {
      return true;
    }

    const badges = container.querySelectorAll(
      'badge-shape, .badge-shape-wiz, ytd-thumbnail-overlay-time-status-renderer, yt-thumbnail-overlay-badge-view-model'
    );
    for (const badge of badges) {
      const txt = badge.textContent?.trim().toUpperCase() || '';
      if (txt === 'LIVE' || txt.includes('WATCHING')) return true;
    }
    return false;
  }

  function pickRandomVisibleVideoUrl(excludeVideoId) {
    const anchors = document.querySelectorAll('a[href*="/watch?v="]');
    const lastReleased = window.AP_State.getLastReleasedVideoId();
    const candidates = new Set();

    anchors.forEach((a) => {
      if (isLiveCard(a)) return;
      const id = window.AP_State.getVideoIdFromUrl(a.href);
      if (id && id !== excludeVideoId && id !== lastReleased) {
        candidates.add(`https://www.youtube.com/watch?v=${id}`);
      }
    });

    const pool = Array.from(candidates);
    return pool.length ? pool[Math.floor(Math.random() * pool.length)] : null;
  }

  function init() {
    ['mouseenter', 'mouseover', 'pointerenter', 'pointerover'].forEach((evtName) => {
      document.addEventListener(
        evtName,
        (e) => {
          if (!document.documentElement.classList.contains('ap-mystery-on')) return;
          if (!(e.target instanceof Element)) return;
          const card = e.target.closest(
            'ytd-rich-item-renderer, ytd-video-renderer, ytd-compact-video-renderer, yt-lockup-view-model, ytm-shorts-lockup-view-model, ytd-reel-item-renderer'
          );
          if (card) e.stopPropagation();
        },
        true
      );
    });

    function handleMysteryFeedClick(e) {
      if (window.AP_Modals.isOpen()) return;
      if (!document.documentElement.classList.contains('ap-mystery-on')) return;
      if (!(e.target instanceof Element)) return;

      const isEndscreenCard = e.target.closest(
        '.html5-endscreen, .ytp-videowall-still, .ytp-modern-videowall-still, .ytp-ce-element'
      );
      if (!isEndscreenCard && e.target.closest('#movie_player, ytd-masthead, #guide')) return;

      const videoCard = e.target.closest(
        'ytd-rich-item-renderer, ytd-video-renderer, ytd-compact-video-renderer, yt-lockup-view-model, ytm-shorts-lockup-view-model, ytd-reel-item-renderer, ytd-playlist-panel-video-renderer, .ytp-videowall-still, .ytp-modern-videowall-still'
      );
      const link = e.target.closest('a[href*="/watch?v="], a[href*="/shorts/"]');
      if (!videoCard && !link) return;

      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();

      if (e.button !== 0 && e.button !== 1) return;

      const commitment = window.AP_State.getCommitment();
      if (commitment && commitment.activeVideoId) {
        location.assign(`https://www.youtube.com/watch?v=${commitment.activeVideoId}`);
        return;
      }

      const targetHref = link
        ? link.href
        : videoCard.querySelector('a[href*="/watch?v="], a[href*="/shorts/"]')?.href;
      const clickedId = targetHref ? window.AP_State.getVideoIdFromUrl(targetHref) : null;
      const randomUrl =
        pickRandomVisibleVideoUrl(clickedId) ||
        (clickedId ? `https://www.youtube.com/watch?v=${clickedId}` : null);

      if (randomUrl) location.assign(randomUrl);
    }

    window.addEventListener('click', handleMysteryFeedClick, true);
    window.addEventListener('auxclick', handleMysteryFeedClick, true);
  }

  window.AP_Feed = {
    init,
    applyVisualState,
    pickRandomVisibleVideoUrl
  };
})();