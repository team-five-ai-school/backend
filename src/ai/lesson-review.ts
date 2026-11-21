import { generateText, NoObjectGeneratedError, Output, type LanguageModel } from "ai";
import { z } from "zod";

import type { SourceExercise, SourceLesson } from "../content/courses.ts";
import { describeError, logAiCall, type AiLogger } from "./log.ts";
import { aiTimeoutMs, getModel, type ResolvedModel } from "./models.ts";
import { describeAnswer, lessonReviewSystemPrompt } from "./prompts/mentor.ts";

/**
 * End-of-lesson review → journal entry (docs/spec.md → Lesson summary and journal).
 * Code computes the numbers (scores per skill, strengths, weak spots) from the stored attempts;
 * the model only writes `summary` and `recommendations`. Never fails: falls back to text built by code.
 */

export const JournalEntry = z.object({
  lessonId: z.string(),
  courseId: z.string(),
  lessonTitle: z.string(),
  correctFirstTry: z.number().int(),
  total: z.number().int(),
  skills: z.array(z.object({ skill: z.string(), correct: z.number().int(), total: z.number().int() })),
  strengths: z.array(z.string()),
  weakSpots: z.array(z.object({ exerciseId: z.string(), question: z.string(), skill: z.string() })),
  summary: z.string(),
  recommendations: z.array(z.string()),
  source: z.enum(["llm", "fallback"]),
  createdAt: z.string(),
});
export type JournalEntry = z.infer<typeof JournalEntry>;

const ReviewText = z.object({
  summary: z.string().describe("1–2 sentences on how the lesson went"),
  recommendations: z.array(z.string()).describe("1–3 concrete next steps, each tied to a real mistake or strength"),
});

type Attempt = { exerciseId: string; attempt: number; verdict: string; answer: unknown };

export type LessonReviewInput = {
  lesson: SourceLesson;
  courseId: string;
  attempts: Attempt[];
  log: AiLogger;
  model?: { model: LanguageModel; modelId: string };
  timeoutMs?: number;
};

const skillName = (slug: string) => slug.replace(/-/g, " ");

/** The numbers, computed from attempts. Exported for tests. */
export function scoreLesson(lesson: SourceLesson, attempts: Attempt[]) {
  const exercises = lesson.blocks.filter((b): b is SourceExercise => "block" in b);
  const first = new Map(attempts.filter((a) => a.attempt === 1).map((a) => [a.exerciseId, a]));
  const bySkill = new Map<string, { correct: number; total: number }>();
  const weak: { exercise: SourceExercise; firstAnswer: unknown }[] = [];
  for (const ex of exercises) {
    const a = first.get(ex.id);
    const ok = a?.verdict === "correct";
    const s = bySkill.get(ex.skill) ?? { correct: 0, total: 0 };
    s.total++;
    if (ok) s.correct++;
    bySkill.set(ex.skill, s);
    if (!ok) weak.push({ exercise: ex, firstAnswer: a?.answer });
  }
  const skills = [...bySkill].map(([skill, s]) => ({ skill, ...s }));
  return {
    correctFirstTry: exercises.length - weak.length,
    total: exercises.length,
    skills,
    strengths: skills.filter((s) => s.correct === s.total).map((s) => skillName(s.skill)),
    weak,
  };
}

export async function reviewLesson(input: LessonReviewInput): Promise<JournalEntry> {
  const { lesson } = input;
  const score = scoreLesson(lesson, input.attempts);
  const base = {
    lessonId: lesson.id,
    courseId: input.courseId,
    lessonTitle: lesson.title,
    correctFirstTry: score.correctFirstTry,
    total: score.total,
    skills: score.skills,
    strengths: score.strengths,
    weakSpots: score.weak.map(({ exercise }) => ({ exerciseId: exercise.id, question: exercise.question, skill: exercise.skill })),
    createdAt: new Date().toISOString(),
  };

  const started = Date.now();
  const resolved: ResolvedModel = input.model ?? getModel("mentor");
  const fallback = (reason: string, modelId: string | null): JournalEntry => {
    logAiCall(input.log, { task: "lesson_review", model: modelId, ms: Date.now() - started, ok: false, fallbackReason: reason });
    const perfect = score.weak.length === 0;
    return {
      ...base,
      summary: perfect
        ? `You got all ${score.total} exercises right on the first try.`
        : `You got ${score.correctFirstTry} of ${score.total} right on the first try. Worth another look: ${[...new Set(score.weak.map((w) => skillName(w.exercise.skill)))].join(", ")}.`,
      recommendations: (perfect ? lesson.mentor.key_points : lesson.mentor.follow_up_tasks).slice(0, 2),
      source: "fallback",
    };
  };
  if (resolved.model === null) return fallback(resolved.reason, null);

  const results = [
    `Score: ${score.correctFirstTry} of ${score.total} right on the first try.`,
    `By skill: ${score.skills.map((s) => `${skillName(s.skill)} ${s.correct}/${s.total}`).join(", ")}.`,
    ...score.weak.map(
      ({ exercise, firstAnswer }) =>
        `Missed on the first try: ${exercise.id} (${skillName(exercise.skill)}). First answer: ${firstAnswer ? describeAnswer(exercise, firstAnswer as { optionIds?: string[] }) : "none"}.`,
    ),
  ].join("\n");

  try {
    const result = await generateText({
      model: resolved.model,
      output: Output.object({ schema: ReviewText }),
      system: lessonReviewSystemPrompt(lesson),
      prompt: results,
      abortSignal: AbortSignal.timeout(input.timeoutMs ?? aiTimeoutMs),
      maxOutputTokens: 1500,
      maxRetries: 1,
    });
    const text = result.output;
    if (!text.summary.trim()) return fallback("empty", resolved.modelId);
    logAiCall(input.log, {
      task: "lesson_review",
      model: resolved.modelId,
      ms: Date.now() - started,
      ok: true,
      inputTokens: result.usage.inputTokens,
      outputTokens: result.usage.outputTokens,
    });
    return { ...base, summary: text.summary, recommendations: text.recommendations.slice(0, 3), source: "llm" };
  } catch (error) {
    return fallback(NoObjectGeneratedError.isInstance(error) ? "no_object" : describeError(error), resolved.modelId);
  }
}
