import { readFileSync } from "node:fs";

import { z } from "zod";

/**
 * Course content, loaded once at startup from content/courses.json (synced from the frontend repo with
 * `npm run content:sync`). Validated here so a broken file fails the boot, not the demo.
 *
 * This module owns the mapping from the authoring format (content/FORMAT.md in the frontend repo) to the
 * API shapes (frontend src/lib/contracts). Answers, explanations and hints never leave this module except
 * through checkAnswer().
 */

const Card = z.object({ type: z.literal("card"), title: z.string(), body: z.string() });
const ExerciseBase = z.object({
  block: z.literal("exercise"),
  id: z.string(),
  skill: z.string(),
  question: z.string(),
  hint: z.string(),
});
const SourceExercise = z.discriminatedUnion("type", [
  ExerciseBase.extend({ type: z.literal("single_select"), options: z.array(z.string()), answer: z.number().int(), explanation: z.string() }),
  ExerciseBase.extend({ type: z.literal("multi_select"), options: z.array(z.string()), answers: z.array(z.number().int()), explanation: z.string() }),
  ExerciseBase.extend({
    type: z.literal("fill_blank"),
    prompt: z.string(),
    options: z.array(z.string()),
    answer: z.number().int(),
    explanation: z.string(),
  }),
  ExerciseBase.extend({
    type: z.literal("true_false"),
    cards: z.array(z.object({ statement: z.string(), answer: z.boolean(), explanation: z.string() })),
  }),
]);
type SourceExercise = z.infer<typeof SourceExercise>;

const SourceLesson = z.object({
  id: z.string(),
  title: z.string(),
  duration_min: z.number().int(),
  goal: z.string(),
  skills: z.array(z.string()),
  blocks: z.array(z.union([Card, SourceExercise])),
  practice: z.unknown(),
  /** Grounding for the AI mentor; never sent to the browser. */
  mentor: z.object({
    common_mistakes: z.array(z.string()),
    key_points: z.array(z.string()),
    follow_up_tasks: z.array(z.string()),
  }),
});
const SourceCourse = z.object({
  id: z.string(),
  title: z.string(),
  track: z.string(),
  level: z.enum(["beginner", "intermediate", "advanced"]),
  description: z.string(),
  tools: z.array(z.string()),
  recommended_for: z.array(z.string()),
  stage: z.string(),
  prerequisites: z.array(z.string()),
  minutes_saved_per_week: z.number(),
  lessons: z.array(SourceLesson),
});
const SourceFile = z.object({ courses: z.array(SourceCourse) });

export type SourceCourse = z.infer<typeof SourceCourse>;
export type SourceLesson = z.infer<typeof SourceLesson>;
export type { SourceExercise };

const file = SourceFile.parse(JSON.parse(readFileSync(new URL("../../content/courses.json", import.meta.url), "utf8")));

/* ───────── API shapes (match frontend src/lib/contracts) ───────── */

export const NodeStatus = z.enum(["locked", "available", "in_progress", "completed"]);

export const CourseDto = z.object({
  id: z.string(),
  title: z.string(),
  summary: z.string(),
  trackId: z.string(),
  toolIds: z.array(z.string()),
  /** Difficulty, for catalog filters. */
  level: z.enum(["beginner", "intermediate", "advanced"]),
  /** Onboarding role ids (content/onboarding.json `roles[].id`) the course is meant for. */
  roleIds: z.array(z.string()),
  lessonCount: z.number().int(),
  durationMinutes: z.number().int(),
  status: NodeStatus,
  progressPercent: z.number(),
  hoursSavedEstimate: z.number(),
});

export const LessonDto = z.object({
  id: z.string(),
  courseId: z.string(),
  title: z.string(),
  summary: z.string(),
  order: z.number().int(),
  durationMinutes: z.number().int(),
  status: NodeStatus,
  flowId: z.string().nullable(),
});

const Option = z.object({ id: z.string(), label: z.string() });
const ExerciseCommon = { id: z.string(), lessonId: z.string(), title: z.string(), prompt: z.string(), hint: z.null() };
export const ExerciseDto = z.discriminatedUnion("kind", [
  z.object({ ...ExerciseCommon, kind: z.literal("single"), options: z.array(Option) }),
  z.object({ ...ExerciseCommon, kind: z.literal("multi"), options: z.array(Option) }),
  z.object({ ...ExerciseCommon, kind: z.literal("fill_blank"), template: z.string(), options: z.array(Option) }),
  z.object({ ...ExerciseCommon, kind: z.literal("true_false"), cards: z.array(z.object({ id: z.string(), statement: z.string() })) }),
]);

export const StepDto = z.discriminatedUnion("type", [
  z.object({ type: z.literal("card"), id: z.string(), title: z.string(), body: z.string() }),
  z.object({ type: z.literal("exercise"), id: z.string(), exercise: ExerciseDto }),
]);

/* ───────── Indexes ───────── */

type IndexedLesson = { course: SourceCourse; lesson: SourceLesson; order: number; nextLessonId: string | null };
const lessonsById = new Map<string, IndexedLesson>();
const exercisesById = new Map<string, { lessonId: string; exercise: SourceExercise }>();
const coursesById = new Map(file.courses.map((c) => [c.id, c]));

