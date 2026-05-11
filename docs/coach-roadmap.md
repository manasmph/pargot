# Coach Panel Roadmap — Phases 2 & 3

This document captures the deferred work from the Phase 1 implementation
of the stepped framework coach panel. Phase 1 shipped the static framework
catalog, structured-output JSON, hydrated `CoachState`, and the new stepper
UI. Phases 2 and 3 add robustness and multi-question awareness on top of
that foundation.

The Phase 1 plan lives at `~/.claude/plans/i-want-to-create-drifting-dove.md`
and the implemented files are referenced inline below.

---

## Phase 2 — Robustness (~half day)

The goal of Phase 2 is to make the panel feel rock-solid in real interviews:
no flicker, no blanking on schema drift, no laggy re-animations.

### 2.1 Memoization tuning

**Problem.** `framework-stepper.tsx` re-renders whenever `useSupportCues`
returns a new `state` object — even when the visible stage data is identical.
With `motion/react` animating stage transitions in the future, this causes
unwanted re-animation on every poll.

**Fix.** Wrap `<FrameworkStepper>` (or the inner `<StageRow>`s) with
`React.memo` keyed on a deep-equal compare of `stages`. Use
`fast-deep-equal` (already common) or write a tiny field-by-field comparator
that checks `id`, `status`, and the per-cue `done` flags.

**Files.**
- `web/components/app/coach/framework-stepper.tsx`
- `web/components/app/coach/stage-row.tsx`

**Acceptance.** In React DevTools profiler, the stepper subtree shows
zero renders between agent turns when nothing about the stage state changed.

### 2.2 Optimistic "thinking" indicator on the current stage

**Problem.** Today the panel shows a top-bar pulse while `/api/support` is
in flight, but the stepper itself sits frozen. There's no visible feedback
that the coach is reacting to the agent's most recent turn.

**Fix.** When a new agent message is detected (the moment the hook fires
its 900 ms debounce timer), set a transient `pendingStageId` flag on the
current stage. Render a tiny loading dot beside its label. Clear the flag
when the API resolves (success or failure).

**Files.**
- `web/hooks/use-support-cues.ts` — track `pendingStageId` in returned shape
- `web/components/app/coach/stage-row.tsx` — render pulsing dot when current stage has pending flag

**Acceptance.** From the moment the interviewer finishes speaking until
the panel updates, the current stage row shows a small pulsing dot.

### 2.3 Soft-failure fallback that preserves prior state

**Problem.** Today, when `/api/support` returns `{ ok: false, warning }`,
the hook surfaces an error but the existing `state` object remains in place
(good). However, if the failure happens on the first call (no prior state),
the panel goes to its empty state (`<Sparkles>` placeholder), which is
confusing because the framework was probably correctly identified — just
failed validation.

**Fix.** When the first call fails, attempt a "best effort" parse: even if
Zod validation fails, if we can extract a recognizable `framework_id`,
hydrate a default `CoachState` (all cues `done=false`, first stage `current`)
from the catalog so the user at least sees the framework structure. Mark
this state as "tentative" with a yellow indicator.

**Files.**
- `web/app/api/support/route.ts` — emit a `partial` discriminator alongside `ok`
- `web/hooks/use-support-cues.ts` — handle the `partial` case
- `web/components/app/support-panel.tsx` — render tentative state with subtle visual difference

**Acceptance.** Force a Zod failure (e.g. set `temperature: 2.0` server-side);
panel shows the framework structure rather than blank.

### 2.4 Recent-transcript window enforcement

**Problem.** Today `buildRecentTranscript()` slices to the last 6 messages,
but each LiveKit message can be very long (a 30-second utterance is ~80
words). With 6 such messages we're sending ~500 words per request, which
is fine, but pathological cases (interviewer monologues) could blow this up.

**Fix.** Cap `recent_transcript` at 1500 characters total, trimming from
the front (older messages) until under the cap.

**Files.**
- `web/hooks/use-support-cues.ts`

**Acceptance.** Even after a 30-turn interview, request payloads stay
≤2 KB.

---

## Phase 3 — Multi-question awareness (~half day)

A real PM mock interview has 2–4 distinct questions. After the candidate
finishes the first one, the interviewer transitions to a new question
("Great, let's switch gears…"). Today, the panel keeps the original
framework locked forever.

### 3.1 New-question classifier

**Goal.** Detect the boundary between two questions in the transcript,
without false positives on follow-up probes within a single question.

**Approach.** On each agent turn (after the regular `/api/support` call
returns), fire a parallel `/api/classify-turn` call:

```ts
POST /api/classify-turn
Body: { latest_agent_utterance: string, prior_question_topic: string }
Response: { is_new_question: boolean, confidence: number }
```

Use `gemini-2.5-flash-lite` (faster, cheaper than Flash) with
`maxOutputTokens: 50`, `responseMimeType: 'application/json'`,
`responseSchema` pinned to `{ is_new_question, confidence }`.

Run in parallel with the main coach call so it doesn't add latency.

**Files (new).**
- `web/app/api/classify-turn/route.ts`
- `web/lib/classify-prompt.ts`

**Acceptance.** Hand-craft 10 transcript snippets — 5 follow-up probes,
5 genuine question pivots. Classifier hits ≥9/10.

### 3.2 Framework unlock on new-question signal

**Trigger.** When `/api/classify-turn` returns `is_new_question: true`
with `confidence > 0.7`:

1. Save the previous `CoachState` to a local "history" stack (for the
   eventual interview-review screen — out of scope now but keep the slot).
2. Reset `prior` to `undefined` for the next `/api/support` call.
3. Animate the existing stepper out (slide left + fade) and the new one
   in (slide from right). Use `motion/react`'s `<AnimatePresence mode="wait">`.

**Files.**
- `web/hooks/use-support-cues.ts` — extend with question-history stack
  and unlock logic
- `web/components/app/coach/framework-stepper.tsx` — wrap with
  `<AnimatePresence>` keyed on `framework.id`

**Acceptance.** Have the interviewer ask a design question, candidate
answers, interviewer says "OK, switching to a behavioral question…" — the
stepper visibly animates from CIRCLES to STAR.

### 3.3 Split feedback off `CoachState` into a parallel call

**Rationale.** The architect's review noted feedback has a different
lifecycle than coach state:

- `CoachState` is slow, structured, accreting (one call per turn, ~2 s).
- `feedback` is fast, ephemeral, only depends on the candidate's last
  utterance (~600 ms).

Splitting them lets feedback chips appear ~3× faster than cue updates,
which is what users notice most.

**Approach.** New `/api/feedback` endpoint, called in parallel with
`/api/support`. Its response is just `{ feedback: FeedbackItem[] }`.
The hook merges the responses as they arrive, so feedback can render
before cues update.

**Files (new).**
- `web/app/api/feedback/route.ts`
- `web/lib/feedback-prompt.ts`

**Files (modified).**
- `web/hooks/use-support-cues.ts` — fire both calls in parallel
- `web/lib/coach-types.ts` — drop `feedback` from `CoachUpdate` (server-side type)
  but keep it on the client `CoachState` (still rendered by the panel)
- `web/app/api/support/route.ts` — drop feedback generation from the
  main call to keep it fast

**Acceptance.** Feedback chips appear ≤1 s after the interviewer's
utterance ends; cues update ~2 s after.

---

## Out of scope for both Phases 2 & 3

- **Persistence.** Coach state still resets when the interview ends.
- **Replay.** No interview-review screen yet (though Phase 3.2 plants the
  history stack).
- **User overrides.** Candidate can't manually switch framework.
- **Mobile.** Stepper is desktop-only; mobile lays out below the voice UI.
