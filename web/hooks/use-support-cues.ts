'use client';

import { useEffect, useRef, useState } from 'react';
import { useSessionContext, useSessionMessages } from '@livekit/components-react';
import { useInterviewSettings } from '@/components/app/interview-settings-context';
import type {
  ClassifyTurnResponse,
  CoachErrorCode,
  CoachPrior,
  CoachResponse,
  CoachState,
  CoachUpdate,
  FeedbackItem,
  FeedbackResponse,
  FrameworkDef,
  FrameworkId,
} from '@/lib/coach-types';
import { getFramework } from '@/lib/frameworks';
import type { SeniorityId } from '@/lib/interview-settings';

/**
 * Watches the LiveKit session transcript and orchestrates three parallel
 * backend calls on every agent turn:
 *
 *  1. /api/support       — slow (~1.5–2.5 s) — coach state (framework, stages, cues).
 *  2. /api/feedback      — fast (~500–700 ms) — feedback chips for the latest answer.
 *  3. /api/classify-turn — fast (~400–600 ms) — "did the interviewer pivot to a
 *                          new question?" signal for framework unlock.
 *
 * Feedback chips are applied to state as soon as /api/feedback returns,
 * so the user sees them in roughly half the time of the full /api/support
 * call. When the classifier flags a new question with confidence > 0.7,
 * the hook pushes the current CoachState onto a history stack, resets the
 * framework lock, and re-fires /api/support without a prior. The next
 * answer will arrive on a fresh framework.
 *
 * Returns the fully-hydrated `CoachState` ready for the stepper UI to render.
 */

const DEBOUNCE_MS = 900;
const TRANSCRIPT_WINDOW = 6; // last 6 turns considered for `recent_transcript`
const TRANSCRIPT_MAX_CHARS = 1500; // hard cap so a long monologue can't blow up prompt cost
const NEW_QUESTION_THRESHOLD = 0.7; // classifier confidence required to unlock the framework

// Internal LiveKit message shape (we only read a few fields and stay loose).
type LkMessage = {
  id: string;
  message?: string;
  from?: { isLocal?: boolean };
  type?: string;
};

// ─── Helpers ──────────────────────────────────────────────────────────────

function isAgentMessage(m: LkMessage): boolean {
  if (m.type === 'agentTranscript') return true;
  if (m.type === 'userTranscript') return false;
  return !m.from?.isLocal;
}

function lastAgentMessage(messages: LkMessage[]): LkMessage | undefined {
  for (let i = messages.length - 1; i >= 0; i--) {
    if (isAgentMessage(messages[i])) return messages[i];
  }
  return undefined;
}

function buildRecentTranscript(messages: LkMessage[], window = TRANSCRIPT_WINDOW): string {
  const lines = messages.slice(-window).map((m) => {
    const role = isAgentMessage(m) ? 'Interviewer' : 'Candidate';
    return `${role}: ${m.message ?? ''}`;
  });

  while (lines.length > 1 && lines.join('\n').length > TRANSCRIPT_MAX_CHARS) {
    lines.shift();
  }
  return lines.join('\n');
}

function transcriptHash(messages: LkMessage[]): string {
  return messages.map((m) => `${m.id}:${m.message?.length ?? 0}`).join('|');
}

function mergeUpdate(
  update: CoachUpdate,
  framework: FrameworkDef,
  feedback: FeedbackItem[]
): CoachState {
  const doneCueIds = new Set(update.done_cue_ids);
  const completedStageIds = new Set(update.completed_stage_ids);

  return {
    framework,
    stages: framework.stages.map((stage) => {
      const isComplete = completedStageIds.has(stage.id);
      const isCurrent = stage.id === update.current_stage_id;
      const status: 'complete' | 'current' | 'pending' = isComplete
        ? 'complete'
        : isCurrent
          ? 'current'
          : 'pending';

      return {
        id: stage.id,
        name: stage.name,
        description: stage.description,
        status,
        cues: stage.defaultCues.map((c) => ({
          id: c.id,
          text: c.text,
          done: doneCueIds.has(c.id),
        })),
        hint: update.hint?.stage_id === stage.id ? update.hint.text : undefined,
      };
    }),
    feedback,
  };
}

function buildPrior(state: CoachState): CoachPrior {
  const currentStage = state.stages.find((s) => s.status === 'current') ?? state.stages[0];
  const doneCueIds = state.stages.flatMap((s) => s.cues.filter((c) => c.done).map((c) => c.id));
  return {
    framework_id: state.framework.id,
    current_stage_id: currentStage.id,
    done_cue_ids: doneCueIds,
  };
}

// ─── Fetch helpers (each soft-fails to a typed null) ──────────────────────

