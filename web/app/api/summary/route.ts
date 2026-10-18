/**
 * /api/summary
 *
 * Generates an end-of-interview summary from the full transcript + final
 * coach state + the candidate's settings. Called once per session, on
 * disconnect (user-triggered or 30-min auto-disconnect).
 *
 * Model tier:
 *   1. gemini-2.5-flash         — preferred (best at structured output)
 *   2. gemini-3.1-flash-lite    — fallback if primary is rate-limited
 *
 * This is a one-shot, expensive call (~800-1200 output tokens), but only
 * once per session — total cost is negligible vs the per-turn coach.
 */
import { GoogleGenAI, Type } from '@google/genai';
import type { Schema } from '@google/genai';
import { auth } from '@/auth';
import { AUTH_ENABLED } from '@/lib/auth-config';
import { InterviewSummarySchema } from '@/lib/coach-schema';
import type { InterviewSummary, SummaryResponse } from '@/lib/coach-types';
import { db } from '@/lib/db';
import { interviews } from '@/lib/db/schema';
import {
  QUESTION_TYPE_LABELS,
  type QuestionTypeId,
  SENIORITY_IDS,
  type SeniorityId,
} from '@/lib/interview-settings';
import { buildSummarySystemPrompt } from '@/lib/summary-prompt';

export const runtime = 'nodejs';
export const revalidate = 0;

const SUMMARY_MODELS = ['gemini-2.5-flash', 'gemini-3.1-flash-lite'] as const;

interface SummaryRequest {
  /** Full session transcript, role-prefixed lines joined by newline. */
  transcript: string;
  /** Optional candidate seniority for calibration. */
  seniority?: SeniorityId;
  /** Optional original-selection question types (for context). */
  question_types?: QuestionTypeId[];
  /** Optional final coach state — framework + cue coverage. */
  final_state?: {
    framework_id?: string;
    framework_name?: string;
    question_type?: string;
    stages_total?: number;
    stages_completed?: number;
  };
  /** Session length in seconds (for the model to calibrate brevity comments). */
  duration_sec?: number;
}

// ─── Gemini structured-output schema ─────────────────────────────────────

const FINDING_SCHEMA: Schema = {
  type: Type.OBJECT,
  properties: {
    title: { type: Type.STRING },
    detail: { type: Type.STRING },
  },
  required: ['title', 'detail'],
};

const SUMMARY_SCHEMA: Schema = {
  type: Type.OBJECT,
  properties: {
    overall_score: { type: Type.NUMBER, description: '1-10' },
    overall_assessment: { type: Type.STRING },
    framework_used: { type: Type.STRING },
    stages_completed: { type: Type.INTEGER },
    stages_total: { type: Type.INTEGER },
    strengths: { type: Type.ARRAY, items: FINDING_SCHEMA, maxItems: '5' },
    improvements: { type: Type.ARRAY, items: FINDING_SCHEMA, maxItems: '5' },
    next_steps: { type: Type.ARRAY, items: { type: Type.STRING }, maxItems: '5' },
  },
  required: [
    'overall_score',
    'overall_assessment',
    'framework_used',
    'stages_completed',
    'stages_total',
    'strengths',
    'improvements',
    'next_steps',
  ],
};

// ─── Helpers ─────────────────────────────────────────────────────────────

function jsonResponse(payload: SummaryResponse, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-cache, no-store' },
  });
}

function extractJsonFromText(text: string): string {
  const fenceMatch = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
  if (fenceMatch) return fenceMatch[1].trim();
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start !== -1 && end > start) return text.slice(start, end + 1).trim();
  return text.trim();
}

function isRetryable(err: unknown): boolean {
  const e = err as { status?: number; message?: string };
  if (e?.status === 429 || e?.status === 503) return true;
  if (e?.status && e.status >= 500 && e.status < 600) return true;
  const msg = String(e?.message ?? err).toLowerCase();
  return (
    msg.includes('quota') ||
    msg.includes('overloaded') ||
    msg.includes('rate limit') ||
    msg.includes('unavailable') ||
    msg.includes('timeout') ||
    msg.includes('429') ||
    msg.includes('503')
  );
}

function buildUserMessage(body: SummaryRequest): string {
  const parts: string[] = [];
  if (body.duration_sec != null) {
    const minutes = Math.floor(body.duration_sec / 60);
    const seconds = body.duration_sec % 60;
    parts.push(`Session duration: ${minutes}m ${seconds}s`);
  }
  if (body.question_types && body.question_types.length > 0) {
    const labels = body.question_types
      .filter((q): q is QuestionTypeId => q in QUESTION_TYPE_LABELS)
      .map((q) => QUESTION_TYPE_LABELS[q]);
    parts.push(`Practice scope (question types candidate opted into): ${labels.join(', ')}`);
  }
  parts.push('Full transcript:\n' + body.transcript);
  return parts.join('\n\n');
}

