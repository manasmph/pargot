'use client';

import { ArrowRight, CheckCircle2, Circle, Lightbulb } from 'lucide-react';
import * as Collapsible from '@radix-ui/react-collapsible';
import type { CoachState } from '@/lib/coach-types';
import { cn } from '@/lib/shadcn/utils';
import { CueItem } from './cue-item';

type Stage = CoachState['stages'][number];

interface StageRowProps {
  stage: Stage;
  index: number;
}

/**
 * Single stage row in the framework stepper. Uses Radix Collapsible so
 * `current` stages are open and `complete` / `pending` stages are collapsed
 * but still keyboard-accessible.
 */
export function StageRow({ stage, index }: StageRowProps) {
  const open = stage.status === 'current';

  const StatusIcon =
    stage.status === 'complete' ? CheckCircle2 : stage.status === 'current' ? ArrowRight : Circle;

  const iconColor =
    stage.status === 'complete'
      ? 'text-emerald-500'
      : stage.status === 'current'
        ? 'text-primary'
        : 'text-muted-foreground/40';

  const labelColor =
    stage.status === 'complete'
      ? 'text-foreground/60'
      : stage.status === 'current'
        ? 'text-foreground'
        : 'text-foreground/50';

  return (
    <Collapsible.Root open={open} className="relative">
      {/* Vertical connector line on the left, lit when stage is complete or current */}
      <span
        aria-hidden
        className={cn(
          'absolute top-7 left-[11px] h-[calc(100%-1.75rem)] w-px transition-colors',
          stage.status === 'complete'
            ? 'bg-emerald-500/40'
            : stage.status === 'current'
              ? 'bg-primary/40'
              : 'bg-border'
        )}
      />

      <Collapsible.Trigger asChild>
        <button
          type="button"
          disabled={open}
          aria-disabled={open}
          className={cn(
            'flex w-full items-center gap-2 rounded-md px-1 py-1.5 text-left transition-colors',
            !open && 'hover:bg-muted/40 cursor-default'
          )}
        >
          <StatusIcon
            className={cn('h-6 w-6 shrink-0', iconColor)}
            strokeWidth={stage.status === 'current' ? 2.5 : 2}
          />
          <span
            className={cn(
              'flex-1 text-sm font-medium tracking-tight',
              labelColor,
              stage.status === 'current' && 'font-semibold'
            )}
          >
            <span className="text-muted-foreground mr-1.5 font-mono text-[10px]">
              {String(index + 1).padStart(2, '0')}
            </span>
            {stage.name}
          </span>
        </button>
      </Collapsible.Trigger>

      <Collapsible.Content className="overflow-hidden data-[state=closed]:animate-none">
        <div className="ml-8 space-y-2 pt-1 pb-3">
          {stage.description && (
            <p className="text-muted-foreground text-xs leading-snug italic">{stage.description}</p>
          )}

          <ul className="space-y-1">
            {stage.cues.map((cue) => (
              <CueItem key={cue.id} text={cue.text} done={cue.done} />
            ))}
          </ul>

          {stage.hint && (
            <div className="border-primary/30 bg-primary/5 mt-2 flex items-start gap-2 rounded-md border px-2.5 py-1.5">
              <Lightbulb className="text-primary mt-0.5 h-3.5 w-3.5 shrink-0" strokeWidth={2.5} />
              <p className="text-foreground/90 text-xs leading-snug">{stage.hint}</p>
            </div>
          )}
        </div>
      </Collapsible.Content>
    </Collapsible.Root>
  );
}
