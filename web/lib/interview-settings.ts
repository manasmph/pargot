/**
 * Pre-interview settings — seniority + question types.
 *
 * Travels: SettingsView → React context (app.tsx) → /api/token POST body
 *        → RoomConfiguration.metadata (signed JWT) → Python agent's
 *          ctx.room.metadata → opener + interviewer system prompt.
 *
 * Validated three times on the way (client form, Next.js route, Python
 * agent) — each layer treats the input as untrusted and falls back to
 * defaults on bad shape.
 */
import { z } from 'zod';

// ─── ID enums ─────────────────────────────────────────────────────────────

export const SENIORITY_IDS = ['pm', 'senior_pm', 'staff_pm', 'principal_pm'] as const;
export type SeniorityId = (typeof SENIORITY_IDS)[number];

export const QUESTION_TYPE_IDS = [
  'design',
  'improvement',
  'estimation',
  'rca',
  'behavioral',
  'strategy',
] as const;
export type QuestionTypeId = (typeof QUESTION_TYPE_IDS)[number];

export interface InterviewSettings {
  seniority: SeniorityId;
  question_types: QuestionTypeId[];
}

// ─── Defaults ─────────────────────────────────────────────────────────────

export const DEFAULT_INTERVIEW_SETTINGS: InterviewSettings = {
  seniority: 'pm',
  question_types: [...QUESTION_TYPE_IDS],
};

/** True when `s` matches `DEFAULT_INTERVIEW_SETTINGS` ignoring array order. */
export function isDefaultSettings(s: InterviewSettings): boolean {
  if (s.seniority !== DEFAULT_INTERVIEW_SETTINGS.seniority) return false;
  if (s.question_types.length !== DEFAULT_INTERVIEW_SETTINGS.question_types.length) return false;
  const set = new Set(s.question_types);
  return DEFAULT_INTERVIEW_SETTINGS.question_types.every((t) => set.has(t));
}

// ─── Display labels ───────────────────────────────────────────────────────

export const SENIORITY_LABELS: Record<SeniorityId, string> = {
  pm: 'PM',
  senior_pm: 'Senior PM',
  staff_pm: 'Staff PM',
  principal_pm: 'Group / Principal PM',
};

export const SENIORITY_DESCRIPTIONS: Record<SeniorityId, string> = {
  pm: 'Mid-level / individual contributor',
  senior_pm: 'Drives team-level outcomes',
  staff_pm: 'Cross-functional leadership',
  principal_pm: 'Strategic, multi-team scope',
};

export const QUESTION_TYPE_LABELS: Record<QuestionTypeId, string> = {
  design: 'Product design',
  improvement: 'Product improvement',
  estimation: 'Estimation / market sizing',
  rca: 'Root cause analysis',
  behavioral: 'Behavioral / leadership',
  strategy: 'Strategy',
};

// ─── Zod schema + parser ──────────────────────────────────────────────────

export const InterviewSettingsSchema = z.object({
  seniority: z.enum(SENIORITY_IDS as unknown as [SeniorityId, ...SeniorityId[]]),
  question_types: z
    .array(z.enum(QUESTION_TYPE_IDS as unknown as [QuestionTypeId, ...QuestionTypeId[]]))
    .min(1),
});

/**
 * Best-effort coercion to a valid `InterviewSettings`. Always returns
 * something usable: bad shape → DEFAULT_INTERVIEW_SETTINGS; partial bad
 * → fields silently fall back individually.
 *
 * Use this at API boundaries. The Zod schema above is for places that
 * want to reject (e.g. the form's onSubmit could refuse to advance).
 */
export function parseInterviewSettings(raw: unknown): InterviewSettings {
  if (!raw || typeof raw !== 'object') return DEFAULT_INTERVIEW_SETTINGS;
  const obj = raw as Record<string, unknown>;

  const seniority = (SENIORITY_IDS as readonly string[]).includes(obj.seniority as string)
    ? (obj.seniority as SeniorityId)
    : DEFAULT_INTERVIEW_SETTINGS.seniority;

  const rawTypes = Array.isArray(obj.question_types) ? obj.question_types : [];
  const question_types = rawTypes.filter((t): t is QuestionTypeId =>
    (QUESTION_TYPE_IDS as readonly string[]).includes(t as string)
  );

  return {
    seniority,
    question_types:
      question_types.length > 0 ? question_types : DEFAULT_INTERVIEW_SETTINGS.question_types,
  };
}
