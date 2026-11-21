import { boolean, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

/** Example table. Matches the `Task` type in the frontend (src/features/tasks). */
export const tasks = pgTable("tasks", {
  id: uuid().primaryKey().defaultRandom(),
  title: text().notNull(),
  done: boolean().notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type Task = typeof tasks.$inferSelect;
