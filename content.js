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

  // --- 2. Persistent Commitment & Unified Play/Pause Privilege ---
  let modalOpen = false;
  let hostEl = null;
  let stateLoaded = false;
  let lastActionTimestamp = 0;
  let ignoreNextStorageSync = false;

  function createDefaultControls() {
    return {
      playback: { usesRemaining: 1, exhausted: false, session: null }
    };
  }

  let commitment = null; // { activeVideoId: string, controls: { playback } }

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
      if (data.commitmentState && !data.commitmentState.controls?.playback) {
        data.commitmentState.controls = createDefaultControls();
      }
      commitment = data.commitmentState;
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
      commitment = changes.commitmentState.newValue || null;
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

  // --- 4. Total Keyboard Isolation While Modal is Open + Unified Play/Pause Lock ---
  function blockEventCompletely(e) {
    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation();
  }

  function handlePlaybackToggle(e, isKeyRepeat = false) {
    const video = document.querySelector('video');
    if (!video || !getVideoIdFromUrl(location.href) || !commitment) return;

    const state = commitment.controls.playback;

    if (modalOpen || isKeyRepeat) {
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
      saveCommitment();
      return; // Allow this 1 native Play/Pause toggle
    }

    blockEventCompletely(e);
    openBegModal();
  }

  window.addEventListener(
    'click',
    (e) => {
      if (modalOpen) return;
      if (!(e.target instanceof Element)) return;
      const playBtn = e.target.closest('.ytp-play-button');
      const videoSurface = e.target.closest('video.html5-main-video');
      if (playBtn || videoSurface) {
        handlePlaybackToggle(e, false);
      }
    },
    true
  );

  ['keydown', 'keypress', 'keyup'].forEach((evtType) => {
    window.addEventListener(
      evtType,
      (e) => {
        if (modalOpen) {
          e.stopPropagation();
          e.stopImmediatePropagation();
          return;
        }

        if (isUserTyping(e) || !commitment) return;

        if (e.code === 'Space' || e.key.toLowerCase() === 'k') {
          if (evtType === 'keydown') {
            handlePlaybackToggle(e, e.repeat);
          } else if (commitment.controls.playback.usesRemaining <= 0) {
            blockEventCompletely(e);
          }
        }
      },
      true
    );
  });

  // --- 5. Deterministic Begging Logic + Prototype AI Responses ---
  function evaluatePleaPrototype(userText, attemptsUsed) {
    const text = userText.trim().toLowerCase();
    const politeMarkers = ['please', 'pretty please', 'beg', 'mommy', 'may i', 'let me', 'sorry', 'plz'];
    const isQualifying = politeMarkers.some((word) => text.includes(word)) && text.length >= 4;

    if (attemptsUsed === 1) {
      return {
        isQualifying,
        stage: 1,
        reply: isQualifying
          ? 'Request logged. Authorization threshold not yet met. Submit further justification.'
          : 'Access denied. Unformatted demand rejected. State your request properly.'
      };
    }

    const teasingLines = isQualifying
      ? [
          "Aww, look at you actually using your manners. That's cute... keep going.",
          "Getting warmer, sweetheart. One more proper 'please' and maybe I'll let you.",
          "Such a good listener. You almost earned it."
        ]
      : [
          "Are you seriously demanding things from me without even saying please?",
          "Tsk. That attitude isn't going to unlock anything. Try asking nicely.",
          "Keep talking to me like that and see what happens."
        ];

    const reply = teasingLines[(attemptsUsed - 2) % teasingLines.length];
    return { isQualifying, stage: 2, reply };
  }

  // --- 6. Headerless Shadow DOM Begging Modal ---
  function closeModal() {
    if (hostEl) {
      hostEl.remove();
      hostEl = null;
    }
    modalOpen = false;
  }

  function openBegModal() {
    if (!commitment) return;
    modalOpen = true;
    const state = commitment.controls.playback;

    if (!state.exhausted && !state.session) {
      state.session = {
        maxAttempts: Math.floor(Math.random() * 3) + 3,
        attemptsUsed: 0,
        validPleas: 0
      };
      saveCommitment();
    }

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
        .box.stage-2 {
          border-color: #d946ef;
        }
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
        .box.stage-2 .msg-ai {
          border-left-color: #d946ef;
        }
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

    const modalBox = shadow.getElementById('modalBox');
    const chatLog = shadow.getElementById('chatLog');
    const pleaInput = shadow.getElementById('pleaInput');
    const sendBtn = shadow.getElementById('sendBtn');
    const dismissBtn = shadow.getElementById('dismissBtn');

    function removeInputControls() {
      pleaInput.remove();
      sendBtn.remove();
    }

    function addMessage(text, isUser) {
      const div = document.createElement('div');
      div.className = isUser ? 'msg-user' : 'msg-ai';
      div.textContent = text;
      chatLog.appendChild(div);
      chatLog.scrollTop = chatLog.scrollHeight;
    }

    if (state.exhausted) {
      modalBox.classList.add('stage-2');
      addMessage("You already blew your chance to control playback on this video, sweetheart. Deal with it.", false);
      removeInputControls();
    } else {
      if (state.session.attemptsUsed >= 1) {
        modalBox.classList.add('stage-2');
      }
      addMessage('Access denied. Play/Pause privilege has already been consumed.', false);
      setTimeout(() => pleaInput.focus(), 50);
    }

    function submitPlea() {
      if (!commitment || state.exhausted || !state.session) return;
      const val = pleaInput.value.trim();
      if (!val) return;

      pleaInput.value = '';
      addMessage(val, true);

      state.session.attemptsUsed++;
      const result = evaluatePleaPrototype(val, state.session.attemptsUsed);

      if (result.isQualifying) {
        state.session.validPleas++;
      }

      if (result.stage === 2) {
        modalBox.classList.add('stage-2');
      }

      // Deterministic Win: 3 qualifying pleas -> auto-toggle video + grant 1 extra manual use!
      if (state.session.validPleas >= 3) {
        addMessage("Good job. I'll toggle it for you now and give you ONE more freebie. Don't waste it.", false);
        state.usesRemaining = 1;
        state.session = null;
        saveCommitment();
        removeInputControls();

        setTimeout(() => {
          lastActionTimestamp = Date.now();
          closeModal();
          const video = document.querySelector('video');
          if (video) {
            if (video.paused) {
              video.play().catch(() => {});
            } else {
              video.pause();
            }
          }
        }, 1000);
        return;
      }

      // Deterministic Fail: ran out of hidden 3-5 replies
      if (state.session.attemptsUsed >= state.session.maxAttempts) {
        state.exhausted = true;
        state.session = null;
        saveCommitment();
        addMessage("Out of chances. You didn't beg hard enough. Privilege permanently locked.", false);
        removeInputControls();
        return;
      }

      saveCommitment();
      addMessage(result.reply, false);
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
})();