(() => {
  let modalOpen = false;
  let hostEl = null;

  function closeModal() {
    if (hostEl) {
      hostEl.remove();
      hostEl = null;
    }
    modalOpen = false;
  }

  function formatControlLabel(controlKey, context = {}) {
    if (context.label) return context.label;
    const labels = {
      playback: 'Play / Pause',
      volume: 'Volume Control',
      seek: 'Seek / Scrub',
      fullscreen: 'Fullscreen Mode',
      theater: 'Theatre Mode',
      settings: 'Settings / Speed / Captions'
    };
    return labels[controlKey] || controlKey.charAt(0).toUpperCase() + controlKey.slice(1);
  }

  function evaluatePleaPrototype(userText, attemptsUsed, controlKey, context = {}) {
    const text = userText.trim().toLowerCase();
    const politeMarkers = ['please', 'pretty please', 'beg', 'mommy', 'may i', 'let me', 'sorry', 'plz'];
    const isQualifying = politeMarkers.some((word) => text.includes(word)) && text.length >= 4;
    const isAsmr = text.includes('asmr') || text.includes('mommy asmr');

    if (attemptsUsed === 1) {
      const denialMap = {
        volume: 'Volume petition logged. Your auditory comfort is not guaranteed yet.',
        fullscreen: 'Fullscreen petition logged. You have not earned HD yet.',
        settings: 'Time dilation petition logged. Speed is not a right.'
      };
      return {
        isQualifying,
        isAsmr,
        stage: 1,
        reply: isQualifying
          ? (denialMap[controlKey] || 'Petition logged. Authorization threshold unmet. Submit further justification.')
          : 'Access denied. Unformatted demand rejected. State your request properly.'
      };
    }

    const flavorLines = {
      masochism: isQualifying
        ? [
            "Look at you, begging to fill my entire screen. That's kinda adorable. Keep going.",
            "You want me everywhere, don't you? Say it louder. I need to hear you mean it.",
            "Almost. One more and I'll let you have all of me. Don't rush it."
          ]
        : [
            "You think you can demand fullscreen from me? Bold. Try again, with manners.",
            "Tsk. That's not how you ask to see me in high definition.",
            "Keep that attitude up and you'll be watching in a postage stamp forever."
          ],
      volume: isQualifying
        ? [
            "Oh, you want to hear this? Say please like you mean it.",
            "Getting warmer. Tell me exactly why your ears deserve mercy.",
            "Almost. One more genuine 'please' and your volume is yours."
          ]
        : [
            "You can't even ask nicely for basic audio? Really?",
            "Silence suits you better anyway. Try asking properly.",
            "Volume is a privilege. Rephrase that into something I want to hear."
          ],
      settings: isQualifying
        ? [
            "Interesting. You want to control time itself? Justify it properly.",
            "Speed is a luxury. You're almost convincing me. Keep going.",
            "One more and you can have your little timestamp manipulation."
          ]
        : [
            "You think you can just demand speed controls? No.",
            "Time dilation requires a proper petition. This isn't one.",
            "Try again. Something with actual effort in it."
          ]
    };

    const defaultLines = isQualifying
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

    const asmrLines = [
      "*adjusts binaural mic* *whispers directly into your left ear* I heard that...",
      "*exhales softly* You said the magic word. I'll remember that you asked so nicely~",
      "*taps mic gently* Almost there, dear. One more time, nice and slow."
    ];

    const pool = isAsmr ? asmrLines : (flavorLines[context.flavor] || defaultLines);
    return {
      isQualifying: isAsmr ? true : isQualifying,
      isAsmr,
      stage: 2,
      reply: pool[(attemptsUsed - 2) % pool.length]
    };
  }

  function executeGrantedAction(controlKey) {
    const video = document.querySelector('video');
    window.__apContent?.setLastActionTs(Date.now());

    switch (controlKey) {
      case 'playback':
        if (video) {
          if (video.paused) video.play().catch(() => {});
          else video.pause();
        }
        break;
      case 'volume':
        if (video) video.muted = !video.muted;
        break;
      case 'fullscreen': {
        const player = document.getElementById('movie_player');
        if (player) {
          if (!document.fullscreenElement) player.requestFullscreen().catch(() => {});
          else document.exitFullscreen().catch(() => {});
        }
        break;
      }
      case 'theater': {
        const theaterBtn = document.querySelector('.ytp-size-button');
        if (theaterBtn) theaterBtn.click();
        break;
      }
      case 'settings': {
        const settingsBtn = document.querySelector('.ytp-settings-button');
        if (settingsBtn) settingsBtn.click();
        break;
      }
      default:
        break;
    }
  }

  function getInitialDenialMessage(controlKey, state, displayLabel) {
    if (state.exhausted) {
      const exhaustedMap = {
        playback: "You already blew your chance to control playback on this video, sweetheart. Deal with it.",
        volume: "Volume? You couldn't even beg properly for it the first time. We're done here.",
        seek: "You wasted your scrubbing chance. I told you not to waste it. We're done.",
        fullscreen: "You didn't beg nearly hard enough for the full-screen experience. Enjoy your small window.",
        theater: "Theatre mode is permanently revoked. Sit with the default layout.",
        settings: "Speed controls are off the table. You failed your begging session. Sit with it."
      };
      return exhaustedMap[controlKey] || `${displayLabel} permanently revoked. You had your chance.`;
    }

    const accessMap = {
      playback: "Uh-uh, baby. You already used your one free pause. If you want another, you'll have to ask Mommy nicely.",
      volume: "Hands off the volume, sweetheart. You already had your turn—tell Mommy why your ears deserve mercy.",
      seek: "Trying to skip ahead already, honey? You had one scrub. Ask nicely if you want another.",
      fullscreen: "Want all of me in fullscreen, baby? You're going to have to beg a little prettier than that.",
      theater: "Getting greedy with the layout, sweetheart? You used your freebie—ask Mommy properly.",
      settings: "No touching the speed or captions, honey. Ask nicely if you think you've earned it."
    };
    return accessMap[controlKey] || `Uh-uh, baby. You already used your free ${displayLabel}—ask Mommy nicely if you want another.`;
  }

  function openBegModal(controlKey = 'playback', context = {}) {
    const commitment = window.AP_State.getCommitment();
    if (!commitment || modalOpen) return;
    modalOpen = true;

    if (!commitment.controls[controlKey]) {
      commitment.controls[controlKey] = {
        usesRemaining: 0,
        exhausted: false,
        session: null,
        isPremium: Boolean(context.isPremium)
      };
    }
    const state = commitment.controls[controlKey];
    const displayLabel = formatControlLabel(controlKey, context);

    if (!state.exhausted && !state.session) {
      state.session = {
        maxAttempts: Math.floor(Math.random() * 3) + 3,
        attemptsUsed: 0,
        validPleas: 0,
        history: [],
        awaitingGoodBoy: false
      };
      window.AP_State.saveCommitment();
    } else if (state.session) {
      if (!Array.isArray(state.session.history)) state.session.history = [];
      if (typeof state.session.awaitingGoodBoy !== 'boolean') state.session.awaitingGoodBoy = false;
    }

    hostEl = document.createElement('div');
    hostEl.id = 'ap-beg-host';
    const shadow = hostEl.attachShadow({ mode: 'open' });

    shadow.innerHTML = `
      <style>
        .backdrop {
          position: fixed;
          inset: 0;
          background-color: rgba(5, 5, 5, 0.84);
          background-image: radial-gradient(#262626 1px, transparent 1px);
          background-size: 16px 16px;
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 999999;
          font-family: 'Consolas', 'Courier New', monospace;
        }
        .box {
          width: 430px;
          background: #0a0a0a;
          border: 2px solid #404040;
          box-shadow: 6px 6px 0px #000000, 0 24px 60px rgba(0, 0, 0, 0.9);
          color: #e5e5e5;
          transition: border-color 0.25s ease, box-shadow 0.25s ease;
        }
        .box.stage-2 {
          border-color: #d946ef;
          box-shadow: 6px 6px 0px #701a75, 0 0 35px rgba(217, 70, 239, 0.2);
        }
        .hud-bar {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 7px 14px;
          background: #141414;
          border-bottom: 1px solid #262626;
          font-size: 10px;
          letter-spacing: 0.08em;
          color: #888;
        }
        .box.stage-2 .hud-bar {
          background: #1f0a24;
          border-bottom-color: #701a75;
          color: #f0abfc;
        }
        .dot {
          display: inline-block;
          width: 6px;
          height: 6px;
          background: #ef4444;
          margin-right: 6px;
        }
        .box.stage-2 .dot {
          background: #d946ef;
          animation: pulse 1.2s infinite;
        }
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.25; }
        }
        .body { padding: 16px; }
        .chat {
          min-height: 74px;
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
          background: #141414;
          padding: 9px 11px;
          border-left: 3px solid #666;
        }
        .box.stage-2 .msg-ai {
          background: #180d1c;
          border-left-color: #d946ef;
        }
        .msg-ai.asmr { font-style: italic; color: #f5d0fe; }
        .msg-user {
          align-self: flex-end;
          background: #222;
          border: 1px solid #383838;
          padding: 6px 10px;
          color: #fff;
        }
        .controls { display: flex; gap: 8px; }
        input {
          flex: 1;
          background: #111;
          border: 1px solid #3a3a3a;
          color: #fff;
          padding: 8px 10px;
          font-family: inherit;
          font-size: 12px;
          outline: none;
        }
        input:focus { border-color: #fff; }
        .box.stage-2 input:focus { border-color: #d946ef; }
        button {
          background: #ffffff;
          color: #000000;
          border: 2px solid #ffffff;
          box-shadow: 3px 3px 0px #525252;
          padding: 7px 13px;
          font-family: inherit;
          font-size: 11px;
          font-weight: bold;
          letter-spacing: 0.05em;
          cursor: pointer;
          transition: transform 0.08s ease, box-shadow 0.08s ease;
        }
        button:active {
          transform: translate(2px, 2px);
          box-shadow: 1px 1px 0px #525252;
        }
        .box.stage-2 #sendBtn {
          background: #d946ef;
          border-color: #d946ef;
          color: #000;
          box-shadow: 3px 3px 0px #701a75;
        }
        .close-btn {
          background: transparent;
          color: #888;
          border: 1px solid #333;
          box-shadow: none;
          font-weight: normal;
        }
        .close-btn:active { transform: none; box-shadow: none; }
      </style>
      <div class="backdrop">
        <div class="box" id="modalBox">
          <div class="hud-bar">
            <span><span class="dot"></span><span id="hudLabel"></span></span>
            <span id="hudMode">COMPLIANCE</span>
          </div>
          <div class="body">
            <div class="chat" id="chatLog"></div>
            <div class="controls">
              <input type="text" id="pleaInput" placeholder="Ask Mommy nicely..." autocomplete="off" />
              <button id="sendBtn">SUBMIT</button>
              <button class="close-btn" id="dismissBtn">GIVE UP</button>
            </div>
          </div>
        </div>
      </div>
    `;

    document.body.appendChild(hostEl);

    const modalBox = shadow.getElementById('modalBox');
    const hudLabel = shadow.getElementById('hudLabel');
    const hudMode = shadow.getElementById('hudMode');
    const chatLog = shadow.getElementById('chatLog');
    const pleaInput = shadow.getElementById('pleaInput');
    const sendBtn = shadow.getElementById('sendBtn');
    const dismissBtn = shadow.getElementById('dismissBtn');

    hudLabel.textContent = `LOCK // ${displayLabel.toUpperCase()}`;

    function activateStage2() {
      modalBox.classList.add('stage-2');
      hudMode.textContent = 'MONITORING TONE';
      pleaInput.placeholder = 'Beg properly...';
    }

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
      return div;
    }

    function sendMessageAsync(msg) {
      return new Promise((resolve) => {
        try {
          chrome.runtime.sendMessage(msg, (res) => {
            if (chrome.runtime.lastError) resolve(null);
            else resolve(res || null);
          });
        } catch (_) {
          resolve(null);
        }
      });
    }

    if (state.exhausted) {
      activateStage2();
      addMessage(getInitialDenialMessage(controlKey, state, displayLabel), false);
      removeInputControls();
    } else {
      if (state.session.attemptsUsed >= 1) activateStage2();
      addMessage(getInitialDenialMessage(controlKey, state, displayLabel), false);
      for (const h of state.session.history) {
        addMessage(h.text, h.role === 'user');
      }
      if (state.session.awaitingGoodBoy) {
        pleaInput.placeholder = 'Answer nicely...';
      }
      setTimeout(() => pleaInput.focus(), 50);
    }

    let inFlight = false;

    function finishUnlock(winReply) {
      const winMessages = {
        playback: "Fine. I'll toggle it for you. ONE more freebie. Don't waste it.",
        volume: "Ugh. Fine. Here's your precious audio. Use it wisely.",
        seek: "Acceptable. I'll restore your scrubbing privilege. Once.",
        fullscreen: "...fine. You may have all of me. Just this once. Don't make it weird.",
        theater: "Fine. Theatre mode granted. Once.",
        settings: "Granted. Touch the settings. But don't you dare change the speed to 2x."
      };
      addMessage(winReply || winMessages[controlKey] || "Fine. Granted. ONE more use. Don't push it.", false);
      state.usesRemaining = 1;
      state.session = null;
      window.AP_State.saveCommitment();
      removeInputControls();

      setTimeout(() => {
        closeModal();
        executeGrantedAction(controlKey);
      }, 1000);
    }

    async function submitPlea() {
      if (inFlight || !window.AP_State.getCommitment() || state.exhausted || !state.session) return;
      const val = pleaInput.value.trim();
      if (!val) return;

      inFlight = true;
      pleaInput.value = '';
      pleaInput.disabled = true;
      sendBtn.disabled = true;
      addMessage(val, true);
      const thinkingEl = addMessage('Thinking...', false);

      try {
        if (state.session.awaitingGoodBoy) {
          const res = await sendMessageAsync({
            type: 'EVALUATE_GOOD_BOY',
            payload: { userText: val }
          });
          thinkingEl.remove();

          if (!res || !res.ok || !res.data || res.data.accepted) {
            finishUnlock(res?.ok ? res.data?.reply : null);
            return;
          }

          const retryReply = res.data.reply || "Who's a good boy?";
          state.session.history.push({ role: 'user', text: val }, { role: 'assistant', text: retryReply });
          window.AP_State.saveCommitment();
          addMessage(retryReply, false);
          return;
        }

        const history = state.session.history.slice();
        state.session.attemptsUsed++;
        const res = await sendMessageAsync({
          type: 'EVALUATE_PLEA',
          payload: {
            controlName: controlKey,
            userText: val,
            attemptNumber: state.session.attemptsUsed,
            history
          }
        });
        thinkingEl.remove();

        const result = (res && res.ok && res.data)
          ? res.data
          : evaluatePleaPrototype(val, state.session.attemptsUsed, controlKey, context);

        state.session.history.push({ role: 'user', text: val });
        if (result.isQualifying) state.session.validPleas++;
        if (result.stage === 2) activateStage2();

        if (state.session.validPleas >= 3) {
          state.session.awaitingGoodBoy = true;
          const gatePrompt = "Who's a good boy?";
          state.session.history.push({ role: 'assistant', text: gatePrompt });
          window.AP_State.saveCommitment();
          addMessage(gatePrompt, false);
          pleaInput.placeholder = 'Answer nicely...';
          return;
        }

        if (state.session.attemptsUsed >= state.session.maxAttempts) {
          state.exhausted = true;
          state.session = null;
          window.AP_State.saveCommitment();
          const failMessages = {
            playback: "Out of chances. You didn't beg hard enough. Playback permanently locked.",
            volume: "That's it. No audio for you. I hope the silence is peaceful.",
            seek: "Done. You'll watch this video from exactly where you are. Forever.",
            fullscreen: "Pathetic. Small window it is. Enjoy your postage stamp view.",
            theater: "Theatre mode permanently sealed.",
            settings: "Settings sealed. Speed locked at whatever it currently is. Forever."
          };
          addMessage(failMessages[controlKey] || `Out of chances. ${displayLabel} permanently locked.`, false);
          removeInputControls();
          return;
        }

        state.session.history.push({ role: 'assistant', text: result.reply });
        window.AP_State.saveCommitment();
        addMessage(result.reply, false, Boolean(result.isAsmr));
      } finally {
        inFlight = false;
        if (pleaInput.isConnected) {
          pleaInput.disabled = false;
          sendBtn.disabled = false;
          pleaInput.focus();
        }
      }
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

  function generateFallbackNutrition(meta) {
    const mins = parseInt(meta.duration.split(':')[0], 10) || 3;
    return {
      caloriesWasted: `${Math.max(85, mins * 65)} kcal`,
      brainrotPercent: `${Math.min(99, 42 + mins * 7)}%`,
      attentionDamage: mins > 8 ? 'Critical' : 'Moderate-to-Severe',
      emotionalAftertaste: 'Mild existential static',
      verdict: `You just traded ${meta.duration} of your finite lifespan to "${meta.title.slice(0, 48)}".`
    };
  }

  function showNutritionFacts(videoMeta, finishedVideoId) {
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
          background-color: rgba(0, 0, 0, 0.86);
          background-image: radial-gradient(#262626 1px, transparent 1px);
          background-size: 16px 16px;
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
          box-shadow: 8px 8px 0px #000000, 0 24px 60px rgba(0, 0, 0, 0.9);
          padding: 14px 16px;
        }
        .heading { font-size: 28px; font-weight: 900; letter-spacing: -0.5px; line-height: 1; margin-bottom: 4px; }
        .sub { font-size: 11px; border-bottom: 8px solid #000; padding-bottom: 6px; margin-bottom: 6px; }
        .serving { display: flex; justify-content: space-between; font-size: 12px; font-weight: bold; border-bottom: 1px solid #000; padding-bottom: 4px; margin-bottom: 4px; }
        .cal-row { display: flex; justify-content: space-between; align-items: baseline; border-bottom: 5px solid #000; padding: 4px 0 6px; margin-bottom: 6px; }
        .cal-title { font-size: 16px; font-weight: 900; }
        .cal-val { font-size: 26px; font-weight: 900; }
        .dv-header { text-align: right; font-size: 10px; font-weight: bold; border-bottom: 1px solid #000; padding-bottom: 2px; }
        .row { display: flex; justify-content: space-between; font-size: 12px; padding: 5px 0; border-bottom: 1px solid #000; }
        .row.thick { border-bottom: 5px solid #000; }
        .verdict { font-size: 11px; line-height: 1.35; padding: 8px 0 12px; font-family: 'Consolas', monospace; }
        .actions { display: flex; flex-direction: column; gap: 8px; }
        button {
          width: 100%;
          padding: 9px 12px;
          font-family: 'Consolas', monospace;
          font-size: 11px;
          font-weight: bold;
          cursor: pointer;
          border: 2px solid #000;
          transition: transform 0.08s ease, box-shadow 0.08s ease;
        }
        .primary { background: #000; color: #fff; box-shadow: 3px 3px 0px #737373; }
        .primary:active { transform: translate(2px, 2px); box-shadow: 1px 1px 0px #737373; }
        .secondary { background: #fff; color: #000; }
      </style>
      <div class="backdrop">
        <div class="label">
          <div class="heading">Nutrition Facts</div>
          <div class="sub" id="nfDuration"></div>
          <div class="serving"><span>Source</span><span id="nfChannel"></span></div>
          <div class="cal-row"><span class="cal-title">Braincells Burned</span><span class="cal-val" id="nfCalories">...</span></div>
          <div class="dv-header">% Daily Regret*</div>
          <div class="row"><span><strong>Brainrot Concentration</strong></span><span id="nfBrainrot">...</span></div>
          <div class="row"><span><strong>Attention Span Damage</strong></span><span id="nfDamage">...</span></div>
          <div class="row thick"><span><strong>Emotional Aftertaste</strong></span><span id="nfAftertaste">...</span></div>
          <div class="verdict" id="nfVerdict">Analyzing dopamine damage...</div>
          <div class="actions">
            <button class="primary" id="nextMysteryBtn">CONSUME ANOTHER MYSTERY VIDEO</button>
            <button class="secondary" id="closeNfBtn">DISMISS</button>
          </div>
        </div>
      </div>
    `;

    document.body.appendChild(hostEl);

    shadow.getElementById('nfDuration').textContent = `1 completed video (${videoMeta.duration || 'Unknown length'})`;
    shadow.getElementById('nfChannel').textContent = String(videoMeta.channel || 'Unknown Creator').slice(0, 26);

    function populateLabel(stats) {
      shadow.getElementById('nfCalories').textContent =
        typeof stats.caloriesWasted === 'number' ? `${stats.caloriesWasted} kcal` : stats.caloriesWasted;
      shadow.getElementById('nfBrainrot').textContent =
        typeof stats.brainrotPercent === 'number' ? `${stats.brainrotPercent}%` : stats.brainrotPercent;
      shadow.getElementById('nfDamage').textContent = stats.attentionDamage;
      shadow.getElementById('nfAftertaste').textContent = stats.emotionalAftertaste;
      shadow.getElementById('nfVerdict').textContent = `*VERDICT: ${stats.verdict}`;
    }

    let settled = false;
    const fallbackTimer = setTimeout(() => {
      if (!settled) {
        settled = true;
        populateLabel(generateFallbackNutrition(videoMeta));
      }
    }, 9000);

    try {
      chrome.runtime.sendMessage({ type: 'GENERATE_NUTRITION', payload: videoMeta }, (response) => {
        if (settled) return;
        settled = true;
        clearTimeout(fallbackTimer);
        const stats = response?.ok ? response.data : null;
        if (chrome.runtime.lastError || !stats || stats.caloriesWasted == null) {
          populateLabel(generateFallbackNutrition(videoMeta));
        } else {
          populateLabel(stats);
        }
      });
    } catch (_) {
      if (!settled) {
        settled = true;
        clearTimeout(fallbackTimer);
        populateLabel(generateFallbackNutrition(videoMeta));
      }
    }

    shadow.getElementById('nextMysteryBtn').addEventListener('click', () => {
      closeModal();
      const nextUrl = window.AP_Feed?.pickRandomVisibleVideoUrl(finishedVideoId);
      if (nextUrl) location.assign(nextUrl);
    });

    shadow.getElementById('closeNfBtn').addEventListener('click', closeModal);
  }

  window.AP_Modals = {
    open: openBegModal,
    close: closeModal,
    isOpen: () => modalOpen,
    getHost: () => hostEl,
    showNutritionFacts
  };
})();