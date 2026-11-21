document.addEventListener('DOMContentLoaded', () => {
  const statusBadge = document.getElementById('statusBadge');
  const freedomView = document.getElementById('freedomView');
  const toggleMysteryBtn = document.getElementById('toggleMysteryBtn');
  const chatLog = document.getElementById('chatLog');
  const inputRow = document.getElementById('inputRow');
  const pleaInput = document.getElementById('pleaInput');
  const sendBtn = document.getElementById('sendBtn');
  const emergencyResetBtn = document.getElementById('emergencyResetBtn');

  let mysteryEnabled = false;
  let commitment = null;

  function evaluateFreedomPleaPrototype(userText, attemptsUsed) {
    const text = userText.trim().toLowerCase();
    const politeMarkers = ['please', 'pretty please', 'beg', 'mommy', 'may i', 'let me', 'sorry', 'plz', 'free'];
    const isQualifying = politeMarkers.some((word) => text.includes(word)) && text.length >= 4;

    if (attemptsUsed === 1) {
      return {
        isQualifying,
        stage: 1,
        reply: isQualifying
          ? 'Escape request logged. Early termination requires stronger justification.'
          : 'Access denied. You committed to this video. State why you deserve early release.'
      };
    }

    const teasingLines = isQualifying
      ? [
          "Aww, trying to run away already? Ask a little sweeter and maybe I'll let you go.",
          "You're actually begging to leave a YouTube video... adorable. One more 'please'.",
          "Almost convinced me, sweetheart. Don't stop now."
        ]
      : [
          "Running away without even saying please? Sit down and finish your video.",
          "That attitude keeps you locked right where you are.",
          "Try asking nicely if you want out of timeout."
        ];

    const reply = teasingLines[(attemptsUsed - 2) % teasingLines.length];
    return { isQualifying, stage: 2, reply };
  }

  function addMessage(text, isUser) {
    const div = document.createElement('div');
    div.className = isUser ? 'msg-user' : 'msg-ai';
    div.textContent = text;
    chatLog.appendChild(div);
    chatLog.scrollTop = chatLog.scrollHeight;
  }

  function renderUI() {
    toggleMysteryBtn.textContent = mysteryEnabled ? 'ON' : 'OFF';
    toggleMysteryBtn.classList.toggle('active', mysteryEnabled);

    if (commitment && commitment.activeVideoId) {
      statusBadge.textContent = 'LOCKED';
      statusBadge.classList.add('locked');
      freedomView.classList.remove('hidden');

      if (!commitment.controls.freedom) {
        commitment.controls.freedom = { usesRemaining: 0, exhausted: false, session: null };
      }

      const freedomState = commitment.controls.freedom;
      if (!freedomState.exhausted && !freedomState.session) {
        freedomState.session = {
          maxAttempts: Math.floor(Math.random() * 3) + 3,
          attemptsUsed: 0,
          validPleas: 0
        };
        chrome.storage.local.set({ commitmentState: commitment });
      }

      chatLog.innerHTML = '';
      if (freedomState.exhausted) {
        document.body.classList.add('stage-2');
        addMessage("You blew your escape attempt, sweetheart. Finish the video.", false);
        inputRow.classList.add('hidden');
      } else {
        inputRow.classList.remove('hidden');
        if (freedomState.session.attemptsUsed >= 1) {
          document.body.classList.add('stage-2');
        } else {
          document.body.classList.remove('stage-2');
        }
        addMessage("Trying to sneak out early? Beg for your freedom.", false);
        setTimeout(() => pleaInput.focus(), 50);
      }
    } else {
      document.body.classList.remove('stage-2');
      statusBadge.textContent = mysteryEnabled ? 'ACTIVE' : 'IDLE';
      statusBadge.classList.remove('locked');
      freedomView.classList.add('hidden');
    }
  }

  chrome.storage.local.get(
    { mysteryShelfEnabled: false, commitmentState: null },
    (data) => {
      mysteryEnabled = Boolean(data.mysteryShelfEnabled);
      commitment = data.commitmentState;
      renderUI();
    }
  );

  toggleMysteryBtn.addEventListener('click', () => {
    mysteryEnabled = !mysteryEnabled;
    chrome.storage.local.set({
      mysteryShelfEnabled: mysteryEnabled,
      lastReleasedVideoId: null
    }, () => {
      renderUI();
    });
  });

  function submitFreedomPlea() {
    if (!commitment || !commitment.controls?.freedom) return;
    const freedomState = commitment.controls.freedom;
    if (freedomState.exhausted || !freedomState.session) return;

    const val = pleaInput.value.trim();
    if (!val) return;

    pleaInput.value = '';
    addMessage(val, true);

    freedomState.session.attemptsUsed++;
    const result = evaluateFreedomPleaPrototype(val, freedomState.session.attemptsUsed);

    if (result.isQualifying) {
      freedomState.session.validPleas++;
    }

    if (result.stage === 2) {
      document.body.classList.add('stage-2');
    }

    if (freedomState.session.validPleas >= 3) {
      addMessage("Fine, you're free to go. Run along now.", false);
      inputRow.classList.add('hidden');
      const releasedId = commitment.activeVideoId;

      setTimeout(() => {
        commitment = null;
        chrome.storage.local.set(
          {
            commitmentState: null,
            lastReleasedVideoId: releasedId
          },
          () => renderUI()
        );
      }, 950);
      return;
    }

    if (freedomState.session.attemptsUsed >= freedomState.session.maxAttempts) {
      freedomState.exhausted = true;
      freedomState.session = null;
      chrome.storage.local.set({ commitmentState: commitment });
      addMessage("Out of chances. You're stuck watching until the very end.", false);
      inputRow.classList.add('hidden');
      return;
    }

    chrome.storage.local.set({ commitmentState: commitment });
    addMessage(result.reply, false);
  }

  sendBtn.addEventListener('click', submitFreedomPlea);
  pleaInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      submitFreedomPlea();
    }
  });

  emergencyResetBtn.addEventListener('click', () => {
    mysteryEnabled = false;
    commitment = null;
    chrome.storage.local.set(
      {
        mysteryShelfEnabled: false,
        commitmentState: null,
        lastReleasedVideoId: null
      },
      () => renderUI()
    );
  });
});