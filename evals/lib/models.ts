import { createAnthropic } from "@ai-sdk/anthropic";
import type { LanguageModel } from "ai";
import { MockLanguageModelV4 } from "ai/test";

import { simulatedMentorModel } from "../../src/ai/simulated.ts";
import { env } from "../../src/env.ts";

/**
 * Models for an eval run.
 *  - real: the component under test uses the same env ids as the app (AI_MODEL_MENTOR, AI_MODEL_EXTRACTION);
 *    the judge uses AI_MODEL_JUDGE, or the mentor model when that is unset.
 *  - mock (--mock): no key needed; checks that the harness itself runs end to end. Scores mean nothing.
 */

export type EvalModel = { model: LanguageModel; modelId: string };

const usage = {
  inputTokens: { total: 0, noCache: 0, cacheRead: undefined, cacheWrite: undefined },
  outputTokens: { total: 0, text: 0, reasoning: undefined },
};

function promptText(prompt: unknown): string {
  return JSON.stringify(prompt);
}

/** Mock extraction: echoes one task per known skill slug mentioned in the system prompt's examples. */
function mockExtractionModel(): EvalModel {
  return {
    modelId: "mock-extraction",
    model: new MockLanguageModelV4({
      doGenerate: async () => ({
        content: [
          {
            type: "text",
            text: JSON.stringify({
              tasks: [{ title: "Mock task", skillSlug: "summarize-reports", hoursPerWeek: 2, aiCapability: "assist" }],
            }),
          },
        ],
        finishReason: { unified: "stop", raw: undefined },
        usage,
        warnings: [],
      }),
    }),
  };
}

/** Mock judge: passes every rule id it finds in the prompt (R1, R2…). */
function mockJudgeModel(): EvalModel {
  return {
    modelId: "mock-judge",
    model: new MockLanguageModelV4({
      doGenerate: async ({ prompt }) => {
        // Rule lines look like "R3: …"; in the JSON-stringified prompt they follow an escaped "\n".
        const ids = [...new Set(promptText(prompt).match(/R\d+(?=: )/g) ?? [])];
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                rules: ids.map((id) => ({ id, reason: "mock", pass: true })),
              }),
            },
          ],
          finishReason: { unified: "stop", raw: undefined },
          usage,
          warnings: [],
        };
      },
    }),
  };
}

export type EvalModels = {
  mock: boolean;
  /** undefined → the component resolves its own model from env, exactly as in the app. */
  mentor?: EvalModel;
  extraction?: EvalModel;
  judge: EvalModel;
  describe: { mentor: string; extraction: string; judge: string };
};

export function resolveEvalModels(mock: boolean): EvalModels {
  if (mock) {
    const judge = mockJudgeModel();
    const extraction = mockExtractionModel();
    return {
      mock,
      mentor: { model: simulatedMentorModel(), modelId: "simulated" },
      extraction,
      judge,
      describe: { mentor: "simulated", extraction: extraction.modelId, judge: judge.modelId },
    };
  }

  if (!env.ANTHROPIC_API_KEY) {
    throw new Error("ANTHROPIC_API_KEY is not set. Add it to backend/.env, or run with --mock to smoke-test the harness.");
  }
  const judgeId = process.env.AI_MODEL_JUDGE ?? env.AI_MODEL_MENTOR;
  if (!judgeId) throw new Error("Set AI_MODEL_JUDGE (or AI_MODEL_MENTOR) for the judge model.");
  const anthropic = createAnthropic({ apiKey: env.ANTHROPIC_API_KEY });
  return {
    mock,
    judge: { model: anthropic(judgeId), modelId: judgeId },
    describe: {
      mentor: env.AI_MODEL_MENTOR ?? "(unset → fallback)",
      extraction: env.AI_MODEL_EXTRACTION ?? "(unset → template)",
      judge: judgeId,
    },
  };
}
