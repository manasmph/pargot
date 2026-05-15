'use client';

import { useMemo, useState } from 'react';
import { ArrowLeft, ArrowRight, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DEFAULT_INTERVIEW_SETTINGS,
  type InterviewSettings,
  QUESTION_TYPE_IDS,
  QUESTION_TYPE_LABELS,
  type QuestionTypeId,
  SENIORITY_DESCRIPTIONS,
  SENIORITY_IDS,
  SENIORITY_LABELS,
  type SeniorityId,
  isDefaultSettings,
} from '@/lib/interview-settings';
import { cn } from '@/lib/shadcn/utils';

interface SettingsViewProps {
  /**
   * Initial values for the form. Defaults to `DEFAULT_INTERVIEW_SETTINGS`.
   * Named `initialSettings` (not `initial`) to avoid collision with
   * `motion.create()`'s built-in `initial` animation prop.
   */
  initialSettings?: InterviewSettings;
  /** Called when the user clicks "Start interview". */
  onConfirm: (settings: InterviewSettings) => void;
  /** Called when the user clicks the back link. */
  onBack: () => void;
}

/**
 * Pre-interview settings page. Single screen, defaults pre-filled.
 *
 *  - Seniority is a 4-option radio group (one row of 2 on mobile, 2×2 on
 *    larger screens).
 *  - Question types are checkboxes; at least one must be ticked.
 *  - "Reset to defaults" link only appears when the form diverges from
 *    DEFAULT_INTERVIEW_SETTINGS.
 *  - Primary CTA disables (with tooltip) when no question types selected.
 *
 * Accessibility:
 *  - Each radio/checkbox is wrapped in a `<label>` so the entire row is
 *    clickable and screen readers announce the label text.
 *  - Tab order flows top-to-bottom by visual position.
 *  - Enter on the focused button submits.
 */
