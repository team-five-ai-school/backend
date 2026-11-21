import { pgEnum, timestamp } from "drizzle-orm/pg-core";

// Enums shared by several domains. Add values with a migration (ALTER TYPE ... ADD VALUE is generated).

export const userRole = pgEnum("user_role", ["learner", "admin"]);
export const skillLevel = pgEnum("skill_level", ["beginner", "intermediate", "advanced"]);

export const USER_ROLES = userRole.enumValues;
export const SKILL_LEVELS = skillLevel.enumValues;
export type UserRole = (typeof USER_ROLES)[number];
export type SkillLevel = (typeof SKILL_LEVELS)[number];

/** created_at + updated_at (updated_at is bumped by Drizzle on every update). */
export const timestamps = {
  createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp({ withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
};
