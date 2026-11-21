// DEV ONLY: gives an existing user a "My plan" by running the real onboarding flow for a role
// (role template tasks, no AI call): session → complete → claim.
// Skills are seeded (English) and the content lessons synced first, so plan items point at real lessons.
// Then marks every plan item done.
// Usage: DATABASE_URL=postgresql://...localhost... node src/seed/demo-plan.ts [email] [roleSlug]
// Refuses to run unless the database host is local (override: ALLOW_REMOTE_SEED=1). Idempotent: skips a user who already has a plan.
import { eq } from "drizzle-orm";

import { db } from "../db/index.ts";
import { issuePlanCertificateIfComplete } from "../certificates/plan-service.ts";
import { syncContentLessons } from "../catalog/sync-content.ts";
import { planItems, users } from "../db/schema/index.ts";
import { seedReferenceData } from "./index.ts";
import { onboardingService } from "../onboarding/service.ts";

const host = new URL(process.env.DATABASE_URL ?? "postgresql://localhost").hostname;
if (!["localhost", "127.0.0.1"].includes(host) && process.env.ALLOW_REMOTE_SEED !== "1") throw new Error(`Refusing to seed demo data into non-local database (${host}). Set ALLOW_REMOTE_SEED=1 to override`);

const email = (process.argv[2] ?? "admin@example.com").toLowerCase();
const roleSlug = process.argv[3] ?? "sales_manager";

const [user] = await db.select().from(users).where(eq(users.email, email));
if (!user) throw new Error(`No user ${email}. Register it first.`);

await seedReferenceData();
await syncContentLessons(db);
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

// ── Complete the plan: every item has a real lesson (content files synced into the catalog), all done.
await db.update(planItems).set({ status: "done" }).where(eq(planItems.planId, (await service.planForUser(user.id))!.id));
const finalCertificate = await issuePlanCertificateIfComplete(db, user.id);
console.log(`final certificate: ${finalCertificate?.id ?? "not issued"}`);
const done = await service.planForUser(user.id);
for (const item of done!.items) console.log(`  ${item.order}. ${item.skillTitle} → ${item.lessonTitle ?? "NO LESSON"} (${item.status})`);
await db.$client.end();
