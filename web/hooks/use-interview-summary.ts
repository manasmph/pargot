'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useSessionContext, useSessionMessages } from '@livekit/components-react';
import { useInterviewSettings } from '@/components/app/interview-settings-context';
import type { CoachState, InterviewSummary, SummaryResponse } from '@/lib/coach-types';

/**
 * Captures the session transcript into a ref while the room is live, then
 * fires `/api/summary` when the session ends (user disconnect or timer
 * auto-disconnect). Returns the resulting summary for SummaryView to render.
 *
 * Why a ref-based capture? LiveKit's `useSessionMessages` clears its
 * internal store after disconnect (the room is gone). If we waited until
 * `isConnected` flipped false to read messages, we'd get an empty array.
 * Instead we buffer them as they arrive, then read the buffer on disconnect.
 *
 * Suppression heuristics: if a session was clearly trivial (<60s OR <2
 * candidate turns OR no transcript content) we skip the API call entirely
 * — no point burning Gemini tokens on a misclick.
 */

const MIN_SESSION_SECONDS = 60;
const MIN_CANDIDATE_TURNS = 2;

type LkMessage = {
  id: string;
  message?: string;
  from?: { isLocal?: boolean };
  type?: string;
};

function isAgentMessage(m: LkMessage): boolean {
  if (m.type === 'agentTranscript') return true;
  if (m.type === 'userTranscript') return false;
  return !m.from?.isLocal;
}

function buildFullTranscript(messages: LkMessage[]): string {
  return messages
    .filter((m) => (m.message ?? '').trim().length > 0)
    .map((m) => `${isAgentMessage(m) ? 'Interviewer' : 'Candidate'}: ${m.message}`)
    .join('\n');
}

function countCandidateTurns(messages: LkMessage[]): number {
  return messages.filter((m) => !isAgentMessage(m) && (m.message ?? '').trim().length > 0).length;
}

export type SummaryHookState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'skipped'; reason: string }
  | { status: 'error'; warning: string }
  | { status: 'ready'; summary: InterviewSummary };

interface UseInterviewSummaryArgs {
  /** Pass the latest CoachState from useSupportCues so we can include framework context in the summary call. */
  coachState: CoachState | null;
}

export function useInterviewSummary({ coachState }: UseInterviewSummaryArgs) {
  const { messages } = useSessionMessages();
  const { isConnected } = useSessionContext();
  const { getSettings } = useInterviewSettings();

  const [state, setState] = useState<SummaryHookState>({ status: 'idle' });

  // Buffer messages as they arrive — survives the LiveKit disconnect reset.
  const transcriptRef = useRef<LkMessage[]>([]);
  useEffect(() => {
    if (messages.length > 0) {
      transcriptRef.current = messages as LkMessage[];
    }
  }, [messages]);

  // Mirror coach state — same reason.
  const coachStateRef = useRef<CoachState | null>(coachState);
  useEffect(() => {
    coachStateRef.current = coachState;
  }, [coachState]);

  // Track session start so we can compute duration on disconnect.
  const sessionStartRef = useRef<number | null>(null);
  // Track previous connection state to detect the truthy→falsy transition.
  const wasConnectedRef = useRef(false);
  // Guard against firing twice for the same disconnect (e.g. React StrictMode double-effects).
  const firedForSessionRef = useRef(false);

  // Note when a session begins.
  useEffect(() => {
    if (isConnected && !wasConnectedRef.current) {
      sessionStartRef.current = Date.now();
      firedForSessionRef.current = false;
      transcriptRef.current = [];
    }
    wasConnectedRef.current = isConnected;
  }, [isConnected]);

  // Fire summary on the connected→disconnected transition.
  useEffect(() => {
    if (isConnected) return;
    if (firedForSessionRef.current) return;
    if (sessionStartRef.current == null) return; // never connected this mount

    // Snapshot everything we need BEFORE marking fired, so a stray re-run can't double-call.
    const buffered = transcriptRef.current;
    const finalCoachState = coachStateRef.current;
    const startedAt = sessionStartRef.current;
    firedForSessionRef.current = true;
    sessionStartRef.current = null;

    const durationSec = Math.max(0, Math.floor((Date.now() - startedAt) / 1000));
    const candidateTurns = countCandidateTurns(buffered);
    const transcript = buildFullTranscript(buffered);

    // Skip the call if the session was clearly a misclick / never got going.
    if (
      durationSec < MIN_SESSION_SECONDS ||
      candidateTurns < MIN_CANDIDATE_TURNS ||
      transcript.length < 50
    ) {
      console.log(
        `[summary] skipping — duration=${durationSec}s, turns=${candidateTurns}, transcript=${transcript.length} chars`
      );
      setState({
        status: 'skipped',
        reason:
          durationSec < MIN_SESSION_SECONDS
            ? 'Session was too short to summarise.'
            : 'Not enough back-and-forth to summarise.',
      });
      return;
    }

    const settings = getSettings();
    setState({ status: 'loading' });

    void (async () => {
      try {
        const res = await fetch('/api/summary', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            transcript,
            seniority: settings.seniority,
            question_types: settings.question_types,
            duration_sec: durationSec,
            final_state: finalCoachState
              ? {
                  framework_id: finalCoachState.framework.id,
                  framework_name: finalCoachState.framework.name,
                  question_type: finalCoachState.framework.questionType,
                  stages_total: finalCoachState.stages.length,
                  stages_completed: finalCoachState.stages.filter((s) => s.status === 'complete')
                    .length,
                }
              : undefined,
          }),
        });
        const payload = (await res.json()) as SummaryResponse;
        if (!payload.ok) {
          setState({ status: 'error', warning: payload.warning });
          return;
        }
        setState({ status: 'ready', summary: payload.summary });
      } catch (err) {
        setState({
          status: 'error',
          warning: `Network error: ${(err as Error).message}`,
        });
      }
    })();
  }, [isConnected, getSettings]);

  const reset = useCallback(() => {
    setState({ status: 'idle' });
    transcriptRef.current = [];
    sessionStartRef.current = null;
    firedForSessionRef.current = false;
  }, []);

  return { state, reset };
}
