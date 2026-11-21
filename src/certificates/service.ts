import { and, eq } from "drizzle-orm";

import { getCourse } from "../content/courses.ts";
import type { Db } from "../db/index.ts";
import { certificates, lessonCompletions, users, type Certificate } from "../db/schema/index.ts";

/**
 * Issues the certificate for `courseId` if the user has completed every lesson of it.
 * Idempotent: one certificate per user and course, a repeat call returns the existing one.
 * Returns null while the course is not complete (or the course does not exist).
 */
export async function issueCertificateIfComplete(db: Db, userId: string, courseId: string): Promise<Certificate | null> {
  const course = getCourse(courseId);
  if (!course || course.lessons.length === 0) return null;

  const done = await db
    .select({ lessonId: lessonCompletions.lessonId })
    .from(lessonCompletions)
    .where(and(eq(lessonCompletions.userId, userId), eq(lessonCompletions.courseId, courseId)));
  const doneIds = new Set(done.map((r) => r.lessonId));
  if (!course.lessons.every((l) => doneIds.has(l.id))) return null;

  const [created] = await db.insert(certificates).values({ userId, courseId }).onConflictDoNothing().returning();
  if (created) return created;
  const [existing] = await db
    .select()
    .from(certificates)
    .where(and(eq(certificates.userId, userId), eq(certificates.courseId, courseId)));
  return existing ?? null;
}

export type CertificateView = {
  id: string;
  courseId: string;
  /** Live: the holder's current account name. */
  holderName: string;
  certificateName: string;
  courseTitle: string;
  issuedAt: Date;
};

function toView(row: { cert: Certificate; holderName: string }): CertificateView | null {
  const course = getCourse(row.cert.courseId);
  if (!course) return null;
  return {
    id: row.cert.id,
    courseId: course.id,
    holderName: row.holderName,
    certificateName: course.certificate,
    courseTitle: course.title,
    issuedAt: row.cert.issuedAt,
  };
}

export async function listCertificates(db: Db, userId: string): Promise<CertificateView[]> {
  const rows = await db
    .select({ cert: certificates, holderName: users.name })
    .from(certificates)
    .innerJoin(users, eq(users.id, certificates.userId))
    .where(eq(certificates.userId, userId))
    .orderBy(certificates.issuedAt);
  return rows.map(toView).filter((v): v is CertificateView => v !== null);
}

/** Public lookup by Verification link id. */
export async function getCertificate(db: Db, id: string): Promise<CertificateView | null> {
  const [row] = await db
    .select({ cert: certificates, holderName: users.name })
    .from(certificates)
    .innerJoin(users, eq(users.id, certificates.userId))
    .where(eq(certificates.id, id));
  return row ? toView(row) : null;
}
