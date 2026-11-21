import { pgTable, text, timestamp, unique, uuid } from "drizzle-orm/pg-core";

import { users } from "./users.ts";

/**
 * Non-accredited proof that a user completed a course. The row id is the public Verification link id.
 * No name is stored: it is rendered from the live users.name. courseId is the content-file slug
 * (same as lesson_completions.course_id), not a UUID.
 */
export const certificates = pgTable(
  "certificates",
  {
    id: uuid().primaryKey().defaultRandom(),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    courseId: text().notNull(),
    issuedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [unique("certificates_user_id_course_id_unique").on(t.userId, t.courseId)],
);

export type Certificate = typeof certificates.$inferSelect;
