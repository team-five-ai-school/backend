import { onboardingConfig } from "../config/onboarding.ts";
import type { AiCapability, PlanItemStatus } from "../db/schema/index.ts";
import { aiHours, type AiFactors } from "./chaos-map.ts";

export type PlanTaskInput = { id: string; skillSlug: string; hoursPerWeek: number; aiCapability: AiCapability };
export type LessonRef = { id: string; title: string; durationMin: number };

export type PlanItemDraft = {
  order: number;
  skillSlug: string;
  lessonId: string | null;
  status: PlanItemStatus;
  sourceTaskIds: string[];
  estimatedHoursSaved: number;
  rationale: string | null;
};

/** Read side of the catalog the plan needs. Implemented over the DB in src/catalog/reader.ts. */
export interface CatalogReader {
  /**
   * Best published lesson for a skill: one made for this role, then a generic one (no roles), then one
   * made for another role; within each group the shorter lesson. null = none yet.
   */
  bestLessonFor(skillSlug: string, role: string): Promise<LessonRef | null>;
}

export interface PlanBuilder {
  build(input: { tasks: PlanTaskInput[]; role: string }, catalog: CatalogReader): Promise<PlanItemDraft[]>;
}

/**
 * v0: rank skills by the hours AI can take over (hoursPerWeek × factor). Tasks AI cannot do (`human`)
 * stay out of the plan. Each skill gets its best published lesson, or becomes a slot (lessonId = null)
 * that the `lesson.published` event fills later.
 */
export class RuleBasedPlanBuilder implements PlanBuilder {
  private readonly factors: AiFactors;
  constructor(factors: AiFactors = onboardingConfig.aiFactors) {
    this.factors = factors;
  }

  async build({ tasks, role }: { tasks: PlanTaskInput[]; role: string }, catalog: CatalogReader) {
    const bySkill = new Map<string, { hours: number; taskIds: string[] }>();
    for (const t of tasks) {
      const saved = aiHours(t, this.factors);
      if (saved <= 0) continue;
      const entry = bySkill.get(t.skillSlug) ?? { hours: 0, taskIds: [] };
      entry.hours += saved;
      entry.taskIds.push(t.id);
      bySkill.set(t.skillSlug, entry);
    }
    const ranked = [...bySkill].sort(([a, x], [b, y]) => y.hours - x.hours || a.localeCompare(b));
    // Sequential on purpose: the reader may run inside a DB transaction (one connection).
    const lessons: (LessonRef | null)[] = [];
    for (const [slug] of ranked) lessons.push(await catalog.bestLessonFor(slug, role));
    return ranked.map(([skillSlug, { hours, taskIds }], i): PlanItemDraft => {
      const lesson = lessons[i] ?? null;
      return {
        order: i + 1,
        skillSlug,
        lessonId: lesson?.id ?? null,
        status: lesson ? "ready" : "slot",
        sourceTaskIds: taskIds,
        estimatedHoursSaved: Math.round(hours * 10) / 10,
        rationale: null,
      };
    });
  }
}

/* ───────── Reranking (extension point) ───────── */

/** Candidates are identified by skill slug (unique within one plan). */
export type RerankResult = { order: string[]; rationale?: Record<string, string> };

/**
 * Reorders plan candidates. The future LLM version receives only candidate ids (plus context) and
 * returns an order and a rationale per id; `applyRerank` enforces that it cannot add anything.
 */
export interface PlanReranker {
  rerank(input: { candidates: PlanItemDraft[]; role: string }): Promise<RerankResult>;
}

/** Stub: keeps the rule-based order. */
export class IdentityReranker implements PlanReranker {
  async rerank({ candidates }: { candidates: PlanItemDraft[]; role: string }) {
    return { order: candidates.map((c) => c.skillSlug) };
  }
}

/** Applies a rerank result: unknown or duplicate ids are dropped, missing candidates keep their relative order at the end. */
export function applyRerank(candidates: PlanItemDraft[], result: RerankResult): PlanItemDraft[] {
  const byId = new Map(candidates.map((c) => [c.skillSlug, c]));
  const picked: PlanItemDraft[] = [];
  for (const id of result.order) {
    const c = byId.get(id);
    if (!c) continue;
    picked.push({ ...c, rationale: result.rationale?.[id]?.slice(0, 300) ?? c.rationale });
    byId.delete(id);
  }
  return [...picked, ...byId.values()].map((c, i) => ({ ...c, order: i + 1 }));
}
