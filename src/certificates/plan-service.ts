import { and, asc, desc, eq, inArray } from "drizzle-orm";

import type { Db } from "../db/index.ts";
import { learningPlans, lessons, planCertificates, planItems, skills, users, type PlanCertificate } from "../db/schema/index.ts";

export const PLAN_CERTIFICATE_TITLE = "Learning plan completed";

/**
 * Finishing a content lesson marks the matching item of the user's active plan done.
 * A catalog lesson's slug is the content lesson id. Idempotent.
 */
export async function markPlanItemsDone(db: Db, userId: string, contentLessonId: string) {
  const [lesson] = await db.select({ id: lessons.id }).from(lessons).where(eq(lessons.slug, contentLessonId));
  if (!lesson) return;
  const plans = await db
    .select({ id: learningPlans.id })
    .from(learningPlans)
    .where(and(eq(learningPlans.userId, userId), eq(learningPlans.status, "active")));
  if (!plans.length) return;
  await db
    .update(planItems)
    .set({ status: "done" })
    .where(
      and(
        eq(planItems.lessonId, lesson.id),
        inArray(
          planItems.planId,
          plans.map((p) => p.id),
        ),
      ),
    );
}

/**
 * Issues the final certificate when every item of the user's active plan is done.
 * Idempotent: one per plan, a repeat call returns the existing one. Null while the plan is incomplete or empty.
 */
export async function issuePlanCertificateIfComplete(db: Db, userId: string): Promise<PlanCertificate | null> {
  const [plan] = await db
    .select()
    .from(learningPlans)
    .where(and(eq(learningPlans.userId, userId), eq(learningPlans.status, "active")))
    .orderBy(desc(learningPlans.createdAt))
    .limit(1);
  if (!plan) return null;

  const items = await db
    .select({ status: planItems.status, title: skills.title })
    .from(planItems)
    .innerJoin(skills, eq(skills.slug, planItems.skillSlug))
    .where(eq(planItems.planId, plan.id))
    .orderBy(asc(planItems.order));
  if (!items.length || items.some((i) => i.status !== "done")) return null;

  const [created] = await db
    .insert(planCertificates)
    .values({ userId, planId: plan.id, title: PLAN_CERTIFICATE_TITLE, skills: items.map((i) => i.title) })
    .onConflictDoNothing({ target: planCertificates.planId })
    .returning();
  if (created) return created;
  const [existing] = await db.select().from(planCertificates).where(eq(planCertificates.planId, plan.id));
  return existing ?? null;
}

export type PlanCertificateView = {
  id: string;
  title: string;
  /** Live: the holder's current account name. */
  holderName: string;
  skills: string[];
  issuedAt: Date;
};

const toView = (row: { cert: PlanCertificate; holderName: string }): PlanCertificateView => ({
  id: row.cert.id,
  title: row.cert.title,
  holderName: row.holderName,
  skills: row.cert.skills,
  issuedAt: row.cert.issuedAt,
});

export async function listPlanCertificates(db: Db, userId: string): Promise<PlanCertificateView[]> {
  const rows = await db
    .select({ cert: planCertificates, holderName: users.name })
    .from(planCertificates)
    .innerJoin(users, eq(users.id, planCertificates.userId))
    .where(eq(planCertificates.userId, userId))
    .orderBy(planCertificates.issuedAt);
  return rows.map(toView);
}

/** Public lookup by Verification link id. */
export async function getPlanCertificate(db: Db, id: string): Promise<PlanCertificateView | null> {
  const [row] = await db
    .select({ cert: planCertificates, holderName: users.name })
    .from(planCertificates)
    .innerJoin(users, eq(users.id, planCertificates.userId))
    .where(eq(planCertificates.id, id));
  return row ? toView(row) : null;
}
