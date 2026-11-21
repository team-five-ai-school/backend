import { eq, inArray } from "drizzle-orm";
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";

import { db } from "../db/index.ts";
import { CONTENT_STATUSES, courses, lessons, SKILL_LEVELS, skills } from "../db/schema/index.ts";
import type { DomainEvents } from "../events/index.ts";
import { error, ErrorBody, IdParams, secured } from "../lib/http.ts";
import { requireRole } from "../plugins/auth.ts";

const tags = ["catalog"];
const Slug = z.string().regex(/^[a-z0-9][a-z0-9-_]{0,79}$/);

const CourseOut = z.object({ id: z.uuid(), slug: z.string(), title: z.string(), status: z.enum(CONTENT_STATUSES) });
const LessonOut = z.object({
  id: z.uuid(),
  courseId: z.uuid(),
  slug: z.string(),
  title: z.string(),
  skillSlugs: z.array(z.string()),
  roles: z.array(z.string()),
  tools: z.array(z.string()),
  durationMin: z.number().int(),
  level: z.enum(SKILL_LEVELS).nullable(),
  status: z.enum(CONTENT_STATUSES),
});

/**
 * Catalog skeleton (admin only): no content yet, just enough to tag lessons with skills and publish them.
 * Publishing emits `lesson.published`, which fills matching plan slots.
 */
export const catalogRoutes: FastifyPluginAsyncZod<{ events: DomainEvents }> = async (app, { events }) => {
  app.addHook("onRequest", requireRole("admin"));

  app.post(
    "/catalog/courses",
    {
      schema: {
        tags,
        security: secured,
        body: z.object({ slug: Slug, title: z.string().trim().min(1).max(200) }),
        response: { 201: CourseOut, 409: ErrorBody },
      },
    },
    async (req, reply) => {
      const [course] = await db.insert(courses).values(req.body).onConflictDoNothing().returning();
      if (!course) return reply.code(409).send(error("A course with this slug already exists"));
      return reply.code(201).send(course);
    },
  );

  app.post(
    "/catalog/lessons",
    {
      schema: {
        tags,
        security: secured,
        body: z.object({
          courseId: z.uuid(),
          slug: Slug,
          title: z.string().trim().min(1).max(200),
          skillSlugs: z.array(Slug).min(1).max(10),
          roles: z.array(Slug).max(20).default([]),
          tools: z.array(Slug).max(20).default([]),
          durationMin: z.number().int().min(1).max(240),
          level: z.enum(SKILL_LEVELS).optional(),
        }),
        response: { 201: LessonOut, 400: ErrorBody, 409: ErrorBody },
      },
    },
    async (req, reply) => {
      const known = await db.select({ slug: skills.slug }).from(skills).where(inArray(skills.slug, req.body.skillSlugs));
      if (known.length !== new Set(req.body.skillSlugs).size) return reply.code(400).send(error("Unknown skill slug"));
      const [course] = await db.select({ id: courses.id }).from(courses).where(eq(courses.id, req.body.courseId));
      if (!course) return reply.code(400).send(error("Unknown course"));
      const [lesson] = await db.insert(lessons).values(req.body).onConflictDoNothing().returning();
      if (!lesson) return reply.code(409).send(error("A lesson with this slug already exists"));
      return reply.code(201).send(lesson);
    },
  );

  app.post(
    "/catalog/lessons/:id/publish",
    { schema: { tags, security: secured, params: IdParams, response: { 200: LessonOut, 404: ErrorBody } } },
    async (req, reply) => {
      const [lesson] = await db.update(lessons).set({ status: "published" }).where(eq(lessons.id, req.params.id)).returning();
      if (!lesson) return reply.code(404).send(error("Lesson not found"));
      // Fills plan slots for the lesson's skills. Idempotent: publishing twice changes nothing more.
      await events.publish("lesson.published", { lessonId: lesson.id });
      return lesson;
    },
  );
};
