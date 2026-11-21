// DEV ONLY: gives an existing user a "My plan" by running the real onboarding flow for a role
// (role template tasks, no AI call): session → complete → claim.
// Then makes the plan complete: every item gets a published demo lesson and a progress status.
// Usage: DATABASE_URL=postgresql://...localhost... node src/seed/demo-plan.ts [email] [roleSlug]
// Refuses to run unless the database host is local. Idempotent: skips a user who already has a plan.
import { asc, eq } from "drizzle-orm";

import { db } from "../db/index.ts";
import { courses, lessons, planItems, skills, users, type PlanItemStatus } from "../db/schema/index.ts";
import { onboardingService } from "../onboarding/service.ts";

const host = new URL(process.env.DATABASE_URL ?? "postgresql://localhost").hostname;
if (!["localhost", "127.0.0.1"].includes(host)) throw new Error(`Refusing to seed demo data into non-local database (${host})`);

const email = (process.argv[2] ?? "admin@example.com").toLowerCase();
const roleSlug = process.argv[3] ?? "sales_manager";

const [user] = await db.select().from(users).where(eq(users.email, email));
if (!user) throw new Error(`No user ${email}. Register it first.`);

const service = onboardingService(db);
const existing = await service.planForUser(user.id);
if (existing) {
  console.log(`${email} already has an active plan (${existing.items.length} items). Nothing to do.`);
} else {
  const { sessionId } = await service.createSession(roleSlug);
  const { plan } = await service.complete(sessionId);
  await service.claim(sessionId, user.id);
  console.log(`${email}: plan ${plan.id} for ${roleSlug}, ${plan.items.length} items`);
  for (const item of plan.items) console.log(`  ${item.order}. ${item.skillSlug} (${item.status})`);
}

// ── Complete the plan: one published demo lesson per item, statuses with every item done.
const plan = await service.planForUser(user.id);
if (!plan) throw new Error("Plan missing after seeding");
await db.delete(courses).where(eq(courses.title, "CRM без рутини")); // leftover test data from the e2e run
const [course] = await db
  .insert(courses)
  .values({ slug: "demo-plan-course", title: "Demo: plan lessons", status: "published" })
  .onConflictDoUpdate({ target: courses.slug, set: { status: "published" } })
  .returning();
const skillRows = await db.select().from(skills);
const title = new Map(skillRows.map((k) => [k.slug, k.title]));
const items = await db.select().from(planItems).where(eq(planItems.planId, plan.id)).orderBy(asc(planItems.order));
const statuses: PlanItemStatus[] = items.map(() => "done");
for (const [i, item] of items.entries()) {
  const [lesson] = await db
    .insert(lessons)
    .values({
      courseId: course!.id,
      slug: `demo-${item.skillSlug}`,
      title: title.get(item.skillSlug) ?? item.skillSlug,
      skillSlugs: [item.skillSlug],
      durationMin: 5,
      status: "published",
    })
    .onConflictDoUpdate({ target: lessons.slug, set: { status: "published" } })
    .returning();
  const status = statuses[i] ?? "ready";
  await db.update(planItems).set({ lessonId: lesson!.id, status }).where(eq(planItems.id, item.id));
  console.log(`  ${item.order}. ${item.skillSlug} → lesson "${lesson!.title}" (${status})`);
}
await db.$client.end();
