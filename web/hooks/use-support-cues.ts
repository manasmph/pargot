'use client';

import { useEffect, useRef, useState } from 'react';
import { useSessionContext, useSessionMessages } from '@livekit/components-react';
import type {
  CoachErrorCode,
  CoachPrior,
  CoachResponse,
  CoachState,
  CoachUpdate,
  FrameworkDef,
} from '@/lib/coach-types';
import { getFramework } from '@/lib/frameworks';

/**
 * Watches the LiveKit session transcript and asks the support model to
 * update the coach panel whenever the interviewer (agent) finishes a turn.
 *
 * Returns the fully-hydrated `CoachState` ready for the stepper UI to render.
 */

const DEBOUNCE_MS = 900;
const TRANSCRIPT_WINDOW = 6; // last 6 turns sent as `recent_transcript`

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
  return messages
    .slice(-window)
    .map((m) => {
      const role = isAgentMessage(m) ? 'Interviewer' : 'Candidate';
      return `${role}: ${m.message ?? ''}`;
    })
    .join('\n');
}

/**
 * Hash combines message id + text length so we re-fetch when the model
 * back-fills or corrects the transcript on a previously-seen message id
 * (LiveKit can revise transcripts mid-utterance).
 */
function transcriptHash(messages: LkMessage[]): string {
  return messages.map((m) => `${m.id}:${m.message?.length ?? 0}`).join('|');
}

function mergeUpdate(update: CoachUpdate, framework: FrameworkDef): CoachState {
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
    feedback: update.feedback,
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

// ─── Hook ─────────────────────────────────────────────────────────────────

export function useSupportCues() {
  const { messages } = useSessionMessages();
  const { isConnected } = useSessionContext();

  const [state, setState] = useState<CoachState | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errorCode, setErrorCode] = useState<CoachErrorCode | null>(null);

  // Refs that survive re-renders. Critical: `timerRef` outlives the messages
  // effect's cleanup so a debounced fetch isn't cancelled when an unrelated
  // user transcript lands within the debounce window.
  const stateRef = useRef<CoachState | null>(null);
  const lastTranscriptHashRef = useRef<string | null>(null);
  const lastAgentIdRef = useRef<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  // Keep `stateRef` in sync with state so the fetch can read the latest
  // value without the effect re-firing.
  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  // Reset everything whenever the LiveKit session disconnects (the user
  // ended the interview and is back at the welcome screen). When a new
  // interview starts, the panel begins fresh — no stale framework, no
  // stale ticks, no stale prior sent to the model.
  useEffect(() => {
    if (isConnected) return;
    console.log('[support] session disconnected — resetting coach state');
    if (timerRef.current) clearTimeout(timerRef.current);
    abortRef.current?.abort();
    stateRef.current = null;
    lastAgentIdRef.current = null;
    lastTranscriptHashRef.current = null;
    setState(null);
    setIsLoading(false);
    setError(null);
    setErrorCode(null);
  }, [isConnected]);

  // Cleanup on unmount.
  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      abortRef.current?.abort();
    };
  }, []);

  // Debug: log every time messages change.
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

  // ── Main effect: fire whenever the latest agent message changes ─────────
  useEffect(() => {
    if (messages.length === 0) return;

    const lkMessages = messages as LkMessage[];
    const agentMsg = lastAgentMessage(lkMessages);
    if (!agentMsg) return;

    const hash = transcriptHash(lkMessages);

    // Skip re-fetch unless either (a) the latest agent id changed, or
    // (b) the transcript text shifted (LiveKit revised an in-flight message).
    if (agentMsg.id === lastAgentIdRef.current && hash === lastTranscriptHashRef.current) {
      return;
    }

    lastAgentIdRef.current = agentMsg.id;
    lastTranscriptHashRef.current = hash;

    // Cancel any pending timer / in-flight request.
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
    const prior = stateRef.current ? buildPrior(stateRef.current) : undefined;

    async function fetchCoach() {
      setIsLoading(true);
      setError(null);
      setErrorCode(null);

      console.log('[support] calling /api/support, prior=', prior?.framework_id ?? 'none');

      try {
        const res = await fetch('/api/support', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ recent_transcript: recentTranscript, prior }),
          signal: controller.signal,
        });

        // The server returns JSON with a CoachResponse body even on 4xx/5xx
        // when it's a structured failure (e.g. 429 rate-limited). Try to parse
        // first, fall back to a generic error if the body isn't JSON.
        let payload: CoachResponse | null = null;
        try {
          payload = (await res.json()) as CoachResponse;
        } catch {
          /* body wasn't JSON */
        }

        if (!payload) {
          console.error('[support] /api/support returned non-JSON body, status', res.status);
          setError(`API error ${res.status}`);
          setErrorCode('unknown');
          return;
        }

        if (!payload.ok) {
          console.warn(`[support] soft failure (${payload.code}):`, payload.warning);
          setError(payload.warning);
          setErrorCode(payload.code);
          // NOTE: we do NOT clear `state` here. Keeping the prior stepper
          // visible while we surface a banner is friendlier than blanking
          // the panel on a transient rate-limit.
          return;
        }

        const framework = getFramework(payload.update.framework_id);
        const next = mergeUpdate(payload.update, framework);
        setState(next);
        console.log(
          `[support] state updated — ${framework.id}/${payload.update.current_stage_id}, ${payload.update.done_cue_ids.length} cues done`
        );
      } catch (err) {
        if ((err as Error).name === 'AbortError') return;
        console.error('[support] fetch error:', err);
        setError(`Error: ${(err as Error).message}`);
        setErrorCode('unknown');
      } finally {
        setIsLoading(false);
      }
    }

    timerRef.current = setTimeout(fetchCoach, DEBOUNCE_MS);

    // ── NO cleanup return ─────────────────────────────────────────────────
    // The debounced timer must survive re-renders triggered by subsequent
    // user-transcript messages arriving inside the debounce window.
    // Unmount cleanup is handled by the separate effect above.
  }, [messages]);

  return { state, isLoading, error, errorCode };
}
