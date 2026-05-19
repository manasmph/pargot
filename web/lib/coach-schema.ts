/**
 * Runtime validation for the support-model output.
 * Zod schema mirrors `CoachUpdate` from coach-types.ts.
 *
 * Used at the API boundary so that schema drift from the model
 * (rare with structured output, but possible) doesn't crash the panel —
 * we surface a soft warning and keep the prior state instead.
 *
 * Phase 3.3: feedback split off into /api/feedback. CoachUpdateSchema
 * no longer validates a `feedback` field; FeedbackResponseSchema below
 * handles that endpoint's payload.
 */
import { z } from 'zod';
import { FRAMEWORK_IDS } from './frameworks';

const FrameworkIdSchema = z.enum(FRAMEWORK_IDS as [string, ...string[]]);

const HintSchema = z
  .object({
    stage_id: z.string().min(1),
    text: z.string().min(1).max(200),
  })
  .optional();

export const CoachUpdateSchema = z.object({
  framework_id: FrameworkIdSchema,
  current_stage_id: z.string().min(1),
  completed_stage_ids: z.array(z.string()).default([]),
  done_cue_ids: z.array(z.string()).default([]),
  hint: HintSchema,
});

export type CoachUpdateValidated = z.infer<typeof CoachUpdateSchema>;

// ─────────────────────────────────────────────────────────────────────────
// Phase 3.3 — /api/feedback
// ─────────────────────────────────────────────────────────────────────────

const FeedbackToneSchema = z.enum(['positive', 'warning', 'info']);

const FeedbackItemSchema = z.object({
  tone: FeedbackToneSchema,
  text: z.string().min(1).max(160),
});

export const FeedbackPayloadSchema = z.object({
  feedback: z.array(FeedbackItemSchema).max(3).default([]),
});

// ─────────────────────────────────────────────────────────────────────────
// Phase 3.1 — /api/classify-turn
// ─────────────────────────────────────────────────────────────────────────

export const ClassifyTurnPayloadSchema = z.object({
  is_new_question: z.boolean(),
  confidence: z.number().min(0).max(1),
  reason: z.string().optional(),
});

// ─────────────────────────────────────────────────────────────────────────
// Phase 4 — /api/summary
// ─────────────────────────────────────────────────────────────────────────

const SummaryFindingSchema = z.object({
  title: z.string().min(1).max(80),
  detail: z.string().min(1).max(300),
});

export const InterviewSummarySchema = z.object({
  overall_score: z.number().min(1).max(10),
  overall_assessment: z.string().min(1).max(500),
  framework_used: z.string().min(1).max(80),
  stages_completed: z.number().int().min(0),
  stages_total: z.number().int().min(1),
  strengths: z.array(SummaryFindingSchema).min(1).max(5),
  improvements: z.array(SummaryFindingSchema).min(1).max(5),
  next_steps: z.array(z.string().min(1).max(200)).min(1).max(5),
});

export type InterviewSummaryValidated = z.infer<typeof InterviewSummarySchema>;
