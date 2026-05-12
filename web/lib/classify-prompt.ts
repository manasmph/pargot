/**
 * New-question classifier prompt (Phase 3.1).
 *
 * Goal: given the last few turns, decide whether the interviewer has just
 * pivoted to a DIFFERENT question vs. just probing the same one. The hook
 * uses this signal to reset the framework lock when a real pivot happens.
 *
 * Designed for `gemini-2.5-flash-lite` with structured output — the prompt
 * stays under ~500 tokens so the round-trip beats the slow /api/support
 * call and arrives in time to influence framework reset logic.
 */
import type { FrameworkId } from './coach-types';
import { FRAMEWORKS } from './frameworks';

const ROLE = `You classify turns in a live Product Manager mock interview.

Decide whether the interviewer has just transitioned to a NEW question, or
is simply probing / following up on the question they were already asking.

This signal controls whether the candidate's coach panel should reset to a
fresh framework. A wrong call is mildly annoying either way; bias toward
false-negative (keep the same question) unless the pivot is obvious.`;

const POSITIVE_EXAMPLES = `New-question signals (return is_new_question: true):

- "Great, let's switch gears. Now I want to ask about…"
- "OK, moving on. Imagine you're a PM at Stripe — how would you…"
- "Let's leave that aside for a moment. Here's a different scenario:…"
- "Thanks for that. Next question — tell me about a time when you…"
- A behavioral / situational opener after a product-design discussion
- A market-sizing question ("how many X are there in…") after a design Q
- An explicit topic boundary marker ("alright", "perfect, next") followed by
  a clearly distinct prompt`;

const NEGATIVE_EXAMPLES = `Follow-up probes — NOT a new question (return is_new_question: false):

- "Why that segment specifically?"
- "Can you elaborate on the trade-offs?"
- "What about edge cases?"
- "How would you measure success?"
- "Tell me more about…" / "Walk me through…"
- "What's your prioritisation criteria?"
- Any short clarifier that builds on the current answer
- Any question that drills deeper into a stage of the same framework
  (e.g. while doing CIRCLES, "how would you prioritise those?" stays inside
  CIRCLES — not a new question)`;

const SCHEMA = `Output schema (JSON, strict):
{
  "is_new_question": boolean,
  "confidence":      number between 0.0 and 1.0,
  "reason":          optional short string (≤ 20 words) for debugging
}

Confidence calibration:
- 0.9+   crystal-clear pivot ("Next question, …")
- 0.7–0.9 strong signal but some ambiguity
- 0.4–0.6 could go either way — return is_new_question=false
- <0.4   probably a probe — return is_new_question=false

The downstream hook ignores any classification with confidence ≤ 0.7, so
you should ALWAYS pair is_new_question=true with confidence > 0.7.`;

export function buildClassifySystemPrompt(priorFrameworkId?: FrameworkId): string {
  const sections = [ROLE, POSITIVE_EXAMPLES, NEGATIVE_EXAMPLES, SCHEMA];

  if (priorFrameworkId) {
    const fw = FRAMEWORKS[priorFrameworkId];
    sections.push(
      `Currently locked framework: ${fw.id} (${fw.name}, ${fw.questionType}).
A question that fits within this framework's question-type is almost certainly
a probe, not a new question.`
    );
  }

  return sections.join('\n\n----\n\n');
}
