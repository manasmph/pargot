'use client';

import {
  type ReactNode,
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  DEFAULT_INTERVIEW_SETTINGS,
  type InterviewSettings,
  parseInterviewSettings,
} from '@/lib/interview-settings';

const STORAGE_KEY = 'socratiq.settings';

interface InterviewSettingsContextValue {
  /** Current settings — `null` until the user has confirmed the settings page. */
  settings: InterviewSettings | null;
  /**
   * Settings as a ref-getter, for non-React consumers (e.g. the
   * `TokenSource.custom` closure in `app.tsx`). Always returns the
   * latest, or the defaults if nothing has been set.
   */
  getSettings: () => InterviewSettings;
  /** Persist new settings (state + ref + sessionStorage). */
  applySettings: (next: InterviewSettings) => void;
  /** Drop any saved settings (called on disconnect / reset). */
  clearSettings: () => void;
}

const InterviewSettingsContext = createContext<InterviewSettingsContextValue | null>(null);

interface ProviderProps {
  children: ReactNode;
}

/**
 * Holds the current pre-interview settings (seniority + question types)
 * and persists them to `sessionStorage` so a tab reload mid-interview
 * doesn't reset the agent's calibration.
 *
 * Exposes both a React `settings` value (for display / re-renders) AND
 * a `getSettings()` ref-getter (so the `TokenSource.custom` closure can
 * read the latest values without depending on React's update cadence).
 */
export function InterviewSettingsProvider({ children }: ProviderProps) {
  // Hydrate from sessionStorage on first client render.
  const [settings, setSettings] = useState<InterviewSettings | null>(() => {
    if (typeof window === 'undefined') return null;
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    try {
      return parseInterviewSettings(JSON.parse(raw));
    } catch {
      return null;
    }
  });

  // Mirror to a ref so `TokenSource.custom`'s closure can read the latest
  // value at fetch time without re-creating the TokenSource on every change.
  const settingsRef = useRef<InterviewSettings | null>(settings);
  useEffect(() => {
    settingsRef.current = settings;
  }, [settings]);

  const getSettings = useCallback((): InterviewSettings => {
    return settingsRef.current ?? DEFAULT_INTERVIEW_SETTINGS;
  }, []);

  const applySettings = useCallback((next: InterviewSettings) => {
    settingsRef.current = next;
    setSettings(next);
    if (typeof window !== 'undefined') {
      try {
        window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      } catch {
        // sessionStorage can throw in private browsing or when full — non-fatal.
      }
    }
  }, []);

  const clearSettings = useCallback(() => {
    settingsRef.current = null;
    setSettings(null);
    if (typeof window !== 'undefined') {
      try {
        window.sessionStorage.removeItem(STORAGE_KEY);
      } catch {
        // ignore
      }
    }
  }, []);

  const value = useMemo<InterviewSettingsContextValue>(
    () => ({ settings, getSettings, applySettings, clearSettings }),
    [settings, getSettings, applySettings, clearSettings]
  );

  return (
    <InterviewSettingsContext.Provider value={value}>{children}</InterviewSettingsContext.Provider>
  );
}

export function useInterviewSettings(): InterviewSettingsContextValue {
  const ctx = useContext(InterviewSettingsContext);
  if (!ctx) {
    throw new Error('useInterviewSettings must be used inside <InterviewSettingsProvider>');
  }
  return ctx;
}
