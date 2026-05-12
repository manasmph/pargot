/**
 * Type definitions for the Interview Coach panel.
 *
 * Architecture: the model only emits IDs + booleans (`CoachUpdate`).
 * Static stage / cue text comes from the `frameworks.ts` catalog.
 * The hook joins `CoachUpdate × FrameworkDef` to produce `CoachState`
 * for the UI.
 */

export type FrameworkId =
  | 'CIRCLES'
  | 'IMPROVE'
  | 'FUNNEL'
  | 'ISSUE_TREE'
  | 'STAR'
  | '3C4P'
  | 'AARRR'
  | 'HEART'
  | 'PORTERS';

export interface FrameworkStageDef {
  /** Short stable id, unique within the framework (e.g. "C", "I", "R"). */
  id: string;
  /** Display name. */
  name: string;
  /** One-line description shown under the stage when expanded. */
  description?: string;
  /** Default cues — what a strong candidate should cover at this stage. */
  defaultCues: Array<{ id: string; text: string }>;
}

export interface FrameworkDef {
  id: FrameworkId;
  /** Human-readable framework name (e.g. "CIRCLES Method"). */
  name: string;
  /** Question type this framework is best for. */
  questionType: string;
  /** Ordered list of stages. */
  stages: FrameworkStageDef[];
}

/**
 * Single piece of per-turn coaching feedback. Sourced from `/api/feedback`
 * (Phase 3.3) — no longer part of CoachUpdate so the slow support call
 * stays purely about cue / stage tracking.
 */
export interface FeedbackItem {
  tone: 'positive' | 'warning' | 'info';
  text: string;
}

/**
 * The exact JSON shape the support model returns, validated by Zod.
 * NEVER contains free-form stage or cue *text* — only IDs + flags.
 * Feedback was split out into its own endpoint in Phase 3.3 so the slow
 * structured-state call doesn't gate fast critique display.
 */
export interface CoachUpdate {
  framework_id: FrameworkId;
  current_stage_id: string;
  completed_stage_ids: string[];
  /** IDs of cues the candidate has covered (cumulative across turns). */
  done_cue_ids: string[];
  /** Optional model-generated guidance for the current stage. */
  hint?: { stage_id: string; text: string };
}

/**
 * The compact prior sent back to the server on each turn.
 * Avoids prompt bloat & "echo drift" (model copying its own previous output).
 */
export interface CoachPrior {
  framework_id: FrameworkId;
  current_stage_id: string;
  done_cue_ids: string[];
}

/**
 * The fully-hydrated state the UI consumes.
 * Stage / cue text comes from `FrameworkDef`; status & done flags come
 * from the model. Built client-side by `mergeCoachState()`.
 */
export interface CoachState {
  framework: FrameworkDef;
  stages: Array<{
    id: string;
    name: string;
    description?: string;
    status: 'complete' | 'current' | 'pending';
    cues: Array<{ id: string; text: string; done: boolean }>;
    hint?: string;
  }>;
  /** Latest 1-3 feedback chips, sourced from `/api/feedback`. */
  feedback: FeedbackItem[];
}

/**
 * Discriminator codes for soft failures returned by /api/support.
 * The UI decides how prominent to render each kind.
 */
export type CoachErrorCode =
  | 'rate_limited' // 429 / quota exhausted — temporary, recovers in background (slow probe)
  | 'service_unavailable' // 503 / "model overloaded" / 5xx / timeouts — temporary (fast probe)
  | 'config' // server misconfigured (e.g. missing API key) — needs operator action
  | 'invalid_input' // bad request body — usually a client bug
  | 'schema' // model returned JSON but Zod validation failed — transient
  | 'unknown'; // anything else

/**
 * Server response shape from /api/support.
 *
 *  - `ok: true`                       → fully validated CoachUpdate, normal path.
 *  - `ok: true, partial: true`        → Zod validation failed but we salvaged a
 *                                       framework_id from the raw response and
 *                                       hydrated a minimal CoachUpdate (current
 *                                       stage = first stage, no cues ticked).
 *                                       The UI renders a "tentative" indicator
 *                                       so the user knows the panel is a stub.
 *  - `ok: false`                      → hard failure. Hook preserves any prior
 *                                       state and surfaces a banner.
 */
export type CoachResponse =
  | { ok: true; update: CoachUpdate; partial?: boolean }
  | { ok: false; code: CoachErrorCode; warning: string };

// ─────────────────────────────────────────────────────────────────────────
// Phase 3.3 — /api/feedback
// ─────────────────────────────────────────────────────────────────────────

/** Server response shape from /api/feedback. Soft-fails to `ok: false`. */
export type FeedbackResponse =
  | { ok: true; feedback: FeedbackItem[] }
  | { ok: false; warning: string };

// ─────────────────────────────────────────────────────────────────────────
// Phase 3.1 — /api/classify-turn
// ─────────────────────────────────────────────────────────────────────────

/**
 * Request body for the new-question classifier. Sent in parallel with
 * `/api/support` so we can decide whether to keep the framework locked
 * or reset it when the interviewer pivots to a different question.
 */
export interface ClassifyTurnRequest {
  recent_transcript: string;
  prior_framework_id?: FrameworkId;
}

/**
 * Classifier response. `is_new_question: true` with `confidence > 0.7`
 * triggers a framework unlock in the hook (Phase 3.2).
 */
export interface ClassifyTurnResult {
  is_new_question: boolean;
  confidence: number;
  reason?: string;
}

export type ClassifyTurnResponse =
  | { ok: true; result: ClassifyTurnResult }
  | { ok: false; warning: string };
