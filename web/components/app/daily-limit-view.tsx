'use client';

import { CalendarClock } from 'lucide-react';
import { PargotIcon } from '@/components/app/pargot-logo';
import { Button } from '@/components/ui/button';

interface DailyLimitViewProps {
  limit: number;
  onBack: () => void;
}

/**
 * Shown when `/api/token` returns 429 — the user has used all their free
 * interviews for the day. Friendly, not punitive.
 */
export const DailyLimitView = ({
  limit,
  onBack,
  ref,
}: React.ComponentProps<'div'> & DailyLimitViewProps) => {
  return (
    <div
      ref={ref}
      className="bg-background flex min-h-svh w-full flex-col items-center justify-center px-4 py-6 text-center sm:p-8"
    >
      <PargotIcon className="text-muted-foreground/50 h-16 w-auto" />
      <CalendarClock className="text-primary mt-6 h-9 w-9" strokeWidth={1.75} />
      <h2 className="text-foreground mt-4 text-xl font-semibold tracking-tight sm:text-2xl">
        You&rsquo;re out of interviews for today
      </h2>
      <p className="text-muted-foreground mt-2 max-w-md text-sm">
        You&rsquo;ve used all {limit} of your free interviews today. Your quota resets at midnight
        UTC — come back tomorrow to keep practicing.
      </p>
      <Button
        size="lg"
        variant="outline"
        onClick={onBack}
        className="mt-8 w-full max-w-[16rem] rounded-full font-mono text-xs font-bold tracking-wider uppercase"
      >
        Back
      </Button>
    </div>
  );
};