for (const course of file.courses) {
  course.lessons.forEach((lesson, i) => {
    lessonsById.set(lesson.id, { course, lesson, order: i + 1, nextLessonId: course.lessons[i + 1]?.id ?? null });
    for (const block of lesson.blocks) if ("block" in block) exercisesById.set(block.id, { lessonId: lesson.id, exercise: block });
  });
}

const toOptions = (labels: string[]) => labels.map((label, i) => ({ id: String(i), label }));

export function toCourseDto(course: SourceCourse): z.infer<typeof CourseDto> {
  return {
    id: course.id,
    title: course.title,
    summary: course.description,
    trackId: course.track,
    toolIds: course.tools,
    level: course.level,
    roleIds: course.recommended_for,
    lessonCount: course.lessons.length,
    durationMinutes: course.lessons.reduce((n, l) => n + l.duration_min, 0),
    status: "available",
    progressPercent: 0,
    hoursSavedEstimate: Math.round((course.minutes_saved_per_week / 60) * 10) / 10,
  };
}

export function toLessonDto(course: SourceCourse, lesson: SourceLesson, order: number): z.infer<typeof LessonDto> {
  return {
    id: lesson.id,
    courseId: course.id,
    title: lesson.title,
    summary: lesson.goal,
    order,
    durationMinutes: lesson.duration_min,
    status: "available",
    flowId: null,
  };
}

function toExerciseDto(lessonId: string, ex: SourceExercise): z.infer<typeof ExerciseDto> {
  const common = { id: ex.id, lessonId, title: "", prompt: ex.question, hint: null };
  switch (ex.type) {
    case "single_select":
      return { ...common, kind: "single", options: toOptions(ex.options) };
    case "multi_select":
      return { ...common, kind: "multi", options: toOptions(ex.options) };
    case "fill_blank":
      return { ...common, kind: "fill_blank", template: ex.prompt, options: toOptions(ex.options) };
    case "true_false":
      return { ...common, kind: "true_false", cards: ex.cards.map((c, i) => ({ id: String(i), statement: c.statement })) };
  }
}

export const listCourses = () => file.courses;
export const getCourse = (id: string) => coursesById.get(id);
export const getLesson = (id: string) => lessonsById.get(id);
export const getExercise = (id: string) => exercisesById.get(id);

/** Lesson steps in authoring order. Every step has a stable id (`<lessonId>-b<index>`), used later by the mentor. */
export function toSteps(lesson: SourceLesson): z.infer<typeof StepDto>[] {
  return lesson.blocks.map((block, i) =>
    "block" in block
      ? { type: "exercise", id: block.id, exercise: toExerciseDto(lesson.id, block) }
      : { type: "card", id: `${lesson.id}-b${i}`, title: block.title, body: block.body },
  );
}

export function exerciseIds(lesson: SourceLesson) {
  return lesson.blocks.flatMap((b) => ("block" in b ? [b.id] : []));
}

/* ───────── Answer checking ───────── */

export const AnswerBody = z.object({
  optionIds: z.array(z.string()).max(10).optional(),
  cardAnswers: z.array(z.boolean()).max(10).optional(),
});
export type AnswerBody = z.infer<typeof AnswerBody>;

export type Verdict = "correct" | "incorrect" | "partial";

export type Checked = {
  verdict: Verdict;
  /** Shown only once the result is final. */
  explanation: string;
  hint: string;
  correctOptionIds: string[] | null;
  cardResults: boolean[] | null;
  cardExplanations: string[] | null;
};

/** Returns null when the body has the wrong shape for this exercise kind. */
export function checkAnswer(ex: SourceExercise, body: AnswerBody): Checked | null {
  const base = { hint: ex.hint, cardResults: null, cardExplanations: null };
  if (ex.type === "true_false") {
    const answers = body.cardAnswers;
    if (!answers || answers.length !== ex.cards.length) return null;
    const results = ex.cards.map((c, i) => c.answer === answers[i]);
    const right = results.filter(Boolean).length;
    return {
      ...base,
      verdict: right === results.length ? "correct" : right > 0 ? "partial" : "incorrect",
      explanation: ex.cards.map((c) => c.explanation).join(" "),
      correctOptionIds: null,
      cardResults: results,
      cardExplanations: ex.cards.map((c) => c.explanation),
    };
  }
  const ids = body.optionIds;
  if (!ids || ids.some((id) => !/^\d+$/.test(id) || Number(id) >= ex.options.length)) return null;
  const correct = ex.type === "multi_select" ? ex.answers.map(String) : [String(ex.answer)];
  if (ex.type !== "multi_select" && ids.length !== 1) return null;
  const chosen = new Set(ids);
  const exact = chosen.size === correct.length && correct.every((id) => chosen.has(id));
  const someRight = correct.some((id) => chosen.has(id));
  return {
    ...base,
    verdict: exact ? "correct" : ex.type === "multi_select" && someRight ? "partial" : "incorrect",
    explanation: ex.explanation,
    correctOptionIds: correct,
  };
}
