# AI Engine Message Contract (Laptop 1)

All LLM calls run in `background.js` (MV3 service worker on Chromium, `background.scripts` on Floorp). Content scripts and the popup communicate with it via `chrome.runtime.sendMessage` / `browser.runtime.sendMessage`.

## Local Setup (Laptops 2 & 3)

1. **Copy `config.example.js` to `config.js`** (gitignored — never commit `config.js`) and paste the shared `GEMINI_API_KEY`.
2. Set `USE_MOCK: true` if you want instant offline replies while building UI, or `USE_MOCK: false` for live Gemini.
3. If `config.js` is missing, the background worker still boots safely in **mock mode** and logs a `console.warn` reminder.
4. **Floorp note:** After loading `manifest.json` via `about:debugging`, check `about:addons` → Permissions and make sure `https://generativelanguage.googleapis.com/*` is enabled.

## Envelope

```js
// Request
{ type: "PING" | "EVALUATE_PLEA" | "EVALUATE_GOOD_BOY" | "GENERATE_NUTRITION", payload?: object }

// Response
{ ok: true, data: object }
{ ok: false, error: string }
```

Every AI response includes `source: "gemini" | "mock" | "fallback"` for debugging.

---

## 1. `PING`

Health check for the background worker.

- **Request:** `{ type: "PING" }`
- **Response `data`:** `{ pong: true, mock: boolean, model: string | null }`

---

## 2. `EVALUATE_PLEA`

Judges a single begging plea and returns an in-character reply. The AI **never** grants or unlocks anything; `content.js` tracks `validPleas` and unlocks at 3.

- **Request `payload`:**
  ```js
  {
    controlName: "playback" | "escape" | "volume" | "seek" | "fullscreen" | string,
    userText: string,          // current plea
    attemptNumber: number,     // 1-based; 1 -> stage 1 (Mommy - initial), 2+ -> stage 2 (Mommy - escalated)
    history: [                 // previous turns only (current userText is deduped if included)
      { role: "user" | "assistant", text: string }
    ]
  }
  ```
- **Response `data`:**
  ```js
  {
    isQualifying: boolean,
    stage: 1 | 2,              // forced by attemptNumber in code
    reply: string,
    source: "gemini" | "mock" | "fallback"
  }
  ```
- **Fallback behavior:** On any Gemini error (429, timeout, safety block, invalid JSON), `heuristicPlea()` runs so the game stays winnable.

---

## 3. `EVALUATE_GOOD_BOY`

Final confirmation gate before closing the plea modal. Once `validPleas >= 3`, `content.js` (Laptop 2/3) should display `"Who's a good boy?"` instead of closing immediately, then send the user's reply here. Unlock and close the modal once `data.accepted === true`.

- **Request `payload`:**
  ```js
  {
    userText: string // user's response (e.g. "me", "I am", "it's me", etc.)
  }
  ```
- **Response `data`:**
  ```js
  {
    accepted: boolean,
    reply: string,
    source: "gemini" | "mock" | "fallback"
  }
  ```
- **Fallback behavior:** On any Gemini error, `heuristicGoodBoy()` checks for non-negated self-referential phrasing (`me`, `I am`, `it's me`, `myself`, etc.).

---

## 4. `GENERATE_NUTRITION`

Generates satirical FDA-style Nutrition Facts for a finished video.

- **Request `payload`:** object returned by `await getVideoContext()` (from `video-context.js`, loaded before `content.js` in `manifest.json`):
  ```js
  {
    title: string,
    channel: string,
    description: string,
    comments: string[]
  }
  ```
  > **Important for Laptop 2:** Call `await getVideoContext()` early (when playback starts) and cache it, then pass the cached object to `GENERATE_NUTRITION` on the `ended` event. By `ended`, YouTube autoplay may have already mutated the DOM.
- **Response `data`:**
  ```js
  {
    caloriesWasted: number,      // integer 0..2000
    brainrotPercent: number,     // integer 0..100
    attentionDamage: string,     // short phrase
    emotionalAftertaste: string, // short phrase
    verdict: string,             // one sentence
    source: "gemini" | "mock" | "fallback"
  }
  ```
