import { generateText, NoObjectGeneratedError, Output, streamText, type LanguageModel } from "ai";

import { onboardingConfig } from "../config/onboarding.ts";
import { roundHours } from "../domain/quiz.ts";
import { describeError, logAiCall, textFingerprint, type AiLogger } from "./log.ts";
import { aiTimeoutMs, getModel, type ResolvedModel } from "./models.ts";
import { extractTasksSystemPrompt, type PromptSkill } from "./prompts/extract-tasks.ts";
import { makeExtractionSchema, type ExtractedTask } from "./schemas/work-tasks.ts";

export type ExtractionInput = {
  freeText: string;
  roleTitle: string;
  skills: PromptSkill[];
  /** Returned when the model is unavailable or fails: the role template (already adjusted by the quiz). */
  fallbackTasks: ExtractedTask[];
  log: AiLogger;
  /** Tests inject a mock model; otherwise the env-configured extraction model is used. */
  model?: { model: LanguageModel; modelId: string };
  timeoutMs?: number;
  signal?: AbortSignal;
};

export type ExtractionResult = { tasks: ExtractedTask[]; source: "llm" | "template"; fallbackReason?: string };

const TASK = "extraction";

const resolve = (input: ExtractionInput): ResolvedModel => input.model ?? getModel(TASK);

function setup(input: ExtractionInput) {
  const slugs = input.skills.map((s) => s.slug);
  if (!slugs.length) throw new Error("No skills to extract into");
  const schema = makeExtractionSchema(slugs as [string, ...string[]]);
  const timeout = AbortSignal.timeout(input.timeoutMs ?? aiTimeoutMs);
  return {
    schema,
    known: new Set(slugs),
    abortSignal: input.signal ? AbortSignal.any([timeout, input.signal]) : timeout,
    system: extractTasksSystemPrompt({ roleTitle: input.roleTitle, skills: input.skills }),
  };
}

/** Clamps hours, drops unknown skills and empty titles, keeps at most `maxExtractedTasks`. */
export function sanitizeExtractedTasks(tasks: readonly ExtractedTask[], knownSkills: Set<string>): ExtractedTask[] {
  return tasks
    .filter((t) => knownSkills.has(t.skillSlug) && t.title.trim().length > 0)
    .slice(0, onboardingConfig.maxExtractedTasks)
    .map((t) => ({ ...t, title: t.title.trim().slice(0, 120), hoursPerWeek: roundHours(t.hoursPerWeek) }));
}

/**
 * Free text → tasks with `generateText` + `Output.object`. Never throws: on a missing model,
 * NoObjectGeneratedError, timeout or provider error it returns the fallback tasks and logs why.
 */
export async function extractTasks(input: ExtractionInput): Promise<ExtractionResult> {
  const started = Date.now();
  const fp = textFingerprint(input.freeText);
  const resolved = resolve(input);
  const fallback = (reason: string, modelId: string | null): ExtractionResult => {
    logAiCall(input.log, { task: TASK, model: modelId, ms: Date.now() - started, ok: false, fallbackReason: reason, ...fp });
    return { tasks: input.fallbackTasks, source: "template", fallbackReason: reason };
  };
  if (resolved.model === null) return fallback(resolved.reason, null);

  const { schema, known, abortSignal, system } = setup(input);
  try {
    const result = await generateText({
      model: resolved.model,
      output: Output.object({ schema: schema.output }),
      system,
      prompt: input.freeText,
      abortSignal,
      maxRetries: 1,
    });
    const tasks = sanitizeExtractedTasks(result.output.tasks, known);
    if (!tasks.length) return fallback("empty", resolved.modelId);
    logAiCall(input.log, {
      task: TASK,
      model: resolved.modelId,
      ms: Date.now() - started,
      ok: true,
      inputTokens: result.usage.inputTokens,
      outputTokens: result.usage.outputTokens,
      ...fp,
    });
    return { tasks, source: "llm" };
  } catch (error) {
    return fallback(NoObjectGeneratedError.isInstance(error) ? "no_object" : describeError(error), resolved.modelId);
  }
}

