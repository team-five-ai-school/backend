import { randomUUID } from "node:crypto";

import { generateText, NoObjectGeneratedError, Output, type LanguageModel, type ModelMessage } from "ai";

import type { SourceExercise, SourceLesson } from "../content/courses.ts";
import { describeError, logAiCall, textFingerprint, type AiLogger } from "./log.ts";
import { aiTimeoutMs, getModel, type ResolvedModel } from "./models.ts";
import { describeAnswer, mentorAskSystemPrompt, mistakeReviewSystemPrompt } from "./prompts/mentor.ts";
import {
  MentorReply,
  MistakeReview,
  type MentorAskBody,
  type MentorBlock,
  type MentorMessage,
} from "./schemas/mentor.ts";

/**
 * The lesson Mentor (docs/spec.md → AI mentor). Two calls, both returning a structured MentorMessage:
 *   reviewMistake: proactive review after a wrong answer. Never fails: falls back to a hint-based note.
 *   askMentor: a learner question. Returns null when the model is unavailable or fails (route → 501/503).
 * Answer guard: see prompts/mentor.ts, plus `leaksAnswer` as a cheap post-check.
 */

const TASK = "mentor";
const MAX_OUTPUT_TOKENS = 2000;

type ModelOverride = { model: LanguageModel; modelId: string };
const resolve = (override?: ModelOverride): ResolvedModel => override ?? getModel(TASK);

/* ───────── Helpers ───────── */

const normalize = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

/** Correct option texts of exercises the learner has not unlocked yet (long enough to match reliably). */
function hiddenAnswers(lesson: SourceLesson, revealed: Set<string>) {
  const out: string[] = [];
  for (const b of lesson.blocks) {
    if (!("block" in b) || revealed.has(b.id) || b.type === "true_false") continue;
    const correct = b.type === "multi_select" ? b.answers : [b.answer];
    for (const i of correct) {
      const text = normalize(b.options[i] ?? "");
      if (text.length >= 16) out.push(text);
    }
  }
  return out;
}

/** True when the reply quotes a correct option the learner has not unlocked. Prompt-side withholding is the real guard. */
export function leaksAnswer(reply: MentorReply, lesson: SourceLesson, revealed: Set<string>) {
  const hidden = hiddenAnswers(lesson, revealed);
  if (!hidden.length) return false;
  const text = normalize(
    [reply.reply, ...reply.points, reply.example?.text ?? "", reply.promptExample ?? ""].join(" "),
  );
  return hidden.some((h) => text.includes(h));
}

/** Markdown the panel doesn't render: **bold** → ==mark==, other asterisks and backticks dropped. */
const clean = (s: string) => s.replace(/\*\*(.+?)\*\*/g, "==$1==").replace(/[*`]/g, "");

/** Main text plus at most one extra block, so a reply stays readable in the side panel. */
function toBlocks(reply: MentorReply): MentorBlock[] {
  const blocks: MentorBlock[] = [{ type: "text", text: clean(reply.reply) }];
  const points = reply.points.map(clean).filter((p) => p.trim()).slice(0, 3);
  if (points.length) blocks.push({ type: "steps", items: points });
  else if (reply.example?.text.trim())
    blocks.push({ type: "example", title: reply.example.title ? clean(reply.example.title) : null, text: clean(reply.example.text) });
  else if (reply.promptExample?.trim()) blocks.push({ type: "prompt", text: reply.promptExample.replace(/[*`]/g, "") });
  return blocks;
}

function message(blocks: MentorBlock[], extra: Partial<MentorMessage> = {}): MentorMessage {
  return {
    id: randomUUID(),
    role: "mentor",
    createdAt: new Date().toISOString(),
    status: "complete",
    blocks,
    mistake: null,
    extraTasks: [],
    suggestions: [],
    ...extra,
  };
}

/* ───────── Mistake review ───────── */

export type MistakeInput = {
  lesson: SourceLesson;
  exercise: SourceExercise;
  attempt: { id: string; answer: unknown; attempt: number; createdAt: Date };
  /** Exercises the learner has unlocked (correct answer or 2+ attempts), including this one when it applies. */
  revealed: Set<string>;
  log: AiLogger;
  model?: ModelOverride;
  timeoutMs?: number;
};

export type MentorResult = { message: MentorMessage; source: "llm" | "fallback"; fallbackReason?: string };

