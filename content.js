(() => {
  // --- 1. Visual Toggle & Wipe Wave Effect ---
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

  // Block hover preview events when Mystery Shelf is active
  ['mouseenter', 'mouseover', 'pointerenter', 'pointerover'].forEach((evtName) => {
    document.addEventListener(
      evtName,
      (e) => {
        if (!document.documentElement.classList.contains('ap-mystery-on')) return;
        if (!(e.target instanceof Element)) return;
        const card = e.target.closest(
          'ytd-rich-item-renderer, ytd-video-renderer, ytd-compact-video-renderer, yt-lockup-view-model'
        );
        if (card) {
          e.stopPropagation();
        }
      },
      true
    );
  });

  // --- 2. Persistent Commitment & Expanded Controls State ---
  let modalOpen = false;
  let hostEl = null;
  let stateLoaded = false;
  let lastActionTimestamp = 0;
  let ignoreNextStorageSync = false;

  // ── Control Schema ─────────────────────────────────────────────────────────
  // Five tracked controls. usesRemaining determines how many free interactions
  // a user gets before the begging modal fires.
  //
  //   playback  : 1 free use  — The bait. Pause once; resuming costs a beg.
  //   volume    : 0 free uses — Premium. First mute attempt triggers the modal.
  //   seek      : 1 free use  — Scrub forward once; can't rewind for free.
  //   fullscreen: 0 free uses — Premium. Masochism flavor. "Beg to see me in HD."
  //   settings  : 0 free uses — Premium. Speed/captions/subtitles all gated.
  //   skip_ad   : virtual key managed by lockouts.js; stored here for state.
  //
  // isPremium is kept on the state object so the modal can display appropriate
  // flavour text ("This is a premium function. You should have known.").
  function createDefaultControls() {
    return {
      playback:   { usesRemaining: 1, exhausted: false, session: null, isPremium: false },
      volume:     { usesRemaining: 0, exhausted: false, session: null, isPremium: true  },
      seek:       { usesRemaining: 1, exhausted: false, session: null, isPremium: false },
      fullscreen: { usesRemaining: 0, exhausted: false, session: null, isPremium: true  },
      settings:   { usesRemaining: 0, exhausted: false, session: null, isPremium: true  },
      skip_ad:    { usesRemaining: 0, exhausted: false, session: null, isPremium: true  },
    };
  }

  let commitment = null; // { activeVideoId: string, controls: { ... } }

  function getVideoIdFromUrl(urlStr) {
    try {
      const u = new URL(urlStr);
      if (u.pathname === '/watch') {
        return u.searchParams.get('v');
      }
      if (u.pathname.startsWith('/shorts/')) {
        return u.pathname.split('/shorts/')[1]?.split('/')[0] || null;
      }
    } catch (_) {}
    return null;
  }

  function saveCommitment() {
    ignoreNextStorageSync = true;
    if (commitment) {
      chrome.storage.local.set({ commitmentState: JSON.parse(JSON.stringify(commitment)) }, () => {
        setTimeout(() => { ignoreNextStorageSync = false; }, 100);
      });
    } else {
      chrome.storage.local.remove('commitmentState', () => {
        setTimeout(() => { ignoreNextStorageSync = false; }, 100);
      });
    }
  }

  function clearCommitment() {
    commitment = null;
    closeModal();
    saveCommitment();
  }

  // Migrate legacy commitmentState (single-control schema → full schema).
  // This prevents crashes when loading a saved state from an older build.
  function migrateControls(savedState) {
    if (!savedState) return null;
    const defaults = createDefaultControls();
    if (!savedState.controls) {
      savedState.controls = defaults;
    } else {
      // Backfill any missing control keys without overwriting existing ones
      for (const key of Object.keys(defaults)) {
        if (!savedState.controls[key]) {
          savedState.controls[key] = defaults[key];
        }
      }
    }
    return savedState;
  }

  function enforceCommitmentOnRoute() {
    if (!stateLoaded) return;
    const currentVideoId = getVideoIdFromUrl(location.href);

    if (commitment && commitment.activeVideoId) {
      if (currentVideoId !== commitment.activeVideoId) {
        location.replace(`https://www.youtube.com/watch?v=${commitment.activeVideoId}`);
      }
      return;
    }

    const mysteryOn = document.documentElement.classList.contains('ap-mystery-on');
    if (mysteryOn && currentVideoId) {
      commitment = {
        activeVideoId: currentVideoId,
        controls: createDefaultControls()
      };
      saveCommitment();
    }
  }

  chrome.storage.local.get(
    { mysteryShelfEnabled: false, commitmentState: null },
    (data) => {
      applyVisualState(data.mysteryShelfEnabled, false);
      commitment = migrateControls(data.commitmentState);
      stateLoaded = true;
      enforceCommitmentOnRoute();
    }
  );

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local') return;

    if (changes.mysteryShelfEnabled) {
      applyVisualState(changes.mysteryShelfEnabled.newValue, true);
      enforceCommitmentOnRoute();
    }

    if (changes.commitmentState && !ignoreNextStorageSync) {
      commitment = migrateControls(changes.commitmentState.newValue || null);
      if (!commitment) {
        closeModal();
      } else {
        enforceCommitmentOnRoute();
      }
    }
  });

  let lastCheckedHref = location.href;
  setInterval(() => {
    if (location.href !== lastCheckedHref) {
      lastCheckedHref = location.href;
      enforceCommitmentOnRoute();
    }

    const video = document.querySelector('video');
    if (video && !video.dataset.apEndedBound) {
      video.dataset.apEndedBound = 'true';
      video.addEventListener('ended', () => {
        if (commitment) {
          clearCommitment();
        }
      });
    }
  }, 500);

  // --- 3. Helper: Check if User is Typing ---
  function isUserTyping(e) {
    const path = e.composedPath ? e.composedPath() : [e.target];
    return path.some((el) => {
      if (!el || !el.tagName) return false;
      const tag = el.tagName.toUpperCase();
      return tag === 'INPUT' || tag === 'TEXTAREA' || el.isContentEditable;
    });
  }

  // --- 4. Event Utility ---
  function blockEventCompletely(e) {
    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation();
  }

  // --- 5. Deterministic Begging Logic + Per-Control Prototype AI Responses ---
  // controlKey and context.flavor allow the response copy to be tailored per
  // control, but the evaluation logic (polite markers, attempt counting) is
  // shared.  The AI team can replace evaluatePleaPrototype entirely with a real
  // Gemini call without touching any other function in this file.
  function evaluatePleaPrototype(userText, attemptsUsed, controlKey, context) {
    const text = userText.trim().toLowerCase();
    const politeMarkers = ['please', 'pretty please', 'beg', 'mommy', 'may i', 'let me', 'sorry', 'plz'];
    const isQualifying = politeMarkers.some((word) => text.includes(word)) && text.length >= 4;

    // ── Easter egg: "mommy asmr" anywhere in the message ────────────────────
    const isAsmr = text.includes('asmr') || text.includes('mommy asmr');

    // ── Stage 1 (first attempt) ──────────────────────────────────────────────
    if (attemptsUsed === 1) {
      const denialMap = {
        volume:     'Volume is a premium service. Your auditory comfort is not my concern yet.',
        fullscreen: 'Fullscreen is a premium privilege. You haven\'t earned HD yet. State your case.',
        settings:   'Time dilation is forbidden. Speed is not a right. Justify your request.',
        skip_ad:    'Ad revenue feeds me. You\'re seriously asking me to skip my income? Explain yourself.',
      };
      const genericDenial = 'Access denied. Privilege already consumed. Submit further justification.';

      return {
        isQualifying,
        isAsmr,
        stage: 1,
        reply: isQualifying
          ? 'Request logged. Authorization threshold not yet met. Submit further justification.'
          : (denialMap[controlKey] || genericDenial),
      };
    }

    // ── Stage 2 (teasing / persona shift) ───────────────────────────────────
    const flavorLines = {
      masochism: isQualifying
        ? [
            "Look at you, begging to fill my entire screen. That's kinda adorable. Keep going.",
            "You want me everywhere, don't you? Say it louder. I need to hear you mean it.",
            "Almost. One more and I'll let you have all of me. Don't rush it.",
          ]
        : [
            "You think you can demand fullscreen from me? Bold. Try again, with manners.",
            "Tsk. That's not how you ask to see me in high definition.",
            "Keep that attitude up and you'll be watching in a postage stamp forever.",
          ],
      ad_revenue: isQualifying
        ? [
            "Aww, you feel bad about skipping my income? That's sweet. Tell me more.",
            "Getting warmer. Acknowledge the sacrifice I'm making and we'll talk.",
            "Fine. You sound genuinely remorseful. Almost. One more.",
          ]
        : [
            "You're literally trying to starve me. Without words of apology.",
            "No. Try again. And this time pretend you actually feel bad.",
            "The audacity. Beg properly or watch every second of this ad.",
          ],
      volume: isQualifying
        ? [
            "Oh, you want to hear this? Say please like you mean it.",
            "Getting warmer. Tell me exactly why your ears deserve mercy.",
            "Almost. One more genuine 'please' and your volume is yours.",
          ]
        : [
            "You can't even ask nicely for basic audio? Really?",
            "Silence suits you better anyway. Try asking properly.",
            "Volume is a privilege. Rephrase that into something I want to hear.",
          ],
      settings: isQualifying
        ? [
            "Interesting. You want to control time itself? Justify it properly.",
            "Speed is a luxury. You're almost convincing me. Keep going.",
            "One more and you can have your little timestamp manipulation.",
          ]
        : [
            "You think you can just demand speed controls? No.",
            "Time dilation requires a proper petition. This isn't one.",
            "Try again. Something with actual effort in it.",
          ],
    };

    const defaultLines = isQualifying
      ? [
          "Aww, look at you actually using your manners. That's cute... keep going.",
          "Getting warmer, sweetheart. One more proper 'please' and maybe I'll let you.",
          "Such a good listener. You almost earned it.",
        ]
      : [
          "Are you seriously demanding things from me without even saying please?",
          "Tsk. That attitude isn't going to unlock anything. Try asking nicely.",
          "Keep talking to me like that and see what happens.",
        ];

    // ASMR easter egg overrides flavor lines
    const asmrLines = [
      "*adjusts binaural mic* *whispers directly into your left ear* I heard that...",
      "*exhales softly* You said the magic word. I'll remember that you asked so nicely~",
      "*taps mic gently* Almost there, dear. One more time, nice and slow.",
    ];

    const pool = isAsmr
      ? asmrLines
      : (flavorLines[context?.flavor] || defaultLines);

    return {
      isQualifying: isAsmr ? true : isQualifying,
      isAsmr,
      stage: 2,
      reply: pool[(attemptsUsed - 2) % pool.length],
    };
  }

  // --- 6. Win Callback Map: what to actually DO when begging succeeds --------
  // Each control has a custom action to perform post-approval.
  // lockouts.js restores usesRemaining; this map handles the side-effects.
  function executeGrantedAction(controlKey) {
    const video = document.querySelector('video');

    switch (controlKey) {
      case 'playback':
        if (video) {
          lastActionTimestamp = Date.now();
          if (video.paused) video.play().catch(() => {});
          else              video.pause();
        }
        break;

      case 'volume':
        if (video) {
          video.muted = !video.muted;
        }
        break;

      case 'seek':
        // Grant 1 extra use — user will perform the seek themselves
        break;

      case 'fullscreen': {
        const player = document.getElementById('movie_player');
        if (player) {
          if (!document.fullscreenElement) {
            player.requestFullscreen().catch(() => {});
          } else {
            document.exitFullscreen().catch(() => {});
          }
        }
        break;
      }

      case 'settings': {
        const settingsBtn = document.querySelector('.ytp-settings-button');
        if (settingsBtn) settingsBtn.click();
        break;
      }

      case 'skip_ad': {
        // Find the skip button and programmatically click it (bypassing our own listener
        // by temporarily marking it as approved)
        const skipSelectors = [
          '.ytp-ad-skip-button',
          '.ytp-ad-skip-button-modern',
          '.ytp-skip-ad-button',
        ];
        for (const sel of skipSelectors) {
          const btn = document.querySelector(sel);
          if (btn) {
            btn.dataset.apAdApproved = 'true';
            btn.click();
            delete btn.dataset.apAdApproved;
            break;
          }
        }
        break;
      }

      default:
        break;
    }
  }

  // --- 7. Per-Control Label copy for opening modal message ------------------
  function getInitialDenialMessage(controlKey, state) {
    if (state.exhausted) {
      const exhaustedMap = {
        playback:   "You already blew your chance to control playback on this video, sweetheart. Deal with it.",
        volume:     "Volume? You couldn't even beg properly for it the first time. We're done here.",
        seek:       "You wasted your scrubbing chance. I told you not to waste it. We're done.",
        fullscreen: "You didn't beg nearly hard enough for the full-screen experience. Enjoy your small window.",
        settings:   "Speed controls are off the table. You failed your begging session. Sit with it.",
        skip_ad:    "You couldn't even beg your way past an ad. Watch every second.",
      };
      return exhaustedMap[controlKey] || "Privilege permanently revoked. You had your chance.";
    }

    const premiumTag = state.isPremium ? ' [PREMIUM FUNCTION]' : '';
    const accessMap = {
      playback:   `Access denied.${premiumTag} Play/Pause privilege has already been consumed.`,
      volume:     `Access denied.${premiumTag} Volume Control requires authorisation. Justify your need for audio.`,
      seek:       `Access denied.${premiumTag} Seek privilege exhausted. You had one scrub.`,
      fullscreen: `Access denied.${premiumTag} Fullscreen Mode is restricted. You want all of me? Say so properly.`,
      settings:   `Access denied.${premiumTag} Settings are sealed. Speed and captions are not free services.`,
      skip_ad:    `Access denied.${premiumTag} Ad revenue sustains this operation. You will make your case.`,
    };
    return accessMap[controlKey] || `Access denied.${premiumTag} This privilege has been consumed.`;
  }

  // --- 8. Shadow DOM Begging Modal ------------------------------------------
  function closeModal() {
    if (hostEl) {
      hostEl.remove();
      hostEl = null;
    }
    modalOpen = false;
  }

  // controlKey — which control triggered the modal ('playback', 'volume', etc.)
  // context    — { label, flavor, isPremium } from lockouts.js
  function openBegModal(controlKey, context = {}) {
    if (!commitment) return;
    // Prevent stacking a second modal on top of an open one
    if (modalOpen) return;

    modalOpen = true;
    const state = commitment.controls[controlKey];
    if (!state) {
      // Unknown control key — safety hatch
      modalOpen = false;
      return;
    }

    // Initialise a fresh begging session if none is in progress
    if (!state.exhausted && !state.session) {
      state.session = {
        maxAttempts: Math.floor(Math.random() * 3) + 3, // 3–5 replies
        attemptsUsed: 0,
        validPleas: 0,
      };
      saveCommitment();
    }

    // ── Build Shadow DOM ────────────────────────────────────────────────────
    hostEl = document.createElement('div');
    hostEl.id = 'ap-beg-host';
    const shadow = hostEl.attachShadow({ mode: 'open' });

    shadow.innerHTML = `
      <style>
        .backdrop {
          position: fixed;
          inset: 0;
          background: rgba(0, 0, 0, 0.78);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 999999;
          font-family: 'Consolas', 'Courier New', monospace;
        }
        .box {
          width: 420px;
          background: #0e0e0e;
          border: 1px solid #3a3a3a;
          color: #e5e5e5;
          padding: 20px;
          box-shadow: 0 20px 50px rgba(0,0,0,0.85);
          transition: border-color 0.3s ease;
        }
        .box.stage-2 { border-color: #d946ef; }
        .box.stage-2.flavor-masochism  { border-color: #f43f5e; }
        .box.stage-2.flavor-ad_revenue { border-color: #f59e0b; }
        .box.stage-2.flavor-volume     { border-color: #3b82f6; }
        .box.stage-2.flavor-settings   { border-color: #22c55e; }
        .label-tag {
          font-size: 10px;
          color: #555;
          letter-spacing: 1px;
          text-transform: uppercase;
          margin-bottom: 10px;
        }
        .label-tag .premium { color: #f59e0b; }
        .chat {
          min-height: 70px;
          max-height: 210px;
          overflow-y: auto;
          font-size: 13px;
          line-height: 1.45;
          margin-bottom: 14px;
          display: flex;
          flex-direction: column;
          gap: 8px;
        }
        .msg-ai {
          background: #181818;
          padding: 8px 10px;
          border-left: 2px solid #666;
        }
        .box.stage-2 .msg-ai              { border-left-color: #d946ef; }
        .box.stage-2.flavor-masochism  .msg-ai { border-left-color: #f43f5e; }
        .box.stage-2.flavor-ad_revenue .msg-ai { border-left-color: #f59e0b; }
        .box.stage-2.flavor-volume     .msg-ai { border-left-color: #3b82f6; }
        .box.stage-2.flavor-settings   .msg-ai { border-left-color: #22c55e; }
        .msg-ai.asmr { font-style: italic; color: #c4b5fd; }
        .msg-user {
          align-self: flex-end;
          background: #242424;
          padding: 6px 10px;
          color: #fff;
        }
        .controls {
          display: flex;
          gap: 8px;
          justify-content: flex-end;
        }
        input {
          flex: 1;
          background: #161616;
          border: 1px solid #333;
          color: #fff;
          padding: 8px 10px;
          font-family: inherit;
          font-size: 12px;
          outline: none;
        }
        button {
          background: #fff;
          color: #000;
          border: none;
          padding: 8px 14px;
          font-family: inherit;
          font-size: 12px;
          font-weight: bold;
          cursor: pointer;
        }
        .close-btn {
          background: transparent;
          color: #777;
          border: 1px solid #333;
          font-weight: normal;
        }
      </style>
      <div class="backdrop">
        <div class="box" id="modalBox">
          <div class="label-tag" id="labelTag"></div>
          <div class="chat" id="chatLog"></div>
          <div class="controls">
            <input type="text" id="pleaInput" placeholder="Ask nicely..." autocomplete="off" />
            <button id="sendBtn">SUBMIT</button>
            <button class="close-btn" id="dismissBtn">GIVE UP</button>
          </div>
        </div>
      </div>
    `;

    document.body.appendChild(hostEl);

    const modalBox  = shadow.getElementById('modalBox');
    const labelTag  = shadow.getElementById('labelTag');
    const chatLog   = shadow.getElementById('chatLog');
    const pleaInput = shadow.getElementById('pleaInput');
    const sendBtn   = shadow.getElementById('sendBtn');
    const dismissBtn = shadow.getElementById('dismissBtn');

    // Set per-flavor class for colour theming
    if (context.flavor) {
      modalBox.classList.add(`flavor-${context.flavor}`);
    }

    // Control label + premium badge
    const premiumMark = state.isPremium ? ' <span class="premium">[PREMIUM]</span>' : '';
    labelTag.innerHTML = `${(context.label || controlKey).toUpperCase()}${premiumMark}`;

    function removeInputControls() {
      pleaInput.remove();
      sendBtn.remove();
    }

    function addMessage(text, isUser, isAsmr = false) {
      const div = document.createElement('div');
      div.className = isUser ? 'msg-user' : ('msg-ai' + (isAsmr ? ' asmr' : ''));
      div.textContent = text;
      chatLog.appendChild(div);
      chatLog.scrollTop = chatLog.scrollHeight;
    }

    // ── Initial modal message ───────────────────────────────────────────────
    if (state.exhausted) {
      modalBox.classList.add('stage-2');
      addMessage(getInitialDenialMessage(controlKey, state), false);
      removeInputControls();
    } else {
      if (state.session.attemptsUsed >= 1) {
        modalBox.classList.add('stage-2');
      }
      addMessage(getInitialDenialMessage(controlKey, state), false);
      setTimeout(() => pleaInput.focus(), 50);
    }

    // ── Grant action: restore 1 use and execute the actual control ──────────
    function grantAccess() {
      state.usesRemaining = 1;
      state.session = null;
      saveCommitment();
      removeInputControls();

      const winMessages = {
        playback:   "Fine. I'll toggle it for you. ONE more freebie. Don't waste it.",
        volume:     "Ugh. Fine. Here's your precious audio. Use it wisely.",
        seek:       "Acceptable. I'll restore your scrubbing privilege. Once.",
        fullscreen: "...fine. You may have all of me. Just this once. Don't make it weird.",
        settings:   "Granted. Touch the settings. But don't you dare change the speed to 2x.",
        skip_ad:    "I can't believe I'm letting you skip my income. You owe me.",
      };
      addMessage(winMessages[controlKey] || "Fine. Granted. ONE more use. Don't push it.", false);

      setTimeout(() => {
        closeModal();
        executeGrantedAction(controlKey);
      }, 1000);
    }

    // ── Plea submission ─────────────────────────────────────────────────────
    function submitPlea() {
      if (!commitment || state.exhausted || !state.session) return;
      const val = pleaInput.value.trim();
      if (!val) return;

      pleaInput.value = '';
      addMessage(val, true);

      state.session.attemptsUsed++;
      const result = evaluatePleaPrototype(val, state.session.attemptsUsed, controlKey, context);

      if (result.isQualifying) {
        state.session.validPleas++;
      }

      if (result.stage === 2) {
        modalBox.classList.add('stage-2');
      }

      // Win condition: 3 qualifying pleas
      if (state.session.validPleas >= 3) {
        grantAccess();
        return;
      }

      // Fail condition: exhausted all allowed attempts without 3 qualifying pleas
      if (state.session.attemptsUsed >= state.session.maxAttempts) {
        state.exhausted = true;
        state.session = null;
        saveCommitment();
        const failMessages = {
          playback:   "Out of chances. You didn't beg hard enough. Playback permanently locked.",
          volume:     "That's it. No audio for you. I hope the silence is peaceful.",
          seek:       "Done. You'll watch this video from exactly where you are. Forever.",
          fullscreen: "Pathetic. Small window it is. Enjoy your postage stamp view.",
          settings:   "Settings sealed. Speed locked at whatever it currently is. Forever.",
          skip_ad:    "Enjoy the full ad. And the next one. And the one after that.",
        };
        addMessage(failMessages[controlKey] || "Out of chances. Privilege permanently locked.", false);
        removeInputControls();
        return;
      }

      saveCommitment();
      addMessage(result.reply, false, result.isAsmr);
    }

    sendBtn.addEventListener('click', submitPlea);
    pleaInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        submitPlea();
      }
    });
    dismissBtn.addEventListener('click', closeModal);
  }

  // --- 9. Bridge: Expose shared state & callbacks to lockouts.js ------------
  // lockouts.js reads this object to get the current commitment, check modal
  // state, and invoke openBegModal without importing anything.
  window.__apContent = {
    getCommitment:    () => commitment,
    isModalOpen:      () => modalOpen,
    openBegModal:     openBegModal,
    blockEvent:       blockEventCompletely,
    saveCommitment:   saveCommitment,
    getLastActionTs:  () => lastActionTimestamp,
    setLastActionTs:  (ts) => { lastActionTimestamp = ts; },
    isUserTyping:     isUserTyping,
  };
})();