/**
 * Streaming variant for the "AI is laying out your day" screen. Yields a JSON document as text:
 * `{"tasks":[…],"source":"llm"|"template"}`, one complete, validated task at a time, so the client can
 * parse partial JSON (`useObject`). Tasks already sent are never taken back:
 * - the model fails before sending any task → the fallback tasks are sent instead;
 * - it fails after some → those are kept.
 * `onDone` runs (e.g. to save the tasks) before the document is closed.
 */
export async function* streamExtractTasks(
  input: ExtractionInput,
  onDone: (result: ExtractionResult) => Promise<void>,
): AsyncGenerator<string> {
  const started = Date.now();
  const fp = textFingerprint(input.freeText);
  const resolved = resolve(input);
  const sent: ExtractedTask[] = [];
  let first = true;
  const emit = (task: ExtractedTask) => {
    sent.push(task);
    const chunk = (first ? "" : ",") + JSON.stringify(task);
    first = false;
    return chunk;
  };

  yield '{"tasks":[';

  let result: ExtractionResult;
  if (resolved.model === null) {
    for (const t of input.fallbackTasks) yield emit(t);
    result = { tasks: input.fallbackTasks, source: "template", fallbackReason: resolved.reason };
    logAiCall(input.log, { task: TASK, model: null, ms: Date.now() - started, ok: false, fallbackReason: resolved.reason, ...fp });
  } else {
    const { schema, known, abortSignal, system } = setup(input);
    let streamError: unknown = null;
    let skipped = 0;
    const stream = streamText({
      model: resolved.model,
      output: Output.object({ schema: schema.output }),
      system,
      prompt: input.freeText,
      abortSignal,
      maxRetries: 1,
      onError: ({ error }) => {
        streamError ??= error;
      },
    });
    // Elements before the last one in a partial array are complete; validate and send them as they land.
    const takeComplete = function* (candidates: unknown[]) {
      for (let i = sent.length + skipped; i < candidates.length; i++) {
        if (sent.length >= onboardingConfig.maxExtractedTasks) return;
        const parsed = schema.task.safeParse(candidates[i]);
        const [clean] = parsed.success ? sanitizeExtractedTasks([parsed.data], known) : [];
        if (clean) yield emit(clean);
        else skipped++;
      }
    };
    let failure: string | null = null;
    try {
      for await (const partial of stream.partialOutputStream) {
        const items = (partial as { tasks?: unknown[] }).tasks ?? [];
        yield* takeComplete(items.slice(0, -1));
      }
      const final = await stream.output;
      yield* takeComplete(final.tasks);
    } catch (error) {
      failure = NoObjectGeneratedError.isInstance(error) ? "no_object" : describeError(error);
    }
    if (!failure && streamError) failure = describeError(streamError);
    if (!failure && sent.length === 0) failure = "empty";

    const usage = await Promise.resolve(stream.totalUsage).catch(() => undefined);
    const base = { task: TASK, model: resolved.modelId, ms: Date.now() - started, ...fp };
    if (failure && sent.length === 0) {
      for (const t of input.fallbackTasks) yield emit(t);
      result = { tasks: input.fallbackTasks, source: "template", fallbackReason: failure };
      logAiCall(input.log, { ...base, ok: false, fallbackReason: failure });
    } else {
      result = { tasks: [...sent], source: "llm", ...(failure && { fallbackReason: `partial_${failure}` }) };
      logAiCall(input.log, {
        ...base,
        ok: true,
        inputTokens: usage?.inputTokens,
        outputTokens: usage?.outputTokens,
        ...(failure && { fallbackReason: `partial_${failure}` }),
      });
    }
  }

  await onDone(result);
  yield `],"source":${JSON.stringify(result.source)}}`;
}
