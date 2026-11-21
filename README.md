Attention, please!

“You clicked it. Now live with it.”
Built by Hey you know what’s a good weekend side quest? I think I have an IDE.A. Say that again? IDE.A

Attention, please! is an anti-productivity Chrome extension that turns YouTube into a mystery-box hostage situation. Every thumbnail becomes a blank grey box, every click is a gamble, every player control works only once, and if you want to pause, adjust the volume, or leave—you’ll have to beg an AI for permission.

Features
1. Mystery Shelf

When switched ON, all YouTube titles and text turn invisible, and every thumbnail transforms into YouTube’s native grey loading skeleton. Clicking any card (including middle-click or Ctrl+Click) hijacks navigation, scans all /watch?v=... links on the page, and redirects you to a completely random video.

2. Commitment Mode

Once a mystery video opens, you are locked in until it finishes. Clicking other videos, navigating away, or even toggling the extension OFF will not free you from an active video. Miniplayer, theatre mode, and playlist auto-advance are blocked so nothing bypasses your sentence.

3. One-Time Controls

Every core video control works exactly once per video. After that single free use, it locks:

Control	Intercepted Inputs & UI Elements
Playback	Play/Pause button, Space, K
Volume / Mute	.ytp-mute-button, .ytp-volume-panel, M, ArrowUp, ArrowDown
Seek / Scrub	.ytp-progress-bar, ArrowLeft, ArrowRight, J, L, 0–9
Fullscreen	.ytp-fullscreen-button, F, double-click on video
Speed & Captions	.ytp-settings-button, C, <, >
Bypass Traps (Blocked)	Miniplayer (I), Theatre Mode (T), Playlist Auto-Advance
4. The AI Begging System

Trying to use a locked control opens the in-page Beg for Privileges modal. Trying to escape the video early via the extension popup opens Beg for Freedom.

The Personality Shift: The AI permission manager starts as a cold, robotic corporate sysadmin (“Access denied. Privilege already consumed.”) and gradually shifts into a teasing, dominant “Mommy” persona (“Are you seriously asking me again? You know what you need to say. Ask nicely.”).
Code-Enforced Rules: Rules are enforced strictly by the extension’s state machine—not the LLM. Each begging session grants a random limit of 3 to 5 replies, and you must submit at least 3 genuine begging messages (classified by the AI) to unlock the control or escape.
Permanent Lockout: Fail to convince the AI within your reply limit, and that control (or escape attempt) is permanently locked for the rest of the video.
5. AI Nutrition Facts

When you finally survive to the end of the video, an FDA-style black-and-white Nutrition Facts modal pops up summarizing what you just consumed—scraped from the video’s hidden title, channel, description, and comments/captions:

Calories / Time Wasted
Brainrot %
Attention Span Damage
Emotional Aftertaste
Final Verdict

Click “Consume Another Mystery Video” to reset the state and spin the wheel again.

Architecture & Project Structure
attention-please-main/
├── manifest.json   # Extension configuration, permissions, and service worker setup
├── content.js      # Feed randomizer, YouTube DOM masking, Shadow DOM modals, video end hooks
├── styles.css      # Grey loading-skeleton masking, hidden text, and Shadow DOM modal styling
├── popup.html      # Extension popup markup (Mystery Shelf toggle + Beg for Freedom chat)
├── popup.js        # Popup state handling and escape begging flow
├── lockouts.js     # Player control interception, keyboard traps, and chrome.storage.local state
├── background.js   # Background service worker routing chrome.runtime.onMessage AI requests
└── ai-client.js    # LLM prompts, structured JSON parsing, and video metadata scraping
 
Internal Message API (chrome.runtime.onMessage)
EVALUATE_PLEA
Input: { controlName, userText, attemptNumber, history } (uses controlName: "escape" for popup freedom requests)
Output: { isQualifying: boolean, stage: 1 | 2, reply: string }
GENERATE_NUTRITION
Input: Scraped video context (title, channel, description, top comments/captions)
Output: { caloriesWasted, brainrotPercent, attentionDamage, emotionalAftertaste, verdict }
Persistent State (chrome.storage.local)

commitmentState persists across page interactions and popup sessions, tracking:

Active commitment status and locked video URL
usesRemaining (initialized to 1) for all 5 controls (playback, volume, seek, fullscreen, settings)
Per-session reply limits (3–5), qualifying plea counts, and permanent lockout flags
Installation (Developer Mode)

Works on Google Chrome, Floorp, and other Chromium/compatible browsers:

Clone or download this repository and unzip it if needed.
Open your browser and navigate to chrome://extensions/.
Enable Developer mode in the top-right corner.
Click Load unpacked and select the attention-please-main directory.
(Optional) Configure your LLM API key in ai-client.js (or your environment/storage config).
Pin Attention, please! to your toolbar so you can access Mystery Shelf and Beg for Freedom.
How to Use
Go to YouTube.
Click the Attention, please! icon in your toolbar and toggle Mystery Shelf ON.
Click any blank grey box on the page and accept your fate.
Spend your one free pause, mute, or scrub wisely.
When a control locks—or if you want out early—beg for your privileges, survive the video, and review your AI Nutrition Facts.
Development Workflow

This project is organized into three parallel feature tracks to minimize merge conflicts:

feat/ai-engine (background.js, ai-client.js) — Service worker message routing, Sysadmin-to-Mommy prompt pipeline, video metadata scraping, and Nutrition Facts generation.
feat/mystery-and-ui (styles.css, popup.html, popup.js, UI/Randomizer in content.js) — Native grey-box masking, link click hijacking, Beg for Freedom popup, and FDA-style Nutrition Facts Shadow DOM modal.
feat/control-lockouts (lockouts.js, wiring in content.js) — chrome.storage.local state engine, 5-control interception, keyboard traps, and bypass hardening.

To test local changes, reload the extension at chrome://extensions/ and refresh your YouTube tab.

Team

Created by Hey you know what’s a good weekend side quest? I think I have an IDE.A. Say that again? IDE.A.