async function fetchSupport(
  recentTranscript: string,
  prior: CoachPrior | undefined,
  seniority: SeniorityId | undefined,
  signal: AbortSignal
): Promise<CoachResponse | null> {
  try {
    const res = await fetch('/api/support', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ recent_transcript: recentTranscript, prior, seniority }),
      signal,
    });
    return (await res.json()) as CoachResponse;
  } catch (err) {
    if ((err as Error).name === 'AbortError') return null;
    return { ok: false, code: 'unknown', warning: `Network error: ${(err as Error).message}` };
  }
}

async function fetchFeedback(
  recentTranscript: string,
  signal: AbortSignal
): Promise<FeedbackResponse | null> {
  try {
    const res = await fetch('/api/feedback', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ recent_transcript: recentTranscript }),
      signal,
    });
    return (await res.json()) as FeedbackResponse;
  } catch (err) {
    if ((err as Error).name === 'AbortError') return null;
    return { ok: false, warning: `Network error: ${(err as Error).message}` };
  }
}

async function fetchClassify(
  recentTranscript: string,
  priorFrameworkId: FrameworkId | undefined,
  signal: AbortSignal
): Promise<ClassifyTurnResponse | null> {
  try {
    const res = await fetch('/api/classify-turn', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        recent_transcript: recentTranscript,
        prior_framework_id: priorFrameworkId,
      }),
      signal,
    });
    return (await res.json()) as ClassifyTurnResponse;
  } catch (err) {
    if ((err as Error).name === 'AbortError') return null;
    return { ok: false, warning: `Network error: ${(err as Error).message}` };
  }
}

// ─── Hook ─────────────────────────────────────────────────────────────────

