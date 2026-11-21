import { sql } from "drizzle-orm";
import { index, integer, pgEnum, pgTable, real, text, timestamp, uuid } from "drizzle-orm/pg-core";

import { lessons } from "./catalog.ts";
import { onboardingSessions } from "./onboarding.ts";
import { users } from "./users.ts";

export const planStatus = pgEnum("plan_status", ["active", "superseded"]);
/** `slot` = the skill is in the plan but no published lesson covers it yet (lessonId is null). */
export const planItemStatus = pgEnum("plan_item_status", ["slot", "ready", "in_progress", "done"]);
export const PLAN_ITEM_STATUSES = planItemStatus.enumValues;
export const PLAN_STATUSES = planStatus.enumValues;
export type PlanItemStatus = (typeof PLAN_ITEM_STATUSES)[number];

/** Owned by a session until claimed, then also by a user. */
export const learningPlans = pgTable(
  "learning_plans",
  {
    id: uuid().primaryKey().defaultRandom(),
    userId: uuid().references(() => users.id, { onDelete: "set null" }),
    sessionId: uuid().references(() => onboardingSessions.id, { onDelete: "cascade" }),
    version: integer().notNull(),
    status: planStatus().notNull().default("active"),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index().on(t.userId), index().on(t.sessionId)],
);

export const planItems = pgTable(
  "plan_items",
  {
    id: uuid().primaryKey().defaultRandom(),
    planId: uuid()
      .notNull()
      .references(() => learningPlans.id, { onDelete: "cascade" }),
    order: integer().notNull(),
    skillSlug: text().notNull(),
    lessonId: uuid().references(() => lessons.id, { onDelete: "set null" }),
    status: planItemStatus().notNull().default("slot"),
    sourceTaskIds: uuid().array().notNull().default(sql`'{}'::uuid[]`),
    estimatedHoursSaved: real().notNull(),
    rationale: text(),
  },
  (t) => [index().on(t.planId), index("plan_items_skill_slug_status_idx").on(t.skillSlug, t.status)],
);

export type LearningPlan = typeof learningPlans.$inferSelect;
export type PlanItem = typeof planItems.$inferSelect;
