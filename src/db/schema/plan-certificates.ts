import { pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

import { learningPlans } from "./plans.ts";
import { users } from "./users.ts";

/**
 * Final certificate for a completed learning plan. One per plan; the row id is the public Verification
 * link id. The holder name is rendered live from users.name. The title and the skill list are frozen at
 * issue time, so a later change to the plan or the catalog never rewrites an issued certificate.
 */
export const planCertificates = pgTable("plan_certificates", {
  id: uuid().primaryKey().defaultRandom(),
  userId: uuid()
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  planId: uuid()
    .notNull()
    .unique()
    .references(() => learningPlans.id, { onDelete: "cascade" }),
  title: text().notNull(),
  /** Skill titles of the plan items, in plan order, as one flat list. */
  skills: text().array().notNull(),
  issuedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
});

export type PlanCertificate = typeof planCertificates.$inferSelect;