export const SettingsView = ({
  initialSettings = DEFAULT_INTERVIEW_SETTINGS,
  onConfirm,
  onBack,
  ref,
}: React.ComponentProps<'div'> & SettingsViewProps) => {
  const [seniority, setSeniority] = useState<SeniorityId>(initialSettings.seniority);
  const [questionTypes, setQuestionTypes] = useState<Set<QuestionTypeId>>(
    () => new Set(initialSettings.question_types)
  );

  const current = useMemo<InterviewSettings>(
    () => ({ seniority, question_types: Array.from(questionTypes) }),
    [seniority, questionTypes]
  );

  const isDefault = isDefaultSettings(current);
  const hasNoTypes = questionTypes.size === 0;

  function toggleType(id: QuestionTypeId) {
    setQuestionTypes((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function reset() {
    setSeniority(DEFAULT_INTERVIEW_SETTINGS.seniority);
    setQuestionTypes(new Set(DEFAULT_INTERVIEW_SETTINGS.question_types));
  }

  function handleSubmit() {
    if (hasNoTypes) return;
    onConfirm(current);
  }

  return (
    <div ref={ref} className="bg-background min-h-svh w-full overflow-y-auto">
      {/* ── Back link ──────────────────────────────────────────────── */}
      <div className="mx-auto w-full max-w-2xl px-4 pt-20 sm:px-6 sm:pt-24 md:pt-28">
        <button
          type="button"
          onClick={onBack}
          className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1.5 text-xs font-medium transition-colors"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Back
        </button>
      </div>

      {/* ── Hero ──────────────────────────────────────────────────── */}
      <section className="mx-auto w-full max-w-2xl px-4 pt-4 pb-6 text-center sm:px-6 sm:pt-6 sm:pb-8">
        <h1 className="text-foreground text-2xl font-bold tracking-tight sm:text-3xl">
          Configure your interview
        </h1>
        <p className="text-muted-foreground mt-2 text-sm sm:text-base">
          Defaults are pre-filled. Adjust if you want, or just hit start.
        </p>
      </section>

      {/* ── Form ──────────────────────────────────────────────────── */}
      <section className="mx-auto w-full max-w-2xl px-4 pb-8 sm:px-6">
        <SeniorityFieldset value={seniority} onChange={setSeniority} />
        <div className="h-4" />
        <QuestionTypesFieldset selected={questionTypes} onToggle={toggleType} />
      </section>

      {/* ── CTAs ──────────────────────────────────────────────────── */}
      <section className="mx-auto flex w-full max-w-2xl flex-col items-center gap-3 px-4 pb-12 sm:px-6">
        <Button
          size="lg"
          onClick={handleSubmit}
          disabled={hasNoTypes}
          title={hasNoTypes ? 'Pick at least one question type' : undefined}
          className="w-full max-w-[18rem] rounded-full font-mono text-xs font-bold tracking-wider uppercase"
        >
          Start interview
          <ArrowRight className="ml-1 h-4 w-4" />
        </Button>

        {!isDefault && (
          <button
            type="button"
            onClick={reset}
            className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1.5 text-xs font-medium transition-colors"
          >
            <RotateCcw className="h-3 w-3" />
            Reset to defaults
          </button>
        )}
      </section>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────

interface SeniorityFieldsetProps {
  value: SeniorityId;
  onChange: (value: SeniorityId) => void;
}

function SeniorityFieldset({ value, onChange }: SeniorityFieldsetProps) {
  return (
    <fieldset className="border-border/60 bg-card/40 rounded-xl border p-4 sm:p-5">
      <legend className="text-foreground px-2 text-sm font-semibold tracking-tight">
        Seniority level
      </legend>
      <p className="text-muted-foreground -mt-0.5 mb-3 text-xs">
        IC roles only. Calibrates question depth and feedback strictness.
      </p>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {SENIORITY_IDS.map((id) => (
          <SeniorityOption key={id} id={id} checked={value === id} onSelect={() => onChange(id)} />
        ))}
      </div>
    </fieldset>
  );
}

interface SeniorityOptionProps {
  id: SeniorityId;
  checked: boolean;
  onSelect: () => void;
}

function SeniorityOption({ id, checked, onSelect }: SeniorityOptionProps) {
  return (
    <label
      className={cn(
        'group flex cursor-pointer items-start gap-3 rounded-lg border px-3 py-2.5 transition-colors',
        checked
          ? 'border-primary/60 bg-primary/5'
          : 'border-border/60 hover:border-border hover:bg-muted/40'
      )}
    >
      <input
        type="radio"
        name="seniority"
        value={id}
        checked={checked}
        onChange={onSelect}
        className="sr-only"
      />
      <span
        aria-hidden
        className={cn(
          'mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border-2 transition-colors',
          checked ? 'border-primary' : 'border-muted-foreground/40'
        )}
      >
        {checked && <span className="bg-primary h-2 w-2 rounded-full" />}
      </span>
      <span className="min-w-0 flex-1">
        <span className="text-foreground block text-sm font-medium">{SENIORITY_LABELS[id]}</span>
        <span className="text-muted-foreground mt-0.5 block text-xs leading-snug">
          {SENIORITY_DESCRIPTIONS[id]}
        </span>
      </span>
    </label>
  );
}

// ─────────────────────────────────────────────────────────────────────────

interface QuestionTypesFieldsetProps {
  selected: Set<QuestionTypeId>;
  onToggle: (id: QuestionTypeId) => void;
}

function QuestionTypesFieldset({ selected, onToggle }: QuestionTypesFieldsetProps) {
  const empty = selected.size === 0;
  return (
    <fieldset
      className={cn(
        'rounded-xl border p-4 sm:p-5',
        empty ? 'border-amber-500/40 bg-amber-500/5' : 'border-border/60 bg-card/40'
      )}
    >
      <legend className="text-foreground px-2 text-sm font-semibold tracking-tight">
        Question types
      </legend>
      <p className="text-muted-foreground -mt-0.5 mb-3 text-xs">
        Pick what to practise. The interviewer will randomly choose one.
      </p>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {QUESTION_TYPE_IDS.map((id) => (
          <QuestionTypeOption
            key={id}
            id={id}
            checked={selected.has(id)}
            onToggle={() => onToggle(id)}
          />
        ))}
      </div>
      {empty && (
        <p className="mt-3 text-xs text-amber-400">Pick at least one question type to continue.</p>
      )}
    </fieldset>
  );
}

interface QuestionTypeOptionProps {
  id: QuestionTypeId;
  checked: boolean;
  onToggle: () => void;
}

function QuestionTypeOption({ id, checked, onToggle }: QuestionTypeOptionProps) {
  return (
    <label
      className={cn(
        'group flex cursor-pointer items-center gap-3 rounded-lg border px-3 py-2.5 transition-colors',
        checked
          ? 'border-primary/60 bg-primary/5'
          : 'border-border/60 hover:border-border hover:bg-muted/40'
      )}
    >
      <input
        type="checkbox"
        checked={checked}
        onChange={onToggle}
        className="sr-only"
        aria-label={QUESTION_TYPE_LABELS[id]}
      />
      <span
        aria-hidden
        className={cn(
          'flex h-4 w-4 shrink-0 items-center justify-center rounded border-2 transition-colors',
          checked ? 'border-primary bg-primary' : 'border-muted-foreground/40'
        )}
      >
        {checked && (
          <svg
            viewBox="0 0 16 16"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            className="h-3 w-3"
            aria-hidden
          >
            <path
              d="M3.5 8.5L6.5 11.5L12.5 5"
              stroke="white"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        )}
      </span>
      <span className="text-foreground text-sm font-medium">{QUESTION_TYPE_LABELS[id]}</span>
    </label>
  );
}
