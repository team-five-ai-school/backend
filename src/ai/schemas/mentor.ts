import { z } from "zod";

/* ───────── API shapes (match frontend src/lib/contracts → Mentor) ───────── */

export const MentorBlock = z.discriminatedUnion("type", [
  z.object({ type: z.literal("text"), text: z.string() }),
  z.object({ type: z.literal("steps"), items: z.array(z.string()) }),
  z.object({ type: z.literal("example"), title: z.string().nullable(), text: z.string() }),
  z.object({ type: z.literal("prompt"), text: z.string() }),
]);
export type MentorBlock = z.infer<typeof MentorBlock>;

export const Mistake = z.object({
  id: z.string(),
  exerciseId: z.string(),
  exerciseTitle: z.string(),
  lessonId: z.string(),
  createdAt: z.string(),
  what: z.string(),
  why: z.string(),
  how: z.string(),
});

export const ExtraTask = z.object({
  id: z.string(),
  mistakeId: z.string(),
  title: z.string(),
  description: z.string(),
  estimatedMinutes: z.number().int(),
  status: z.enum(["pending", "done", "skipped"]),
  exerciseId: z.string(),
});

export const MentorMessage = z.object({
  id: z.string(),
  role: z.enum(["mentor", "user"]),
  createdAt: z.string(),
  status: z.enum(["complete", "pending", "error"]),
  blocks: z.array(MentorBlock),
  mistake: Mistake.nullable(),
  extraTasks: z.array(ExtraTask),
  suggestions: z.array(z.string()),
});
export type MentorMessage = z.infer<typeof MentorMessage>;

export const MentorContext = z.object({
  source: z.enum(["global", "lesson", "exercise", "mistake"]),
  lessonId: z.string().nullable(),
  exerciseId: z.string().nullable(),
});
export type MentorContext = z.infer<typeof MentorContext>;

export const MentorAskBody = z.object({
  text: z.string().trim().min(1).max(2000),
  context: MentorContext,
  history: z
    .array(z.object({ role: z.enum(["user", "mentor"]), text: z.string().max(1000) }))
    .max(6)
    .default([]),
});
export type MentorAskBody = z.infer<typeof MentorAskBody>;

/* ───────── Model output: flat and easy to fill; code turns it into blocks ───────── */

export const MentorReply = z.object({
  reply: z.string().describe("The main answer, 1–3 short sentences (under 60 words), plain English. **bold** for the one key idea."),
  points: z.array(z.string()).describe("Up to 3 short steps or checks (under 12 words each) when steps are the most useful extra; otherwise []"),
  example: z
    .object({ title: z.string(), text: z.string() })
    .nullable()
    .describe("One short before → after or work example (under 40 words) when an example is the most useful extra; otherwise null"),
  promptExample: z.string().nullable().describe("A short ready-to-copy prompt (under 50 words) when the learner asks how to do something; otherwise null"),
  suggestions: z.array(z.string()).describe("2–3 short follow-up questions (under 8 words each) the learner could ask next"),
});
export type MentorReply = z.infer<typeof MentorReply>;

export const MistakeReview = MentorReply.extend({
  what: z.string().describe("What went wrong in the learner's answer, in one sentence, without the correct answer"),
  why: z.string().describe("Why it matters at work, one sentence"),
  how: z.string().describe("What to look at or try next, one sentence, without stating the correct answer"),
  followUpIndex: z
    .number()
    .int()
    .nullable()
    .describe("Index of the follow-up task from the list that fits this mistake best, or null"),
});
export type MistakeReview = z.infer<typeof MistakeReview>;
