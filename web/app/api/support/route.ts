/**
 * /api/support
 *
 * Non-streaming structured-output endpoint that returns a `CoachUpdate`
 * for the support panel. The model only emits IDs and booleans; the
 * UI joins them against the static framework catalog to render text.
 *
 * Request:
 *   { recent_transcript: string, prior?: CoachPrior }
 *
 * Response:
 *   { ok: true, update: CoachUpdate } | { ok: false, warning: string }
 *
 * The `ok: false` path is a SOFT failure: the client preserves its
 * prior state and shows a warning chip instead of going blank.
 */
import { GoogleGenAI, Type } from '@google/genai';
import type { Schema } from '@google/genai';
import { CoachUpdateSchema } from '@/lib/coach-schema';
import type {
  CoachErrorCode,
  CoachPrior,
  CoachResponse,
  CoachUpdate,
  FrameworkId,
} from '@/lib/coach-types';
import { FRAMEWORKS, FRAMEWORK_IDS, getValidCueIds, getValidStageIds } from '@/lib/frameworks';
import { buildSupportSystemPrompt } from '@/lib/support-prompt';

export const runtime = 'nodejs';
export const revalidate = 0;

// ─── Gemini structured-output schema ──────────────────────────────────────
// Mirrors `CoachUpdate` from coach-types.ts. Gemini's structured output uses
// the OpenAPI 3.0 subset; arrays are typed via Type.ARRAY etc.

const COACH_UPDATE_SCHEMA: Schema = {
  type: Type.OBJECT,
  properties: {
    framework_id: {
      type: Type.STRING,
      enum: [...FRAMEWORK_IDS],
      description: 'The PM framework chosen for this question.',
    },
    current_stage_id: {
      type: Type.STRING,
      description: 'Stage id within the chosen framework.',
    },
    completed_stage_ids: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
      description: 'Stage ids the candidate has clearly finished.',
    },
    done_cue_ids: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
      description: 'Cue ids the candidate has covered (cumulative).',
    },
    hint: {
      type: Type.OBJECT,
      nullable: true,
      properties: {
        stage_id: { type: Type.STRING },
        text: { type: Type.STRING },
      },
      required: ['stage_id', 'text'],
      description: 'Optional ≤25-word nudge for the current stage.',
    },
    // Phase 3.3 — feedback split off to /api/feedback so this slow
    // structured-state call doesn't gate fast critique display.
  },
  required: ['framework_id', 'current_stage_id', 'completed_stage_ids', 'done_cue_ids'],
};

// ─── Model availability + background quota probing ──────────────────────
//
// Three-tier fallback chain:
//   1. gemini-2.5-flash         — fastest + best at structured output
//   2. gemini-3.1-flash-lite    — when 2.5 is rate-limited
//   3. gemma-4-26b-a4b-it       — open-weights backstop when both Geminis are
//                                 exhausted. Gemma 4 (released Apr 2026) is a
//                                 26B-total / 4B-active Mixture-of-Experts
//                                 model. Unlike Gemma 3, it natively supports
//                                 systemInstruction and structured-output JSON
//                                 — so the request shape matches the Gemini
//                                 models exactly except we omit thinkingConfig
//                                 (Gemma has no thinking mode).
//
// Goal: no extra user-facing latency once a model has been rate-limited.
//
// Mechanism:
//   1. We track each model's availability in `modelAvailability`.
//   2. `pickActiveModel()` returns the FIRST available model in MODELS order.
//      Each user request uses ONE model — no retry on a model we already
//      know is rate-limited.
//   3. When a request gets a 429, we mark that model unavailable AND walk
//      down the chain to the next available model. The user pays at most
//      `(MODELS.length - 1) - n` extra calls in the worst case, where n is
//      the number of models already marked unavailable. Once all models
//      below the first available one have been tried in this rate-limit
//      window, subsequent requests skip them entirely.
//   4. A background `setTimeout` probe checks each rate-limited model
//      after `PROBE_INTERVAL_MS` with a tiny `maxOutputTokens: 1` call.
//      If the probe succeeds, the model is marked available again — the
//      next user request automatically picks the highest-priority one.

const MODELS = [
  'gemini-2.5-flash',
  'gemini-3.1-flash-lite',
  'gemma-4-26b-a4b-it',
  'openai/gpt-oss-120b',
] as const;
type Model = (typeof MODELS)[number];

