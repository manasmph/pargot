'use client';

import { BookOpen, Compass, Mic, Sparkles, Target, Zap } from 'lucide-react';
import { PargotIcon } from '@/components/app/pargot-logo';
import { Button } from '@/components/ui/button';
import { AUTH_ENABLED } from '@/lib/auth-config';
import { cn } from '@/lib/shadcn/utils';

interface WelcomeViewProps {
  startButtonText: string;
  onStartCall: () => void;
}

interface Feature {
  icon: typeof Mic;
  title: string;
  description: string;
}

const FEATURES: Feature[] = [
  {
    icon: Mic,
    title: 'Live voice interviewer',
    description:
      'Talk naturally to Alex — an AI PM interviewer who probes, clarifies, and reacts in real time.',
  },
  {
    icon: Compass,
    title: '9 PM frameworks, tracked live',
    description:
      'CIRCLES, STAR, AARRR, HEART, RICE and more. See your stage progress fill in as you answer.',
  },
  {
    icon: Sparkles,
    title: 'Real-time coaching cues',
    description:
      'A side panel ticks off cues you cover and nudges you toward the ones you missed — no pausing the interview.',
  },
  {
    icon: Target,
    title: 'Six question types',
    description:
      'Product design, improvement, estimation, root cause, behavioral, and strategy — picked at random.',
  },
  {
    icon: BookOpen,
    title: 'Per-turn feedback',
    description:
      'After each answer, the coach flags what worked, what to drop, and what to try next.',
  },
  {
    icon: Zap,
    title: AUTH_ENABLED ? 'Track your progress' : 'No setup',
    description: AUTH_ENABLED
      ? 'Sign in with Google to save every interview and revisit your scores and feedback over time.'
      : 'No accounts, no question banks, no fees. Mic in, feedback out.',
  },
];

export const WelcomeView = ({
  startButtonText,
  onStartCall,
  ref,
}: React.ComponentProps<'div'> & WelcomeViewProps) => {
  return (
    <div ref={ref} className="bg-background min-h-svh w-full overflow-y-auto">
      {/* ── Hero ─────────────────────────────────────────────────────────── */}
      <section className="relative mx-auto flex max-w-3xl flex-col items-center px-4 pt-16 pb-10 text-center sm:px-6 sm:pt-24 md:pt-32 md:pb-12">
        <PargotIcon className="text-foreground h-20 w-auto sm:h-24 md:h-28" />

        <h1 className="text-foreground mt-5 text-4xl font-bold tracking-tight sm:text-5xl md:mt-6 md:text-6xl">
          Pargot.ai
        </h1>

        <p className="text-muted-foreground mt-3 max-w-xl text-sm leading-relaxed sm:text-base md:mt-4 md:text-lg">
          Master the PM interview with a live voice interviewer and a real-time coach that tracks
          your framework, ticks off cues, and gives feedback after every answer.
        </p>

        <Button
          size="lg"
          onClick={onStartCall}
          className="mt-6 w-full max-w-[16rem] rounded-full font-mono text-xs font-bold tracking-wider uppercase md:mt-8"
        >
          {startButtonText}
        </Button>

        <p className="text-muted-foreground mt-3 text-xs">
          {AUTH_ENABLED
            ? '~30-minute mock interview · Google sign-in · free daily quota'
            : '~30-minute mock interview · No signup required'}
        </p>
      </section>

      {/* ── Features grid ────────────────────────────────────────────────── */}
      <section className="mx-auto w-full max-w-5xl px-4 pb-16 sm:px-6 md:pb-20">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4 lg:grid-cols-3">
          {FEATURES.map((feature) => (
            <FeatureCard key={feature.title} feature={feature} />
          ))}
        </div>
      </section>

      {/* ── Footer ──────────────────────────────────────────────────────── */}
      <footer className="mx-auto max-w-3xl px-4 pb-10 text-center sm:px-6 md:pb-12">
        <p className="text-muted-foreground text-xs">
          Built for product managers, by product managers.
        </p>
      </footer>
    </div>
  );
};

function FeatureCard({ feature }: { feature: Feature }) {
  const Icon = feature.icon;
  return (
    <div
      className={cn(
        'bg-card/40 border-border/60 group flex flex-col gap-2 rounded-xl border p-5 transition-colors',
        'hover:bg-card/60 hover:border-border'
      )}
    >
      <div className="bg-primary/10 text-primary mb-1 flex h-9 w-9 items-center justify-center rounded-lg">
        <Icon className="h-4.5 w-4.5" strokeWidth={2} />
      </div>
      <h3 className="text-foreground text-sm font-semibold tracking-tight">{feature.title}</h3>
      <p className="text-muted-foreground text-xs leading-relaxed">{feature.description}</p>
    </div>
  );
}
