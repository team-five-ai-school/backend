/** Storage the slot filler needs. The DB version lives in src/catalog/slot-repo.ts; tests use an in-memory one. */
export interface SlotRepo {
  findPublishedLesson(lessonId: string): Promise<{ id: string; skillSlugs: string[] } | null>;
  /** Sets lessonId + status `ready` on plan items with status `slot` and one of these skills. Returns how many changed. */
  fillSlots(skillSlugs: string[], lessonId: string): Promise<number>;
}

/**
 * Handler for `lesson.published`: plan slots for the lesson's skills get the lesson.
 * Idempotent: only items still in `slot` change, so a repeated event changes nothing.
 */
export async function fillSlotsForLesson(lessonId: string, repo: SlotRepo): Promise<number> {
  const lesson = await repo.findPublishedLesson(lessonId);
  if (!lesson || lesson.skillSlugs.length === 0) return 0;
  return repo.fillSlots(lesson.skillSlugs, lesson.id);
}
