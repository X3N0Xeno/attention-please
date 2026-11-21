# Design: Duration × Brainrot Ratio for Attention Span Damage

## Intent & Why
Right now, `attentionDamage` on the Nutrition Facts card is guessed by Gemini without knowing how long the video was. Users should see a rating that reflects **both** video length (with ~30–40 minutes as long-form) and how "brainrot" the subject is:
- **Long (30–40+ min) + substantive** → `Minimal`
- **Short + substantive** → `Low`
- **Short + brainrot** → `Severe`
- **Long (30–40+ min) + brainrot** → `Critical` / `Terminal`

## Goals, Non-Goals, Anti-Goals
- **Goals:** Pass `ctx.duration` into `nutritionSystemPrompt()` so Gemini's `brainrotPercent`, `caloriesWasted`, and `verdict` are length-aware; compute `attentionDamage` deterministically from `duration` + `brainrotPercent`; lock down the 4 corners with local unit tests.
- **Non-Goals:** Changing the message contract (`GENERATE_NUTRITION` payload/response field names stay identical) or modifying `modal.js` / `state.js` (which already sends `duration`).
- **Anti-Goals:** Letting the LLM drift on numeric thresholds (e.g., rating a 2-minute educational video as `Severe` or a 40-minute lecture as `Moderate`), or breaking when `duration` is missing/`"0:00"`.

## Constraints
- Plain JS only, no new dependencies, stays inside Laptop 1's files (`ai-client.js`, `test-pleas.js`, `CONTRACT.md`).
- Must degrade cleanly when `duration` is missing or `"0:00"` (treat as mid-length `0.5`).

## Approaches Considered
1. **Approach A — Deterministic ratio in code (Selected):** Gemini provides `brainrotPercent` (`0–100`) with `duration` visible in the prompt; `ai-client.js` computes `attentionDamage` from `parseDurationMinutes(ctx.duration)` and `brainrotPercent`. Predictable, unit-testable, and consistent across live, mock, and fallback modes.
2. **Approach B — Prompt-only:** Describe the 30–40 min cutoff and 4-corner ratio in English inside `nutritionSystemPrompt()`. Less code, but LLMs frequently drift on numeric cutoffs and fallback mode wouldn't share the curve.

## Design (Approach A)
1. **Prompt update (`ai-client.js`):** Include `Duration: ${c(ctx.duration, 20)}` inside `<video>...</video>` in `nutritionSystemPrompt(ctx)`.
2. **Duration parser (`parseDurationMinutes(duration)`):** Parses `"H:MM:SS"` or `"MM:SS"` into minutes; returns `null` for empty, `"0:00"`, or invalid strings.
3. **Damage score (`computeAttentionDamage(brainrotPercent, duration)`):**
   - `b = clamp(brainrotPercent, 0, 100, 50) / 100`
   - `lengthFactor = minutes == null ? 0.5 : Math.min(1, minutes / 35)` (reaches `1.0` at 35 min, middle of 30–40 min)
   - `shortFormPenalty = (1 - lengthFactor) * 0.25`
   - `score = b * (0.70 + 0.35 * lengthFactor) + shortFormPenalty * (1 - b)`
   - Rating buckets:
     - `< 0.18` → `"Minimal"`
     - `< 0.34` → `"Low"`
     - `< 0.50` → `"Moderate"`
     - `< 0.72` → `"Severe"`
     - `< 0.88` → `"Critical"`
     - `>= 0.88` → `"Terminal"`
4. **Apply everywhere:** Use `computeAttentionDamage(brainrotPercent, context.duration)` for live Gemini, mock, and fallback paths in `generateNutrition()`.
5. **Docs & Tests:** Document optional `duration?: string` in `CONTRACT.md`, and add unit assertions in `test-pleas.js` covering `parseDurationMinutes` and all 4 corners + missing duration.

## Left to the Builder
- Exact unit test inputs in `test-pleas.js` (e.g., 40m lecture, 2m explainer, 45s Short brainrot, 40m brainrot marathon, missing duration).
