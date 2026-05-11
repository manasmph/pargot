/**
 * Runtime validation for the support-model output.
 * Zod schema mirrors `CoachUpdate` from coach-types.ts.
 *
 * Used at the API boundary so that schema drift from the model
 * (rare with structured output, but possible) doesn't crash the panel —
 * we surface a soft warning and keep the prior state instead.
 */
import { z } from 'zod';
import { FRAMEWORK_IDS } from './frameworks';

const FrameworkIdSchema = z.enum(FRAMEWORK_IDS as [string, ...string[]]);

const FeedbackToneSchema = z.enum(['positive', 'warning', 'info']);

const FeedbackItemSchema = z.object({
  tone: FeedbackToneSchema,
  text: z.string().min(1).max(160),
});

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
  feedback: z.array(FeedbackItemSchema).max(3).default([]),
});

export type CoachUpdateValidated = z.infer<typeof CoachUpdateSchema>;
