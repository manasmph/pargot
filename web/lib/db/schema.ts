/**
 * Drizzle schema — Neon Postgres.
 *
 * The `users` / `accounts` / `sessions` / `verificationTokens` tables are the
 * standard Auth.js Drizzle adapter schema (see authjs.dev/getting-started/
 * adapters/drizzle). `interviews` is our own table storing each completed
 * interview's summary, keyed to the signed-in user.
 */
import type { AdapterAccountType } from 'next-auth/adapters';
import { integer, jsonb, pgTable, primaryKey, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import type { InterviewSummary } from '@/lib/coach-types';

// ─── Auth.js standard tables ──────────────────────────────────────────────

export const users = pgTable('user', {
  id: text('id')
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  name: text('name'),
  email: text('email').unique(),
  emailVerified: timestamp('emailVerified', { mode: 'date' }),
  image: text('image'),
});

export const accounts = pgTable(
  'account',
  {
    userId: text('userId')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    type: text('type').$type<AdapterAccountType>().notNull(),
    provider: text('provider').notNull(),
    providerAccountId: text('providerAccountId').notNull(),
    refresh_token: text('refresh_token'),
    access_token: text('access_token'),
    expires_at: integer('expires_at'),
    token_type: text('token_type'),
    scope: text('scope'),
    id_token: text('id_token'),
    session_state: text('session_state'),
  },
  (account) => [
    {
      compoundKey: primaryKey({
        columns: [account.provider, account.providerAccountId],
      }),
    },
  ]
);

export const sessions = pgTable('session', {
  sessionToken: text('sessionToken').primaryKey(),
  userId: text('userId')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  expires: timestamp('expires', { mode: 'date' }).notNull(),
});

export const verificationTokens = pgTable(
  'verificationToken',
  {
    identifier: text('identifier').notNull(),
    token: text('token').notNull(),
    expires: timestamp('expires', { mode: 'date' }).notNull(),
  },
  (vt) => [
    {
      compositePk: primaryKey({ columns: [vt.identifier, vt.token] }),
    },
  ]
);

// ─── App tables ───────────────────────────────────────────────────────────

export const interviews = pgTable('interviews', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: text('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  frameworkId: text('framework_id'),
  frameworkName: text('framework_name'),
  questionType: text('question_type'),
  seniority: text('seniority'),
  overallScore: integer('overall_score'),
  stagesCompleted: integer('stages_completed'),
  stagesTotal: integer('stages_total'),
  durationSec: integer('duration_sec'),
  // The full structured summary, so the History view can re-render it exactly.
  summary: jsonb('summary').$type<InterviewSummary>().notNull(),
});

export type InterviewRow = typeof interviews.$inferSelect;