// Probe cadence is category-driven: quota windows are minutes-long so probe
// slowly; overload / transient errors recover in seconds so probe fast.
const RATE_LIMIT_PROBE_MS = 120_000; // 2 min
const FAST_PROBE_MS = 30_000; // 30 s

const modelAvailability: Record<Model, boolean> = {
  'gemini-2.5-flash': true,
  'gemini-3.1-flash-lite': true,
  'gemma-4-26b-a4b-it': true,
  'openai/gpt-oss-120b': true,
};
const probeTimers = new Map<Model, ReturnType<typeof setTimeout>>();

/** Returns the first model in MODELS order that is currently available. */
function pickActiveModel(): Model {
  for (const m of MODELS) {
    if (modelAvailability[m]) return m;
  }
  // All unavailable — return the primary so the caller can attempt and
  // fail fast. Background probes will recover the chain.
  return MODELS[0];
}

/** Returns the next available model after `current` in MODELS order, or null. */
function nextAvailableModel(current: Model): Model | null {
  const idx = MODELS.indexOf(current);
  for (let i = idx + 1; i < MODELS.length; i++) {
    if (modelAvailability[MODELS[i]]) return MODELS[i];
  }
  return null;
}

function isGemma(model: string): boolean {
  return model.startsWith('gemma');
}

function isGroq(model: string): boolean {
  return model === 'openai/gpt-oss-120b';
}

/**
 * Bucket a Gemini API error into one of four categories so we can route
 * retry behaviour intelligently. Centralising this here keeps the POST
 * handler readable and makes it easy to add new patterns when Google
 * surfaces yet another transient-error wording.
 *
 *   rate_limited   429 / RESOURCE_EXHAUSTED / "quota" / "rate limit"
 *                  → slow probe (120s) — quota windows are minutes
 *   overloaded     503 / UNAVAILABLE / "model is overloaded" /
 *                  "experiencing high traffic" / "try again later"
 *                  → fast probe (30s) — overloads usually clear in seconds
 *   transient      500 / 502 / 504 / timeouts / network/socket errors
 *                  → fast probe (30s) — same recovery profile
 *   permanent      400 / 401 / 403 / 404 — request or auth problem;
 *                  retrying with a different model won't help
 */
type FailureCategory = 'rate_limited' | 'overloaded' | 'transient' | 'permanent';

function categorizeFailure(err: unknown): FailureCategory {
  const e = err as { status?: number; message?: string; code?: number };
  const status = e?.status ?? e?.code;
  const msg = String(e?.message ?? err).toLowerCase();

  // ── Rate limit / quota ────────────────────────────────────────────────
  if (status === 429) return 'rate_limited';
  if (
    msg.includes('429') ||
    msg.includes('quota') ||
    msg.includes('resource_exhausted') ||
    msg.includes('rate limit') ||
    msg.includes('rate-limit')
  ) {
    return 'rate_limited';
  }

  // ── Overloaded / high traffic ────────────────────────────────────────
  if (status === 503) return 'overloaded';
  if (
    msg.includes('overloaded') ||
    msg.includes('high traffic') ||
    msg.includes('unavailable') ||
    msg.includes('try again later') ||
    msg.includes('busy')
  ) {
    return 'overloaded';
  }

  // ── Generic transient 5xx / network ──────────────────────────────────
  if (status === 500 || status === 502 || status === 504) return 'transient';
  if (
    msg.includes('timeout') ||
    msg.includes('deadline') ||
    msg.includes('econnreset') ||
    msg.includes('etimedout') ||
    msg.includes('econnrefused') ||
    msg.includes('enotfound') ||
    msg.includes('socket hang up') ||
    msg.includes('fetch failed') ||
    msg.includes('network')
  ) {
    return 'transient';
  }

  // ── Anything else — permanent (don't retry with a different model) ──
  return 'permanent';
}

function isRetryable(c: FailureCategory): boolean {
  return c !== 'permanent';
}

function probeDelayFor(c: FailureCategory): number {
  return c === 'rate_limited' ? RATE_LIMIT_PROBE_MS : FAST_PROBE_MS;
}

function errorCodeFor(c: FailureCategory): CoachErrorCode {
  if (c === 'rate_limited') return 'rate_limited';
  if (c === 'overloaded' || c === 'transient') return 'service_unavailable';
  return 'unknown';
}

