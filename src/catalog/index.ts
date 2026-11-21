import { and, arrayContains, arrayOverlaps, asc, eq, inArray, sql } from "drizzle-orm";

import type { Db, Tx } from "../db/index.ts";
import { learningPlans, lessons, onboardingSessions, planItems } from "../db/schema/index.ts";
import type { CatalogReader, LessonRef } from "../domain/plan.ts";
import type { SlotRepo } from "../domain/slots.ts";

/** CatalogReader over Postgres: published lessons tagged with the skill (GIN index on skill_slugs). */
export function dbCatalogReader(db: Db | Tx): CatalogReader {
  return {
    async bestLessonFor(skillSlug, role): Promise<LessonRef | null> {
      const [row] = await db
        .select({ id: lessons.id, title: lessons.title, durationMin: lessons.durationMin })
        .from(lessons)
        .where(and(eq(lessons.status, "published"), arrayContains(lessons.skillSlugs, [skillSlug])))
        // Own role first, then generic lessons (no roles), then lessons made for other roles; shorter first.
        .orderBy(
          sql`(${role} = any(${lessons.roles})) desc`,
          sql`(cardinality(${lessons.roles}) = 0) desc`,
          asc(lessons.durationMin),
          asc(lessons.slug),
        )
        .limit(1);
      return row ?? null;
    },
  };
}

export function dbSlotRepo(db: Db): SlotRepo {
  return {
    async findPublishedLesson(lessonId) {
      const [row] = await db
        .select({ id: lessons.id, skillSlugs: lessons.skillSlugs })
        .from(lessons)
        .where(and(eq(lessons.id, lessonId), eq(lessons.status, "published")));
      return row ?? null;
    },
    async fillSlots(skillSlugs, lessonId) {
      const updated = await db
        .update(planItems)
        .set({ lessonId, status: "ready" })
        .where(and(eq(planItems.status, "slot"), inArray(planItems.skillSlug, skillSlugs)))
        .returning({ id: planItems.id });
      return updated.length;
    },
  };
}

/** Title and slug (content lesson id, used in /lessons/:id) for plan items. */
export async function lessonRefs(db: Db, ids: string[]) {
  if (!ids.length) return new Map<string, { title: string; slug: string }>();
  const rows = await db
    .select({ id: lessons.id, title: lessons.title, slug: lessons.slug })
    .from(lessons)
    .where(inArray(lessons.id, ids));
  return new Map(rows.map((r) => [r.id, { title: r.title, slug: r.slug }]));
}

/**
 * Gives every open slot the best published lesson for its skill and the plan's role (same choice as a
 * new plan). Used after bulk catalog changes, where "first published wins" would pick at random.
 * Idempotent: only `slot` items change.
 */
export async function fillSlotsWithBestLessons(db: Db) {
  const slots = await db
    .select({
      id: planItems.id,
      skillSlug: planItems.skillSlug,
      role: onboardingSessions.roleSlug,
    })
    .from(planItems)
    .innerJoin(learningPlans, eq(planItems.planId, learningPlans.id))
    .innerJoin(onboardingSessions, eq(learningPlans.sessionId, onboardingSessions.id))
    .where(eq(planItems.status, "slot"));
  const reader = dbCatalogReader(db);
  let filled = 0;
  for (const slot of slots) {
    const lesson = await reader.bestLessonFor(slot.skillSlug, slot.role);
    if (!lesson) continue;
    const updated = await db
      .update(planItems)
      .set({ lessonId: lesson.id, status: "ready" })
      .where(and(eq(planItems.id, slot.id), eq(planItems.status, "slot")))
      .returning({ id: planItems.id });
    filled += updated.length;
  }
  return filled;
}

// Kept for the future embeddings search: lessons sharing any of the skills.
export const lessonsForSkills = (db: Db, skillSlugs: string[]) =>
  db.select().from(lessons).where(and(eq(lessons.status, "published"), arrayOverlaps(lessons.skillSlugs, skillSlugs)));
