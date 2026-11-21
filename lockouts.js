(() => {
  const CONTROL_DEFS = {
    playback: { label: 'Play / Pause', startingUses: 1, isPremium: false, flavor: 'default' },
    volume: { label: 'Volume Control', startingUses: 1, isPremium: false, flavor: 'volume' },
    seek: { label: 'Seek / Scrub', startingUses: 1, isPremium: false, flavor: 'default' },
    fullscreen: { label: 'Fullscreen Mode', startingUses: 1, isPremium: false, flavor: 'masochism' },
    theater: { label: 'Theatre Mode', startingUses: 1, isPremium: false, flavor: 'default' },
    settings: { label: 'Settings / Speed / Captions', startingUses: 1, isPremium: false, flavor: 'settings' }
  };

  const CONTROL_SELECTORS = {
    playback: ['.ytp-play-button'],
    volume: [
      '.ytp-mute-button',
      '.ytp-volume-panel',
      '.ytp-volume-slider',
      '.ytp-volume-slider-handle',
      '.ytp-volume-area'
    ],
    seek: [
      '.ytp-progress-bar',
      '.ytp-progress-bar-container',
      '.ytp-chapters-container',
      '.ytp-scrubber-container',
      '.ytp-scrubber-button'
    ],
    fullscreen: ['.ytp-fullscreen-button'],
    theater: ['.ytp-size-button'],
    settings: ['.ytp-settings-button', '.ytp-subtitles-button']
  };

  function getControlForElement(target) {
    if (!(target instanceof Element)) return null;
    for (const [controlKey, selectors] of Object.entries(CONTROL_SELECTORS)) {
      for (const sel of selectors) {
        if (target.closest(sel)) return controlKey;
      }
    }
    if (target.closest('video.html5-main-video')) return 'playback';
    return null;
  }

  function getBridge() {
    return window.__apContent || null;
  }

  function getCurrentVideoId() {
    return window.AP_State?.getVideoIdFromUrl(location.href) || null;
  }

  function isEventInsideModal(e) {
    if (!e) return false;
    const path = e.composedPath ? e.composedPath() : [e.target];
    return path.some((el) => {
      if (!el) return false;
      if (
        el.id === 'ap-beg-host' ||
        el.id === 'ap-nutrition-host' ||
        el.id === 'modalBox' ||
        el.id === 'pleaInput' ||
        el.id === 'sendBtn' ||
        el.id === 'dismissBtn'
      ) {
        return true;
      }
      if (el.tagName && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable)) {
        return true;
      }
      return false;
    });
  }

  function handleControlAction(controlKey, e, isKeyRepeat = false) {
    const bridge = getBridge();
    if (!bridge) return;

    const commitment = bridge.getCommitment();
    if (!commitment || !getCurrentVideoId()) return;

    const def = CONTROL_DEFS[controlKey] || {
      label: controlKey,
      startingUses: 1,
      isPremium: false,
      flavor: 'default'
    };

    if (!commitment.controls[controlKey]) {
      commitment.controls[controlKey] = {
        usesRemaining: def.startingUses,
        exhausted: false,
        session: null
      };
    }

    const state = commitment.controls[controlKey];

    if (isKeyRepeat || bridge.isModalOpen()) {
      if (e) bridge.blockEvent(e);
      return;
    }

    if (state.usesRemaining > 0) {
      bridge.setLastActionTs(Date.now());
      state.usesRemaining--;
      bridge.saveCommitment();
      return;
    }

    if (e) bridge.blockEvent(e);

    const now = Date.now();
    if (now - bridge.getLastActionTs() < 350) return;
    bridge.setLastActionTs(now);

    bridge.openBegModal(controlKey, {
      label: def.label,
      flavor: def.flavor,
      isPremium: def.isPremium
    });
  }

  // Multi-phase pointer & mouse interceptors
  ['pointerdown', 'mousedown', 'click'].forEach((evtType) => {
    window.addEventListener(
      evtType,
      (e) => {
        if (isEventInsideModal(e)) return;

        const bridge = getBridge();
        if (!bridge) return;

        if (bridge.isModalOpen()) {
          bridge.blockEvent(e);
          return;
        }

        const controlKey = getControlForElement(e.target);
        if (!controlKey) return;

        const commitment = bridge.getCommitment();
        if (!commitment || !getCurrentVideoId()) return;

        const state = commitment.controls[controlKey];
        const isLocked = !state || state.usesRemaining <= 0;

        if (isLocked) {
          bridge.blockEvent(e);
          if (evtType === 'pointerdown' || evtType === 'click') {
            handleControlAction(controlKey, e, false);
          }
        } else if (evtType === 'click') {
          handleControlAction(controlKey, e, false);
        }
      },
      true
    );
  });

  // Double-click video surface -> Fullscreen guard
  window.addEventListener(
    'dblclick',
    (e) => {
      if (isEventInsideModal(e)) return;
      const bridge = getBridge();
      if (!bridge) return;
      const commitment = bridge.getCommitment();
      if (!commitment || !getCurrentVideoId()) return;

      if (e.target instanceof Element && e.target.closest('video, #movie_player')) {
        const state = commitment.controls.fullscreen;
        if (!state || state.usesRemaining <= 0) {
          bridge.blockEvent(e);
        }
        handleControlAction('fullscreen', e, false);
      }
    },
    true
  );

  // Mouse wheel volume guard
  window.addEventListener(
    'wheel',
    (e) => {
      if (isEventInsideModal(e)) return;

      const bridge = getBridge();
      if (!bridge) return;
      const commitment = bridge.getCommitment();
      if (!commitment || !getCurrentVideoId()) return;

      if (e.target instanceof Element && e.target.closest('.ytp-volume-area, .ytp-volume-panel, .ytp-mute-button')) {
        const state = commitment.controls.volume;
        if (!state || state.usesRemaining <= 0) {
          bridge.blockEvent(e);
        }
        handleControlAction('volume', e, false);
      }
    },
    { capture: true, passive: false }
  );

  // Keyboard interceptor
  ['keydown', 'keypress', 'keyup'].forEach((evtType) => {
    window.addEventListener(
      evtType,
      (e) => {
        if (isEventInsideModal(e)) return;

        const bridge = getBridge();
        if (!bridge || bridge.isUserTyping(e)) return;

        if (bridge.isModalOpen()) {
          e.stopPropagation();
          e.stopImmediatePropagation();
          if (evtType !== 'keyup') e.preventDefault();
          return;
        }

        const commitment = bridge.getCommitment();
        if (!commitment || !getCurrentVideoId()) return;

        const key = e.key.toLowerCase();
        const code = e.code;

        if (key === 'i') {
          bridge.blockEvent(e);
          return;
        }

        let matchedControl = null;
        if (code === 'Space' || key === 'k') {
          matchedControl = 'playback';
        } else if (key === 'm' || key === 'arrowup' || key === 'arrowdown') {
          matchedControl = 'volume';
        } else if (
          key === 'arrowleft' ||
          key === 'arrowright' ||
          key === 'j' ||
          key === 'l' ||
          (code.startsWith('Digit') && !e.ctrlKey && !e.metaKey && !e.altKey)
        ) {
          matchedControl = 'seek';
        } else if (key === 'f') {
          matchedControl = 'fullscreen';
        } else if (key === 't') {
          matchedControl = 'theater';
        } else if (key === 'c' || key === '<' || key === '>') {
          matchedControl = 'settings';
        }

        if (!matchedControl) return;

        const state = commitment.controls[matchedControl];
        const isLocked = !state || state.usesRemaining <= 0;

        if (isLocked) {
          bridge.blockEvent(e);
          if (evtType === 'keydown') {
            handleControlAction(matchedControl, e, e.repeat);
          }
        } else if (evtType === 'keydown') {
          handleControlAction(matchedControl, e, e.repeat);
        }
      },
      true
    );
  });

  // Autoplay / Next-button blocker
  window.addEventListener(
    'click',
    (e) => {
      if (isEventInsideModal(e)) return;
      const bridge = getBridge();
      if (!bridge || !bridge.getCommitment()) return;
      if (!(e.target instanceof Element)) return;
      if (e.target.closest('.ytp-autonav-toggle-button, .ytp-next-button')) {
        bridge.blockEvent(e);
      }
    },
    true
  );

  setInterval(() => {
    const bridge = getBridge();
    if (!bridge || !bridge.getCommitment()) return;
    const watchFlexy = document.querySelector('ytd-watch-flexy');
    if (watchFlexy && watchFlexy.hasAttribute('is-autonav-on')) {
      watchFlexy.removeAttribute('is-autonav-on');
    }
  }, 1000);

  // Fleeing "Skip Ad" button (pure evasion — unskippable)
  const AD_SKIP_SELECTORS = [
    '.ytp-ad-skip-button',
    '.ytp-ad-skip-button-modern',
    '.ytp-skip-ad-button',
    '.ytp-ad-skip-button-slot'
  ];

  let adSkipFleeing = false;

  function teleportSkipButton(btn) {
    if (adSkipFleeing) return;
    const player = document.getElementById('movie_player');
    if (!player) return;

    const rect = player.getBoundingClientRect();
    if (!rect.width || !rect.height) return;

    adSkipFleeing = true;
    const btnW = btn.offsetWidth || 120;
    const btnH = btn.offsetHeight || 36;
    const maxX = Math.max(16, rect.width - btnW - 24);
    const maxY = Math.max(16, rect.height - btnH - 48);

    const curX = parseFloat(btn.style.left) || rect.width - btnW - 24;
    const curY = parseFloat(btn.style.top) || rect.height - btnH - 60;
    let randX = Math.floor(Math.random() * maxX);
    let randY = Math.floor(Math.random() * maxY);
    if (Math.hypot(randX - curX, randY - curY) < 120) {
      randX = (curX + Math.floor(maxX / 2)) % maxX;
      randY = (curY + Math.floor(maxY / 2)) % maxY;
    }

    btn.style.setProperty('position', 'fixed', 'important');
    btn.style.setProperty('left', `${rect.left + randX}px`, 'important');
    btn.style.setProperty('top', `${rect.top + randY}px`, 'important');
    btn.style.setProperty('right', 'auto', 'important');
    btn.style.setProperty('bottom', 'auto', 'important');
    btn.style.setProperty('z-index', '99999', 'important');
    btn.style.setProperty('transition', 'left 0.12s ease-out, top 0.12s ease-out', 'important');

    setTimeout(() => { adSkipFleeing = false; }, 140);
  }

  const adObserver = new MutationObserver(() => {
    const bridge = getBridge();
    if (!bridge || !bridge.getCommitment()) return;

    for (const sel of AD_SKIP_SELECTORS) {
      const btn = document.querySelector(sel);
      if (btn && !btn.dataset.apAdBound) {
        btn.dataset.apAdBound = 'true';

        ['pointerenter', 'mouseover'].forEach((evt) => {
          btn.addEventListener(
            evt,
            () => {
              const bridge = getBridge();
              if (bridge && bridge.getCommitment()) teleportSkipButton(btn);
            },
            true
          );
        });

        ['pointerdown', 'mousedown', 'click'].forEach((evt) => {
          btn.addEventListener(
            evt,
            (e) => {
              const bridge = getBridge();
              if (!bridge || !bridge.getCommitment()) return;
              bridge.blockEvent(e);
              teleportSkipButton(btn);
            },
            true
          );
        });
      }
    }
  });

  adObserver.observe(document.documentElement, { childList: true, subtree: true });

  window.__apLockouts = { ready: true };
})();