'use client';

import type { CoachState } from '@/lib/coach-types';
import { StageRow } from './stage-row';

interface FrameworkStepperProps {
  stages: CoachState['stages'];
}

/**
 * Vertical stepper that renders a sequence of `StageRow`s.
 * Header / framework metadata is rendered by the parent panel.
 */
export function FrameworkStepper({ stages }: FrameworkStepperProps) {
  return (
    <ol className="space-y-0">
      {stages.map((stage, i) => (
        <li key={stage.id} className="relative">
          <StageRow stage={stage} index={i} />
        </li>
      ))}
    </ol>
  );
}
