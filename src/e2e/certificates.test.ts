import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";

// End-to-end: real Fastify app (app.inject) + real Postgres. Runs only with TEST_DATABASE_URL
// pointing at a throwaway database (see onboarding.test.ts for the docker one-liner).
const TEST_DB = process.env.TEST_DATABASE_URL;

describe("certificates (e2e)", { skip: TEST_DB ? false : "TEST_DATABASE_URL not set" }, () => {
  let app: Awaited<ReturnType<typeof import("../app.ts").buildApp>>;
  let db: typeof import("../db/index.ts").db;
  let schema: typeof import("../db/schema/index.ts");
  let eq: typeof import("drizzle-orm").eq;
  let courses: typeof import("../content/courses.ts");

  before(async () => {
    process.env.DATABASE_URL = TEST_DB;
    const [{ buildApp }, { runMigrations }, dbMod, schemaMod, drizzle, coursesMod] = await Promise.all([
      import("../app.ts"),
      import("../db/migrate.ts"),
      import("../db/index.ts"),
      import("../db/schema/index.ts"),
      import("drizzle-orm"),
      import("../content/courses.ts"),
    ]);
    await runMigrations();
    app = await buildApp({ logger: false });
    db = dbMod.db;
    schema = schemaMod;
    eq = drizzle.eq;
    courses = coursesMod;
  });

  after(async () => {
    await app.close();
    await db.$client.end();
  });

  async function register(name: string) {
    const res = await app.inject({
      method: "POST",
      url: "/auth/register",
      payload: { email: `cert-${crypto.randomUUID()}@example.com`, password: "password-123", name },
    });
    assert.equal(res.statusCode, 201, res.body);
    return { token: res.json().token as string, id: res.json().user.id as string };
  }

  const completeLessons = (userId: string, courseId: string, lessonIds: string[]) =>
    db.insert(schema.lessonCompletions).values(lessonIds.map((lessonId) => ({ userId, lessonId, courseId, correctFirstTry: 1, total: 1 })));

  it("issues once, only when every lesson is done, and serves it publicly with the live name", async () => {
    const { issueCertificateIfComplete } = await import("../certificates/service.ts");
    const course = courses.listCourses()[0];
    const ids = course.lessons.map((l) => l.id);
    const user = await register("Anna Kovalenko");

    await completeLessons(user.id, course.id, ids.slice(0, -1));
    assert.equal(await issueCertificateIfComplete(db, user.id, course.id), null, "no certificate while a lesson is missing");

    await completeLessons(user.id, course.id, ids.slice(-1));
    const first = await issueCertificateIfComplete(db, user.id, course.id);
    assert.ok(first);
    const again = await issueCertificateIfComplete(db, user.id, course.id);
    assert.equal(again?.id, first.id, "repeat issue returns the existing certificate");

    const list = await app.inject({ method: "GET", url: "/certificates", headers: { authorization: `Bearer ${user.token}` } });
    assert.equal(list.statusCode, 200, list.body);
    assert.equal(list.json().length, 1);

    // Public: no auth header.
    const pub = await app.inject({ method: "GET", url: `/certificates/${first.id}` });
    assert.equal(pub.statusCode, 200, pub.body);
    assert.equal(pub.json().holderName, "Anna Kovalenko");
    assert.equal(pub.json().certificateName, course.certificate);

    await db.update(schema.users).set({ name: "Anna Shevchenko" }).where(eq(schema.users.id, user.id));
    const renamed = await app.inject({ method: "GET", url: `/certificates/${first.id}` });
    assert.equal(renamed.json().holderName, "Anna Shevchenko", "name is rendered live, not stored");
  });

  it("returns 404 for an unknown certificate and requires login for the list", async () => {
    assert.equal((await app.inject({ method: "GET", url: `/certificates/${crypto.randomUUID()}` })).statusCode, 404);
    assert.equal((await app.inject({ method: "GET", url: "/certificates" })).statusCode, 401);
  });

  it("issues the final certificate only when every plan item is done, once, with a frozen skill list", async () => {
    const [{ seedReferenceData }, { syncContentLessons }, { onboardingService }, planSvc] = await Promise.all([
      import("../seed/index.ts"),
      import("../catalog/sync-content.ts"),
      import("../onboarding/service.ts"),
      import("../certificates/plan-service.ts"),
    ]);
    await seedReferenceData();
    await syncContentLessons(db);
    const user = await register("Plan Holder");
    const service = onboardingService(db);
    const { sessionId } = await service.createSession("sales_manager");
    const { plan } = await service.complete(sessionId);
    await service.claim(sessionId, user.id);
    const slugs = plan.items.map((i: { lessonSlug: string | null }) => i.lessonSlug);
    assert.ok(plan.items.length > 1 && slugs.every(Boolean), "every plan item has a real lesson");

    for (const slug of slugs.slice(0, -1)) await planSvc.markPlanItemsDone(db, user.id, slug as string);
    assert.equal(await planSvc.issuePlanCertificateIfComplete(db, user.id), null, "not while an item is open");

    await planSvc.markPlanItemsDone(db, user.id, slugs.at(-1) as string);
    const first = await planSvc.issuePlanCertificateIfComplete(db, user.id);
    assert.ok(first);
    assert.equal((await planSvc.issuePlanCertificateIfComplete(db, user.id))?.id, first.id, "repeat issue returns the same one");

    const pub = await app.inject({ method: "GET", url: `/plan-certificates/${first.id}` });
    assert.equal(pub.statusCode, 200, pub.body);
    assert.equal(pub.json().holderName, "Plan Holder");
    assert.equal(pub.json().title, planSvc.PLAN_CERTIFICATE_TITLE);
    assert.equal(pub.json().skills.length, plan.items.length);

    // Frozen: renaming a skill later does not change the issued certificate; the holder name stays live.
    await db.update(schema.skills).set({ title: "Renamed later" });
    await db.update(schema.users).set({ name: "Renamed Holder" }).where(eq(schema.users.id, user.id));
    const after = (await app.inject({ method: "GET", url: `/plan-certificates/${first.id}` })).json();
    assert.ok(!after.skills.includes("Renamed later"), "skill list is frozen at issue time");
    assert.equal(after.holderName, "Renamed Holder", "name is live");

    const list = await app.inject({ method: "GET", url: "/plan-certificates", headers: { authorization: `Bearer ${user.token}` } });
    assert.equal(list.json().length, 1);
    assert.equal((await app.inject({ method: "GET", url: "/plan-certificates" })).statusCode, 401);
    assert.equal((await app.inject({ method: "GET", url: `/plan-certificates/${crypto.randomUUID()}` })).statusCode, 404);
  });
});
