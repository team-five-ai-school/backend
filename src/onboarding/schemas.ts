import { z } from "zod";

import { onboardingConfig } from "../config/onboarding.ts";
import { AI_CAPABILITIES, CHAOS_TYPES, ONBOARDING_STATUSES, PLAN_ITEM_STATUSES, PLAN_STATUSES, TASK_SOURCES } from "../db/schema/index.ts";

// Request/response shapes of the onboarding and /me routes. docs/api-contracts.md documents the same.

export const QuizOptionOut = z.object({ id: z.string(), label: z.string(), description: z.string().optional() });
export const QuizQuestionOut = z.object({
  id: z.string(),
  kind: z.enum(["single", "multi"]),
  text: z.string(),
  hint: z.string().optional(),
  options: z.array(QuizOptionOut),
});
export const RoleOut = z.object({ slug: z.string(), title: z.string(), description: z.string() });

export const QuizAnswerIn = z.object({
  questionId: z.string().min(1).max(64),
  optionIds: z.array(z.string().min(1).max(64)).min(1).max(10),
});
export const AnswersBody = z.object({ answers: z.array(QuizAnswerIn).max(20) });

export const CreateSessionBody = z.object({ role: z.string().min(1).max(64) });
export const DescribeBody = z.object({ freeText: z.string().trim().min(1).max(onboardingConfig.freeTextMaxLength) });
export const DescribeQuery = z.object({
  /** `false` returns one JSON response instead of a text stream. */
  stream: z.enum(["true", "false"]).default("true"),
});

export const WorkTaskOut = z.object({
  id: z.uuid(),
  title: z.string(),
  skillSlug: z.string(),
  chaosType: z.enum(CHAOS_TYPES),
  hoursPerWeek: z.number(),
  aiCapability: z.enum(AI_CAPABILITIES),
  source: z.enum(TASK_SOURCES),
});

/** Streamed / returned by describe before the tasks get ids. The frontend uses the same shape for useObject. */
export const ExtractedTaskOut = z.object({
  title: z.string(),
  skillSlug: z.string(),
  hoursPerWeek: z.number(),
  aiCapability: z.enum(AI_CAPABILITIES),
});
export const DescribeResponse = z.object({ tasks: z.array(ExtractedTaskOut), source: z.enum(["llm", "template"]) });

export const ChaosLaneOut = z.object({
  id: z.string(),
  kind: z.enum(["skill", "human"]),
  skillSlug: z.string().nullable(),
  title: z.string(),
  chaosType: z.enum(CHAOS_TYPES).nullable(),
  taskIds: z.array(z.string()),
  hoursTotal: z.number(),
  hoursAiCan: z.number(),
  aiSharePercent: z.number(),
});
export const ChaosMapOut = z.object({
  id: z.uuid(),
  version: z.number().int(),
  lanes: z.array(ChaosLaneOut),
  totals: z.object({
    hoursTotal: z.number(),
    hoursAiCan: z.number(),
    hoursHuman: z.number(),
    aiSharePercent: z.number(),
  }),
  createdAt: z.date(),
});

export const PlanItemOut = z.object({
  id: z.uuid(),
  order: z.number().int(),
  skillSlug: z.string(),
  skillTitle: z.string(),
  lessonId: z.uuid().nullable(),
  lessonTitle: z.string().nullable(),
  /** Content lesson id: open it at /lessons/:lessonSlug. */
  lessonSlug: z.string().nullable(),
  status: z.enum(PLAN_ITEM_STATUSES),
  sourceTaskIds: z.array(z.uuid()),
  estimatedHoursSaved: z.number(),
  rationale: z.string().nullable(),
});
export const PlanOut = z.object({
  id: z.uuid(),
  version: z.number().int(),
  status: z.enum(PLAN_STATUSES),
  items: z.array(PlanItemOut),
  createdAt: z.date(),
});

export const SessionOut = z.object({
  sessionId: z.uuid(),
  role: RoleOut,
  quiz: z.array(QuizQuestionOut),
  answers: z.array(QuizAnswerIn),
  status: z.enum(ONBOARDING_STATUSES),
  /** Tasks from describe (if any); after complete, the final tasks. */
  tasks: z.array(WorkTaskOut),
  /** Latest chaos map and active plan of this session (null before complete): lets the client restore the result. */
  chaosMap: ChaosMapOut.nullable(),
  plan: PlanOut.nullable(),
});

export const CompleteResponse = z.object({ tasks: z.array(WorkTaskOut), chaosMap: ChaosMapOut, plan: PlanOut });

export const RoutineTimeBody = z.object({
  taskId: z.uuid(),
  hoursBefore: z.number().min(0).max(onboardingConfig.maxHoursPerTask),
  hoursAfter: z.number().min(0).max(onboardingConfig.maxHoursPerTask),
  measuredAt: z.iso.datetime().optional(),
});
export const RoutineTimeOut = z.object({
  id: z.uuid(),
  taskId: z.uuid(),
  hoursBefore: z.number(),
  hoursAfter: z.number(),
  measuredAt: z.date(),
});