/**
 * Single request shape works for both Gemini and Gemma 4 — both support
 * `systemInstruction` and structured-output `responseSchema` natively.
 * The only model-specific divergence: `thinkingConfig` exists on Gemini
 * 2.5+ (we set thinkingBudget=0 to keep latency tight) but isn't a
 * concept on Gemma, so we omit it for Gemma models.
 */
async function callCoachModel(
  ai: GoogleGenAI,
  groqApiKey: string | undefined,
  model: Model,
  systemInstruction: string,
  recentTranscript: string
): Promise<string | undefined> {
  if (isGroq(model)) {
    if (!groqApiKey) {
      const err = Object.assign(new Error('GROQ_API_KEY is not configured'), { status: 401 }); // permanent error
      throw err;
    }
    const schemaPrompt = `
You MUST return a JSON object that matches the following structure:
{
  "framework_id": "string",
  "current_stage_id": "string",
  "completed_stage_ids": ["string"], // array of strings
  "done_cue_ids": ["string"], // array of strings
  "hint": { "stage_id": "string", "text": "string" } // hint is optional, can be null or omitted
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
          { role: 'user', content: recentTranscript },
        ],
        temperature: 0.4,
        max_tokens: 1024,
        response_format: { type: 'json_object' },
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      const err = Object.assign(new Error(`Groq API error: ${response.status} ${errText}`), {
        status: response.status,
      });
      throw err;
    }

    const json = await response.json();
    return json.choices?.[0]?.message?.content;
  }

  const response = await ai.models.generateContent({
    model,
    config: {
      systemInstruction,
      temperature: 0.4,
      maxOutputTokens: 1024,
      responseMimeType: 'application/json',
      responseSchema: COACH_UPDATE_SCHEMA,
      ...(isGemma(model) ? {} : { thinkingConfig: { thinkingBudget: 0 } }),
    },
    contents: [{ role: 'user', parts: [{ text: recentTranscript }] }],
  });
  return response.text;
}

/**
 * Extract a JSON object from arbitrary model output.
 *  - Strict JSON (from Gemini structured output) → returned as-is.
 *  - Gemma may wrap in ```json fences or include a brief preamble.
 *
 * Tries fence-stripping first, then the first {…} block, then the
 * trimmed text as a last resort.
 */
function extractJsonFromText(text: string): string {
  const fenceMatch = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
  if (fenceMatch) return fenceMatch[1].trim();

  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start !== -1 && end > start) return text.slice(start, end + 1).trim();

  return text.trim();
}

/**
 * Best-effort framework_id extraction from a parsed-but-schema-invalid response.
 * Used by the partial-response salvage path: when Zod rejects the full
 * CoachUpdate but the model at least picked a valid framework, we'd rather
 * show the user a tentative stepper than a blank panel.
 */
function salvageFrameworkId(parsed: unknown): FrameworkId | null {
  if (!parsed || typeof parsed !== 'object') return null;
  const candidate = (parsed as { framework_id?: unknown }).framework_id;
  if (typeof candidate !== 'string') return null;
  if (!(FRAMEWORK_IDS as readonly string[]).includes(candidate)) return null;
  return candidate as FrameworkId;
}

/**
 * Construct a minimal `CoachUpdate` for the given framework: current stage =
 * first stage of the framework, no cues ticked, no feedback. Used when the
 * model picked a framework but we couldn't trust the rest of its output.
 */
function buildTentativeUpdate(frameworkId: FrameworkId): CoachUpdate {
  const fw = FRAMEWORKS[frameworkId];
  return {
    framework_id: frameworkId,
    current_stage_id: fw.stages[0].id,
    completed_stage_ids: [],
    done_cue_ids: [],
  };
}

/**
 * Mark a model unavailable and schedule a background probe to test
 * whether it has recovered. Probe interval is category-driven so that
 * brief 503 overloads don't get stuck behind a 2-minute quota timer.
 * Idempotent — calling twice for the same model keeps the existing timer.
 */
function markUnavailable(
  model: Model,
  apiKey: string,
  groqApiKey: string | undefined,
  category: FailureCategory
): void {
  modelAvailability[model] = false;
  if (probeTimers.has(model)) return;
  const probeIn = probeDelayFor(category);
  console.warn(
    `[support-api] ${model} marked unavailable (${category}) — background probe in ${probeIn / 1000}s`
  );
  const timer = setTimeout(() => {
    probeTimers.delete(model);
    void probeModel(model, apiKey, groqApiKey);
  }, probeIn);
  probeTimers.set(model, timer);
}

/**
 * Background probe — fires a tiny generation against `model` to see if
 * it has recovered. Doesn't block any user request. On success the
 * model is marked available; the next user request will pick it up.
 * On any retryable failure (rate-limit, overload, transient) the probe
 * reschedules itself with a category-appropriate delay. Permanent
 * failures (e.g. invalid key) re-mark the model available so the next
 * real request surfaces the issue.
 */
async function probeModel(
  model: Model,
  apiKey: string,
  groqApiKey: string | undefined
): Promise<void> {
  console.log(`[support-api] probing ${model} for recovery`);
  try {
    if (isGroq(model)) {
      if (!groqApiKey) throw new Error('No GROQ_API_KEY');
      const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${groqApiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model,
          messages: [{ role: 'user', content: 'ping' }],
          max_tokens: 1,
        }),
      });
      if (!response.ok) {
        const errText = await response.text();
        const err = Object.assign(new Error(`Groq probe failed: ${response.status} ${errText}`), {
          status: response.status,
        });
        throw err;
      }
    } else {
      const ai = new GoogleGenAI({ apiKey });
      // Gemma doesn't accept thinkingConfig — keep the probe minimal & shape-correct.
      const config = isGemma(model)
        ? { maxOutputTokens: 1 }
        : { maxOutputTokens: 1, thinkingConfig: { thinkingBudget: 0 } };
      await ai.models.generateContent({
        model,
        config,
        contents: [{ role: 'user', parts: [{ text: 'ping' }] }],
      });
    }
    modelAvailability[model] = true;
    console.log(`[support-api] ${model} recovered — back in rotation`);
  } catch (err) {
    const category = categorizeFailure(err);
    if (!isRetryable(category)) {
      // A permanent error during probe (e.g., invalid API key) shouldn't
      // keep the model parked forever; let the next user request surface
      // the persistent issue.
      console.warn(`[support-api] ${model} probe failed with permanent error:`, err);
      modelAvailability[model] = true;
      return;
    }
    const delay = probeDelayFor(category);
    console.log(
      `[support-api] ${model} probe still failing (${category}) — retry in ${delay / 1000}s`
    );
    const timer = setTimeout(() => {
      probeTimers.delete(model);
      void probeModel(model, apiKey, groqApiKey);
    }, delay);
    probeTimers.set(model, timer);
  }
}

