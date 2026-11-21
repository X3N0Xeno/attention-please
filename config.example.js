// Copy to config.js (gitignored!) and fill in your key.
// Any extension-bundled key is extractable. Fine for a hackathon, never for production.
const CONFIG = {
  GEMINI_API_KEY: "YOUR_GEMINI_API_KEY_HERE",
  MODEL: "gemini-2.5-flash",
  THINKING_BUDGET: 0, // faster replies on 2.5 Flash. Delete this line if Gemini returns a 400 about thinking.
  USE_MOCK: true,     // true = prototype-style replies, no API calls. Flip to false once the key works in-extension.
};
