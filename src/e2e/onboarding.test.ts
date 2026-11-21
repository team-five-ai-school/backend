import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";

// End-to-end: real Fastify app (app.inject) + real Postgres, mock model. Runs only with TEST_DATABASE_URL
// pointing at a throwaway database: never at the shared one in .env. Example:
//   docker run -d -p 5433:5432 -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=app postgres:17-alpine
//   TEST_DATABASE_URL=postgresql://postgres:postgres@localhost:5433/app npm test
const TEST_DB = process.env.TEST_DATABASE_URL;

describe("onboarding flow (e2e)", { skip: TEST_DB ? false : "TEST_DATABASE_URL is not set" }, () => {
  let app: Awaited<ReturnType<typeof import("../app.ts").buildApp>>;
  let close: () => Promise<void>;
  let setAdmin: (email: string) => Promise<void>;

  before(async () => {
    process.env.DATABASE_URL = TEST_DB;
    const [{ buildApp }, { runMigrations }, { seedReferenceData }, { db }, { mockStreamModel }, { users }, { eq }] = await Promise.all([
      import("../app.ts"),
      import("../db/migrate.ts"),
      import("../seed/index.ts"),
      import("../db/index.ts"),
      import("../ai/test-utils.ts"),
      import("../db/schema/index.ts"),
      import("drizzle-orm"),
    ]);
    const { sql } = await import("drizzle-orm");
    await runMigrations();
    // Throwaway DB: start from a clean slate so earlier runs (published lessons) don't leak in.
    await db.execute(
      sql`truncate courses, lessons, learning_plans, plan_items, chaos_maps, work_tasks, onboarding_sessions, routine_time_logs restart identity cascade`,
    );
    await seedReferenceData();
    const output = {
      tasks: [
        { title: "Заявки з Instagram у CRM", skillSlug: "messages-to-crm", hoursPerWeek: 6, aiCapability: "auto" },
        { title: "Звіт по воронці", skillSlug: "summarize-reports", hoursPerWeek: 3, aiCapability: "assist" },
        { title: "Знижки для постійних", skillSlug: "draft-replies", hoursPerWeek: 2, aiCapability: "human" },
      ],
    };
    app = await buildApp({ logger: false, extractionModel: { model: mockStreamModel(JSON.stringify(output)), modelId: "mock" } });
    close = async () => {
      await app.close();
      await db.$client.end();
    };
    setAdmin = async (email) => {
      await db.update(users).set({ role: "admin" }).where(eq(users.email, email));
    };
  });

  after(async () => close?.());

  const register = async (prefix: string) => {
    const email = `${prefix}-${crypto.randomUUID()}@example.com`;
    const res = await app.inject({ method: "POST", url: "/auth/register", payload: { email, password: "password123", name: "Test" } });
    assert.equal(res.statusCode, 201, res.body);
    return { email, token: res.json().token as string };
  };

  it("roles → session → answers → describe (stream) → complete → claim → /me, then lesson.published fills the slot", async () => {
    const roles = (await app.inject({ method: "GET", url: "/onboarding/roles" })).json();
    assert.deepEqual(
      roles.map((r: { slug: string }) => r.slug).sort(),
      ["accountant", "sales_manager", "small_business_owner"],
    );

    const created = await app.inject({ method: "POST", url: "/onboarding/sessions", payload: { role: "sales_manager" } });
    assert.equal(created.statusCode, 201, created.body);
    const { sessionId, quiz } = created.json();
    assert.ok(quiz.length >= 6);
    assert.ok(!created.body.includes("multiply"), "quiz effects stay on the server");

    const badAnswers = await app.inject({
      method: "PATCH",
      url: `/onboarding/sessions/${sessionId}/answers`,
      payload: { answers: [{ questionId: "nope", optionIds: ["x"] }] },
    });
    assert.equal(badAnswers.statusCode, 400);

    const answers = await app.inject({
      method: "PATCH",
      url: `/onboarding/sessions/${sessionId}/answers`,
      payload: { answers: [{ questionId: "sal-leads", optionIds: ["gt30"] }] },
    });
    assert.equal(answers.statusCode, 200, answers.body);

    const tooLong = await app.inject({
      method: "POST",
      url: `/onboarding/sessions/${sessionId}/describe`,
      payload: { freeText: "x".repeat(2001) },
    });
    assert.equal(tooLong.statusCode, 400);

    const described = await app.inject({
      method: "POST",
      url: `/onboarding/sessions/${sessionId}/describe`,
      payload: { freeText: "Щодня переношу заявки з інстаграму в CRM, роблю звіт по воронці і вирішую про знижки." },
    });
    assert.equal(described.statusCode, 200, described.body);
    assert.match(described.headers["content-type"] as string, /text\/plain/);
    const doc = JSON.parse(described.body);
    assert.equal(doc.source, "llm");
    assert.equal(doc.tasks.length, 3);

    const restored = (await app.inject({ method: "GET", url: `/onboarding/sessions/${sessionId}` })).json();
    assert.equal(restored.status, "described");
    assert.equal(restored.tasks.length, 3);
    assert.deepEqual(restored.answers, [{ questionId: "sal-leads", optionIds: ["gt30"] }]);

    const completed = await app.inject({ method: "POST", url: `/onboarding/sessions/${sessionId}/complete` });
    assert.equal(completed.statusCode, 200, completed.body);
    const { tasks, chaosMap, plan } = completed.json();
    assert.equal(tasks.length, 3);
    // 6×0.8 + 3×0.4 + 2×0 = 6 of 11 h → 55%
    assert.deepEqual(chaosMap.totals, { hoursTotal: 11, hoursAiCan: 6, hoursHuman: 5, aiSharePercent: 55 });
    assert.equal(chaosMap.lanes.at(-1).kind, "human");
    assert.deepEqual(plan.items.map((i: { skillSlug: string }) => i.skillSlug), ["messages-to-crm", "summarize-reports"]);
    assert.ok(plan.items.every((i: { status: string; lessonId: null }) => i.status === "slot" && i.lessonId === null));

    const afterComplete = (await app.inject({ method: "GET", url: `/onboarding/sessions/${sessionId}` })).json();
    assert.equal(afterComplete.status, "completed");
    assert.equal(afterComplete.plan.id, plan.id);
    assert.equal(afterComplete.chaosMap.id, chaosMap.id);

    // Claim needs auth, then links everything to the user.
    assert.equal((await app.inject({ method: "POST", url: `/onboarding/sessions/${sessionId}/claim` })).statusCode, 401);
    const learner = await register("learner");
    const auth = { authorization: `Bearer ${learner.token}` };
    const claimed = await app.inject({ method: "POST", url: `/onboarding/sessions/${sessionId}/claim`, headers: auth });
    assert.equal(claimed.statusCode, 200, claimed.body);
    assert.equal(claimed.json().status, "claimed");
    const other = await register("other");
    const stolen = await app.inject({
      method: "POST",
      url: `/onboarding/sessions/${sessionId}/claim`,
      headers: { authorization: `Bearer ${other.token}` },
    });
    assert.equal(stolen.statusCode, 409);

    const myPlan = await app.inject({ method: "GET", url: "/me/plan", headers: auth });
    assert.equal(myPlan.statusCode, 200, myPlan.body);
    assert.equal(myPlan.json().id, plan.id);
    const myMap = await app.inject({ method: "GET", url: "/me/chaos-map", headers: auth });
    assert.equal(myMap.json().id, chaosMap.id);

    const logged = await app.inject({
      method: "POST",
      url: "/me/routine-time",
      headers: auth,
      payload: { taskId: tasks[0].id, hoursBefore: 6, hoursAfter: 1.5 },
    });
    assert.equal(logged.statusCode, 201, logged.body);
    const foreign = await app.inject({
      method: "POST",
      url: "/me/routine-time",
      headers: { authorization: `Bearer ${other.token}` },
      payload: { taskId: tasks[0].id, hoursBefore: 6, hoursAfter: 1.5 },
    });
    assert.equal(foreign.statusCode, 404);

    // Admin publishes a lesson for the top skill → the slot gets it (twice = no change).
    const admin = await register("admin");
    await setAdmin(admin.email);
    const adminToken = (
      await app.inject({ method: "POST", url: "/auth/login", payload: { email: admin.email, password: "password123" } })
    ).json().token;
    const adminAuth = { authorization: `Bearer ${adminToken}` };
    assert.equal((await app.inject({ method: "POST", url: "/catalog/courses", headers: auth, payload: { slug: "x", title: "x" } })).statusCode, 403);

    const course = (
      await app.inject({ method: "POST", url: "/catalog/courses", headers: adminAuth, payload: { slug: `c-${Date.now()}`, title: "CRM без рутини" } })
    ).json();
    const lesson = await app.inject({
      method: "POST",
      url: "/catalog/lessons",
      headers: adminAuth,
      payload: { courseId: course.id, slug: `l-${Date.now()}`, title: "Заявки в CRM за 5 хвилин", skillSlugs: ["messages-to-crm"], roles: ["sales_manager"], durationMin: 5 },
    });
    assert.equal(lesson.statusCode, 201, lesson.body);
    const lessonId = lesson.json().id;

    for (let i = 0; i < 2; i++) {
      const published = await app.inject({ method: "POST", url: `/catalog/lessons/${lessonId}/publish`, headers: adminAuth });
      assert.equal(published.statusCode, 200, published.body);
    }
    const filled = (await app.inject({ method: "GET", url: "/me/plan", headers: auth })).json();
    const [first, second] = filled.items;
    assert.equal(first.status, "ready");
    assert.equal(first.lessonId, lessonId);
    assert.equal(first.lessonTitle, "Заявки в CRM за 5 хвилин");
    assert.equal(second.status, "slot");
  });

  it("complete without describe uses the role template adjusted by the quiz", async () => {
    const { sessionId } = (await app.inject({ method: "POST", url: "/onboarding/sessions", payload: { role: "accountant" } })).json();
    await app.inject({
      method: "PATCH",
      url: `/onboarding/sessions/${sessionId}/answers`,
      payload: { answers: [{ questionId: "acc-reports", optionIds: ["gt5"] }] },
    });
    const { tasks, chaosMap } = (await app.inject({ method: "POST", url: `/onboarding/sessions/${sessionId}/complete` })).json();
    assert.equal(tasks.length, 5);
    assert.ok(tasks.every((t: { source: string }) => t.source === "template"));
    const report = tasks.find((t: { skillSlug: string }) => t.skillSlug === "summarize-reports");
    assert.equal(report.hoursPerWeek, 3); // 2 × 1.6 = 3.2 → 3
    assert.equal(chaosMap.totals.hoursTotal, 15);
  });

  it("rejects an unknown role and a missing session", async () => {
    assert.equal((await app.inject({ method: "POST", url: "/onboarding/sessions", payload: { role: "hacker" } })).statusCode, 400);
    assert.equal((await app.inject({ method: "GET", url: `/onboarding/sessions/${crypto.randomUUID()}` })).statusCode, 404);
  });
});
