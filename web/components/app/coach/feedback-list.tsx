'use client';

import { CheckCircle2, Info, TriangleAlert } from 'lucide-react';
import type { CoachState } from '@/lib/coach-types';
import { cn } from '@/lib/shadcn/utils';

type FeedbackItem = CoachState['feedback'][number];

interface FeedbackListProps {
  items: FeedbackItem[];
}

const TONE_STYLES: Record<
  FeedbackItem['tone'],
  { container: string; icon: typeof CheckCircle2; iconClass: string; label: string }
> = {
  positive: {
    container: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200',
    icon: CheckCircle2,
    iconClass: 'text-emerald-400',
    label: 'Strong',
  },
  warning: {
    container: 'border-amber-500/30 bg-amber-500/10 text-amber-200',
    icon: TriangleAlert,
    iconClass: 'text-amber-400',
    label: 'Watch',
  },
  info: {
    container: 'border-sky-500/30 bg-sky-500/10 text-sky-200',
    icon: Info,
    iconClass: 'text-sky-400',
    label: 'Tip',
  },
};

/**
 * Per-turn feedback chips. Up to 3 items, latest only. Tone determines
 * colour and icon.
 */
export function FeedbackList({ items }: FeedbackListProps) {
  if (items.length === 0) return null;

  return (
    <ul className="space-y-1.5">
      {items.map((item, i) => {
        const styles = TONE_STYLES[item.tone];
        const Icon = styles.icon;
        return (
          <li
            key={i}
            className={cn(
              'flex items-start gap-2 rounded-md border px-2.5 py-1.5 text-xs leading-snug',
              styles.container
            )}
          >
            <Icon className={cn('mt-0.5 h-3.5 w-3.5 shrink-0', styles.iconClass)} />
            <span className="text-foreground/90">{item.text}</span>
          </li>
        );
      })}
    </ul>
  );
}
