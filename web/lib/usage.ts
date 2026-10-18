/**
 * Daily usage-limit helpers.
 *
 * The quota counts *saved* interviews (rows in the `interviews` table) since
 * UTC midnight. `/api/token` calls `getTodayInterviewCount` before minting a
 * LiveKit token and refuses at/over the limit.
 */
import { and, count, eq, gte } from 'drizzle-orm';
import { db } from '@/lib/db';
import { interviews } from '@/lib/db/schema';

/** Free-tier interviews per user per (UTC) day. Override with DAILY_INTERVIEW_LIMIT. */
export const DAILY_INTERVIEW_LIMIT = Number(process.env.DAILY_INTERVIEW_LIMIT ?? 3);

function startOfUtcDay(): Date {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

/** Number of interviews this user has completed since UTC midnight. */
export async function getTodayInterviewCount(userId: string): Promise<number> {
  const rows = await db
    .select({ n: count() })
    .from(interviews)
    .where(and(eq(interviews.userId, userId), gte(interviews.createdAt, startOfUtcDay())));
  return rows[0]?.n ?? 0;
}
