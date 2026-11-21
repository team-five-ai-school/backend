import { and, asc, eq } from "drizzle-orm";
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";

import { AnswerBody, checkAnswer, exerciseIds, getExercise, getLesson, listCourses, NodeStatus, type Checked } from "../content/courses.ts";
import { db } from "../db/index.ts";
import { exerciseAttempts, lessonCompletions, type ExerciseAttempt } from "../db/schema/index.ts";
import { error, ErrorBody, secured } from "../lib/http.ts";
import { requireAuth } from "../plugins/auth.ts";

const AnswerResult = z.object({
  exerciseId: z.string(),
  verdict: z.enum(["correct", "incorrect", "partial"]),
  feedback: z.string(),
  correctOptionIds: z.array(z.string()).nullable(),
  /** Attempt row id when the answer is not correct: the mistake the mentor will pick up. */
  mistakeId: z.string().nullable(),
  attempt: z.number().int(),
  cardResults: z.array(z.boolean()).nullable(),
  cardExplanations: z.array(z.string()).nullable(),
  /** true once the answer is revealed (correct, or attempt 2+). */
  final: z.boolean(),
});

/**
 * Attempt flow (docs/spec.md → Exercise answers): attempt 1 wrong → only the hint, nothing that reveals
 * the answer; correct or attempt 2+ → explanation and correct answer.
 */
function toResult(exerciseId: string, row: ExerciseAttempt, checked: Checked): z.infer<typeof AnswerResult> {
  const final = row.verdict === "correct" || row.attempt >= 2;
  return {
    exerciseId,
    verdict: row.verdict as Checked["verdict"],
    feedback: final ? checked.explanation : checked.hint,
    correctOptionIds: final ? checked.correctOptionIds : null,
    mistakeId: row.verdict === "correct" ? null : row.id,
    attempt: row.attempt,
    cardResults: final ? checked.cardResults : null,
    cardExplanations: final ? checked.cardExplanations : null,
    final,
  };
}

export const progressRoutes: FastifyPluginAsyncZod = async (app) => {
  app.get(
    "/me/progress",
    {
      onRequest: requireAuth,
      schema: {
        tags: ["progress"],
        security: secured,
        response: {
          200: z.object({
            completedLessonIds: z.array(z.string()),
            courses: z.record(z.string(), z.object({ progressPercent: z.number(), status: NodeStatus })),
          }),
        },
      },
    },
    async (req) => {
      const rows = await db.select().from(lessonCompletions).where(eq(lessonCompletions.userId, req.user.sub));
      const done = new Set(rows.map((r) => r.lessonId));
      const courses: Record<string, { progressPercent: number; status: z.infer<typeof NodeStatus> }> = {};
      for (const c of listCourses()) {
        const n = c.lessons.filter((l) => done.has(l.id)).length;
        const progressPercent = Math.round((n / c.lessons.length) * 100);
        courses[c.id] = { progressPercent, status: n === 0 ? "available" : n === c.lessons.length ? "completed" : "in_progress" };
      }
      return { completedLessonIds: [...done], courses };
    },
  );

  app.post(
    "/lessons/:lessonId/exercises/:exerciseId/answer",
    {
      onRequest: requireAuth,
      schema: {
        tags: ["progress"],
        security: secured,
        params: z.object({ lessonId: z.string(), exerciseId: z.string() }),
        body: AnswerBody,
        response: { 200: AnswerResult, 400: ErrorBody, 404: ErrorBody, 409: ErrorBody },
      },
    },
    async (req, reply) => {
      const { lessonId, exerciseId } = req.params;
      const found = getExercise(exerciseId);
      if (!found || found.lessonId !== lessonId) return reply.code(404).send(error("Exercise not found"));

      const previous = await db
        .select()
        .from(exerciseAttempts)
        .where(and(eq(exerciseAttempts.userId, req.user.sub), eq(exerciseAttempts.exerciseId, exerciseId)))
        .orderBy(asc(exerciseAttempts.attempt));

      // Already solved: return the stored result, no new attempt.
      const solved = previous.find((a) => a.verdict === "correct");
      if (solved) {
        const checked = checkAnswer(found.exercise, solved.answer as AnswerBody)!;
        return toResult(exerciseId, solved, checked);
      }

      const checked = checkAnswer(found.exercise, req.body);
      if (!checked) return reply.code(400).send(error("Answer does not match this exercise type"));

      const [row] = await db
        .insert(exerciseAttempts)
        .values({
          userId: req.user.sub,
          lessonId,
          exerciseId,
          attempt: previous.length + 1,
          verdict: checked.verdict,
          answer: req.body,
        })
        .onConflictDoNothing()
        .returning();
      // A parallel request took this attempt number (double click).
      if (!row) return reply.code(409).send(error("Answer already submitted, try again"));
      return toResult(exerciseId, row, checked);
    },
  );

  app.post(
    "/lessons/:lessonId/complete",
    {
      onRequest: requireAuth,
      schema: {
        tags: ["progress"],
        security: secured,
        params: z.object({ lessonId: z.string() }),
        response: {
          200: z.object({ correctFirstTry: z.number().int(), total: z.number().int(), nextLessonId: z.string().nullable() }),
          404: ErrorBody,
          409: ErrorBody,
        },
      },
    },
    async (req, reply) => {
      const found = getLesson(req.params.lessonId);
      if (!found) return reply.code(404).send(error("Lesson not found"));
      const ids = exerciseIds(found.lesson);
      const attempts = await db
        .select()
        .from(exerciseAttempts)
        .where(and(eq(exerciseAttempts.userId, req.user.sub), eq(exerciseAttempts.lessonId, found.lesson.id)));
      const answered = new Set(attempts.map((a) => a.exerciseId));
      if (ids.some((id) => !answered.has(id))) return reply.code(409).send(error("Answer every exercise first"));

      const correctFirstTry = ids.filter((id) =>
        attempts.some((a) => a.exerciseId === id && a.attempt === 1 && a.verdict === "correct"),
      ).length;
      await db
        .insert(lessonCompletions)
        .values({ userId: req.user.sub, lessonId: found.lesson.id, courseId: found.course.id, correctFirstTry, total: ids.length })
        .onConflictDoUpdate({
          target: [lessonCompletions.userId, lessonCompletions.lessonId],
          set: { correctFirstTry, total: ids.length, completedAt: new Date() },
        });
      return { correctFirstTry, total: ids.length, nextLessonId: found.nextLessonId };
    },
  );
};
