import { sql } from "drizzle-orm";
import { index, integer, jsonb, pgEnum, pgTable, real, text, timestamp, uuid } from "drizzle-orm/pg-core";

import { timestamps } from "./_shared.ts";
import { users } from "./users.ts";

// Onboarding → work tasks → chaos map. The skill taxonomy sits between a person's work and the content:
// tasks and lessons are tagged with the same skill slugs, and the learning plan links one to the other.

export const chaosType = pgEnum("chaos_type", [
  "scattered_channels",
  "manual_transfer",
  "repetitive_replies",
  "reports",
  "status_tracking",
]);
export const aiCapability = pgEnum("ai_capability", ["auto", "assist", "human"]);
export const taskSource = pgEnum("task_source", ["template", "llm", "user"]);
export const onboardingStatus = pgEnum("onboarding_status", ["started", "described", "completed", "claimed"]);

export const CHAOS_TYPES = chaosType.enumValues;
export const AI_CAPABILITIES = aiCapability.enumValues;
export const TASK_SOURCES = taskSource.enumValues;
export const ONBOARDING_STATUSES = onboardingStatus.enumValues;
export type ChaosType = (typeof CHAOS_TYPES)[number];
export type AiCapability = (typeof AI_CAPABILITIES)[number];
export type TaskSource = (typeof TASK_SOURCES)[number];

/* ───────── Reference data (seeded from src/seed/) ───────── */

export const skills = pgTable("skills", {
  slug: text().primaryKey(),
  title: text().notNull(),
  chaosType: chaosType().notNull(),
  /** Goes into the extraction prompt: what this skill automates, in plain words. */
  description: text().notNull(),
  roles: text().array().notNull().default(sql`'{}'::text[]`),
  tools: text().array().notNull().default(sql`'{}'::text[]`),
  ...timestamps,
});

/** One quiz option's effect: multiply the hours of the template tasks with these skills. */
export type QuizEffect = { multiply: Record<string, number> };
export type QuizOptionConfig = { id: string; label: string; description?: string; effect?: QuizEffect };
export type QuizQuestionConfig = {
  id: string;
  kind: "single" | "multi";
  text: string;
  hint?: string;
  options: QuizOptionConfig[];
};
export type DefaultTask = { title: string; skillSlug: string; hoursPerWeek: number; aiCapability: AiCapability };

export const roleTemplates = pgTable("role_templates", {
  slug: text().primaryKey(),
  title: text().notNull(),
  description: text().notNull(),
  /** Quiz questions; the hour adjustments live in each option's `effect`, not in code. */
  quiz: jsonb().$type<QuizQuestionConfig[]>().notNull(),
  defaultTasks: jsonb().$type<DefaultTask[]>().notNull(),
  ...timestamps,
});

/* ───────── Per-person data ───────── */

export type QuizAnswer = { questionId: string; optionIds: string[] };

/** Anonymous until claimed: `userId` is set by POST /onboarding/sessions/:id/claim. */
export const onboardingSessions = pgTable(
  "onboarding_sessions",
  {
    id: uuid().primaryKey().defaultRandom(),
    userId: uuid().references(() => users.id, { onDelete: "set null" }),
    roleSlug: text()
      .notNull()
      .references(() => roleTemplates.slug),
    answers: jsonb().$type<QuizAnswer[]>().notNull().default([]),
    freeText: text(),
    status: onboardingStatus().notNull().default("started"),
    ...timestamps,
  },
  (t) => [index().on(t.userId)],
);

export const workTasks = pgTable(
  "work_tasks",
  {
    id: uuid().primaryKey().defaultRandom(),
    sessionId: uuid()
      .notNull()
      .references(() => onboardingSessions.id, { onDelete: "cascade" }),
    userId: uuid().references(() => users.id, { onDelete: "set null" }),
    title: text().notNull(),
    skillSlug: text()
      .notNull()
      .references(() => skills.slug),
    chaosType: chaosType().notNull(),
    hoursPerWeek: real().notNull(),
    aiCapability: aiCapability().notNull(),
    source: taskSource().notNull(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index().on(t.sessionId), index().on(t.userId)],
);

export type ChaosLane = {
  id: string;
  kind: "skill" | "human";
  /** null for the "your decision" lane. */
  skillSlug: string | null;
  title: string;
  chaosType: ChaosType | null;
  taskIds: string[];
  hoursTotal: number;
  hoursAiCan: number;
  aiSharePercent: number;
};
export type ChaosTotals = { hoursTotal: number; hoursAiCan: number; hoursHuman: number; aiSharePercent: number };

/** Versioned snapshot, computed by code (src/domain/chaos-map.ts), never by a model. */
export const chaosMaps = pgTable(
  "chaos_maps",
  {
    id: uuid().primaryKey().defaultRandom(),
    sessionId: uuid()
      .notNull()
      .references(() => onboardingSessions.id, { onDelete: "cascade" }),
    userId: uuid().references(() => users.id, { onDelete: "set null" }),
    version: integer().notNull(),
    lanes: jsonb().$type<ChaosLane[]>().notNull(),
    totals: jsonb().$type<ChaosTotals>().notNull(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index().on(t.sessionId), index().on(t.userId)],
);

export const routineTimeLogs = pgTable(
  "routine_time_logs",
  {
    id: uuid().primaryKey().defaultRandom(),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    taskId: uuid()
      .notNull()
      .references(() => workTasks.id, { onDelete: "cascade" }),
    hoursBefore: real().notNull(),
    hoursAfter: real().notNull(),
    measuredAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index().on(t.userId)],
);

export type OnboardingSession = typeof onboardingSessions.$inferSelect;
export type WorkTask = typeof workTasks.$inferSelect;
export type ChaosMapRow = typeof chaosMaps.$inferSelect;
export type Skill = typeof skills.$inferSelect;
export type RoleTemplate = typeof roleTemplates.$inferSelect;
