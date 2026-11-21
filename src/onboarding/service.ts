import { and, asc, desc, eq, isNull, max, ne, or } from "drizzle-orm";

import type { ExtractedTask } from "../ai/schemas/work-tasks.ts";
import { dbCatalogReader, lessonTitles } from "../catalog/index.ts";
import type { Db, Tx } from "../db/index.ts";
import {
  chaosMaps,
  learningPlans,
  onboardingSessions,
  planItems,
  roleTemplates,
  skills,
  users,
  workTasks,
  type ChaosMapRow,
  type LearningPlan,
  type OnboardingSession,
  type QuizAnswer,
  type RoleTemplate,
  type Skill,
  type TaskSource,
  type WorkTask,
} from "../db/schema/index.ts";
import { buildChaosMap } from "../domain/chaos-map.ts";
import { applyRerank, IdentityReranker, RuleBasedPlanBuilder, type PlanBuilder, type PlanReranker } from "../domain/plan.ts";
import { applyQuiz, publicQuiz } from "../domain/quiz.ts";

/** Expected failures the routes map to 4xx. */
export class OnboardingError extends Error {
  readonly statusCode: 404 | 409 | 400;
  constructor(statusCode: 404 | 409 | 400, message: string) {
    super(message);
    this.statusCode = statusCode;
  }
}

export type OnboardingDeps = { planBuilder?: PlanBuilder; reranker?: PlanReranker };

