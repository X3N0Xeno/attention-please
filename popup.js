const toggleBtn = document.getElementById('toggleBtn');
const statusText = document.getElementById('statusText');
const commitmentBox = document.getElementById('commitmentBox');
const resetBtn = document.getElementById('resetBtn');

function updateUI(enabled, commitment) {
  toggleBtn.textContent = enabled ? 'ON' : 'OFF';
  toggleBtn.classList.toggle('active', enabled);
  statusText.textContent = enabled
    ? 'Active: Thumbnails & metadata suppressed.'
    : 'Visual masking inactive.';

  if (commitment && commitment.activeVideoId) {
    commitmentBox.classList.add('visible');
    commitmentBox.textContent = `COMMITMENT ACTIVE (${commitment.activeVideoId}): Finish watching to unlock.`;
  } else {
    commitmentBox.classList.remove('visible');
  }
}

chrome.storage.local.get({ mysteryShelfEnabled: false, commitmentState: null }, (data) => {
  updateUI(data.mysteryShelfEnabled, data.commitmentState);
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local') {
    chrome.storage.local.get({ mysteryShelfEnabled: false, commitmentState: null }, (data) => {
      updateUI(data.mysteryShelfEnabled, data.commitmentState);
    });
  }
});

toggleBtn.addEventListener('click', () => {
  chrome.storage.local.get({ mysteryShelfEnabled: false, commitmentState: null }, (data) => {
    const nextState = !data.mysteryShelfEnabled;
    chrome.storage.local.set({ mysteryShelfEnabled: nextState }, () => {
      updateUI(nextState, data.commitmentState);
    });
  });
});

resetBtn.addEventListener('click', () => {
  chrome.storage.local.remove('commitmentState', () => {
    chrome.storage.local.get({ mysteryShelfEnabled: false }, (data) => {
      updateUI(data.mysteryShelfEnabled, null);
    });
  });
});