// ─── POST handler ─────────────────────────────────────────────────────────

interface SupportRequest {
  recent_transcript: string;
  prior?: CoachPrior;
}

function jsonResponse(payload: CoachResponse, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-cache, no-store',
    },
  });
}

// ─── GET handler: lightweight health probe ────────────────────────────────
//
// Used by the connecting view to verify that at least one coach model is
// reachable *before* the interview begins. Walks the same model chain as
// the POST handler — including marking models unavailable + scheduling
// background probes — but uses a tiny `maxOutputTokens: 1` "ping" instead
// of a full coach request. Quota cost: a few input tokens per session.

export async function GET(): Promise<Response> {
  const apiKey = process.env.GOOGLE_API_KEY;
  const groqApiKey = process.env.GROQ_API_KEY;
  if (!apiKey && !groqApiKey) {
    console.error('[support-api] health: No API keys set');
    return jsonResponse({ ok: false, code: 'config', warning: 'API keys are not configured' }, 500);
  }

  const ai = apiKey ? new GoogleGenAI({ apiKey }) : ({} as GoogleGenAI);
  let activeModel = pickActiveModel();
  let lastError: unknown;
  let lastCategory: FailureCategory | undefined;

  for (let attempt = 0; attempt < MODELS.length; attempt++) {
    try {
      if (isGroq(activeModel)) {
        if (!groqApiKey) throw new Error('No GROQ_API_KEY configured');
        const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${groqApiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: activeModel,
            messages: [{ role: 'user', content: 'ping' }],
            max_tokens: 1,
          }),
        });
        if (!response.ok) {
          const errText = await response.text();
          const err = Object.assign(new Error(`Groq API error: ${response.status} ${errText}`), {
            status: response.status,
          });
          throw err;
        }
      } else {
        if (!apiKey) throw new Error('No GOOGLE_API_KEY configured');
        const config = isGemma(activeModel)
          ? { maxOutputTokens: 1 }
          : { maxOutputTokens: 1, thinkingConfig: { thinkingBudget: 0 } };
        await ai.models.generateContent({
          model: activeModel,
          config,
          contents: [{ role: 'user', parts: [{ text: 'ping' }] }],
        });
      }
      console.log(`[support-api] health OK via ${activeModel}`);
      return new Response(JSON.stringify({ ok: true, model: activeModel }), {
        headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-cache, no-store' },
      });
    } catch (err) {
      lastError = err;
      const category = categorizeFailure(err);
      lastCategory = category;
      if (!isRetryable(category)) {
        console.error(`[support-api] health: ${activeModel} permanent failure:`, err);
        break;
      }
      markUnavailable(activeModel, apiKey ?? '', groqApiKey, category);
      const next = nextAvailableModel(activeModel);
      if (!next) {
        console.warn(`[support-api] health: ${activeModel} ${category}, no fallback`);
        break;
      }
      console.warn(`[support-api] health: ${activeModel} ${category} → trying ${next}`);
      activeModel = next;
    }
  }

  const code: CoachErrorCode = lastCategory ? errorCodeFor(lastCategory) : 'unknown';
  const status = lastCategory === 'rate_limited' ? 429 : lastCategory === 'permanent' ? 500 : 503;
  const warning =
    lastCategory === 'rate_limited'
      ? 'All coach models are rate-limited.'
      : lastCategory === 'overloaded' || lastCategory === 'transient'
        ? 'Coach models are experiencing high traffic.'
        : `Coach error: ${(lastError as Error)?.message ?? 'unknown'}`;

  return jsonResponse({ ok: false, code, warning }, status);
}

