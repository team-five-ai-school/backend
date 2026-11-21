import { pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

import { skillLevel, timestamps, userRole } from "./_shared.ts";

export const users = pgTable("users", {
  id: uuid().primaryKey().defaultRandom(),
  /** Always stored lowercased. */
  email: text().notNull().unique(),
  passwordHash: text().notNull(),
  name: text().notNull(),
  role: userRole().notNull().default("learner"),
  /** Overall level. Null until onboarding sets it (scoring logic TBD). */
  level: skillLevel(),
  onboardingCompletedAt: timestamp({ withTimezone: true }),
  ...timestamps,
});

export type User = typeof users.$inferSelect;
