'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, ChevronDown, Loader2, Sparkles } from 'lucide-react';
import { SummaryReport } from '@/components/app/summary-report';
import { Button } from '@/components/ui/button';
import type { InterviewSummary } from '@/lib/coach-types';
import { cn } from '@/lib/shadcn/utils';

/** Row shape as serialized by /api/interviews (createdAt is an ISO string). */
interface InterviewRecord {
  id: string;
  createdAt: string;
  frameworkName: string | null;
  questionType: string | null;
  overallScore: number | null;
  stagesCompleted: number | null;
  stagesTotal: number | null;
  durationSec: number | null;
  summary: InterviewSummary;
}

type FetchState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; rows: InterviewRecord[] };

export function HistoryView() {
  const [state, setState] = useState<FetchState>({ status: 'loading' });

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch('/api/interviews');
        if (res.status === 401) {
          if (!cancelled) setState({ status: 'error', message: 'Please sign in to view history.' });
          return;
        }
        const data = (await res.json()) as { ok: boolean; interviews?: InterviewRecord[] };
        if (!cancelled) {
          if (data.ok && data.interviews) setState({ status: 'ready', rows: data.interviews });
          else setState({ status: 'error', message: 'Could not load your history.' });
        }
      } catch (err) {
        if (!cancelled) setState({ status: 'error', message: (err as Error).message });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="bg-background min-h-svh w-full overflow-y-auto">
      <div className="mx-auto w-full max-w-3xl px-4 pt-20 pb-16 sm:px-6 sm:pt-24 md:pt-28">
        <div className="mb-6 flex items-center justify-between">
          <h1 className="text-foreground text-2xl font-bold tracking-tight sm:text-3xl">
            Interview history
          </h1>
          <Button asChild variant="outline" size="sm" className="gap-1.5 rounded-full">
            <Link href="/">
              <ArrowLeft className="h-4 w-4" />
              Back
            </Link>
          </Button>
        </div>

        {state.status === 'loading' && (
          <div className="text-muted-foreground flex items-center justify-center gap-2 py-16 text-sm">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading your interviews…
          </div>
        )}

        {state.status === 'error' && (
          <p className="text-muted-foreground py-16 text-center text-sm">{state.message}</p>
        )}

        {state.status === 'ready' && state.rows.length === 0 && (
          <div className="text-muted-foreground flex flex-col items-center gap-3 py-16 text-center">
            <Sparkles className="text-muted-foreground/50 h-8 w-8" strokeWidth={1.5} />
            <p className="text-sm">No interviews yet. Finish one and it&rsquo;ll show up here.</p>
            <Button asChild size="sm" className="mt-2 rounded-full">
              <Link href="/">Start your first interview</Link>
            </Button>
          </div>
        )}

        {state.status === 'ready' && state.rows.length > 0 && (
          <ul className="space-y-3">
            {state.rows.map((row) => (
              <HistoryCard key={row.id} row={row} />
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function HistoryCard({ row }: { row: InterviewRecord }) {
  const [open, setOpen] = useState(false);
  const date = new Date(row.createdAt).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });

  return (
    <li className="border-border/60 bg-card/40 overflow-hidden rounded-2xl border">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="hover:bg-muted/30 flex w-full items-center gap-4 px-5 py-4 text-left transition-colors"
      >
        <div className="flex flex-col items-center">
          <span className="text-foreground text-2xl font-bold tracking-tight">
            {row.overallScore ?? '–'}
          </span>
          <span className="text-muted-foreground text-[10px]">/ 10</span>
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-foreground truncate text-sm font-semibold">
            {row.frameworkName ?? row.summary.framework_used}
          </p>
          <p className="text-muted-foreground text-xs">
            {date}
            {row.questionType ? ` · ${row.questionType}` : ''}
          </p>
        </div>
        <ChevronDown
          className={cn(
            'text-muted-foreground h-5 w-5 shrink-0 transition-transform',
            open && 'rotate-180'
          )}
        />
      </button>

      {open && (
        <div className="border-border/60 border-t px-5 py-5">
          <SummaryReport summary={row.summary} showHero={false} />
        </div>
      )}
    </li>
  );
}
