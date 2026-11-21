import { onboardingConfig } from "../config/onboarding.ts";
import type { DefaultTask, QuizAnswer, QuizQuestionConfig } from "../db/schema/index.ts";

export function roundHours(hours: number, step: number = onboardingConfig.hoursStep) {
  const clamped = Math.min(Math.max(hours, 0), onboardingConfig.maxHoursPerTask);
  return Math.round(clamped / step) * step;
}

/**
 * Adjusts the role's template tasks by the quiz answers. Each chosen option may multiply the hours of
 * tasks with given skills; effects of several answers multiply together. Unknown questions/options are
 * ignored. Pure: the rules live in the role config, not here.
 */
export function applyQuiz(tasks: DefaultTask[], quiz: QuizQuestionConfig[], answers: QuizAnswer[]): DefaultTask[] {
  const factor = new Map<string, number>();
  for (const answer of answers) {
    const question = quiz.find((q) => q.id === answer.questionId);
    if (!question) continue;
    for (const optionId of answer.optionIds) {
      const effect = question.options.find((o) => o.id === optionId)?.effect;
      for (const [skill, k] of Object.entries(effect?.multiply ?? {})) factor.set(skill, (factor.get(skill) ?? 1) * k);
    }
  }
  return tasks.map((t) => ({ ...t, hoursPerWeek: roundHours(t.hoursPerWeek * (factor.get(t.skillSlug) ?? 1)) }));
}

/** Returns an error message if answers reference unknown questions/options or break `single`. */
export function validateAnswers(quiz: QuizQuestionConfig[], answers: QuizAnswer[]): string | null {
  const seen = new Set<string>();
  for (const a of answers) {
    const q = quiz.find((x) => x.id === a.questionId);
    if (!q) return `Unknown question: ${a.questionId}`;
    if (seen.has(q.id)) return `Duplicate answer for question: ${q.id}`;
    seen.add(q.id);
    if (q.kind === "single" && a.optionIds.length > 1) return `Question ${q.id} takes one option`;
    const bad = a.optionIds.find((id) => !q.options.some((o) => o.id === id));
    if (bad) return `Unknown option ${bad} for question ${q.id}`;
  }
  return null;
}

/** The quiz as the client sees it: without the hour effects. */
export function publicQuiz(quiz: QuizQuestionConfig[]) {
  return quiz.map(({ options, ...q }) => ({
    ...q,
    options: options.map(({ effect: _effect, ...o }) => o),
  }));
}