// ─── POST handler ────────────────────────────────────────────────────────

export async function POST(req: Request): Promise<Response> {
  const apiKey = process.env.GOOGLE_API_KEY;
  if (!apiKey) {
    return jsonResponse({ ok: false, warning: 'GOOGLE_API_KEY is not configured' }, 500);
  }

  let body: SummaryRequest;
  try {
    body = (await req.json()) as SummaryRequest;
  } catch {
    return jsonResponse({ ok: false, warning: 'Invalid JSON body' }, 400);
  }

  if (!body.transcript || typeof body.transcript !== 'string') {
    return jsonResponse({ ok: false, warning: 'Missing transcript' }, 400);
  }
  if (body.transcript.length < 20) {
    // No real signal — return a graceful no-op so the UI doesn't show a hard error.
    return jsonResponse({ ok: false, warning: 'Transcript too short to summarise' }, 400);
  }

  const seniority: SeniorityId | undefined =
    body.seniority && (SENIORITY_IDS as readonly string[]).includes(body.seniority)
      ? body.seniority
      : undefined;

  const systemInstruction = buildSummarySystemPrompt({
    seniority,
    frameworkName: body.final_state?.framework_name,
    questionType: body.final_state?.question_type,
    stagesTotal: body.final_state?.stages_total,
    stagesCovered: body.final_state?.stages_completed,
  });
  const userMessage = buildUserMessage(body);

  console.log(
    `[summary-api] request — transcript ${body.transcript.length} chars, seniority=${
      seniority ?? 'unset'
    }, duration=${body.duration_sec ?? '?'}s`
  );

  const ai = new GoogleGenAI({ apiKey });

  let raw: string | undefined;
  let lastError: unknown;
  let usedModel: string = SUMMARY_MODELS[0];

  for (const model of SUMMARY_MODELS) {
    try {
      const response = await ai.models.generateContent({
        model,
        config: {
          systemInstruction,
          temperature: 0.4,
          maxOutputTokens: 2048,
          responseMimeType: 'application/json',
          responseSchema: SUMMARY_SCHEMA,
          thinkingConfig: { thinkingBudget: 0 },
        },
        contents: [{ role: 'user', parts: [{ text: userMessage }] }],
      });
      raw = response.text;
      usedModel = model;
      break;
    } catch (err) {
      lastError = err;
      if (!isRetryable(err)) {
        console.error(`[summary-api] ${model} permanent failure:`, err);
        break;
      }
      console.warn(`[summary-api] ${model} retryable failure — trying next`);
    }
  }

  if (!raw) {
    return jsonResponse(
      { ok: false, warning: `Summary error: ${(lastError as Error)?.message ?? 'unknown'}` },
      503
    );
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(extractJsonFromText(raw));
  } catch {
    return jsonResponse({ ok: false, warning: 'Summary model returned invalid JSON' }, 200);
  }

  const validation = InterviewSummarySchema.safeParse(parsed);
  if (!validation.success) {
    console.error('[summary-api] Zod validation failed:', validation.error.issues.slice(0, 5));
    return jsonResponse({ ok: false, warning: 'Summary schema validation failed' }, 200);
  }

  // Clamp + sanitise. The schema already enforces ranges, but be explicit.
  const summary: InterviewSummary = {
    ...validation.data,
    overall_score: Math.max(1, Math.min(10, Math.round(validation.data.overall_score))),
    stages_completed: Math.max(
      0,
      Math.min(validation.data.stages_total, validation.data.stages_completed)
    ),
  };

  console.log(
    `[summary-api] OK (${usedModel}) — score=${summary.overall_score}/10, ${summary.strengths.length} strengths, ${summary.improvements.length} improvements`
  );

  // ── Persist to history (best-effort, only when auth is on) ────────────────
  // Save the interview for the signed-in user. This is the row the daily
  // quota counts and the History view lists. A DB failure here is non-fatal —
  // the user still gets their summary; we just log the miss.
  if (AUTH_ENABLED) {
    try {
      const session = await auth();
      if (session?.user?.id) {
        await db.insert(interviews).values({
          userId: session.user.id,
          frameworkId: body.final_state?.framework_id ?? null,
          frameworkName: body.final_state?.framework_name ?? summary.framework_used,
          questionType: body.final_state?.question_type ?? null,
          seniority: seniority ?? null,
          overallScore: summary.overall_score,
          stagesCompleted: summary.stages_completed,
          stagesTotal: summary.stages_total,
          durationSec: body.duration_sec ?? null,
          summary,
        });
        console.log(`[summary-api] saved to history for user ${session.user.id}`);
      }
    } catch (err) {
      console.error('[summary-api] failed to persist interview (non-fatal):', err);
    }
  }

  return jsonResponse({ ok: true, summary });
}
