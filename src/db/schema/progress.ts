import { index, integer, jsonb, pgTable, primaryKey, text, timestamp, unique, uuid } from "drizzle-orm/pg-core";

import { users } from "./users.ts";

/**
 * Every answer a learner submits. Doubles as the mistake log for the AI mentor: rows with
 * verdict != 'correct' are the mistakes (their id is returned as `mistakeId`).
 * Content ids (lesson, exercise) are text ids from content/courses.json.
 */
export const exerciseAttempts = pgTable(
  "exercise_attempts",
  {
    id: uuid().primaryKey().defaultRandom(),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    lessonId: text().notNull(),
    exerciseId: text().notNull(),
    attempt: integer().notNull(),
    /** correct | incorrect | partial */
    verdict: text().notNull(),
    answer: jsonb().notNull(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [unique().on(t.userId, t.exerciseId, t.attempt), index().on(t.userId, t.lessonId)],
);

/** One row per finished lesson. Scores are computed on the server from exercise_attempts. */
export const lessonCompletions = pgTable(
  "lesson_completions",
  {
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    lessonId: text().notNull(),
    courseId: text().notNull(),
    correctFirstTry: integer().notNull(),
    total: integer().notNull(),
    completedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.lessonId] })],
);

export type ExerciseAttempt = typeof exerciseAttempts.$inferSelect;
