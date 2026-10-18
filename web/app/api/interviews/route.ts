/**
 * /api/interviews
 *
 * GET — returns the signed-in user's saved interviews, newest first (capped).
 * Used by the History view. When auth is disabled there is no history, so we
 * return an empty list without touching the database.
 */
import { desc, eq } from 'drizzle-orm';
import { auth } from '@/auth';
import { AUTH_ENABLED } from '@/lib/auth-config';
import { db } from '@/lib/db';
import { interviews } from '@/lib/db/schema';

export const runtime = 'nodejs';
export const revalidate = 0;

const HISTORY_LIMIT = 50;

export async function GET(): Promise<Response> {
  if (!AUTH_ENABLED) {
    return Response.json({ ok: true, interviews: [] });
  }

  const session = await auth();
  if (!session?.user?.id) {
    return Response.json({ ok: false, error: 'unauthorized' }, { status: 401 });
  }

  try {
    const rows = await db
      .select()
      .from(interviews)
      .where(eq(interviews.userId, session.user.id))
      .orderBy(desc(interviews.createdAt))
      .limit(HISTORY_LIMIT);

    return Response.json({ ok: true, interviews: rows });
  } catch (err) {
    console.error('[interviews-api] query failed:', err);
    return Response.json({ ok: false, error: 'query_failed' }, { status: 500 });
  }
}