export function onboardingService(db: Db, deps: OnboardingDeps = {}) {
  const planBuilder = deps.planBuilder ?? new RuleBasedPlanBuilder();
  const reranker = deps.reranker ?? new IdentityReranker();

  const allSkills = () => db.select().from(skills).orderBy(asc(skills.slug));

  async function role(slug: string): Promise<RoleTemplate> {
    const [row] = await db.select().from(roleTemplates).where(eq(roleTemplates.slug, slug));
    if (!row) throw new OnboardingError(400, `Unknown role: ${slug}`);
    return row;
  }

  async function session(id: string): Promise<OnboardingSession> {
    const [row] = await db.select().from(onboardingSessions).where(eq(onboardingSessions.id, id));
    if (!row) throw new OnboardingError(404, "Onboarding session not found");
    return row;
  }

  /** Anonymous sessions are editable by id until claimed; after that only through the user's account. */
  async function editableSession(id: string) {
    const s = await session(id);
    if (s.status === "claimed") throw new OnboardingError(409, "This onboarding is already linked to an account");
    return s;
  }

  const sessionTasks = (sessionId: string) =>
    db.select().from(workTasks).where(eq(workTasks.sessionId, sessionId)).orderBy(asc(workTasks.createdAt), asc(workTasks.id));

  const roleOut = (r: RoleTemplate) => ({ slug: r.slug, title: r.title, description: r.description });

  async function sessionView(s: OnboardingSession) {
    const [r, tasks, [map], [plan]] = await Promise.all([
      role(s.roleSlug),
      sessionTasks(s.id),
      db.select().from(chaosMaps).where(eq(chaosMaps.sessionId, s.id)).orderBy(desc(chaosMaps.version)).limit(1),
      db
        .select()
        .from(learningPlans)
        .where(and(eq(learningPlans.sessionId, s.id), eq(learningPlans.status, "active")))
        .orderBy(desc(learningPlans.version))
        .limit(1),
    ]);
    return {
      sessionId: s.id,
      role: roleOut(r),
      quiz: publicQuiz(r.quiz),
      answers: s.answers,
      status: s.status,
      tasks: tasks.map(taskOut),
      chaosMap: map ? chaosMapOut(map) : null,
      plan: plan ? await planView(plan) : null,
    };
  }

  async function replaceTasks(tx: Db | Tx, s: OnboardingSession, tasks: ExtractedTask[], source: TaskSource) {
    const bySlug = new Map((await tx.select().from(skills)).map((k) => [k.slug, k]));
    await tx.delete(workTasks).where(eq(workTasks.sessionId, s.id));
    const values = tasks
      .filter((t) => bySlug.has(t.skillSlug))
      .map((t) => ({
        sessionId: s.id,
        userId: s.userId,
        title: t.title,
        skillSlug: t.skillSlug,
        chaosType: bySlug.get(t.skillSlug)!.chaosType,
        hoursPerWeek: t.hoursPerWeek,
        aiCapability: t.aiCapability,
        source,
      }));
    return values.length ? tx.insert(workTasks).values(values).returning() : [];
  }

  async function planView(plan: LearningPlan) {
    const [items, skillRows] = await Promise.all([
      db.select().from(planItems).where(eq(planItems.planId, plan.id)).orderBy(asc(planItems.order)),
      allSkills(),
    ]);
    const titles = await lessonTitles(db, items.flatMap((i) => (i.lessonId ? [i.lessonId] : [])));
    const skillTitle = new Map(skillRows.map((k) => [k.slug, k.title]));
    return {
      id: plan.id,
      version: plan.version,
      status: plan.status,
      createdAt: plan.createdAt,
      items: items.map((i) => ({
        id: i.id,
        order: i.order,
        skillSlug: i.skillSlug,
        skillTitle: skillTitle.get(i.skillSlug) ?? i.skillSlug,
        lessonId: i.lessonId,
        lessonTitle: i.lessonId ? (titles.get(i.lessonId) ?? null) : null,
        status: i.status,
        sourceTaskIds: i.sourceTaskIds,
        estimatedHoursSaved: i.estimatedHoursSaved,
        rationale: i.rationale,
      })),
    };
  }

  return {
    async listRoles() {
      const rows = await db.select().from(roleTemplates).orderBy(asc(roleTemplates.createdAt), asc(roleTemplates.slug));
      return rows.map(roleOut);
    },

    async createSession(roleSlug: string) {
      const r = await role(roleSlug);
      const [s] = await db.insert(onboardingSessions).values({ roleSlug: r.slug }).returning();
      return sessionView(s!);
    },

    async getSession(id: string) {
      return sessionView(await session(id));
    },

    async saveAnswers(id: string, answers: QuizAnswer[], validate: (quiz: RoleTemplate["quiz"]) => string | null) {
      const s = await editableSession(id);
      const r = await role(s.roleSlug);
      const problem = validate(r.quiz);
      if (problem) throw new OnboardingError(400, problem);
      const [updated] = await db.update(onboardingSessions).set({ answers }).where(eq(onboardingSessions.id, id)).returning();
      return sessionView(updated!);
    },

    /** What describe needs: role, prompt skills and the quiz-adjusted template as fallback. */
    async describeContext(id: string) {
      const s = await editableSession(id);
      const [r, skillRows] = await Promise.all([role(s.roleSlug), allSkills()]);
      return {
        session: s,
        roleTitle: r.title,
        skills: skillRows.map((k: Skill) => ({ slug: k.slug, title: k.title, description: k.description })),
        fallbackTasks: applyQuiz(r.defaultTasks, r.quiz, s.answers),
      };
    },

    async saveDescribed(s: OnboardingSession, freeText: string, tasks: ExtractedTask[], source: "llm" | "template") {
      return db.transaction(async (tx) => {
        const saved = await replaceTasks(tx, s, tasks, source);
        await tx.update(onboardingSessions).set({ freeText, status: "described" }).where(eq(onboardingSessions.id, s.id));
        return saved;
      });
    },

    /**
     * Final tasks → chaos map → plan, each saved as a new version. Tasks: the ones from describe if
     * there are any, otherwise the role template adjusted by the quiz.
     */
    async complete(id: string) {
      const s = await editableSession(id);
      const r = await role(s.roleSlug);
      return db.transaction(async (tx) => {
        let tasks: WorkTask[] = await tx.select().from(workTasks).where(eq(workTasks.sessionId, s.id)).orderBy(asc(workTasks.createdAt), asc(workTasks.id));
        if (!tasks.length) tasks = await replaceTasks(tx, s, applyQuiz(r.defaultTasks, r.quiz, s.answers), "template");

        const skillRows = await tx.select().from(skills);
        const info = new Map(skillRows.map((k) => [k.slug, k]));
        const map = buildChaosMap(tasks, (slug) => info.get(slug));
        const [mapVersion] = await tx.select({ v: max(chaosMaps.version) }).from(chaosMaps).where(eq(chaosMaps.sessionId, s.id));
        const [chaosMap] = await tx
          .insert(chaosMaps)
          .values({ sessionId: s.id, userId: s.userId, version: (mapVersion?.v ?? 0) + 1, ...map })
          .returning();

        const drafts = await planBuilder.build({ tasks, role: r.slug }, dbCatalogReader(tx));
        const ordered = applyRerank(drafts, await reranker.rerank({ candidates: drafts, role: r.slug }));
        const [planVersion] = await tx.select({ v: max(learningPlans.version) }).from(learningPlans).where(eq(learningPlans.sessionId, s.id));
        await tx.update(learningPlans).set({ status: "superseded" }).where(eq(learningPlans.sessionId, s.id));
        const [plan] = await tx
          .insert(learningPlans)
          .values({ sessionId: s.id, userId: s.userId, version: (planVersion?.v ?? 0) + 1 })
          .returning();
        if (ordered.length) await tx.insert(planItems).values(ordered.map((d) => ({ ...d, planId: plan!.id })));
        await tx.update(onboardingSessions).set({ status: "completed" }).where(eq(onboardingSessions.id, s.id));
        return { tasks, chaosMap: chaosMap!, plan: plan! };
      }).then(async ({ tasks, chaosMap, plan }) => ({
        tasks: tasks.map(taskOut),
        chaosMap: chaosMapOut(chaosMap),
        plan: await planView(plan),
      }));
    },

    /** Links the session and everything built from it to the user. Idempotent for the same user. */
    async claim(id: string, userId: string) {
      const s = await session(id);
      if (s.userId && s.userId !== userId) throw new OnboardingError(409, "This onboarding belongs to another account");
      if (s.status === "started" || s.status === "described") throw new OnboardingError(409, "Complete the onboarding first");
      await db.transaction(async (tx) => {
        await tx.update(onboardingSessions).set({ userId, status: "claimed" }).where(eq(onboardingSessions.id, id));
        await tx.update(workTasks).set({ userId }).where(eq(workTasks.sessionId, id));
        await tx.update(chaosMaps).set({ userId }).where(eq(chaosMaps.sessionId, id));
        // Plans from the user's earlier onboardings step aside for this one.
        await tx
          .update(learningPlans)
          .set({ status: "superseded" })
          .where(and(eq(learningPlans.userId, userId), or(ne(learningPlans.sessionId, id), isNull(learningPlans.sessionId))));
        await tx.update(learningPlans).set({ userId }).where(eq(learningPlans.sessionId, id));
        await tx
          .update(users)
          .set({ onboardingCompletedAt: new Date() })
          .where(and(eq(users.id, userId), isNull(users.onboardingCompletedAt)));
      });
      return sessionView(await session(id));
    },

    async planForUser(userId: string) {
      const [plan] = await db
        .select()
        .from(learningPlans)
        .where(and(eq(learningPlans.userId, userId), eq(learningPlans.status, "active")))
        .orderBy(desc(learningPlans.createdAt))
        .limit(1);
      return plan ? planView(plan) : null;
    },

    async chaosMapForUser(userId: string) {
      const [row] = await db
        .select()
        .from(chaosMaps)
        .where(eq(chaosMaps.userId, userId))
        .orderBy(desc(chaosMaps.createdAt), desc(chaosMaps.version))
        .limit(1);
      return row ? chaosMapOut(row) : null;
    },

    async userOwnsTask(userId: string, taskId: string) {
      const [row] = await db
        .select({ id: workTasks.id })
        .from(workTasks)
        .where(and(eq(workTasks.id, taskId), eq(workTasks.userId, userId)));
      return Boolean(row);
    },
  };
}

export type OnboardingService = ReturnType<typeof onboardingService>;

const taskOut = (t: WorkTask) => ({
  id: t.id,
  title: t.title,
  skillSlug: t.skillSlug,
  chaosType: t.chaosType,
  hoursPerWeek: t.hoursPerWeek,
  aiCapability: t.aiCapability,
  source: t.source,
});

const chaosMapOut = (m: ChaosMapRow) => ({
  id: m.id,
  version: m.version,
  lanes: m.lanes,
  totals: m.totals,
  createdAt: m.createdAt,
});
