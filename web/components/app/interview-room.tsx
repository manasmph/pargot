'use client';

import { useCallback, useEffect, useState } from 'react';
import { useTheme } from 'next-themes';
import { AnimatePresence, motion } from 'motion/react';
import { useSessionContext } from '@livekit/components-react';
import type { AppConfig } from '@/app-config';
import { AgentSessionView_01 } from '@/components/agents-ui/blocks/agent-session-view-01';
import { ConnectingView, type StepStatus } from '@/components/app/connecting-view';
import { useInterviewSettings } from '@/components/app/interview-settings-context';
import { SettingsView } from '@/components/app/settings-view';
import { SupportPanel } from '@/components/app/support-panel';
import { WelcomeView } from '@/components/app/welcome-view';
import { useSupportCues } from '@/hooks/use-support-cues';
import { DEFAULT_INTERVIEW_SETTINGS, type InterviewSettings } from '@/lib/interview-settings';

const MotionWelcomeView = motion.create(WelcomeView);
const MotionSettingsView = motion.create(SettingsView);
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
  const { state, isLoading, error, errorCode, isPartial } = useSupportCues();
  const { settings, applySettings } = useInterviewSettings();

  // ── Pre-interview state ─────────────────────────────────────────────────
  // The view machine grows a 'settings' step between welcome and connecting:
  //   welcome → settings → connecting → connected
  //
  // `wantsSettings` flips true when the user clicks Start on the welcome
  // page; `isStarting` flips true when they confirm the settings page and
  // we kick off the LiveKit handshake.
  const [wantsSettings, setWantsSettings] = useState(false);
  const [isStarting, setIsStarting] = useState(false);
  const [coachHealth, setCoachHealth] = useState<StepStatus>('pending');
  const [coachError, setCoachError] = useState<string | undefined>(undefined);

  // Once LiveKit reports connected, leave the connecting view.
  useEffect(() => {
    if (isConnected) {
      setIsStarting(false);
      setWantsSettings(false);
    }
  }, [isConnected]);

  // Reset the loader state whenever we drop back to the welcome screen
  // (e.g. user ended the interview and is starting a new one).
  useEffect(() => {
    if (!isConnected && !isStarting && !wantsSettings) {
      setCoachHealth('pending');
      setCoachError(undefined);
    }
  }, [isConnected, isStarting, wantsSettings]);

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

  const view: 'welcome' | 'settings' | 'connecting' | 'connected' = isConnected
    ? 'connected'
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
            isPartial={isPartial}
            className="min-h-0 flex-[3] md:max-w-[420px] md:min-w-[280px] md:flex-[2]"
          />
        </motion.div>
      )}
    </AnimatePresence>
  );
}
