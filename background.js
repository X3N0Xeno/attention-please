// background.js — MV3 background worker (Chromium service_worker + Floorp background.scripts).
// Runs LLM calls here to avoid CORS. No in-memory state because the worker can sleep.

if (typeof importScripts === "function") {
  try {
    importScripts("config.js");
  } catch (_) {
    console.warn(
      "Attention, please!: config.js not found — running in mock mode. Copy config.example.js to config.js to enable Gemini."
    );
  }
  importScripts("ai-client.js");
}

const api = globalThis.browser ?? globalThis.chrome;

const HANDLERS = {
  EVALUATE_PLEA: evaluatePlea,
  EVALUATE_GOOD_BOY: evaluateGoodBoy,
  GENERATE_NUTRITION: generateNutrition,
};

api.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (!msg || typeof msg.type !== "string") return false;

  if (msg.type === "PING") {
    const cfg = typeof CONFIG !== "undefined" ? CONFIG : { USE_MOCK: true, MODEL: null };
    const mock = typeof isMockMode === "function" ? isMockMode() : Boolean(cfg.USE_MOCK);
    sendResponse({
      ok: true,
      data: {
        pong: true,
        mock,
        model: cfg.MODEL ?? null,
      },
    });
    return false;
  }

  const handler = HANDLERS[msg.type];
  if (!handler) return false;

  handler(msg.payload || {})
    .then((data) => sendResponse({ ok: true, data }))
    .catch((err) => sendResponse({ ok: false, error: String(err?.message || err) }));
  return true;
});
