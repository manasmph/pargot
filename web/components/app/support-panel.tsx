'use client';

import { Hourglass, OctagonAlert, Sparkles, TriangleAlert } from 'lucide-react';
import { FeedbackList } from '@/components/app/coach/feedback-list';
import { FrameworkStepper } from '@/components/app/coach/framework-stepper';
import type { CoachErrorCode, CoachState } from '@/lib/coach-types';
import { cn } from '@/lib/shadcn/utils';

interface SupportPanelProps {
  state: CoachState | null;
  isLoading: boolean;
  error?: string | null;
  errorCode?: CoachErrorCode | null;
  /**
   * True when the current `state` was hydrated from a schema-fail salvage
   * on the server. We render a small "tentative" indicator so the user
   * knows the framework is a best-effort guess (Phase 2.3).
   */
  isPartial?: boolean;
  className?: string;
}

/**
 * Right-rail Interview Coach panel.
 *
 *  - Empty state: shown until the first agent question lands.
 *  - Loaded state: framework header + stepper + per-turn feedback chips.
 *  - Error state: prominent banner at the top of the body. Prior stepper
 *    (if any) stays visible underneath so the user keeps their context.
 *  - Tentative state: yellow badge in the header reading "Tentative" plus
 *    a soft yellow border around the framework name, signalling that the
 *    panel will refine itself on the next turn.
 */
export function SupportPanel({
  state,
  isLoading,
  error,
  errorCode,
  isPartial = false,
  className,
}: SupportPanelProps) {
  const hasState = state !== null;
  const hasError = !!error;

  return (
    <aside
      className={cn(
        // Border sits on top when the panel is stacked below the agent view
        // on mobile, and on the left when it's the right column on desktop.
        'bg-background/95 border-border flex h-full flex-col overflow-hidden border-t md:border-t-0 md:border-l',
        className
      )}
    >
      {/* ── Header ─────────────────────────────────────────────────────── */}
      <div className="border-border flex items-center gap-2 border-b px-4 py-3">
        <div
          className={cn(
            'h-2 w-2 rounded-full transition-colors',
            errorCode === 'rate_limited' || errorCode === 'service_unavailable'
              ? 'animate-pulse bg-amber-500'
              : hasError
                ? 'bg-red-500'
                : isLoading
                  ? 'animate-pulse bg-emerald-500'
                  : hasState
                    ? 'bg-emerald-500'
                    : 'bg-muted-foreground/30'
          )}
        />
        <span className="text-foreground text-sm font-semibold">Interview Coach</span>
        {isPartial && hasState && (
          <span className="ml-1.5 inline-flex items-center rounded-full border border-amber-500/40 bg-amber-500/10 px-1.5 py-px text-[9px] font-semibold tracking-wide text-amber-400 uppercase">
            Tentative
          </span>
        )}
        {hasState && (
          <span className="text-muted-foreground ml-auto text-[11px] tracking-wide uppercase">
            {state.framework.name}
          </span>
        )}
      </div>

      {/* ── Body ──────────────────────────────────────────────────────── */}
      <div className="scrollbar-thin flex-1 overflow-y-auto px-4 py-4">
        {/* Error banner — shown above any prior content so the user knows */}
        {hasError && <ErrorBanner code={errorCode ?? 'unknown'} message={error!} />}

        {!hasState && !isLoading && !hasError && (
          <div className="text-muted-foreground mt-12 flex flex-col items-center gap-2 px-6 text-center">
            <Sparkles className="text-muted-foreground/60 h-6 w-6" strokeWidth={1.75} />
            <p className="text-sm">Cues will appear here once the interviewer asks a question.</p>
          </div>
        )}

        {!hasState && isLoading && !hasError && (
          <div className="text-muted-foreground mt-12 flex flex-col items-center gap-2 px-6 text-center">
            <div className="h-2 w-2 animate-pulse rounded-full bg-emerald-500" />
            <p className="text-sm">Identifying framework…</p>
          </div>
        )}

        {hasState && (
          <div className={cn('space-y-4', hasError && 'mt-3')}>
            <div
              className={cn(
                isPartial && 'rounded-md border border-amber-500/30 bg-amber-500/5 px-3 py-2'
              )}
            >
              <p className="text-muted-foreground text-[11px] tracking-wide uppercase">
                {state.framework.questionType}
              </p>
              <h3 className="text-foreground mt-0.5 text-base font-semibold tracking-tight">
                {state.framework.name}
              </h3>
              {isPartial && (
                <p className="text-muted-foreground mt-1 text-[11px] leading-snug">
                  Framework picked from a partial response. Cues will tick in on the next turn.
                </p>
              )}
            </div>

            <FrameworkStepper stages={state.stages} isPending={isLoading} />

            {state.feedback.length > 0 && (
              <div className="border-border/60 space-y-2 border-t pt-3">
                <p className="text-muted-foreground text-[11px] font-medium tracking-wide uppercase">
                  Feedback on your last answer
                </p>
                <FeedbackList items={state.feedback} />
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Footer hint ──────────────────────────────────────────────── */}
      <div className="border-border border-t px-4 py-2">
        <p className="text-muted-foreground text-xs">Updates after each interviewer turn.</p>
      </div>
    </aside>
  );
}

// ─────────────────────────────────────────────────────────────────────────

const ERROR_VARIANTS: Record<
  CoachErrorCode,
  {
    title: string;
    icon: typeof TriangleAlert;
    container: string;
    iconClass: string;
  }
> = {
  rate_limited: {
    title: 'Coach rate-limited — recovering',
    icon: Hourglass,
    container: 'border-amber-500/30 bg-amber-500/10',
    iconClass: 'text-amber-400',
  },
  service_unavailable: {
    title: 'Coach busy — recovering',
    icon: Hourglass,
    container: 'border-amber-500/30 bg-amber-500/10',
    iconClass: 'text-amber-400',
  },
  config: {
    title: 'Coach misconfigured',
    icon: OctagonAlert,
    container: 'border-red-500/30 bg-red-500/10',
    iconClass: 'text-red-400',
  },
  invalid_input: {
    title: 'Coach received bad input',
    icon: TriangleAlert,
    container: 'border-red-500/30 bg-red-500/10',
    iconClass: 'text-red-400',
  },
  schema: {
    title: 'Coach output failed validation',
    icon: TriangleAlert,
    container: 'border-amber-500/30 bg-amber-500/10',
    iconClass: 'text-amber-400',
  },
  unknown: {
    title: 'Coach error',
    icon: TriangleAlert,
    container: 'border-amber-500/30 bg-amber-500/10',
    iconClass: 'text-amber-400',
  },
};

function ErrorBanner({ code, message }: { code: CoachErrorCode; message: string }) {
  const variant = ERROR_VARIANTS[code];
  const Icon = variant.icon;
  return (
    <div
      role="status"
      aria-live="polite"
      className={cn('flex items-start gap-2 rounded-md border px-3 py-2', variant.container)}
    >
      <Icon className={cn('mt-0.5 h-4 w-4 shrink-0', variant.iconClass)} strokeWidth={2.25} />
      <div className="min-w-0 flex-1">
        <p className="text-foreground text-xs font-semibold">{variant.title}</p>
        <p className="text-foreground/80 mt-0.5 text-xs leading-snug">{message}</p>
      </div>
    </div>
  );
}
