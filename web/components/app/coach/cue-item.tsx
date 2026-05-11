'use client';

import { CheckCircle2, Circle } from 'lucide-react';
import { cn } from '@/lib/shadcn/utils';

interface CueItemProps {
  text: string;
  done: boolean;
}

/**
 * Single cue under a stage. Renders as a checkbox + text.
 * `done=true` → green check + slight strikethrough.
 * `done=false` → muted empty circle.
 */
export function CueItem({ text, done }: CueItemProps) {
  return (
    <li
      className={cn(
        'flex items-start gap-2 text-sm leading-snug transition-colors',
        done ? 'text-foreground/60' : 'text-foreground/90'
      )}
    >
      {done ? (
        <CheckCircle2
          className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500"
          strokeWidth={2.25}
          aria-label="Done"
        />
      ) : (
        <Circle
          className="text-muted-foreground/50 mt-0.5 h-4 w-4 shrink-0"
          strokeWidth={2}
          aria-label="Not yet"
        />
      )}
      <span className={cn(done && 'decoration-foreground/30 line-through')}>{text}</span>
    </li>
  );
}
