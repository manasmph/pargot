'use client';

import { Check, Loader2, TriangleAlert } from 'lucide-react';
import { SocratiqIcon } from '@/components/app/socratiq-logo';
import { cn } from '@/lib/shadcn/utils';

export type StepStatus = 'pending' | 'ok' | 'error';

interface ConnectingViewProps {
  coachHealth: StepStatus;
  coachError?: string;
}

/**
 * Loader shown between "Start interview" click and the room becoming
 * ready. Visualises two parallel tracks:
 *   1. LiveKit room — always shown as pending until `isConnected` flips
 *      and the parent transitions us out of this view.
 *   2. Coach models — pre-flight probe of `/api/support` (GET). Surfaces
 *      a soft warning if the coach is unhealthy without blocking the
 *      interview from starting.
 */
export const ConnectingView = ({
  coachHealth,
  coachError,
  ref,
}: React.ComponentProps<'div'> & ConnectingViewProps) => {
  return (
    <div
      ref={ref}
      className="bg-background flex min-h-svh w-full flex-col items-center justify-center px-4 py-6 sm:p-8"
    >
      <div className="flex flex-col items-center">
        <SocratiqIcon className="text-foreground h-20 w-auto animate-pulse sm:h-24" />
        <h2 className="text-foreground mt-6 text-xl font-semibold tracking-tight sm:mt-8 sm:text-2xl">
          Starting your interview…
        </h2>
        <p className="text-muted-foreground mt-2 text-xs sm:text-sm">
          This usually takes a couple of seconds.
        </p>
      </div>

      <div className="mt-8 w-full max-w-sm space-y-2 sm:mt-10">
        <StatusRow label="Joining interview room" status="pending" />
        <StatusRow
          label="Verifying coach models"
          status={coachHealth}
          subtitle={coachHealth === 'error' ? coachError : undefined}
        />
      </div>

      {coachHealth === 'error' && (
        <p className="text-muted-foreground mt-5 max-w-sm px-2 text-center text-xs sm:mt-6">
          The coach side-panel may be limited, but your interview will still proceed.
        </p>
      )}
    </div>
  );
};

interface StatusRowProps {
  label: string;
  status: StepStatus;
  subtitle?: string;
}

function StatusRow({ label, status, subtitle }: StatusRowProps) {
  return (
    <div
      className={cn(
        'border-border/60 flex items-start gap-3 rounded-lg border px-4 py-3 transition-colors',
        status === 'ok' && 'bg-emerald-500/5',
        status === 'error' && 'bg-amber-500/5'
      )}
    >
      <div className="mt-0.5 h-5 w-5 shrink-0">
        {status === 'pending' && <Loader2 className="text-muted-foreground h-5 w-5 animate-spin" />}
        {status === 'ok' && <Check className="h-5 w-5 text-emerald-500" strokeWidth={2.5} />}
        {status === 'error' && (
          <TriangleAlert className="h-5 w-5 text-amber-500" strokeWidth={2.25} />
        )}
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-foreground text-sm font-medium">{label}</p>
        {subtitle && <p className="text-muted-foreground mt-0.5 text-xs">{subtitle}</p>}
      </div>
    </div>
  );
}
