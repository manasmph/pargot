'use client';

import { useMemo } from 'react';
import { TokenSource } from 'livekit-client';
import { useSession } from '@livekit/components-react';
import { WarningIcon } from '@phosphor-icons/react/dist/ssr';
import type { AppConfig } from '@/app-config';
import { AgentSessionProvider } from '@/components/agents-ui/agent-session-provider';
import { StartAudioButton } from '@/components/agents-ui/start-audio-button';
import { InterviewRoom } from '@/components/app/interview-room';
import {
  InterviewSettingsProvider,
  useInterviewSettings,
} from '@/components/app/interview-settings-context';
import { Toaster } from '@/components/ui/sonner';
import { useAgentErrors } from '@/hooks/useAgentErrors';
import { useDebugMode } from '@/hooks/useDebug';
import { getSandboxTokenSource } from '@/lib/utils';

const IN_DEVELOPMENT = process.env.NODE_ENV !== 'production';

function AppSetup() {
  useDebugMode({ enabled: IN_DEVELOPMENT });
  useAgentErrors();

  return null;
}

interface AppProps {
  appConfig: AppConfig;
}

/**
 * Outer App component — wraps in <InterviewSettingsProvider> so the
 * settings context is available to InterviewRoom (where the form lives)
 * AND to AppInner below (where the LiveKit TokenSource closure reads
 * from settings via the provider's `getSettings()` ref-getter).
 */
export function App({ appConfig }: AppProps) {
  return (
    <InterviewSettingsProvider>
      <AppInner appConfig={appConfig} />
    </InterviewSettingsProvider>
  );
}

function AppInner({ appConfig }: AppProps) {
  const { getSettings } = useInterviewSettings();

  const tokenSource = useMemo(() => {
    if (typeof process.env.NEXT_PUBLIC_CONN_DETAILS_ENDPOINT === 'string') {
      return getSandboxTokenSource(appConfig);
    }
    // Switch from `TokenSource.endpoint(url)` to `TokenSource.custom(fn)` so
    // we can POST a JSON body containing the user's pre-interview settings.
    // The SDK's endpoint primitive types `options` as Omit<RequestInit,'body'>
    // — body is explicitly forbidden — which is why we own the fetch here.
    //
    // `getSettings()` reads from a ref inside the provider, so the closure
    // always picks up the latest values without the TokenSource needing to
    // be re-created on every settings change.
    return TokenSource.custom(async () => {
      const settings = getSettings();
      const res = await fetch('/api/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ interview_settings: settings }),
      });
      if (!res.ok) {
        throw new Error(`Token endpoint returned ${res.status}`);
      }
      return res.json();
    });
  }, [appConfig, getSettings]);

  const session = useSession(
    tokenSource,
    appConfig.agentName ? { agentName: appConfig.agentName } : undefined
  );

  return (
    <AgentSessionProvider session={session}>
      <AppSetup />
      <main className="h-svh">
        <InterviewRoom appConfig={appConfig} />
      </main>
      <StartAudioButton label="Start Audio" />
      <Toaster
        icons={{
          warning: <WarningIcon weight="bold" />,
        }}
        position="top-center"
        className="toaster group"
        style={
          {
            '--normal-bg': 'var(--popover)',
            '--normal-text': 'var(--popover-foreground)',
            '--normal-border': 'var(--border)',
          } as React.CSSProperties
        }
      />
    </AgentSessionProvider>
  );
}
