'use client';

import { memo } from 'react';
import type { CoachState } from '@/lib/coach-types';
import { StageRow } from './stage-row';

interface FrameworkStepperProps {
  stages: CoachState['stages'];
  /**
   * True while `/api/support` is in flight. Used by the current stage row to
   * render a small pulsing "thinking" dot so the user knows the coach is
   * recomputing in the background (Phase 2.2).
   */
  isPending?: boolean;
}

/**
 * Vertical stepper. Memoized with a deep-equality compare on `stages` so it
 * skips re-renders between coach polls when nothing visible changed
 * (Phase 2.1). Without this, every new `CoachState` reference from the hook
 * would re-mount every <StageRow> and re-trigger motion/react animations.
 */
function FrameworkStepperImpl({ stages, isPending = false }: FrameworkStepperProps) {
  return (
    <ol className="space-y-0">
      {stages.map((stage, i) => (
        <li key={stage.id} className="relative">
          <StageRow stage={stage} index={i} isPending={isPending} />
        </li>
      ))}
    </ol>
  );
}

/**
 * Two stepper renders are equal when every stage has the same id / status /
 * hint and every cue inside it has the same `done` flag. Skipping renders
 * when this holds means a poll that returns identical cue/stage state is
 * essentially free at the component layer.
 */
function arePropsEqual(prev: FrameworkStepperProps, next: FrameworkStepperProps): boolean {
  if (prev.isPending !== next.isPending) return false;
  if (prev.stages === next.stages) return true;
  if (prev.stages.length !== next.stages.length) return false;
  for (let i = 0; i < prev.stages.length; i++) {
    const a = prev.stages[i];
    const b = next.stages[i];
    if (
      a.id !== b.id ||
      a.status !== b.status ||
      a.hint !== b.hint ||
      a.cues.length !== b.cues.length
    ) {
      return false;
    }
    for (let j = 0; j < a.cues.length; j++) {
      if (a.cues[j].done !== b.cues[j].done) return false;
    }
  }
  return true;
}

export const FrameworkStepper = memo(FrameworkStepperImpl, arePropsEqual);
