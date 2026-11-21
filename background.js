// background.js — MV3 background worker (Chromium service_worker + Floorp background.scripts).
// Runs LLM calls here to avoid CORS. No in-memory state because the worker can sleep.

if (typeof importScripts === "function") {
  importScripts("config.js", "ai-client.js");
}

const api = globalThis.browser ?? globalThis.chrome;

api.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (!msg || typeof msg.type !== "string") return false;

  if (msg.type === "PING") {
    const cfg = typeof CONFIG !== "undefined" ? CONFIG : null;
    sendResponse({
      ok: true,
      data: {
        pong: true,
        mock: Boolean(cfg?.USE_MOCK),
        model: cfg?.MODEL ?? null,
      },
    });
    return false;
  }

  if (msg.type === "EVALUATE_PLEA") {
    evaluatePlea(msg.payload)
      .then((data) => sendResponse({ ok: true, data }))
      .catch((err) => sendResponse({ ok: false, error: String(err?.message || err) }));
    return true;
  }

  if (msg.type === "EVALUATE_GOOD_BOY") {
    evaluateGoodBoy(msg.payload)
      .then((data) => sendResponse({ ok: true, data }))
      .catch((err) => sendResponse({ ok: false, error: String(err?.message || err) }));
    return true;
  }

  if (msg.type === "GENERATE_NUTRITION") {
    generateNutrition(msg.payload)
      .then((data) => sendResponse({ ok: true, data }))
      .catch((err) => sendResponse({ ok: false, error: String(err?.message || err) }));
    return true;
  }

  return false;
});
