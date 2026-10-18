'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { signIn } from 'next-auth/react';
import { useTheme } from 'next-themes';
import { AnimatePresence, motion } from 'motion/react';
import { toast } from 'sonner';
import { useSessionContext } from '@livekit/components-react';
import type { AppConfig } from '@/app-config';
import { AgentSessionView_01 } from '@/components/agents-ui/blocks/agent-session-view-01';
import { ConnectingView, type StepStatus } from '@/components/app/connecting-view';
import { DailyLimitView } from '@/components/app/daily-limit-view';
import { useInterviewSettings } from '@/components/app/interview-settings-context';
import { SettingsView } from '@/components/app/settings-view';
import { SummaryView } from '@/components/app/summary-view';
import { SupportPanel } from '@/components/app/support-panel';
import { WelcomeView } from '@/components/app/welcome-view';
import { useInterviewSummary } from '@/hooks/use-interview-summary';
import { useSupportCues } from '@/hooks/use-support-cues';
import { AUTH_ENABLED } from '@/lib/auth-config';
import { DEFAULT_INTERVIEW_SETTINGS, type InterviewSettings } from '@/lib/interview-settings';

const MotionWelcomeView = motion.create(WelcomeView);
const MotionSettingsView = motion.create(SettingsView);
const MotionConnectingView = motion.create(ConnectingView);
const MotionSummaryView = motion.create(SummaryView);
const MotionDailyLimitView = motion.create(DailyLimitView);

// Keep in sync with DAILY_INTERVIEW_LIMIT server-side. Display-only — the
// server is the source of truth; this just labels the limit screen.
const DAILY_LIMIT_DISPLAY = Number(process.env.NEXT_PUBLIC_DAILY_INTERVIEW_LIMIT ?? 3);

// 30-minute hard cap on a session, with a 5-min-remaining warning.
// Matches the "~30-minute mock PM interview" framing in the agent's opener.
const SESSION_LIMIT_MS = 30 * 60 * 1000;
const SESSION_WARNING_MS = 25 * 60 * 1000;

const VIEW_MOTION_PROPS = {
  variants: {
    visible: { opacity: 1 },
    hidden: { opacity: 0 },
  },
  initial: 'hidden',
  animate: 'visible',
  exit: 'hidden',
  transition: { duration: 0.5, ease: 'linear' },
};

interface InterviewRoomProps {
  appConfig: AppConfig;
}

