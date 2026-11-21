import { sql } from "drizzle-orm";
import { index, integer, pgEnum, pgTable, text, uuid } from "drizzle-orm/pg-core";

import { skillLevel, timestamps } from "./_shared.ts";

// Catalog skeleton: courses and lessons tagged with skill slugs. No content yet; when a lesson is
// published, the `lesson.published` event fills matching plan slots (src/events/handlers.ts).

export const contentStatus = pgEnum("content_status", ["draft", "published"]);
export const CONTENT_STATUSES = contentStatus.enumValues;

export const courses = pgTable("courses", {
  id: uuid().primaryKey().defaultRandom(),
  slug: text().notNull().unique(),
  title: text().notNull(),
  status: contentStatus().notNull().default("draft"),
  ...timestamps,
});

export const lessons = pgTable(
  "lessons",
  {
    id: uuid().primaryKey().defaultRandom(),
    courseId: uuid()
      .notNull()
      .references(() => courses.id, { onDelete: "cascade" }),
    slug: text().notNull().unique(),
    title: text().notNull(),
    skillSlugs: text().array().notNull().default(sql`'{}'::text[]`),
    roles: text().array().notNull().default(sql`'{}'::text[]`),
    tools: text().array().notNull().default(sql`'{}'::text[]`),
    durationMin: integer().notNull(),
    level: skillLevel(),
    status: contentStatus().notNull().default("draft"),
    ...timestamps,
  },
  (t) => [index("lessons_skill_slugs_gin").using("gin", t.skillSlugs), index().on(t.courseId)],
);

export type Course = typeof courses.$inferSelect;
export type Lesson = typeof lessons.$inferSelect;
