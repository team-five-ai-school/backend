import { jsonb, pgTable, primaryKey, text, timestamp, uuid } from "drizzle-orm/pg-core";

import { users } from "./users.ts";

/**
 * End-of-lesson review (docs/spec.md → Lesson summary and journal). One per learner and lesson.
 * `entry` is the JournalEntry from src/ai/lesson-review.ts: numbers computed by code, text by AI.
 */
export const journalEntries = pgTable(
  "journal_entries",
  {
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    lessonId: text().notNull(),
    courseId: text().notNull(),
    entry: jsonb().notNull(),
    /** llm | fallback */
    source: text().notNull(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.lessonId] })],
);
