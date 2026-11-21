// DEV ONLY: completes the first courses for an existing user and issues their certificates.
// Usage: DATABASE_URL=postgresql://...localhost... node src/seed/demo-certificates.ts [email] [fullCourses=3]
// Refuses to run unless the database host is local (override: ALLOW_REMOTE_SEED=1). Idempotent.
import { eq } from "drizzle-orm";

import { issueCertificateIfComplete } from "../certificates/service.ts";
import { listCourses } from "../content/courses.ts";
import { db } from "../db/index.ts";
import { lessonCompletions, users } from "../db/schema/index.ts";

const host = new URL(process.env.DATABASE_URL ?? "postgresql://localhost").hostname;
if (!["localhost", "127.0.0.1"].includes(host) && process.env.ALLOW_REMOTE_SEED !== "1") throw new Error(`Refusing to seed demo data into non-local database (${host}). Set ALLOW_REMOTE_SEED=1 to override`);

const email = (process.argv[2] ?? "admin@example.com").toLowerCase();
const fullCourses = Number(process.argv[3] ?? 3);

const [user] = await db.select().from(users).where(eq(users.email, email));
if (!user) throw new Error(`No user ${email}. Register it first.`);

const courses = listCourses();
for (const [i, course] of courses.slice(0, fullCourses + 1).entries()) {
  // The last course is only partly done, so the list shows both a certificate and a course in progress.
  const lessons = i < fullCourses ? course.lessons : course.lessons.slice(0, 1);
  await db
    .insert(lessonCompletions)
    .values(lessons.map((l) => ({ userId: user.id, lessonId: l.id, courseId: course.id, correctFirstTry: 4, total: 5 })))
    .onConflictDoNothing();
  const cert = await issueCertificateIfComplete(db, user.id, course.id);
  console.log(`${course.id}: ${cert ? `certificate ${cert.id}` : "in progress, no certificate"}`);
}
await db.$client.end();
