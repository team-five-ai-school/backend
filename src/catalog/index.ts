import { and, arrayContains, arrayOverlaps, asc, eq, inArray, sql } from "drizzle-orm";

import type { Db, Tx } from "../db/index.ts";
import { lessons, planItems } from "../db/schema/index.ts";
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
        .orderBy(sql`(${role} = any(${lessons.roles})) desc`, asc(lessons.durationMin), asc(lessons.createdAt))
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

/** Lesson titles for plan items. */
export async function lessonTitles(db: Db, ids: string[]) {
  if (!ids.length) return new Map<string, string>();
  const rows = await db.select({ id: lessons.id, title: lessons.title }).from(lessons).where(inArray(lessons.id, ids));
  return new Map(rows.map((r) => [r.id, r.title]));
}

// Kept for the future embeddings search: lessons sharing any of the skills.
export const lessonsForSkills = (db: Db, skillSlugs: string[]) =>
  db.select().from(lessons).where(and(eq(lessons.status, "published"), arrayOverlaps(lessons.skillSlugs, skillSlugs)));