export async function POST(req: Request): Promise<Response> {
  const apiKey = process.env.GOOGLE_API_KEY;
  const groqApiKey = process.env.GROQ_API_KEY;
  if (!apiKey && !groqApiKey) {
    console.error('[support-api] API keys not set');
    return jsonResponse({ ok: false, code: 'config', warning: 'API keys are not configured' }, 500);
  }

  let body: SupportRequest;
  try {
    body = (await req.json()) as SupportRequest;
  } catch {
    return jsonResponse({ ok: false, code: 'invalid_input', warning: 'Invalid JSON body' }, 400);
  }

  const { recent_transcript, prior } = body;
  if (!recent_transcript || typeof recent_transcript !== 'string') {
    return jsonResponse(
      { ok: false, code: 'invalid_input', warning: 'Missing recent_transcript' },
      400
    );
  }

  console.log(
    `[support-api] request — transcript ${recent_transcript.length} chars, prior=${
      prior ? `${prior.framework_id}/${prior.current_stage_id}` : 'none'
    }, available=${Object.entries(modelAvailability)
      .filter(([, v]) => v)
      .map(([k]) => k)
      .join('/')}`
  );

  const ai = apiKey ? new GoogleGenAI({ apiKey }) : ({} as GoogleGenAI);
  const systemInstruction = buildSupportSystemPrompt(prior);

  // Walk the model chain: try the first available model; on a retryable
  // failure mark it unavailable, schedule a background probe, and try
  // the next available model. We stop on success, on a permanent error,
  // or when no models remain available.
  let usedModel: Model = pickActiveModel();
  let raw: string | undefined;
  let lastError: unknown;
  let lastCategory: FailureCategory | undefined;

  for (let attempt = 0; attempt < MODELS.length; attempt++) {
    try {
      raw = await callCoachModel(ai, groqApiKey, usedModel, systemInstruction, recent_transcript);
      break; // success
    } catch (err) {
      lastError = err;
      const category = categorizeFailure(err);
      lastCategory = category;

      if (!isRetryable(category)) {
        console.error(`[support-api] ${usedModel} permanent failure:`, err);
        break;
      }

      markUnavailable(usedModel, apiKey ?? '', groqApiKey, category);
      const next = nextAvailableModel(usedModel);
      if (!next) {
        console.warn(`[support-api] ${usedModel} ${category}, no fallback available`);
        break;
      }
      console.warn(`[support-api] ${usedModel} ${category} → trying ${next}`);
      usedModel = next;
    }
  }

  if (!raw) {
    // Map the final failure category to the right HTTP status + UI code.
    const code = lastCategory ? errorCodeFor(lastCategory) : 'unknown';
    const status = lastCategory === 'rate_limited' ? 429 : lastCategory === 'permanent' ? 500 : 503;

    const warning =
      lastCategory === 'rate_limited'
        ? 'Coach is rate-limited across all models. Updates will resume automatically once a model recovers.'
        : lastCategory === 'overloaded' || lastCategory === 'transient'
          ? 'Coach models are experiencing high traffic. Updates will resume shortly.'
          : `Coach error: ${(lastError as Error)?.message ?? 'unknown'}`;

    return jsonResponse({ ok: false, code, warning }, status);
  }

  // ── Parse + Zod validate ────────────────────────────────────────────────
  // `extractJsonFromText` is robust to Gemma's occasional markdown wrapping;
  // it's a no-op on clean structured-output JSON from the Gemini models.
  let parsed: unknown;
  try {
    parsed = JSON.parse(extractJsonFromText(raw));
  } catch (err) {
    console.error('[support-api] JSON parse failed:', err, 'raw:', raw.slice(0, 400));
    return jsonResponse({ ok: false, code: 'schema', warning: 'Model returned invalid JSON' }, 200);
  }

  const validation = CoachUpdateSchema.safeParse(parsed);
  if (!validation.success) {
    console.error('[support-api] Zod validation failed:', validation.error.issues.slice(0, 5));

    // Partial-response salvage path. If this is the FIRST call (no prior
    // state on the client) and we can at least pull a valid framework_id
    // out of the raw response, hydrate a tentative CoachUpdate so the
    // panel renders the framework structure instead of going blank.
    // When prior IS present, the hook keeps its existing state, so the
    // schema-failure code path is the friendlier response there.
    if (!prior) {
      const salvaged = salvageFrameworkId(parsed);
      if (salvaged) {
        console.warn(`[support-api] schema-fail salvage — emitting tentative ${salvaged} update`);
        return jsonResponse({
          ok: true,
          update: buildTentativeUpdate(salvaged),
          partial: true,
        });
      }
    }

    return jsonResponse(
      { ok: false, code: 'schema', warning: 'Coach output failed schema validation' },
      200
    );
  }

  const update = validation.data as CoachUpdate;

  // ── Apply framework lock ────────────────────────────────────────────────
  // If the client sent a prior, the model MUST stay on that framework. If it
  // tried to switch, override server-side rather than confuse the UI.
  if (prior && update.framework_id !== prior.framework_id) {
    console.warn(
      `[support-api] framework lock: model returned ${update.framework_id}, forcing ${prior.framework_id}`
    );
    update.framework_id = prior.framework_id;
  }

  // ── Sanitize cue and stage IDs against catalog ─────────────────────────
  const validStageIds = getValidStageIds(update.framework_id);
  const validCueIds = getValidCueIds(update.framework_id);

  if (!validStageIds.has(update.current_stage_id)) {
    // Fall back to the prior's current stage, or the first stage of the framework.
    const fallback = prior?.current_stage_id ?? Array.from(validStageIds)[0];
    console.warn(
      `[support-api] invalid current_stage_id "${update.current_stage_id}" — using "${fallback}"`
    );
    update.current_stage_id = fallback;
  }

  update.completed_stage_ids = update.completed_stage_ids.filter((id) => validStageIds.has(id));

  // Merge with prior done_cue_ids so the model can never accidentally drop
  // a previously-ticked cue (cumulative semantics, defence in depth).
  const mergedCueIds = new Set<string>(prior?.done_cue_ids ?? []);
  for (const id of update.done_cue_ids) {
    if (validCueIds.has(id)) mergedCueIds.add(id);
  }
  update.done_cue_ids = Array.from(mergedCueIds);

  // Also sanitize hint stage_id
  if (update.hint && !validStageIds.has(update.hint.stage_id)) {
    update.hint = undefined;
  }

  console.log(
    `[support-api] OK (${usedModel}) — ${update.framework_id}/${update.current_stage_id}, ` +
      `${update.done_cue_ids.length} cues done`
  );

  // Type assertion: `framework_id` was narrowed to FrameworkId by the catalog
  // sanitization; Zod's enum returned `string` but only valid framework IDs
  // could have passed.
  return jsonResponse({
    ok: true,
    update: { ...update, framework_id: update.framework_id as FrameworkId },
  });
}
