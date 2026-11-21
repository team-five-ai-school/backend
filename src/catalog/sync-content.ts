import { and, inArray, notInArray, sql } from "drizzle-orm";

import { listCourses } from "../content/courses.ts";
import type { Db } from "../db/index.ts";
import { courses, lessons } from "../db/schema/index.ts";
import { skillSeeds } from "../seed/skills.ts";
import { contentRoleMap, excludedCoursePrefixes, skillLessons } from "./content-skill-map.ts";
import { fillSlotsWithBestLessons } from "./index.ts";

type ContentCourse = ReturnType<typeof listCourses>[number];

/** lesson id → skill slugs (inverse of `skillLessons`). */
export function lessonSkills(map: Record<string, string[]> = skillLessons) {
  const result = new Map<string, string[]>();
  for (const [skill, ids] of Object.entries(map)) {
    for (const id of ids) result.set(id, [...(result.get(id) ?? []), skill]);
  }
  return result;
}

/** Fails fast on typos and on lessons the hackathon rules exclude. */
export function validateSkillMap(
  contentCourses: ContentCourse[] = listCourses(),
  map: Record<string, string[]> = skillLessons,
) {
  const skills = new Set(skillSeeds.map((s) => s.slug));
  const lessonIds = new Set(contentCourses.flatMap((c) => c.lessons.map((l) => l.id)));
  const problems: string[] = [];
  for (const [skill, ids] of Object.entries(map)) {
    if (!skills.has(skill)) problems.push(`unknown skill "${skill}"`);
    for (const id of ids) {
      if (!lessonIds.has(id)) problems.push(`unknown lesson "${id}" (skill ${skill})`);
      if (excludedCoursePrefixes.some((p) => id.startsWith(`${p}-`))) problems.push(`excluded lesson "${id}"`);
    }
  }
  if (problems.length) throw new Error(`content-skill-map: ${problems.join("; ")}`);
}

/**
 * Roles only for role-specific courses (`stage: "role"`). Generic courses list every audience in
 * `recommended_for`; tagging them with roles would make "role match first" meaningless.
 */
const rolesFor = (course: ContentCourse) =>
  course.stage === "role"
    ? [...new Set(course.recommended_for.flatMap((audience) => contentRoleMap[audience] ?? []))]
    : [];

/**
 * Puts the tagged lessons from content/courses.json into the catalog as published lessons, so the plan
 * can pick them, and fills plan slots that were waiting for them (best lesson for the plan's role).
 * Untagged content lessons are kept as drafts. Idempotent; runs on every start.
 */
export async function syncContentLessons(db: Db, contentCourses: ContentCourse[] = listCourses()) {
  validateSkillMap(contentCourses);
  const tags = lessonSkills();
  const tagged = contentCourses.filter((c) => c.lessons.some((l) => tags.has(l.id)));

  const published = await db.transaction(async (tx) => {
    if (!tagged.length) return [];
    const courseRows = await tx
      .insert(courses)
      .values(
        tagged.map((c) => ({
          slug: c.id,
          title: c.title,
          status: "published" as const,
        })),
      )
      .onConflictDoUpdate({
        target: courses.slug,
        set: {
          title: sql`excluded.title`,
          status: sql`excluded.status`,
          updatedAt: sql`now()`,
        },
      })
      .returning({ id: courses.id, slug: courses.slug });
    const courseId = new Map(courseRows.map((r) => [r.slug, r.id]));

    const values = tagged.flatMap((c) =>
      c.lessons
        .filter((l) => tags.has(l.id))
        .map((l) => ({
          courseId: courseId.get(c.id)!,
          slug: l.id,
          title: l.title,
          skillSlugs: tags.get(l.id)!,
          roles: rolesFor(c),
          tools: c.tools,
          durationMin: l.duration_min,
          level: c.level,
          status: "published" as const,
        })),
    );
    const rows = await tx
      .insert(lessons)
      .values(values)
      .onConflictDoUpdate({
        target: lessons.slug,
        set: {
          courseId: sql`excluded.course_id`,
          title: sql`excluded.title`,
          skillSlugs: sql`excluded.skill_slugs`,
          roles: sql`excluded.roles`,
          tools: sql`excluded.tools`,
          durationMin: sql`excluded.duration_min`,
          level: sql`excluded.level`,
          status: sql`excluded.status`,
          updatedAt: sql`now()`,
        },
      })
      .returning({ id: lessons.id });

    // A content lesson whose tags were removed goes back to draft, so new plans stop picking it.
    const allContentIds = contentCourses.flatMap((c) => c.lessons.map((l) => l.id));
    await tx
      .update(lessons)
      .set({ status: "draft" })
      .where(and(inArray(lessons.slug, allContentIds), notInArray(lessons.slug, [...tags.keys()])));
    return rows;
  });

  return {
    lessons: published.length,
    filled: await fillSlotsWithBestLessons(db),
  };
}
