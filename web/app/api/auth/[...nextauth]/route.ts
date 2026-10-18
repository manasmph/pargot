/**
 * Auth.js catch-all route — handles sign-in, sign-out, OAuth callbacks, and
 * session endpoints under /api/auth/*. All logic lives in `@/auth`.
 */
import { handlers } from '@/auth';

export const { GET, POST } = handlers;
