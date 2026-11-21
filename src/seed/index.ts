import { sql } from "drizzle-orm";

import { db } from "../db/index.ts";
import { roleTemplates, skills } from "../db/schema/index.ts";
import { roleSeeds } from "./roles.ts";
import { skillSeeds } from "./skills.ts";

/** Upserts the skill taxonomy and role templates. Idempotent; runs on every start after migrations. */
export async function seedReferenceData() {
  validateSeeds();
  await db.transaction(async (tx) => {
    await tx
      .insert(skills)
      .values(skillSeeds)
      .onConflictDoUpdate({
        target: skills.slug,
        set: {
          title: sql`excluded.title`,
          chaosType: sql`excluded.chaos_type`,
          description: sql`excluded.description`,
          roles: sql`excluded.roles`,
          tools: sql`excluded.tools`,
          updatedAt: sql`now()`,
        },
      });
    await tx
      .insert(roleTemplates)
      .values(roleSeeds)
      .onConflictDoUpdate({
        target: roleTemplates.slug,
        set: {
          title: sql`excluded.title`,
          description: sql`excluded.description`,
          quiz: sql`excluded.quiz`,
          defaultTasks: sql`excluded.default_tasks`,
          updatedAt: sql`now()`,
        },
      });
  });
}

/** Fails fast on typos: every skill slug used by a role must exist. */
export function validateSeeds() {
  const known = new Set(skillSeeds.map((s) => s.slug));
  for (const role of roleSeeds) {
    const used = [
      ...role.defaultTasks.map((t) => t.skillSlug),
      ...role.quiz.flatMap((q) => q.options.flatMap((o) => Object.keys(o.effect?.multiply ?? {}))),
    ];
    const unknown = used.filter((slug) => !known.has(slug));
    if (unknown.length) throw new Error(`Role "${role.slug}" uses unknown skills: ${[...new Set(unknown)].join(", ")}`);
  }
}

// `npm run db:seed`
if (import.meta.main) {
  await seedReferenceData();
  console.log("Reference data seeded");
  await db.$client.end();
}
