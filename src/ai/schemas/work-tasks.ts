import { z } from "zod";

import { onboardingConfig } from "../../config/onboarding.ts";
import { AI_CAPABILITIES } from "../../db/schema/index.ts";

/**
 * Structured output for free-text → tasks. `skillSlug` is an enum of the skills in the DB, so the model
 * cannot invent a skill. Count and hour limits are stated in descriptions and enforced by
 * `sanitizeExtractedTasks` (clamped, not rejected: one task with 45 h must not throw away the rest).
 */
export function makeExtractionSchema(skillSlugs: readonly [string, ...string[]]) {
  const task = z.object({
    title: z.string().describe("Short task name in English, close to how the person would say it, 2–8 words"),
    skillSlug: z.enum(skillSlugs).describe("The skill this task needs"),
    hoursPerWeek: z
      .number()
      .describe(`Hours per week the task takes now, 0–${onboardingConfig.maxHoursPerTask}; estimate if not stated`),
    aiCapability: z
      .enum(AI_CAPABILITIES)
      .describe("auto: AI can do it end to end; assist: AI prepares, the person checks; human: needs the person's judgment"),
  });
  return {
    task,
    output: z.object({
      tasks: z.array(task).describe(`Routine work tasks, at most ${onboardingConfig.maxExtractedTasks}`),
    }),
  };
}

export type ExtractedTask = {
  title: string;
  skillSlug: string;
  hoursPerWeek: number;
  aiCapability: (typeof AI_CAPABILITIES)[number];
};
