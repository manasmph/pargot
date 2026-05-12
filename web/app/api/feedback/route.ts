/**
 * /api/feedback  (Phase 3.3)
 *
 * Generates 1–3 feedback chips about the candidate's most recent answer.
 * Called in parallel with /api/support so feedback can render in
 * ~500–700ms vs the 1.5–2.5s of the full state call.
 *
 * Two-tier model fallback (lighter than the full /api/support chain):
 *   1. gemini-3.1-flash-lite — fast and cheap; preferred path
 *   2. gemini-2.5-flash      — fallback if the lite model is unavailable
 *
 * If both fail, the route returns `{ ok: false }` and the panel just
 * keeps showing the prior turn's chips (or none on the first turn).
 * Feedback is non-essential — never block the user on it.
 */
import { GoogleGenAI, Type } from "@google/genai";
import type { Schema } from "@google/genai";
import { FeedbackPayloadSchema } from "@/lib/coach-schema";
import type { FeedbackResponse } from "@/lib/coach-types";
import { FEEDBACK_SYSTEM_PROMPT } from "@/lib/feedback-prompt";

export const runtime = "nodejs";
export const revalidate = 0;

const FEEDBACK_MODELS = [
  "gemini-3.1-flash-lite",
  "gemini-2.5-flash",
  "openai/gpt-oss-120b",
] as const;
type FeedbackModel = (typeof FEEDBACK_MODELS)[number];

function isGroq(model: string): boolean {
  return model === "openai/gpt-oss-120b";
}

const FEEDBACK_SCHEMA: Schema = {
  type: Type.OBJECT,
  properties: {
    feedback: {
      type: Type.ARRAY,
      maxItems: "3",
      items: {
        type: Type.OBJECT,
        properties: {
          tone: { type: Type.STRING, enum: ["positive", "warning", "info"] },
          text: { type: Type.STRING },
        },
        required: ["tone", "text"],
      },
    },
  },
  required: ["feedback"],
};

interface FeedbackRequest {
  recent_transcript: string;
}

function jsonResponse(payload: FeedbackResponse, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-cache, no-store",
    },
  });
}

function extractJsonFromText(text: string): string {
  const fenceMatch = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
  if (fenceMatch) return fenceMatch[1].trim();
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start !== -1 && end > start) return text.slice(start, end + 1).trim();
  return text.trim();
}

function isRetryable(err: unknown): boolean {
  const e = err as { status?: number; message?: string };
  if (e?.status === 429 || e?.status === 503) return true;
  if (e?.status && e.status >= 500 && e.status < 600) return true;
  const msg = String(e?.message ?? err).toLowerCase();
  return (
    msg.includes("quota") ||
    msg.includes("overloaded") ||
    msg.includes("rate limit") ||
    msg.includes("unavailable") ||
    msg.includes("timeout") ||
    msg.includes("429") ||
    msg.includes("503")
  );
}

async function callFeedbackModel(
  ai: GoogleGenAI,
  groqApiKey: string | undefined,
  model: FeedbackModel,
  recentTranscript: string,
): Promise<string | undefined> {
  if (isGroq(model)) {
    if (!groqApiKey) {
      const err = Object.assign(new Error("GROQ_API_KEY is not configured"), {
        status: 401,
      });
      throw err;
    }
    const schemaPrompt = `
You MUST return a JSON object that matches the following structure:
{
  "feedback": [
    { "tone": "positive" | "warning" | "info", "text": "string" }
  ]
}
Return an array with maximum 3 items.
`;
    const response = await fetch(
      "https://api.groq.com/openai/v1/chat/completions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${groqApiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model,
          messages: [
            {
              role: "system",
              content: FEEDBACK_SYSTEM_PROMPT + "\n\n" + schemaPrompt,
            },
            { role: "user", content: recentTranscript },
          ],
          temperature: 0.5,
          max_tokens: 200,
          response_format: { type: "json_object" },
        }),
      },
    );
    if (!response.ok) {
      const errText = await response.text();
      const err = Object.assign(
        new Error(`Groq API error: ${response.status} ${errText}`),
        {
          status: response.status,
        },
      );
      throw err;
    }
    const json = await response.json();
    return json.choices?.[0]?.message?.content;
  }

  const response = await ai.models.generateContent({
    model,
    config: {
      systemInstruction: FEEDBACK_SYSTEM_PROMPT,
      temperature: 0.5,
      maxOutputTokens: 200,
      responseMimeType: "application/json",
      responseSchema: FEEDBACK_SCHEMA,
      thinkingConfig: { thinkingBudget: 0 },
    },
    contents: [{ role: "user", parts: [{ text: recentTranscript }] }],
  });
  return response.text;
}

export async function POST(req: Request): Promise<Response> {
  const apiKey = process.env.GOOGLE_API_KEY;
  const groqApiKey = process.env.GROQ_API_KEY;
  if (!apiKey && !groqApiKey) {
    return jsonResponse(
      { ok: false, warning: "API keys are not configured" },
      500,
    );
  }

  let body: FeedbackRequest;
  try {
    body = (await req.json()) as FeedbackRequest;
  } catch {
    return jsonResponse({ ok: false, warning: "Invalid JSON body" }, 400);
  }

  if (!body.recent_transcript || typeof body.recent_transcript !== "string") {
    return jsonResponse(
      { ok: false, warning: "Missing recent_transcript" },
      400,
    );
  }

  const ai = apiKey ? new GoogleGenAI({ apiKey }) : ({} as GoogleGenAI);

  // Try each model in order, falling forward on retryable errors only.
  let raw: string | undefined;
  let usedModel: FeedbackModel = FEEDBACK_MODELS[0];
  let lastError: unknown;

  for (const model of FEEDBACK_MODELS) {
    try {
      raw = await callFeedbackModel(
        ai,
        groqApiKey,
        model,
        body.recent_transcript,
      );
      usedModel = model;
      break;
    } catch (err) {
      lastError = err;
      if (!isRetryable(err)) {
        console.error(`[feedback-api] ${model} permanent failure:`, err);
        break;
      }
      console.warn(`[feedback-api] ${model} retryable failure — trying next`);
    }
  }

  if (!raw) {
    return jsonResponse(
      {
        ok: false,
        warning: `Feedback error: ${(lastError as Error)?.message ?? "unknown"}`,
      },
      503,
    );
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(extractJsonFromText(raw));
  } catch {
    return jsonResponse(
      { ok: false, warning: "Feedback model returned invalid JSON" },
      200,
    );
  }

  const validation = FeedbackPayloadSchema.safeParse(parsed);
  if (!validation.success) {
    return jsonResponse(
      { ok: false, warning: "Feedback schema validation failed" },
      200,
    );
  }

  console.log(
    `[feedback-api] OK (${usedModel}) — ${validation.data.feedback.length} chip(s)`,
  );
  return jsonResponse({ ok: true, feedback: validation.data.feedback });
}
