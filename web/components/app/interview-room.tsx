'use client';

import { useCallback, useEffect, useState } from 'react';
import { useTheme } from 'next-themes';
import { AnimatePresence, motion } from 'motion/react';
import { useSessionContext } from '@livekit/components-react';
import type { AppConfig } from '@/app-config';
import { AgentSessionView_01 } from '@/components/agents-ui/blocks/agent-session-view-01';
import { ConnectingView, type StepStatus } from '@/components/app/connecting-view';
import { SupportPanel } from '@/components/app/support-panel';
import { WelcomeView } from '@/components/app/welcome-view';
import { useSupportCues } from '@/hooks/use-support-cues';

const MotionWelcomeView = motion.create(WelcomeView);
const MotionConnectingView = motion.create(ConnectingView);

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
  const { isConnected, start } = useSessionContext();
  const { resolvedTheme } = useTheme();
  const { state, isLoading, error, errorCode } = useSupportCues();

  // ── Connecting state ────────────────────────────────────────────────────
  // We show the loader from the moment the user clicks "Start interview"
  // until `isConnected` flips true. While the LiveKit handshake is in
  // flight we also pre-flight the coach pipeline so the user knows
  // upfront if cues might be limited.
  const [isStarting, setIsStarting] = useState(false);
  const [coachHealth, setCoachHealth] = useState<StepStatus>('pending');
  const [coachError, setCoachError] = useState<string | undefined>(undefined);

  // Once LiveKit reports connected, leave the connecting view.
  useEffect(() => {
    if (isConnected) setIsStarting(false);
  }, [isConnected]);

  // Reset the loader state whenever we drop back to the welcome screen
  // (e.g. user ended the interview and is starting a new one).
  useEffect(() => {
    if (!isConnected && !isStarting) {
      setCoachHealth('pending');
      setCoachError(undefined);
    }
  }, [isConnected, isStarting]);

  const handleStart = useCallback(() => {
    setIsStarting(true);
    setCoachHealth('pending');
    setCoachError(undefined);

    // Kick off LiveKit connection. `start` may be sync or async — wrap in
    // Promise.resolve so a thrown sync error or a rejected promise both
    // surface to the catch.
    Promise.resolve(start()).catch((err: unknown) => {
      console.error('[interview-room] LiveKit connect failed:', err);
      setIsStarting(false);
    });

    // Pre-flight the coach pipeline in parallel. This call is non-blocking:
    // if it fails, the room still opens — we just surface a soft warning.
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
  }, [start]);

  const view: 'welcome' | 'connecting' | 'connected' = isConnected
    ? 'connected'
    : isStarting
      ? 'connecting'
      : 'welcome';

  return (
    <AnimatePresence mode="wait">
      {view === 'welcome' && (
        <MotionWelcomeView
          key="welcome"
          {...VIEW_MOTION_PROPS}
          startButtonText={appConfig.startButtonText}
          onStartCall={handleStart}
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
          {/* Agent visualizer + mic controls.
              Mobile (column layout): top section, ~40% height.
              Desktop (row layout): left column, ~60% width. */}
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

          {/* Support panel.
              Mobile: bottom section, ~60% height — scrolls internally.
              Desktop: right column, 280-420px wide. */}
          <SupportPanel
            state={state}
            isLoading={isLoading}
            error={error}
            errorCode={errorCode}
            className="min-h-0 flex-[3] md:max-w-[420px] md:min-w-[280px] md:flex-[2]"
          />
        </motion.div>
      )}
    </AnimatePresence>
  );
}