export async function reviewMistake(input: MistakeInput): Promise<MentorResult> {
  const { lesson, exercise, attempt, revealed } = input;
  const learnerAnswer = describeAnswer(exercise, attempt.answer as { optionIds?: string[]; cardAnswers?: boolean[] });
  const mistakeBase = {
    id: attempt.id,
    exerciseId: exercise.id,
    exerciseTitle: exercise.question,
    lessonId: lesson.id,
    createdAt: attempt.createdAt.toISOString(),
  };
  const followUp = (index: number | null) => {
    const task = index === null ? undefined : lesson.mentor.follow_up_tasks[index];
    if (!task) return [];
    return [
      {
        id: `${attempt.id}-f${index}`,
        mistakeId: attempt.id,
        title: "Practice task",
        description: task,
        estimatedMinutes: 3,
        status: "pending" as const,
        exerciseId: exercise.id,
      },
    ];
  };

  const started = Date.now();
  const fp = textFingerprint(learnerAnswer);
  const resolved = resolve(input.model);
  const fallback = (reason: string, modelId: string | null): MentorResult => {
    logAiCall(input.log, { task: `${TASK}.review`, model: modelId, ms: Date.now() - started, ok: false, fallbackReason: reason, ...fp });
    return {
      source: "fallback",
      fallbackReason: reason,
      message: message(
        [
          { type: "text", text: "Let's look at this one together. It's a common slip." },
          { type: "steps", items: lesson.mentor.key_points.slice(0, 3) },
        ],
        {
          mistake: { ...mistakeBase, what: `You answered: ${learnerAnswer.replace(/[.!?]+$/, "")}.`, why: exercise.hint, how: "Use the hint, then try the exercise again." },
          extraTasks: followUp(0),
          suggestions: ["Explain this in other words", "What should I look at first?"],
        },
      ),
    };
  };
  if (resolved.model === null) return fallback(resolved.reason, null);

  try {
    const result = await generateText({
      model: resolved.model,
      output: Output.object({ schema: MistakeReview }),
      system: mistakeReviewSystemPrompt(lesson, revealed),
      prompt: `Exercise: ${exercise.id}\nAttempt number: ${attempt.attempt}\nThe learner answered: ${learnerAnswer}`,
      abortSignal: AbortSignal.timeout(input.timeoutMs ?? aiTimeoutMs),
      maxOutputTokens: MAX_OUTPUT_TOKENS,
      maxRetries: 1,
    });
    const review = result.output;
    if (leaksAnswer(review, lesson, revealed)) return fallback("answer_leak", resolved.modelId);
    logAiCall(input.log, {
      task: `${TASK}.review`,
      model: resolved.modelId,
      ms: Date.now() - started,
      ok: true,
      inputTokens: result.usage.inputTokens,
      outputTokens: result.usage.outputTokens,
      ...fp,
    });
    return {
      source: "llm",
      message: message(toBlocks(review), {
        mistake: { ...mistakeBase, what: clean(review.what), why: clean(review.why), how: clean(review.how) },
        extraTasks: followUp(review.followUpIndex),
        suggestions: review.suggestions.slice(0, 3),
      }),
    };
  } catch (error) {
    return fallback(NoObjectGeneratedError.isInstance(error) ? "no_object" : describeError(error), resolved.modelId);
  }
}

/* ───────── Learner question ───────── */

export type AskInput = {
  lesson: SourceLesson;
  body: MentorAskBody;
  revealed: Set<string>;
  log: AiLogger;
  model?: ModelOverride;
  timeoutMs?: number;
};

export type AskResult = { ok: true; message: MentorMessage } | { ok: false; reason: string; configured: boolean };

export async function askMentor(input: AskInput): Promise<AskResult> {
  const { lesson, body, revealed } = input;
  const started = Date.now();
  const fp = textFingerprint(body.text);
  const resolved = resolve(input.model);
  const fail = (reason: string, modelId: string | null, configured: boolean): AskResult => {
    logAiCall(input.log, { task: `${TASK}.ask`, model: modelId, ms: Date.now() - started, ok: false, fallbackReason: reason, ...fp });
    return { ok: false, reason, configured };
  };
  if (resolved.model === null) return fail(resolved.reason, null, false);

  // History from the client: user/mentor turns as plain text. Must start with a user turn.
  const history: ModelMessage[] = body.history.map((h) => ({
    role: h.role === "user" ? ("user" as const) : ("assistant" as const),
    content: h.text,
  }));
  while (history[0]?.role === "assistant") history.shift();
  const where =
    body.context.exerciseId ? `The learner is on exercise ${body.context.exerciseId}.` : "The learner is reading the lesson.";

  try {
    const result = await generateText({
      model: resolved.model,
      output: Output.object({ schema: MentorReply }),
      system: mentorAskSystemPrompt(lesson, revealed),
      messages: [...history, { role: "user", content: `${where}\n\nQuestion: ${body.text}` }],
      abortSignal: AbortSignal.timeout(input.timeoutMs ?? aiTimeoutMs),
      maxOutputTokens: MAX_OUTPUT_TOKENS,
      maxRetries: 1,
    });
    const reply = result.output;
    if (leaksAnswer(reply, lesson, revealed)) {
      logAiCall(input.log, { task: `${TASK}.ask`, model: resolved.modelId, ms: Date.now() - started, ok: false, fallbackReason: "answer_leak", ...fp });
      return {
        ok: true,
        message: message(
          [{ type: "text", text: "I can't give away the answer before your next try, but here's what to look at." }, { type: "steps", items: lesson.mentor.key_points.slice(0, 3) }],
          { suggestions: ["Give me a hint", "Explain the key idea again"] },
        ),
      };
    }
    logAiCall(input.log, {
      task: `${TASK}.ask`,
      model: resolved.modelId,
      ms: Date.now() - started,
      ok: true,
      inputTokens: result.usage.inputTokens,
      outputTokens: result.usage.outputTokens,
      ...fp,
    });
    return { ok: true, message: message(toBlocks(reply), { suggestions: reply.suggestions.slice(0, 3) }) };
  } catch (error) {
    return fail(NoObjectGeneratedError.isInstance(error) ? "no_object" : describeError(error), resolved.modelId, true);
  }
}
