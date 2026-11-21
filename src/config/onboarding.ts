import type { AiCapability } from "../db/schema/index.ts";

/**
 * Tunable numbers of the onboarding. Code reads them from here, never inline.
 * Hour adjustments by quiz answers are data too: see `effect` on each option in src/seed/roles.ts.
 */
export const onboardingConfig = {
  /** Share of a task's weekly hours AI can take over, by capability. Used by the chaos map and the plan. */
  aiFactors: { auto: 0.8, assist: 0.4, human: 0 } satisfies Record<AiCapability, number>,
  /** Hours per task are clamped to this range (quiz multipliers and model output alike). */
  maxHoursPerTask: 40,
  /** Hours are rounded to this step after quiz adjustments. */
  hoursStep: 0.5,
  /** Max tasks the model may return; extra ones are dropped. */
  maxExtractedTasks: 12,
  freeTextMaxLength: 2000,
  /** Rate limit for POST /onboarding/sessions/:id/describe (in-memory, per process). */
  describeLimit: { perSession: 5, perIp: 20, windowMs: 10 * 60 * 1000 },
} as const;
