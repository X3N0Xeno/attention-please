# Implementation Plan: Duration × Brainrot Attention Span Damage Ratio

**Spec:** `docs/superpowers/specs/2026-11-21-attention-damage-ratio-design.md`

## Tasks
1. **`ai-client.js`:**
   - Add `parseDurationMinutes(duration)` (`H:MM:SS` / `MM:SS` → minutes, `null` if invalid or `0:00`).
   - Add `computeAttentionDamage(brainrotPercent, duration)` using the 35-minute long-form mark and 6 severity buckets (`Minimal`, `Low`, `Moderate`, `Severe`, `Critical`, `Terminal`).
   - Include `Duration:` in `nutritionSystemPrompt(ctx)`.
   - Compute `attentionDamage` via `computeAttentionDamage()` across live, mock, and fallback paths in `generateNutrition()`.
2. **`CONTRACT.md`:**
   - Document optional `duration?: string` in `GENERATE_NUTRITION` payload and note that `attentionDamage` is derived from `duration` + `brainrotPercent`.
3. **`test-pleas.js`:**
   - Export `parseDurationMinutes` and `computeAttentionDamage` from the VM.
   - Add unit assertions covering duration parsing, all 4 corners (long/short × substantive/brainrot), mid-length, and missing duration.
   - Add `duration` fields to `NUTRITION_SAMPLES`.
4. **Verify & Commit:**
   - Run `node --check ai-client.js test-pleas.js` and `node test-pleas.js --unit-only`.
   - Commit spec/plan and implementation cleanly on `feat/ai-engine`.
