import { and, eq } from "drizzle-orm";
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";

import { askMentor, reviewMistake } from "../ai/mentor.ts";
import { MentorAskBody, MentorMessage } from "../ai/schemas/mentor.ts";
import { getExercise, getLesson } from "../content/courses.ts";
import { db } from "../db/index.ts";
import { exerciseAttempts } from "../db/schema/index.ts";
import { error, ErrorBody, secured } from "../lib/http.ts";
import { requireAuth } from "../plugins/auth.ts";

/**
 * Lesson Mentor (contract: frontend src/features/mentor/mentor-transport.ts).
 *   POST /mentor/mistakes/:mistakeId/review → MentorMessage (never fails on a model error: hint-based fallback)
 *   POST /mentor/messages                   → MentorMessage; 501 when no mentor model is configured
 *                                             (the frontend then answers from the lesson cards), 503 on model failure
 */

/** Exercises the learner has unlocked in a lesson: answered correctly, or tried at least twice. */
async function revealedExercises(userId: string, lessonId: string) {
  const rows = await db
    .select({ exerciseId: exerciseAttempts.exerciseId, attempt: exerciseAttempts.attempt, verdict: exerciseAttempts.verdict })
    .from(exerciseAttempts)
    .where(and(eq(exerciseAttempts.userId, userId), eq(exerciseAttempts.lessonId, lessonId)));
  return new Set(rows.filter((r) => r.verdict === "correct" || r.attempt >= 2).map((r) => r.exerciseId));
}

export const mentorRoutes: FastifyPluginAsyncZod = async (app) => {
  app.post(
    "/mentor/mistakes/:mistakeId/review",
    {
      onRequest: requireAuth,
      schema: {
        tags: ["mentor"],
        security: secured,
        params: z.object({ mistakeId: z.uuid() }),
        response: { 200: MentorMessage, 404: ErrorBody },
      },
    },
    async (req, reply) => {
      // The stored attempt, not anything from the client: the answer can't be forged.
      const [attempt] = await db
        .select()
        .from(exerciseAttempts)
        .where(and(eq(exerciseAttempts.id, req.params.mistakeId), eq(exerciseAttempts.userId, req.user.sub)));
      if (!attempt || attempt.verdict === "correct") return reply.code(404).send(error("Mistake not found"));
      const found = getLesson(attempt.lessonId);
      const exercise = getExercise(attempt.exerciseId);
      if (!found || !exercise) return reply.code(404).send(error("Lesson not found"));

      const { message } = await reviewMistake({
        lesson: found.lesson,
        exercise: exercise.exercise,
        attempt,
        revealed: await revealedExercises(req.user.sub, attempt.lessonId),
        log: req.log,
      });
      return message;
    },
  );

  app.post(
    "/mentor/messages",
    {
      onRequest: requireAuth,
      schema: {
        tags: ["mentor"],
        security: secured,
        body: MentorAskBody,
        response: { 200: MentorMessage, 400: ErrorBody, 501: ErrorBody, 503: ErrorBody },
      },
    },
    async (req, reply) => {
      const lessonId = req.body.context.lessonId;
      const found = lessonId ? getLesson(lessonId) : undefined;
      if (!found) return reply.code(400).send(error("The Mentor needs a lesson to talk about"));

      const result = await askMentor({
        lesson: found.lesson,
        body: req.body,
        revealed: await revealedExercises(req.user.sub, found.lesson.id),
        log: req.log,
      });
      if (result.ok) return result.message;
      return result.configured
        ? reply.code(503).send(error("The Mentor couldn't answer. Try again."))
        : reply.code(501).send(error("The Mentor model is not configured"));
    },
  );
};
