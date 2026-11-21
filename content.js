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
          'ytd-rich-item-renderer, ytd-video-renderer, ytd-compact-video-renderer, yt-lockup-view-model, ytm-shorts-lockup-view-model, ytd-reel-item-renderer'
        );
        if (card) {
          e.stopPropagation();
        }
      },
      true
    );
  });

  // --- 2. Persistent Commitment & Same-Video Re-lock Guard ---
  let modalOpen = false;
  let hostEl = null;
  let stateLoaded = false;
  let lastActionTimestamp = 0;
  let ignoreNextStorageSync = false;

  let commitment = null; // { activeVideoId: string, controls: { ... } }
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
      if (u.pathname === '/watch') {
        return u.searchParams.get('v');
      }
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
    closeModal();
    saveState({
      commitmentState: null,
      lastReleasedVideoId: lastReleasedVideoId
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

  chrome.storage.local.get(
    { mysteryShelfEnabled: false, commitmentState: null, lastReleasedVideoId: null },
    (data) => {
      applyVisualState(data.mysteryShelfEnabled, false);
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
      applyVisualState(changes.mysteryShelfEnabled.newValue, true);
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
        closeModal();
      } else {
        enforceCommitmentOnRoute();
      }
    }
  });

  // Scrape hidden video metadata for Nutrition Facts before clearing commitment
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

    const title = (titleEl?.textContent || titleEl?.getAttribute('content') || document.title.replace(' - YouTube', '')).trim();
    const channel = (channelEl?.textContent || channelEl?.getAttribute('content') || 'Unknown Creator').trim();
    const description = (descEl?.textContent || descEl?.getAttribute('content') || '').trim().slice(0, 300);
    const duration = (durationEl?.textContent || '0:00').trim();

    return { title, channel, description, duration };
  }

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
          const finishedId = commitment.activeVideoId;
          const videoMeta = scrapeCurrentVideoMetadata();
          releaseCurrentCommitment(finishedId);
          showNutritionFactsModal(videoMeta, finishedId);
        }
      });
    }
  }, 500);

  // --- 3. Mystery Shelf Random Video Click Hijacker (Livestream-Exempt) ---
  function isLiveCard(cardOrAnchor) {
    const container = cardOrAnchor.closest(
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
      if (txt === 'LIVE' || txt.includes('WATCHING')) {
        return true;
      }
    }
    return false;
  }

  function pickRandomVisibleVideoUrl(excludeVideoId) {
    const anchors = document.querySelectorAll('a[href*="/watch?v="]');
    const candidates = new Set();

    anchors.forEach((a) => {
      if (isLiveCard(a)) return;
      const id = getVideoIdFromUrl(a.href);
      if (id && id !== excludeVideoId && id !== lastReleasedVideoId) {
        candidates.add(`https://www.youtube.com/watch?v=${id}`);
      }
    });

    const pool = Array.from(candidates);
    if (pool.length === 0) return null;
    return pool[Math.floor(Math.random() * pool.length)];
  }

  function handleMysteryFeedClick(e) {
    if (modalOpen) return;
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

    if (commitment && commitment.activeVideoId) {
      location.assign(`https://www.youtube.com/watch?v=${commitment.activeVideoId}`);
      return;
    }

    const targetHref = link ? link.href : videoCard.querySelector('a[href*="/watch?v="], a[href*="/shorts/"]')?.href;
    const clickedId = targetHref ? getVideoIdFromUrl(targetHref) : null;
    const randomUrl =
      pickRandomVisibleVideoUrl(clickedId) ||
      (clickedId ? `https://www.youtube.com/watch?v=${clickedId}` : null);

    if (randomUrl) {
      location.assign(randomUrl);
    }
  }

  window.addEventListener('click', handleMysteryFeedClick, true);
  window.addEventListener('auxclick', handleMysteryFeedClick, true);

  // --- 4. Helper: Check if User is Typing ---
  function isUserTyping(e) {
    const path = e.composedPath ? e.composedPath() : [e.target];
    return path.some((el) => {
      if (!el || !el.tagName) return false;
      const tag = el.tagName.toUpperCase();
      return tag === 'INPUT' || tag === 'TEXTAREA' || el.isContentEditable;
    });
  }

  // --- 5. Total Keyboard Isolation While Modal is Open + Unified Play/Pause Lock ---
  function blockEventCompletely(e) {
    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation();
  }

  function handlePlaybackToggle(e, isKeyRepeat = false) {
    const video = document.querySelector('video');
    if (!video || !getVideoIdFromUrl(location.href) || !commitment) return;

    if (!commitment.controls.playback) {
      commitment.controls.playback = { usesRemaining: 1, exhausted: false, session: null };
    }
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
      saveState({ commitmentState: commitment });
      return;
    }

    blockEventCompletely(e);
    openBegModal('playback');
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
          const path = e.composedPath ? e.composedPath() : [];
          if (hostEl && path.includes(hostEl)) {
            return;
          }
          blockEventCompletely(e);
          return;
        }

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

  // --- 6. Deterministic Begging Logic + Prototype AI Responses ---
  function evaluatePleaPrototype(userText, attemptsUsed, displayLabel) {
    const text = userText.trim().toLowerCase();
    const politeMarkers = ['please', 'pretty please', 'beg', 'mommy', 'may i', 'let me', 'sorry', 'plz'];
    const isQualifying = politeMarkers.some((word) => text.includes(word)) && text.length >= 4;

    if (attemptsUsed === 1) {
      return {
        isQualifying,
        stage: 1,
        reply: isQualifying
          ? `${displayLabel} request logged. Authorization threshold not yet met. Submit further justification.`
          : `Access denied. Unformatted ${displayLabel} demand rejected. State your request properly.`
      };
    }

    const teasingLines = isQualifying
      ? [
          "Aww, look at you actually using your manners. That's cute... keep going.",
          `Getting warmer, sweetheart. One more proper 'please' for ${displayLabel} and maybe I'll let you.`,
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

  // --- 7. Generalized Headerless Shadow DOM Begging Modal ---
  function closeModal() {
    if (hostEl) {
      hostEl.remove();
      hostEl = null;
    }
    modalOpen = false;
  }

  function formatControlLabel(controlName) {
    const labels = {
      playback: 'Play/Pause',
      volume: 'Volume/Mute',
      seek: 'Seek/Scrub',
      fullscreen: 'Fullscreen',
      settings: 'Playback Settings'
    };
    if (labels[controlName]) return labels[controlName];
    return controlName.charAt(0).toUpperCase() + controlName.slice(1);
  }

  function openBegModal(controlName = 'playback') {
    if (!commitment || modalOpen) return;
    modalOpen = true;

    if (!commitment.controls[controlName]) {
      commitment.controls[controlName] = { usesRemaining: 0, exhausted: false, session: null };
    }
    const state = commitment.controls[controlName];
    const displayLabel = formatControlLabel(controlName);

    if (!state.exhausted && !state.session) {
      state.session = {
        maxAttempts: Math.floor(Math.random() * 3) + 3,
        attemptsUsed: 0,
        validPleas: 0
      };
      saveState({ commitmentState: commitment });
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
      addMessage(`You already blew your chance to use ${displayLabel} on this video, sweetheart. Deal with it.`, false);
      removeInputControls();
    } else {
      if (state.session.attemptsUsed >= 1) {
        modalBox.classList.add('stage-2');
      }
      addMessage(`Access denied. ${displayLabel} privilege has already been consumed.`, false);
      setTimeout(() => pleaInput.focus(), 50);
    }

    function submitPlea() {
      if (!commitment || state.exhausted || !state.session) return;
      const val = pleaInput.value.trim();
      if (!val) return;

      pleaInput.value = '';
      addMessage(val, true);

      state.session.attemptsUsed++;
      const result = evaluatePleaPrototype(val, state.session.attemptsUsed, displayLabel);

      if (result.isQualifying) {
        state.session.validPleas++;
      }

      if (result.stage === 2) {
        modalBox.classList.add('stage-2');
      }

      if (state.session.validPleas >= 3) {
        const winText =
          controlName === 'playback'
            ? "Good job. I'll toggle it for you now and give you ONE more freebie. Don't waste it."
            : `Good job. I'll grant you ONE ${displayLabel} action. Don't waste it.`;

        addMessage(winText, false);
        state.usesRemaining = 1;
        state.session = null;
        saveState({ commitmentState: commitment });
        removeInputControls();

        setTimeout(() => {
          lastActionTimestamp = Date.now();
          closeModal();
          if (controlName === 'playback') {
            const video = document.querySelector('video');
            if (video) {
              if (video.paused) {
                video.play().catch(() => {});
              } else {
                video.pause();
              }
            }
          }
        }, 1000);
        return;
      }

      if (state.session.attemptsUsed >= state.session.maxAttempts) {
        state.exhausted = true;
        state.session = null;
        saveState({ commitmentState: commitment });
        addMessage(`Out of chances. You didn't beg hard enough. ${displayLabel} permanently locked.`, false);
        removeInputControls();
        return;
      }

      saveState({ commitmentState: commitment });
      addMessage(result.reply, false);
    }

    sendBtn.addEventListener('click', submitPlea);
    pleaInput.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key === 'Enter') {
        e.preventDefault();
        submitPlea();
      }
    });
    dismissBtn.addEventListener('click', closeModal);
  }

  // --- 8. FDA-Style Shadow DOM Nutrition Facts Modal (Post-Video) ---
  function generateFallbackNutrition(meta) {
    const mins = parseInt(meta.duration.split(':')[0], 10) || 3;
    const calories = Math.max(85, mins * 65);
    const brainrot = Math.min(99, 42 + mins * 7);
    return {
      caloriesWasted: `${calories} kcal`,
      brainrotPercent: `${brainrot}%`,
      attentionDamage: mins > 8 ? 'Critical' : 'Moderate-to-Severe',
      emotionalAftertaste: 'Mild existential static',
      verdict: `You just traded ${meta.duration} of your finite lifespan to "${meta.title.slice(0, 48)}".`
    };
  }

  function showNutritionFactsModal(videoMeta, finishedVideoId) {
    closeModal();
    modalOpen = true;

    hostEl = document.createElement('div');
    hostEl.id = 'ap-nutrition-host';
    const shadow = hostEl.attachShadow({ mode: 'open' });

    shadow.innerHTML = `
      <style>
        .backdrop {
          position: fixed;
          inset: 0;
          background: rgba(0, 0, 0, 0.84);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 999999;
          font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif;
        }
        .label {
          width: 340px;
          background: #ffffff;
          color: #000000;
          border: 3px solid #000000;
          padding: 14px 16px;
          box-shadow: 0 24px 60px rgba(0, 0, 0, 0.9);
        }
        .heading {
          font-size: 28px;
          font-weight: 900;
          letter-spacing: -0.5px;
          line-height: 1;
          margin-bottom: 4px;
        }
        .sub {
          font-size: 11px;
          border-bottom: 8px solid #000;
          padding-bottom: 6px;
          margin-bottom: 6px;
        }
        .serving {
          display: flex;
          justify-content: space-between;
          font-size: 12px;
          font-weight: bold;
          border-bottom: 1px solid #000;
          padding-bottom: 4px;
          margin-bottom: 4px;
        }
        .cal-row {
          display: flex;
          justify-content: space-between;
          align-items: baseline;
          border-bottom: 5px solid #000;
          padding: 4px 0 6px;
          margin-bottom: 6px;
        }
        .cal-title {
          font-size: 16px;
          font-weight: 900;
        }
        .cal-val {
          font-size: 26px;
          font-weight: 900;
        }
        .dv-header {
          text-align: right;
          font-size: 10px;
          font-weight: bold;
          border-bottom: 1px solid #000;
          padding-bottom: 2px;
        }
        .row {
          display: flex;
          justify-content: space-between;
          font-size: 12px;
          padding: 5px 0;
          border-bottom: 1px solid #000;
        }
        .row.thick {
          border-bottom: 5px solid #000;
        }
        .verdict {
          font-size: 11px;
          line-height: 1.35;
          padding: 8px 0 12px;
          font-family: 'Consolas', monospace;
        }
        .actions {
          display: flex;
          flex-direction: column;
          gap: 6px;
        }
        button {
          width: 100%;
          padding: 9px 12px;
          font-family: 'Consolas', monospace;
          font-size: 11px;
          font-weight: bold;
          cursor: pointer;
          border: 2px solid #000;
        }
        .primary {
          background: #000;
          color: #fff;
        }
        .secondary {
          background: #fff;
          color: #000;
        }
      </style>
      <div class="backdrop">
        <div class="label">
          <div class="heading">Nutrition Facts</div>
          <div class="sub">1 completed video (${videoMeta.duration || 'Unknown length'})</div>
          <div class="serving">
            <span>Source</span>
            <span>${videoMeta.channel.slice(0, 26)}</span>
          </div>
          <div class="cal-row">
            <span class="cal-title">Braincells Burned</span>
            <span class="cal-val" id="nfCalories">...</span>
          </div>
          <div class="dv-header">% Daily Regret*</div>
          <div class="row">
            <span><strong>Brainrot Concentration</strong></span>
            <span id="nfBrainrot">...</span>
          </div>
          <div class="row">
            <span><strong>Attention Span Damage</strong></span>
            <span id="nfDamage">...</span>
          </div>
          <div class="row thick">
            <span><strong>Emotional Aftertaste</strong></span>
            <span id="nfAftertaste">...</span>
          </div>
          <div class="verdict" id="nfVerdict">Analyzing dopamine damage...</div>
          <div class="actions">
            <button class="primary" id="nextMysteryBtn">CONSUME ANOTHER MYSTERY VIDEO</button>
            <button class="secondary" id="closeNfBtn">DISMISS</button>
          </div>
        </div>
      </div>
    `;

    document.body.appendChild(hostEl);

    function populateLabel(stats) {
      shadow.getElementById('nfCalories').textContent = stats.caloriesWasted;
      shadow.getElementById('nfBrainrot').textContent = stats.brainrotPercent;
      shadow.getElementById('nfDamage').textContent = stats.attentionDamage;
      shadow.getElementById('nfAftertaste').textContent = stats.emotionalAftertaste;
      shadow.getElementById('nfVerdict').textContent = `*VERDICT: ${stats.verdict}`;
    }

    // Request live AI Nutrition Facts from background.js with 2.5s local fallback
    let settled = false;
    const fallbackTimer = setTimeout(() => {
      if (!settled) {
        settled = true;
        populateLabel(generateFallbackNutrition(videoMeta));
      }
    }, 2500);

    try {
      chrome.runtime.sendMessage(
        {
          type: 'GENERATE_NUTRITION',
          ...videoMeta
        },
        (response) => {
          if (settled) return;
          settled = true;
          clearTimeout(fallbackTimer);
          if (chrome.runtime.lastError || !response || !response.caloriesWasted) {
            populateLabel(generateFallbackNutrition(videoMeta));
          } else {
            populateLabel(response);
          }
        }
      );
    } catch (_) {
      if (!settled) {
        settled = true;
        clearTimeout(fallbackTimer);
        populateLabel(generateFallbackNutrition(videoMeta));
      }
    }

    shadow.getElementById('nextMysteryBtn').addEventListener('click', () => {
      closeModal();
      const nextUrl = pickRandomVisibleVideoUrl(finishedVideoId);
      if (nextUrl) {
        location.assign(nextUrl);
      }
    });

    shadow.getElementById('closeNfBtn').addEventListener('click', closeModal);
  }

  // --- 9. Public Bridge for Laptop 3 (lockouts.js) ---
  window.AP_Modal = {
    open: openBegModal,
    isOpen: () => modalOpen,
    getCommitment: () => commitment,
    saveCommitment: () => saveState({ commitmentState: commitment })
  };
})();