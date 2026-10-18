'use client';

import { SessionProvider } from 'next-auth/react';
import { AUTH_ENABLED } from '@/lib/auth-config';

/**
 * Client wrapper so `useSession()` works anywhere in the tree. Mounted once
 * in the root layout around all app UI.
 *
 * When auth is disabled we skip `SessionProvider` entirely — there is no
 * `/api/auth/session` endpoint worth polling, and no auth-aware component is
 * rendered in that mode.
 */
export function AuthProvider({ children }: { children: React.ReactNode }) {
  if (!AUTH_ENABLED) return <>{children}</>;
  return <SessionProvider>{children}</SessionProvider>;
}
