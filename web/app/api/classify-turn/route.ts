/**
 * /api/classify-turn  (Phase 3.1)
 *
 * Decides whether the interviewer has just pivoted to a NEW question vs.
 * just probing the existing one. The client fires this in parallel with
 * /api/support so the hook can reset the framework lock before the next
 * support call commits to a stale prior.
 *
 * Design choices:
 * - Uses `gemini-3.1-flash-lite` directly (no fallback chain) — this is a
 *   non-critical signal; if it fails, we conservatively assume "not a new
 *   question" and the framework stays locked.
 * - No retry / no probe: keeping it fast is more important than reliability.
 * - Structured output via responseSchema for cheap JSON parsing.
 */
import { GoogleGenAI, Type } from '@google/genai';
import type { Schema } from '@google/genai';
import { buildClassifySystemPrompt } from '@/lib/classify-prompt';
import { ClassifyTurnPayloadSchema } from '@/lib/coach-schema';
import type {
  ClassifyTurnRequest,
  ClassifyTurnResponse,
  ClassifyTurnResult,
} from '@/lib/coach-types';

export const runtime = 'nodejs';
export const revalidate = 0;

const CLASSIFY_MODELS = ['gemini-3.1-flash-lite', 'openai/gpt-oss-120b'] as const;

function isGroq(model: string): boolean {
  return model === 'openai/gpt-oss-120b';
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

const CLASSIFY_SCHEMA: Schema = {
  type: Type.OBJECT,
  properties: {
    is_new_question: { type: Type.BOOLEAN },
    confidence: { type: Type.NUMBER },
    reason: { type: Type.STRING, nullable: true },
  },
  required: ['is_new_question', 'confidence'],
};

function jsonResponse(payload: ClassifyTurnResponse, status = 200): Response {
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

export async function POST(req: Request): Promise<Response> {
  const apiKey = process.env.GOOGLE_API_KEY;
  const groqApiKey = process.env.GROQ_API_KEY;
  if (!apiKey && !groqApiKey) {
    return jsonResponse({ ok: false, warning: 'API keys are not configured' }, 500);
  }

  let body: ClassifyTurnRequest;
  try {
    body = (await req.json()) as ClassifyTurnRequest;
  } catch {
    return jsonResponse({ ok: false, warning: 'Invalid JSON body' }, 400);
  }

  if (!body.recent_transcript || typeof body.recent_transcript !== 'string') {
    return jsonResponse({ ok: false, warning: 'Missing recent_transcript' }, 400);
  }

  const ai = apiKey ? new GoogleGenAI({ apiKey }) : ({} as GoogleGenAI);
  const systemInstruction = buildClassifySystemPrompt(body.prior_framework_id);

  let raw: string | undefined;
  for (const model of CLASSIFY_MODELS) {
    try {
      if (isGroq(model)) {
        if (!groqApiKey) throw new Error('GROQ_API_KEY is not configured');
        const schemaPrompt = `
You MUST return a JSON object that matches the following structure:
{
  "is_new_question": boolean,
  "confidence": number,
  "reason": "string" // optional
}
`;
        const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${groqApiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model,
            messages: [
              { role: 'system', content: systemInstruction + '\n\n' + schemaPrompt },
              { role: 'user', content: body.recent_transcript },
            ],
            temperature: 0.1,
            max_tokens: 80,
            response_format: { type: 'json_object' },
          }),
        });
        if (!response.ok) {
          const errText = await response.text();
          const err = Object.assign(new Error(`Groq API error: ${response.status} ${errText}`), { status: response.status });
          throw err;
        }
        const json = await response.json();
        raw = json.choices?.[0]?.message?.content;
      } else {
        const response = await ai.models.generateContent({
          model,
          config: {
            systemInstruction,
            temperature: 0.1, // deterministic — this is a binary classification
            maxOutputTokens: 80,
            responseMimeType: 'application/json',
            responseSchema: CLASSIFY_SCHEMA,
          },
          contents: [{ role: 'user', parts: [{ text: body.recent_transcript }] }],
        });
        raw = response.text;
      }
      break;
    } catch (err) {
      if (!isRetryable(err)) {
        console.warn(`[classify-api] ${model} permanent failure:`, (err as Error).message);
        break;
      }
      console.warn(`[classify-api] ${model} retryable failure — trying next`);
    }
  }

  if (!raw) {
    return jsonResponse(
      { ok: false, warning: 'Empty classifier response or all models failed' },
      503
    );
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(extractJsonFromText(raw));
  } catch {
    return jsonResponse({ ok: false, warning: 'Classifier returned invalid JSON' }, 200);
  }

  const validation = ClassifyTurnPayloadSchema.safeParse(parsed);
  if (!validation.success) {
    return jsonResponse({ ok: false, warning: 'Classifier schema validation failed' }, 200);
  }

  const result: ClassifyTurnResult = validation.data;
  console.log(
    `[classify-api] is_new=${result.is_new_question} conf=${result.confidence.toFixed(2)}${
      result.reason ? ` — ${result.reason}` : ''
    }`
  );
  return jsonResponse({ ok: true, result });
}
