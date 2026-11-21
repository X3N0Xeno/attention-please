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

  function formatControlLabel(controlName) {
    const labels = {
      playback: 'Play/Pause',
      volume: 'Volume/Mute',
      seek: 'Seek/Scrub',
      fullscreen: 'Fullscreen',
      settings: 'Playback Settings'
    };
    return labels[controlName] || controlName.charAt(0).toUpperCase() + controlName.slice(1);
  }

  function evaluatePleaPrototype(userText, attemptsUsed, displayLabel) {
    const text = userText.trim().toLowerCase();
    const politeMarkers = ['please', 'pretty please', 'beg', 'mommy', 'may i', 'let me', 'sorry', 'plz'];
    const isQualifying = politeMarkers.some((word) => text.includes(word)) && text.length >= 4;

    if (attemptsUsed === 1) {
      return {
        isQualifying,
        stage: 1,
        reply: isQualifying
          ? `${displayLabel} petition logged. Threshold unmet. Submit further justification.`
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

    return {
      isQualifying,
      stage: 2,
      reply: teasingLines[(attemptsUsed - 2) % teasingLines.length]
    };
  }

  function openBegModal(controlName = 'playback', onActionGranted = null) {
    const commitment = window.AP_State.getCommitment();
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
      window.AP_State.saveCommitment();
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
        .body {
          padding: 16px;
        }
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
        .msg-user {
          align-self: flex-end;
          background: #222;
          border: 1px solid #383838;
          padding: 6px 10px;
          color: #fff;
        }
        .controls {
          display: flex;
          gap: 8px;
        }
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
        input:focus {
          border-color: #fff;
        }
        .box.stage-2 input:focus {
          border-color: #d946ef;
        }
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
        .close-btn:active {
          transform: none;
          box-shadow: none;
        }
      </style>
      <div class="backdrop">
        <div class="box" id="modalBox">
          <div class="hud-bar">
            <span><span class="dot"></span><span id="hudStatus">LOCK // ${displayLabel.toUpperCase()}</span></span>
            <span id="hudMode">COMPLIANCE</span>
          </div>
          <div class="body">
            <div class="chat" id="chatLog"></div>
            <div class="controls">
              <input type="text" id="pleaInput" placeholder="Submit petition..." autocomplete="off" />
              <button id="sendBtn">SUBMIT</button>
              <button class="close-btn" id="dismissBtn">GIVE UP</button>
            </div>
          </div>
        </div>
      </div>
    `;

    document.body.appendChild(hostEl);

    const modalBox = shadow.getElementById('modalBox');
    const hudMode = shadow.getElementById('hudMode');
    const chatLog = shadow.getElementById('chatLog');
    const pleaInput = shadow.getElementById('pleaInput');
    const sendBtn = shadow.getElementById('sendBtn');
    const dismissBtn = shadow.getElementById('dismissBtn');

    function activateStage2() {
      modalBox.classList.add('stage-2');
      hudMode.textContent = 'MONITORING TONE';
      pleaInput.placeholder = 'Beg properly...';
    }

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
      activateStage2();
      addMessage(`You already blew your chance to use ${displayLabel} on this video, sweetheart. Deal with it.`, false);
      removeInputControls();
    } else {
      if (state.session.attemptsUsed >= 1) activateStage2();
      addMessage(`Access denied. ${displayLabel} privilege has already been consumed.`, false);
      setTimeout(() => pleaInput.focus(), 50);
    }

    function submitPlea() {
      if (!window.AP_State.getCommitment() || state.exhausted || !state.session) return;
      const val = pleaInput.value.trim();
      if (!val) return;

      pleaInput.value = '';
      addMessage(val, true);

      state.session.attemptsUsed++;
      const result = evaluatePleaPrototype(val, state.session.attemptsUsed, displayLabel);

      if (result.isQualifying) state.session.validPleas++;
      if (result.stage === 2) activateStage2();

      if (state.session.validPleas >= 3) {
        const winText =
          controlName === 'playback'
            ? "Good job. I'll toggle it for you now and give you ONE more freebie. Don't waste it."
            : `Good job. I'll grant you ONE ${displayLabel} action. Don't waste it.`;

        addMessage(winText, false);
        state.usesRemaining = 1;
        state.session = null;
        window.AP_State.saveCommitment();
        removeInputControls();

        setTimeout(() => {
          closeModal();
          if (typeof onActionGranted === 'function') onActionGranted(controlName);
        }, 1000);
        return;
      }

      if (state.session.attemptsUsed >= state.session.maxAttempts) {
        state.exhausted = true;
        state.session = null;
        window.AP_State.saveCommitment();
        addMessage(`Out of chances. You didn't beg hard enough. ${displayLabel} permanently locked.`, false);
        removeInputControls();
        return;
      }

      window.AP_State.saveCommitment();
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
          <div class="sub">1 completed video (${videoMeta.duration || 'Unknown length'})</div>
          <div class="serving"><span>Source</span><span>${videoMeta.channel.slice(0, 26)}</span></div>
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

    function populateLabel(stats) {
      shadow.getElementById('nfCalories').textContent = stats.caloriesWasted;
      shadow.getElementById('nfBrainrot').textContent = stats.brainrotPercent;
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
    }, 2500);

    try {
      chrome.runtime.sendMessage({ type: 'GENERATE_NUTRITION', ...videoMeta }, (response) => {
        if (settled) return;
        settled = true;
        clearTimeout(fallbackTimer);
        if (chrome.runtime.lastError || !response || !response.caloriesWasted) {
          populateLabel(generateFallbackNutrition(videoMeta));
        } else {
          populateLabel(response);
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