'use client';

import { Loader2, TriangleAlert, X } from 'lucide-react';
import { PargotIcon } from '@/components/app/pargot-logo';
import { SummaryReport } from '@/components/app/summary-report';
import { Button } from '@/components/ui/button';
import type { SummaryHookState } from '@/hooks/use-interview-summary';

interface SummaryViewProps {
  state: SummaryHookState;
  onStartNew: () => void;
}

/**
 * Post-interview summary screen. Rendered when the LiveKit session ends
 * (user disconnect or 30-min auto-disconnect). Shows one of four states:
 *
 *  - 'loading'  — spinner while /api/summary processes (3-5s)
 *  - 'ready'    — full structured summary (score + assessment + lists)
 *  - 'skipped'  — friendly note when session was too short for a summary
 *  - 'error'    — soft failure, with a retry hint
 *
 * The 'ready' state delegates to <SummaryReport>, shared with the History
 * view so both stay visually identical. Always offers a "Start new interview"
 * CTA that returns to the welcome page.
 */
export const SummaryView = ({
  state,
  onStartNew,
  ref,
}: React.ComponentProps<'div'> & SummaryViewProps) => {
  return (
    <div ref={ref} className="bg-background min-h-svh w-full overflow-y-auto">
      <div className="mx-auto w-full max-w-3xl px-4 pt-20 pb-12 sm:px-6 sm:pt-24 md:pt-28">
        {state.status === 'loading' && <LoadingPanel />}
        {state.status === 'ready' && <SummaryReport summary={state.summary} />}
        {state.status === 'skipped' && <SkippedPanel reason={state.reason} />}
        {state.status === 'error' && <ErrorPanel warning={state.warning} />}
        {state.status === 'idle' && <LoadingPanel />}

        <div className="mt-10 flex flex-col items-center">
          <Button
            size="lg"
            onClick={onStartNew}
            className="w-full max-w-[18rem] rounded-full font-mono text-xs font-bold tracking-wider uppercase"
          >
            Start new interview
          </Button>
        </div>
      </div>
    </div>
  );
};

// ─── Loading ─────────────────────────────────────────────────────────────

function LoadingPanel() {
  return (
    <div className="flex flex-col items-center gap-3 py-8 text-center">
      <PargotIcon className="text-foreground h-16 w-auto animate-pulse" />
      <h2 className="text-foreground mt-4 text-xl font-semibold tracking-tight sm:text-2xl">
        Analyzing your interview…
      </h2>
      <div className="text-muted-foreground inline-flex items-center gap-2 text-sm">
        <Loader2 className="h-4 w-4 animate-spin" />
        This usually takes a few seconds.
      </div>
    </div>
  );
}

// ─── Skipped (short session) ─────────────────────────────────────────────

function SkippedPanel({ reason }: { reason: string }) {
  return (
    <div className="flex flex-col items-center gap-3 py-8 text-center">
      <X className="text-muted-foreground/60 h-10 w-10" strokeWidth={1.5} />
      <h2 className="text-foreground text-xl font-semibold tracking-tight sm:text-2xl">
        Interview ended
      </h2>
      <p className="text-muted-foreground max-w-md text-sm">{reason}</p>
    </div>
  );
}

// ─── Error ───────────────────────────────────────────────────────────────

function ErrorPanel({ warning }: { warning: string }) {
  return (
    <div className="flex flex-col items-center gap-3 py-8 text-center">
      <TriangleAlert className="h-10 w-10 text-amber-400" strokeWidth={1.75} />
      <h2 className="text-foreground text-xl font-semibold tracking-tight sm:text-2xl">
        Couldn&rsquo;t generate summary
      </h2>
      <p className="text-muted-foreground max-w-md text-sm">{warning}</p>
      <p className="text-muted-foreground/80 mt-2 max-w-md text-xs">
        Your interview wasn&rsquo;t saved. Try starting a new one.
      </p>
    </div>
  );
}
