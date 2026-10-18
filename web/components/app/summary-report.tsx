'use client';

import { CheckCircle2, Compass, Sparkles, Target } from 'lucide-react';
import type { InterviewSummary, SummaryFinding } from '@/lib/coach-types';
import { cn } from '@/lib/shadcn/utils';

interface SummaryReportProps {
  summary: InterviewSummary;
  /** Show the big "Your interview summary" hero. On for the end-of-interview
   *  view, off inside a history card that has its own header. */
  showHero?: boolean;
}

/**
 * Renders a full `InterviewSummary`: score card, assessment, strengths,
 * improvements, next steps. Shared by the end-of-interview SummaryView and
 * the History view so both stay visually identical.
 */
export function SummaryReport({ summary, showHero = true }: SummaryReportProps) {
  const stageRatio = summary.stages_total > 0 ? summary.stages_completed / summary.stages_total : 0;
  const stagePct = Math.round(stageRatio * 100);

  return (
    <div className="space-y-6">
      {showHero && (
        <header className="text-center">
          <p className="text-muted-foreground text-[11px] tracking-wide uppercase">
            Your interview summary
          </p>
          <h1 className="text-foreground mt-1 text-3xl font-bold tracking-tight sm:text-4xl">
            {summary.framework_used}
          </h1>
        </header>
      )}

      {/* Score card */}
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

      <FindingsSection
        title="Strengths"
        icon={CheckCircle2}
        accent="emerald"
        findings={summary.strengths}
      />

      <FindingsSection
        title="What to improve"
        icon={Target}
        accent="amber"
        findings={summary.improvements}
      />

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

interface FindingsSectionProps {
  title: string;
  icon: typeof CheckCircle2;
  accent: 'emerald' | 'amber';
  findings: SummaryFinding[];
}

function FindingsSection({ title, icon: Icon, accent, findings }: FindingsSectionProps) {
  const accentClasses = {
    emerald: { iconColor: 'text-emerald-500', bullet: 'bg-emerald-500' },
    amber: { iconColor: 'text-amber-500', bullet: 'bg-amber-500' },
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
