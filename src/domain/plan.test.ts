import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { applyRerank, IdentityReranker, RuleBasedPlanBuilder, type CatalogReader, type LessonRef, type PlanTaskInput } from "./plan.ts";

type FakeLesson = LessonRef & { skillSlugs: string[]; roles: string[]; published: boolean };

/** Same rules as the DB reader: published, has the skill; role match first, then shorter. */
function fakeCatalog(lessons: FakeLesson[]): CatalogReader {
  return {
    async bestLessonFor(skill, role) {
      const candidates = lessons
        .filter((l) => l.published && l.skillSlugs.includes(skill))
        .sort((a, b) => Number(b.roles.includes(role)) - Number(a.roles.includes(role)) || a.durationMin - b.durationMin);
      const best = candidates[0];
      return best ? { id: best.id, title: best.title, durationMin: best.durationMin } : null;
    },
  };
}

const tasks: PlanTaskInput[] = [
  { id: "t1", skillSlug: "extract", hoursPerWeek: 5, aiCapability: "auto" }, // 4
  { id: "t2", skillSlug: "remind", hoursPerWeek: 3, aiCapability: "auto" }, // 2.4
  { id: "t3", skillSlug: "report", hoursPerWeek: 2, aiCapability: "assist" }, // 0.8
  { id: "t4", skillSlug: "remind", hoursPerWeek: 2, aiCapability: "assist" }, // +0.8 → 3.2
  { id: "t5", skillSlug: "faq", hoursPerWeek: 10, aiCapability: "human" }, // 0 → not in the plan
];

describe("RuleBasedPlanBuilder", () => {
  it("ranks skills by hours AI can take, skips human tasks and makes slots when no lesson exists", async () => {
    const plan = await new RuleBasedPlanBuilder().build({ tasks, role: "accountant" }, fakeCatalog([]));
    assert.deepEqual(
      plan.map((p) => [p.order, p.skillSlug, p.estimatedHoursSaved, p.status, p.lessonId]),
      [
        [1, "extract", 4, "slot", null],
        [2, "remind", 3.2, "slot", null],
        [3, "report", 0.8, "slot", null],
      ],
    );
    assert.deepEqual(plan[1]!.sourceTaskIds, ["t2", "t4"]);
    assert.ok(!plan.some((p) => p.skillSlug === "faq"));
  });

  it("picks a published lesson: role match first, then the shorter one", async () => {
    const catalog = fakeCatalog([
      { id: "L-short-other-role", title: "a", durationMin: 3, skillSlugs: ["extract"], roles: ["sales_manager"], published: true },
      { id: "L-long-my-role", title: "b", durationMin: 9, skillSlugs: ["extract"], roles: ["accountant"], published: true },
      { id: "L-short-my-role-draft", title: "c", durationMin: 2, skillSlugs: ["extract"], roles: ["accountant"], published: false },
      { id: "L-remind-5", title: "d", durationMin: 5, skillSlugs: ["remind"], roles: [], published: true },
      { id: "L-remind-4", title: "e", durationMin: 4, skillSlugs: ["remind"], roles: [], published: true },
    ]);
    const plan = await new RuleBasedPlanBuilder().build({ tasks, role: "accountant" }, catalog);
    assert.equal(plan[0]!.lessonId, "L-long-my-role");
    assert.equal(plan[0]!.status, "ready");
    assert.equal(plan[1]!.lessonId, "L-remind-4");
    assert.equal(plan[2]!.status, "slot");
  });
});

describe("applyRerank", () => {
  const drafts = [
    { order: 1, skillSlug: "a", lessonId: null, status: "slot" as const, sourceTaskIds: [], estimatedHoursSaved: 3, rationale: null },
    { order: 2, skillSlug: "b", lessonId: null, status: "slot" as const, sourceTaskIds: [], estimatedHoursSaved: 2, rationale: null },
    { order: 3, skillSlug: "c", lessonId: null, status: "slot" as const, sourceTaskIds: [], estimatedHoursSaved: 1, rationale: null },
  ];

  it("identity reranker keeps the order", async () => {
    const result = applyRerank(drafts, await new IdentityReranker().rerank({ candidates: drafts, role: "x" }));
    assert.deepEqual(result.map((d) => d.skillSlug), ["a", "b", "c"]);
  });

  it("drops ids that are not candidates and duplicates, appends missing candidates, renumbers", () => {
    const result = applyRerank(drafts, { order: ["c", "invented", "a", "c"], rationale: { c: "why c", invented: "x" } });
    assert.deepEqual(result.map((d) => [d.order, d.skillSlug, d.rationale]), [
      [1, "c", "why c"],
      [2, "a", null],
      [3, "b", null],
    ]);
  });
});