export function useSupportCues() {
  const { messages } = useSessionMessages();
  const { isConnected } = useSessionContext();
  // Pull seniority from the settings context so the coach prompt can
  // calibrate cue-ticking strictness. `getSettings()` reads from a ref so
  // its identity is stable across renders — safe to read in `orchestrate`.
  const { getSettings } = useInterviewSettings();

  const [state, setState] = useState<CoachState | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errorCode, setErrorCode] = useState<CoachErrorCode | null>(null);
  const [isPartial, setIsPartial] = useState(false);

  const stateRef = useRef<CoachState | null>(null);
  const lastTranscriptHashRef = useRef<string | null>(null);
  const lastAgentIdRef = useRef<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  // Phase 3.2 — history stack of past CoachStates. Each entry is a framework
  // the candidate has completed (interviewer pivoted away from it). Surfaced
  // by future review-screen work; for now we just keep the slot so old state
  // isn't lost when we reset on new-question detection.
  const historyRef = useRef<CoachState[]>([]);
  // Most recent feedback chips for the in-flight turn. Lets feedback render
  // as soon as /api/feedback resolves, even before /api/support catches up.
  const pendingFeedbackRef = useRef<FeedbackItem[] | null>(null);

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  useEffect(() => {
    if (isConnected) return;
    console.log('[support] session disconnected — resetting coach state');
    if (timerRef.current) clearTimeout(timerRef.current);
    abortRef.current?.abort();
    stateRef.current = null;
    lastAgentIdRef.current = null;
    lastTranscriptHashRef.current = null;
    historyRef.current = [];
    pendingFeedbackRef.current = null;
    setState(null);
    setIsLoading(false);
    setError(null);
    setErrorCode(null);
    setIsPartial(false);
  }, [isConnected]);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      abortRef.current?.abort();
    };
  }, []);

  useEffect(() => {
    if (messages.length === 0) return;
    console.log(
      '[support] messages count:',
      messages.length,
      messages.slice(-3).map((m) => ({
        id: m.id,
        type: (m as LkMessage).type,
        text: m.message?.slice(0, 50),
      }))
    );
  }, [messages]);

  useEffect(() => {
    if (messages.length === 0) return;

    const lkMessages = messages as LkMessage[];
    const agentMsg = lastAgentMessage(lkMessages);
    if (!agentMsg) return;

    const hash = transcriptHash(lkMessages);
    if (agentMsg.id === lastAgentIdRef.current && hash === lastTranscriptHashRef.current) {
      return;
    }

    lastAgentIdRef.current = agentMsg.id;
    lastTranscriptHashRef.current = hash;

    if (timerRef.current) clearTimeout(timerRef.current);
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    console.log(
      '[support] new agent turn — id=',
      agentMsg.id,
      'text=',
      agentMsg.message?.slice(0, 80)
    );

    const recentTranscript = buildRecentTranscript(lkMessages);
    const initialPrior = stateRef.current ? buildPrior(stateRef.current) : undefined;

    async function orchestrate() {
      setIsLoading(true);
      setError(null);
      setErrorCode(null);
      // Reset feedback ref at the start of each turn — chips from the
      // previous turn should clear immediately so they don't linger
      // misleadingly while the new ones are fetched.
      pendingFeedbackRef.current = null;

      // Read seniority from settings context once per turn — passed to
      // /api/support so the coach prompt can calibrate cue strictness.
      const seniority = getSettings().seniority;

      console.log(
        '[support] firing parallel calls (support/feedback/classify), prior=',
        initialPrior?.framework_id ?? 'none',
        'seniority=',
        seniority
      );

      // Fire all three in parallel.
      const supportPromise = fetchSupport(
        recentTranscript,
        initialPrior,
        seniority,
        controller.signal
      );
      const feedbackPromise = fetchFeedback(recentTranscript, controller.signal);
      const classifyPromise = fetchClassify(
        recentTranscript,
        initialPrior?.framework_id,
        controller.signal
      );

      // Feedback resolves fast — patch chips as soon as it arrives so the
      // user sees critique while the slower support call is still in flight.
      feedbackPromise.then((fbResult) => {
        if (controller.signal.aborted) return;
        if (!fbResult || !fbResult.ok) return;
        pendingFeedbackRef.current = fbResult.feedback;
        if (stateRef.current) {
          setState({ ...stateRef.current, feedback: fbResult.feedback });
        }
        console.log(`[support] feedback ready — ${fbResult.feedback.length} chip(s)`);
      });

      // ── Apply support response AS SOON AS IT LANDS ──
      // Critical: do NOT gate cues on the classifier. If classify is slow
      // (or briefly stalls under traffic), cues would wait — that's what
      // made the panel feel "super late" in the first orchestration pass.
      // The classifier is consulted afterwards, post-hoc; if it says "new
      // question", we animate a framework swap then.
      const supportResult = await supportPromise;
      if (controller.signal.aborted) return;
      if (!supportResult) return;

      if (!supportResult.ok) {
        console.warn(`[support] soft failure (${supportResult.code}):`, supportResult.warning);
        setError(supportResult.warning);
        setErrorCode(supportResult.code);
        if (pendingFeedbackRef.current && stateRef.current) {
          setState({ ...stateRef.current, feedback: pendingFeedbackRef.current });
        }
        return;
      }

      const framework = getFramework(supportResult.update.framework_id);
      const initialFeedback = pendingFeedbackRef.current ?? stateRef.current?.feedback ?? [];
      const initialState = mergeUpdate(supportResult.update, framework, initialFeedback);
      setState(initialState);
      setIsPartial(Boolean(supportResult.partial));
      setIsLoading(false); // cues visible NOW

      console.log(
        `[support] state updated — ${framework.id}/${supportResult.update.current_stage_id}, ${supportResult.update.done_cue_ids.length} cues done${supportResult.partial ? ' (tentative)' : ''}`
      );

      // ── Now wait for classifier in the background (cues already showing) ──
      const classifyResult = await classifyPromise;
      if (controller.signal.aborted) return;

      const isNewQuestion =
        classifyResult?.ok === true &&
        classifyResult.result.is_new_question &&
        classifyResult.result.confidence > NEW_QUESTION_THRESHOLD &&
        // Only meaningful if we HAD a prior — first turn can't be a "new question".
        initialPrior !== undefined;

      if (!isNewQuestion) return;

      // ── New question detected — push history and re-fetch w/o prior ──
      // The old framework stays visible during this re-fetch (no setState(null))
      // so the user sees a clean animated swap when the new framework arrives.
      console.log(
        `[support] new question detected (conf=${classifyResult!.ok ? classifyResult!.result.confidence.toFixed(2) : '?'}) — unlocking framework + re-fetching`
      );
      historyRef.current.push(initialState);
      pendingFeedbackRef.current = [];
      setIsLoading(true); // pending dot on the (still-visible) old framework

      const freshResult = await fetchSupport(
        recentTranscript,
        undefined,
        seniority,
        controller.signal
      );
      if (controller.signal.aborted) return;
      if (!freshResult || !freshResult.ok) {
        console.warn('[support] re-fetch after new-question failed — keeping old framework');
        return;
      }

      const freshFramework = getFramework(freshResult.update.framework_id);
      const freshState = mergeUpdate(freshResult.update, freshFramework, []);
      setState(freshState);
      setIsPartial(Boolean(freshResult.partial));
      console.log(`[support] framework swapped — ${framework.id} → ${freshFramework.id}`);
    }

    timerRef.current = setTimeout(() => {
      orchestrate().finally(() => {
        if (!controller.signal.aborted) setIsLoading(false);
      });
    }, DEBOUNCE_MS);
  }, [messages]);

  return { state, isLoading, error, errorCode, isPartial };
}
