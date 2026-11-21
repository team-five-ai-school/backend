import { createAnthropic } from "@ai-sdk/anthropic";
import type { LanguageModel } from "ai";

import { env } from "../env.ts";
import { simulatedMentorModel } from "./simulated.ts";

/**
 * The single access point to models. Provider key and model ids come only from env; a task without a
 * configured model returns `null` and the caller uses its deterministic fallback.
 */
export type AiTask = "extraction" | "rerank" | "mentor";

const modelIdFor: Record<AiTask, string | undefined> = {
  extraction: env.AI_MODEL_EXTRACTION,
  rerank: env.AI_MODEL_RERANK,
  mentor: env.AI_MODEL_MENTOR,
};

const anthropic = env.ANTHROPIC_API_KEY ? createAnthropic({ apiKey: env.ANTHROPIC_API_KEY }) : null;

export type ResolvedModel = { model: LanguageModel; modelId: string } | { model: null; reason: string };

export function getModel(task: AiTask): ResolvedModel {
  const modelId = modelIdFor[task];
  if (!anthropic && task === "mentor" && env.AI_SIMULATE && env.NODE_ENV !== "production") {
    return { model: simulatedMentorModel(), modelId: "simulated" };
  }
  if (!anthropic) return { model: null, reason: "no_api_key" };
  if (!modelId) return { model: null, reason: `no_model_for_${task}` };
  return { model: anthropic(modelId), modelId };
}

export const aiTimeoutMs = env.AI_TIMEOUT_MS;
