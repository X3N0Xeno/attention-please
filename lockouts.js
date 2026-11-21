// lockouts.js — Player Interception & State Engine
// Owns: all keyboard, mouse, pointer, and wheel intercepts for all tracked controls:
//       playback, volume, seek, fullscreen, theater, settings, and fleeing Skip Ad.
// Bridge: reads window.__apContent (set by content.js) for shared state/callbacks.
(() => {
  // ─── 0. Control Definitions ───────────────────────────────────────────────
  const CONTROL_DEFS = {
    playback: {
      label: 'Play / Pause',
      startingUses: 1,
      isPremium: false,
      flavor: 'default',
    },
    volume: {
      label: 'Volume Control',
      startingUses: 1,
      isPremium: false,
      flavor: 'volume',
    },
    seek: {
      label: 'Seek / Scrub',
      startingUses: 1,
      isPremium: false,
      flavor: 'default',
    },
    fullscreen: {
      label: 'Fullscreen Mode',
      startingUses: 1,
      isPremium: false,
      flavor: 'masochism',
    },
    theater: {
      label: 'Theatre Mode',
      startingUses: 1,
      isPremium: false,
      flavor: 'default',
    },
    settings: {
      label: 'Settings / Speed / Captions',
      startingUses: 1,
      isPremium: false,
      flavor: 'settings',
    },
  };

  // ─── 1. Selectors for Every Control ────────────────────────────────────────
  const CONTROL_SELECTORS = {
    playback: ['.ytp-play-button'],
    volume: [
      '.ytp-mute-button',
      '.ytp-volume-panel',
      '.ytp-volume-slider',
      '.ytp-volume-slider-handle',
      '.ytp-volume-area',
    ],
    seek: [
      '.ytp-progress-bar',
      '.ytp-progress-bar-container',
      '.ytp-chapters-container',
      '.ytp-scrubber-container',
      '.ytp-scrubber-button',
    ],
    fullscreen: ['.ytp-fullscreen-button'],
    theater: ['.ytp-size-button'],
    settings: ['.ytp-settings-button', '.ytp-subtitles-button'],
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

  // ─── 2. Helpers: Modal and Input Detection ─────────────────────────────────
  function getBridge() {
    return window.__apContent || null;
  }

  function getVideoIdFromUrl(urlStr) {
    try {
      const u = new URL(urlStr);
      if (u.pathname === '/watch') return u.searchParams.get('v');
      if (u.pathname.startsWith('/shorts/')) return u.pathname.split('/shorts/')[1]?.split('/')[0] || null;
    } catch (_) {}
    return null;
  }

  // CRITICAL: Checks if an event occurred inside the Shadow DOM modal or any typing field.
  // Events originating here MUST NEVER be prevented or stopped, allowing text input and button clicks.
  function isEventInsideModal(e) {
    if (!e) return false;
    const path = e.composedPath ? e.composedPath() : [e.target];
    return path.some((el) => {
      if (!el) return false;
      if (el.id === 'ap-beg-host' || el.id === 'modalBox' || el.id === 'pleaInput' || el.id === 'sendBtn' || el.id === 'dismissBtn') {
        return true;
      }
      if (el.tagName && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable)) {
        return true;
      }
      return false;
    });
  }

  // ─── 3. Generic Control Action Handler ────────────────────────────────────
  function handleControlAction(controlKey, e, isKeyRepeat = false) {
    const bridge = getBridge();
    if (!bridge) return;

    const commitment = bridge.getCommitment();
    if (!commitment || !getVideoIdFromUrl(location.href)) return;

    const def = CONTROL_DEFS[controlKey] || {
      label: controlKey,
      startingUses: 1,
      isPremium: false,
      flavor: 'default',
    };

    // Self-healing: ensure control state exists so openBegModal never crashes
    if (!commitment.controls[controlKey]) {
      commitment.controls[controlKey] = {
        usesRemaining: def.startingUses,
        exhausted: false,
        session: null,
      };
    }

    const state = commitment.controls[controlKey];

    if (isKeyRepeat) {
      if (e) bridge.blockEvent(e);
      return;
    }

    if (bridge.isModalOpen()) {
      if (e) bridge.blockEvent(e);
      return;
    }

    // ── Has Remaining Uses: Grant Native Execution ─────────────────────────
    if (state.usesRemaining > 0) {
      const now = Date.now();
      bridge.setLastActionTs(now);
      state.usesRemaining--;
      bridge.saveCommitment();
      return; // Allow native event
    }

    // ── Locked: Block Event & Trigger Begging Modal ─────────────────────────
    if (e) bridge.blockEvent(e);

    // Debounce opening the modal (prevent multi-trigger from pointerdown + mousedown)
    const now = Date.now();
    if (now - bridge.getLastActionTs() < 350) return;
    bridge.setLastActionTs(now);

    bridge.openBegModal(controlKey, {
      label: def.label,
      flavor: def.flavor,
      isPremium: def.isPremium,
    });
  }

  // ─── 4. Multi-Phase Pointer & Mouse Interceptors ──────────────────────────
  // YouTube controls trigger on pointerdown/mousedown/click depending on the button.
  // Intercepting all three phases at the window capture level guarantees YouTube's
  // internal player handlers NEVER receive the event when locked.
  ['pointerdown', 'mousedown', 'click'].forEach((evtType) => {
    window.addEventListener(
      evtType,
      (e) => {
        // ALWAYS allow full interaction with the begging modal
        if (isEventInsideModal(e)) return;

        const bridge = getBridge();
        if (!bridge) return;

        // If modal is open, block clicks on the YouTube player behind it
        if (bridge.isModalOpen()) {
          bridge.blockEvent(e);
          return;
        }

        const controlKey = getControlForElement(e.target);
        if (!controlKey) return;

        const commitment = bridge.getCommitment();
        if (!commitment || !getVideoIdFromUrl(location.href)) return;

        const state = commitment.controls[controlKey];
        const isLocked = !state || state.usesRemaining <= 0;

        if (isLocked) {
          // Block at every phase (pointerdown, mousedown, click)
          bridge.blockEvent(e);
          // Launch begging modal on first touch
          if (evtType === 'pointerdown' || evtType === 'click') {
            handleControlAction(controlKey, e, false);
          }
        } else {
          // Free use available: allow pointerdown and mousedown to pass natively
          // Consume the free use on the final click event
          if (evtType === 'click') {
            handleControlAction(controlKey, e, false);
          }
        }
      },
      true // Capture phase: runs before YouTube
    );
  });

  // ─── 5. Double-Click Video Surface → Fullscreen Guard ────────────────────
  window.addEventListener(
    'dblclick',
    (e) => {
      if (isEventInsideModal(e)) return;
      const bridge = getBridge();
      if (!bridge) return;
      const commitment = bridge.getCommitment();
      if (!commitment || !getVideoIdFromUrl(location.href)) return;

      if (e.target instanceof Element && e.target.closest('video, #movie_player')) {
        const state = commitment.controls['fullscreen'];
        if (!state || state.usesRemaining <= 0) {
          bridge.blockEvent(e);
          handleControlAction('fullscreen', e, false);
        }
      }
    },
    true
  );

  // ─── 6. Mouse Wheel Interceptor (Volume Scroll Guard) ─────────────────────
  window.addEventListener(
    'wheel',
    (e) => {
      // Allow scrolling inside the modal chat log!
      if (isEventInsideModal(e)) return;

      const bridge = getBridge();
      if (!bridge) return;
      const commitment = bridge.getCommitment();
      if (!commitment || !getVideoIdFromUrl(location.href)) return;

      if (e.target instanceof Element && e.target.closest('#movie_player, video, .ytp-volume-area')) {
        const state = commitment.controls['volume'];
        if (!state || state.usesRemaining <= 0) {
          bridge.blockEvent(e);
          handleControlAction('volume', e, false);
        }
      }
    },
    { capture: true, passive: false }
  );

  // ─── 7. Keyboard Interceptor ──────────────────────────────────────────────
  ['keydown', 'keypress', 'keyup'].forEach((evtType) => {
    window.addEventListener(
      evtType,
      (e) => {
        // CRITICAL FIX: If typing in the begging input or any modal control, DO NOT INTERCEPT!
        if (isEventInsideModal(e)) return;

        const bridge = getBridge();
        if (!bridge) return;

        if (bridge.isUserTyping(e)) return;

        // Isolate keyboard for background player when modal is open
        if (bridge.isModalOpen()) {
          e.stopPropagation();
          e.stopImmediatePropagation();
          if (evtType !== 'keyup') e.preventDefault();
          return;
        }

        const commitment = bridge.getCommitment();
        if (!commitment || !getVideoIdFromUrl(location.href)) return;

        const key = e.key.toLowerCase();
        const code = e.code;

        // ── Miniplayer bypass (always blocked) ───────────────────────────────
        if (key === 'i') {
          bridge.blockEvent(e);
          return;
        }

        let matchedControl = null;

        // Playback: Space, k
        if (code === 'Space' || key === 'k') {
          matchedControl = 'playback';
        }
        // Volume: m, ArrowUp, ArrowDown
        else if (key === 'm' || key === 'arrowup' || key === 'arrowdown') {
          matchedControl = 'volume';
        }
        // Seek: ArrowLeft, ArrowRight, j, l, number keys 0-9
        else if (
          key === 'arrowleft' || key === 'arrowright' ||
          key === 'j' || key === 'l' ||
          (code.startsWith('Digit') && !e.ctrlKey && !e.metaKey && !e.altKey)
        ) {
          matchedControl = 'seek';
        }
        // Fullscreen: f
        else if (key === 'f') {
          matchedControl = 'fullscreen';
        }
        // Theater mode: t
        else if (key === 't') {
          matchedControl = 'theater';
        }
        // Settings / Captions / Speed: c, <, >
        else if (key === 'c' || key === '<' || key === '>') {
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
        } else {
          if (evtType === 'keydown') {
            handleControlAction(matchedControl, e, e.repeat);
          }
        }
      },
      true // Capture phase
    );
  });

  // ─── 8. Autoplay / Auto-Advance Blocker ────────────────────────────────────
  window.addEventListener(
    'click',
    (e) => {
      if (isEventInsideModal(e)) return;
      const bridge = getBridge();
      if (!bridge) return;
      const commitment = bridge.getCommitment();
      if (!commitment) return;
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

  // ─── 9. Fleeing "Skip Ad" Button ──────────────────────────────────────────
  const AD_SKIP_SELECTORS = [
    '.ytp-ad-skip-button',
    '.ytp-ad-skip-button-modern',
    '.ytp-skip-ad-button',
  ];

  let adSkipFleeing = false;

  function getPlayerRect() {
    const player = document.getElementById('movie_player');
    return player ? player.getBoundingClientRect() : null;
  }

  function teleportSkipButton(btn) {
    if (adSkipFleeing) return;
    const rect = getPlayerRect();
    if (!rect) return;

    adSkipFleeing = true;
    const btnW = btn.offsetWidth || 120;
    const btnH = btn.offsetHeight || 36;
    const maxX = Math.max(0, rect.width - btnW - 16);
    const maxY = Math.max(0, rect.height - btnH - 16);
    const randX = Math.floor(Math.random() * maxX);
    const randY = Math.floor(Math.random() * maxY);

    btn.style.position = 'absolute';
    btn.style.left = `${randX}px`;
    btn.style.top = `${randY}px`;
    btn.style.right = 'auto';
    btn.style.bottom = 'auto';
    btn.style.zIndex = '9999';
    btn.style.transition = 'left 0.15s ease, top 0.15s ease';

    setTimeout(() => { adSkipFleeing = false; }, 200);
  }

  const adObserver = new MutationObserver(() => {
    for (const sel of AD_SKIP_SELECTORS) {
      const btn = document.querySelector(sel);
      if (btn && !btn.dataset.apAdBound) {
        btn.dataset.apAdBound = 'true';

        btn.addEventListener('pointerenter', () => {
          const bridge = getBridge();
          if (bridge && bridge.getCommitment()) teleportSkipButton(btn);
        });

        btn.addEventListener(
          'click',
          (e) => {
            const bridge = getBridge();
            if (!bridge || !bridge.getCommitment()) return;
            bridge.blockEvent(e);
            bridge.openBegModal('skip_ad', {
              label: 'Skip Ad',
              flavor: 'ad_revenue',
              isPremium: true,
            });
          },
          true
        );
      }
    }
  });

  adObserver.observe(document.documentElement, { childList: true, subtree: true });

  window.__apLockouts = { ready: true };
})();
