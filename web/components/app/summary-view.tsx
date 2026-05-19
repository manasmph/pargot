'use client';

import { CheckCircle2, Compass, Loader2, Sparkles, Target, TriangleAlert, X } from 'lucide-react';
import { SocratiqIcon } from '@/components/app/socratiq-logo';
import { Button } from '@/components/ui/button';
import type { SummaryHookState } from '@/hooks/use-interview-summary';
import type { InterviewSummary, SummaryFinding } from '@/lib/coach-types';
import { cn } from '@/lib/shadcn/utils';

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
 * Always offers a "Start new interview" CTA that returns to the welcome page.
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
        {state.status === 'ready' && <SummaryPanel summary={state.summary} />}
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
      <SocratiqIcon className="text-foreground h-16 w-auto animate-pulse" />
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

// ─── Full summary ────────────────────────────────────────────────────────

function SummaryPanel({ summary }: { summary: InterviewSummary }) {
  const stageRatio = summary.stages_total > 0 ? summary.stages_completed / summary.stages_total : 0;
  const stagePct = Math.round(stageRatio * 100);

  return (
    <div className="space-y-6">
      {/* ── Hero ────────────────────────────────────────────────── */}
      <header className="text-center">
        <p className="text-muted-foreground text-[11px] tracking-wide uppercase">
          Your interview summary
        </p>
        <h1 className="text-foreground mt-1 text-3xl font-bold tracking-tight sm:text-4xl">
          {summary.framework_used}
        </h1>
      </header>

      {/* ── Score card ──────────────────────────────────────────── */}
      <div className="border-border/60 bg-card/40 grid grid-cols-1 gap-4 rounded-2xl border p-5 sm:grid-cols-3 sm:gap-6 sm:p-6">
        <div className="flex flex-col items-center justify-center text-center">
          <div className="text-muted-foreground text-[10px] tracking-wider uppercase">Overall</div>
          <div className="text-foreground mt-1 text-5xl font-bold tracking-tight">
            {summary.overall_score}
            <span className="text-muted-foreground text-2xl font-medium">/10</span>
          </div>
        </div>
        <div className="flex flex-col items-center justify-center text-center">
          <div className="text-muted-foreground text-[10px] tracking-wider uppercase">
            Stages covered
          </div>
          <div className="text-foreground mt-1 text-5xl font-bold tracking-tight">
            {summary.stages_completed}
            <span className="text-muted-foreground text-2xl font-medium">
              /{summary.stages_total}
            </span>
          </div>
          <div className="text-muted-foreground mt-0.5 text-xs">{stagePct}% of framework</div>
        </div>
        <div className="sm:col-span-1">
          <div className="text-muted-foreground text-[10px] tracking-wider uppercase">
            Assessment
          </div>
          <p className="text-foreground mt-1 text-sm leading-snug">{summary.overall_assessment}</p>
        </div>
      </div>

      {/* ── Strengths ──────────────────────────────────────────── */}
      <FindingsSection
        title="Strengths"
        icon={CheckCircle2}
        accent="emerald"
        findings={summary.strengths}
      />

      {/* ── Improvements ───────────────────────────────────────── */}
      <FindingsSection
        title="What to improve"
        icon={Target}
        accent="amber"
        findings={summary.improvements}
      />

      {/* ── Next steps ─────────────────────────────────────────── */}
      <section className="border-border/60 bg-card/40 rounded-2xl border p-5 sm:p-6">
        <div className="flex items-center gap-2">
          <Compass className="text-primary h-5 w-5" strokeWidth={2.25} />
          <h2 className="text-foreground text-base font-semibold tracking-tight">Next steps</h2>
        </div>
        <ul className="mt-3 space-y-2">
          {summary.next_steps.map((step, i) => (
            <li
              key={i}
              className="text-foreground/90 flex items-start gap-2 text-sm leading-relaxed"
            >
              <Sparkles className="text-primary mt-0.5 h-3.5 w-3.5 shrink-0" strokeWidth={2.25} />
              <span>{step}</span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

// ─── Findings list (strengths / improvements) ───────────────────────────

interface FindingsSectionProps {
  title: string;
  icon: typeof CheckCircle2;
  accent: 'emerald' | 'amber';
  findings: SummaryFinding[];
}

function FindingsSection({ title, icon: Icon, accent, findings }: FindingsSectionProps) {
  const accentClasses = {
    emerald: {
      iconColor: 'text-emerald-500',
      bullet: 'bg-emerald-500',
    },
    amber: {
      iconColor: 'text-amber-500',
      bullet: 'bg-amber-500',
    },
  }[accent];

  return (
    <section className="border-border/60 bg-card/40 rounded-2xl border p-5 sm:p-6">
      <div className="flex items-center gap-2">
        <Icon className={cn('h-5 w-5', accentClasses.iconColor)} strokeWidth={2.25} />
        <h2 className="text-foreground text-base font-semibold tracking-tight">{title}</h2>
      </div>
      <ul className="mt-3 space-y-3">
        {findings.map((f, i) => (
          <li key={i} className="flex items-start gap-3">
            <span
              className={cn('mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full', accentClasses.bullet)}
            />
            <div className="min-w-0 flex-1">
              <p className="text-foreground text-sm font-semibold tracking-tight">{f.title}</p>
              <p className="text-muted-foreground mt-0.5 text-xs leading-relaxed sm:text-sm">
                {f.detail}
              </p>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