export function InterviewRoom({ appConfig }: InterviewRoomProps) {
  const { isConnected, start, end } = useSessionContext();
  const { resolvedTheme } = useTheme();
  const { state, isLoading, error, errorCode, isPartial } = useSupportCues();
  const { settings, applySettings } = useInterviewSettings();
  const { state: summaryState, reset: resetSummary } = useInterviewSummary({ coachState: state });

  // ── View state machine ─────────────────────────────────────────────────
  //   welcome → settings → connecting → connected → summary → welcome
  //
  // `wantsSettings`  : user clicked Start on welcome, settings page showing.
  // `isStarting`     : user confirmed settings, LiveKit handshake in flight.
  // `showSummary`    : session has just ended (manually or via auto-end);
  //                    SummaryView is rendered until user clicks "Start new".
  const [wantsSettings, setWantsSettings] = useState(false);
  const [isStarting, setIsStarting] = useState(false);
  const [showSummary, setShowSummary] = useState(false);
  const [limitReached, setLimitReached] = useState(false);
  const [coachHealth, setCoachHealth] = useState<StepStatus>('pending');
  const [coachError, setCoachError] = useState<string | undefined>(undefined);

  // Detect connected → disconnected transition to flip into summary view.
  // We only set `showSummary` on the falling edge; staying-false (idle) or
  // staying-true (mid-session) is a no-op.
  const wasConnectedRef = useRef(false);
  useEffect(() => {
    if (wasConnectedRef.current && !isConnected) {
      setShowSummary(true);
    }
    wasConnectedRef.current = isConnected;
  }, [isConnected]);

  // Leave the connecting view once LiveKit reports connected.
  useEffect(() => {
    if (isConnected) {
      setIsStarting(false);
      setWantsSettings(false);
    }
  }, [isConnected]);

  // Reset the loader state whenever we drop back to the welcome screen.
  useEffect(() => {
    if (!isConnected && !isStarting && !wantsSettings && !showSummary) {
      setCoachHealth('pending');
      setCoachError(undefined);
    }
  }, [isConnected, isStarting, wantsSettings, showSummary]);

  // ── 30-minute session limit ────────────────────────────────────────────
  // Mounts a pair of timers when the session goes live: a soft 5-min-
  // remaining toast and a hard auto-end at 30 min. The agent's opener
  // tells the candidate "~30-minute mock PM interview" so this enforces it.
  useEffect(() => {
    if (!isConnected) return;

    const warningId = window.setTimeout(() => {
      toast.warning('5 minutes left in your interview', {
        description: 'Wrap up your final answer — the summary appears when time is up.',
        duration: 8000,
      });
    }, SESSION_WARNING_MS);

    const limitId = window.setTimeout(() => {
      console.log('[interview-room] 30-min session limit reached — auto-ending');
      toast.info("Time's up — generating your summary…", { duration: 4000 });
      void end();
    }, SESSION_LIMIT_MS);

    return () => {
      window.clearTimeout(warningId);
      window.clearTimeout(limitId);
    };
  }, [isConnected, end]);

  // ── Welcome → settings ─────────────────────────────────────────────────
  const handleWelcomeStart = useCallback(() => {
    setWantsSettings(true);
  }, []);

  // ── Settings → connecting ──────────────────────────────────────────────
  const handleSettingsConfirm = useCallback(
    (next: InterviewSettings) => {
      // applySettings updates the ref synchronously so the TokenSource.custom
      // closure in app.tsx will read these values when `start()` triggers
      // its fetch — no race against React's batched state updates.
      applySettings(next);
      setWantsSettings(false);
      setIsStarting(true);
      setCoachHealth('pending');
      setCoachError(undefined);

      Promise.resolve(start()).catch((err: unknown) => {
        const msg = (err as Error)?.message ?? '';
        // Quota exhausted → dedicated limit screen instead of a generic error.
        if (msg.includes('daily_limit')) {
          setLimitReached(true);
          setIsStarting(false);
          return;
        }
        // Not signed in (auth mode only) → kick off Google sign-in.
        if (msg.includes('unauthorized')) {
          setIsStarting(false);
          setWantsSettings(false);
          if (AUTH_ENABLED) void signIn('google');
          return;
        }
        console.error('[interview-room] LiveKit connect failed:', err);
        setIsStarting(false);
      });

      // Pre-flight the coach pipeline in parallel. Non-blocking — if it
      // fails the room still opens, we just surface a soft warning.
      fetch('/api/support', { method: 'GET' })
        .then(async (res) => {
          const data = (await res.json()) as { ok: boolean; warning?: string };
          if (data.ok) {
            setCoachHealth('ok');
          } else {
            setCoachHealth('error');
            setCoachError(data.warning ?? 'Coach is currently unavailable');
          }
        })
        .catch((err: unknown) => {
          setCoachHealth('error');
          setCoachError((err as Error).message);
        });
    },
    [applySettings, start]
  );

  const handleSettingsBack = useCallback(() => {
    setWantsSettings(false);
  }, []);

  // ── Daily-limit screen → back to welcome ────────────────────────────────
  const handleLimitBack = useCallback(() => {
    setLimitReached(false);
    setWantsSettings(false);
  }, []);

  // ── Summary → welcome ──────────────────────────────────────────────────
  const handleStartNew = useCallback(() => {
    setShowSummary(false);
    resetSummary();
  }, [resetSummary]);

  const view: 'welcome' | 'settings' | 'connecting' | 'connected' | 'summary' | 'limit' =
    showSummary
      ? 'summary'
      : isConnected
        ? 'connected'
        : limitReached
          ? 'limit'
          : isStarting
            ? 'connecting'
            : wantsSettings
              ? 'settings'
              : 'welcome';

  return (
    <AnimatePresence mode="wait">
      {view === 'welcome' && (
        <MotionWelcomeView
          key="welcome"
          {...VIEW_MOTION_PROPS}
          startButtonText={appConfig.startButtonText}
          onStartCall={handleWelcomeStart}
        />
      )}

      {view === 'settings' && (
        <MotionSettingsView
          key="settings"
          {...VIEW_MOTION_PROPS}
          initialSettings={settings ?? DEFAULT_INTERVIEW_SETTINGS}
          onConfirm={handleSettingsConfirm}
          onBack={handleSettingsBack}
        />
      )}

      {view === 'connecting' && (
        <MotionConnectingView
          key="connecting"
          {...VIEW_MOTION_PROPS}
          coachHealth={coachHealth}
          coachError={coachError}
        />
      )}

      {view === 'connected' && (
        <motion.div
          key="session"
          {...VIEW_MOTION_PROPS}
          className="fixed inset-0 flex flex-col md:flex-row"
        >
          <AgentSessionView_01
            className="min-h-0 min-w-0 flex-[2] md:flex-[3]"
            supportsChatInput={appConfig.supportsChatInput}
            supportsVideoInput={appConfig.supportsVideoInput}
            supportsScreenShare={appConfig.supportsScreenShare}
            isPreConnectBufferEnabled={appConfig.isPreConnectBufferEnabled}
            audioVisualizerType={appConfig.audioVisualizerType}
            audioVisualizerColor={
              resolvedTheme === 'dark'
                ? appConfig.audioVisualizerColorDark
                : appConfig.audioVisualizerColor
            }
            audioVisualizerColorShift={appConfig.audioVisualizerColorShift}
            audioVisualizerBarCount={appConfig.audioVisualizerBarCount}
            audioVisualizerGridRowCount={appConfig.audioVisualizerGridRowCount}
            audioVisualizerGridColumnCount={appConfig.audioVisualizerGridColumnCount}
            audioVisualizerRadialBarCount={appConfig.audioVisualizerRadialBarCount}
            audioVisualizerRadialRadius={appConfig.audioVisualizerRadialRadius}
            audioVisualizerWaveLineWidth={appConfig.audioVisualizerWaveLineWidth}
          />

          <SupportPanel
            state={state}
            isLoading={isLoading}
            error={error}
            errorCode={errorCode}
            isPartial={isPartial}
            className="min-h-0 flex-[3] md:max-w-[420px] md:min-w-[280px] md:flex-[2]"
          />
        </motion.div>
      )}

      {view === 'summary' && (
        <MotionSummaryView
          key="summary"
          {...VIEW_MOTION_PROPS}
          state={summaryState}
          onStartNew={handleStartNew}
        />
      )}

      {view === 'limit' && (
        <MotionDailyLimitView
          key="limit"
          {...VIEW_MOTION_PROPS}
          limit={DAILY_LIMIT_DISPLAY}
          onBack={handleLimitBack}
        />
      )}
    </AnimatePresence>
  );
}
