import { simulateReadableStream } from "ai";
import { MockLanguageModelV4 } from "ai/test";

// Mock models from the AI SDK's own test helpers (ai/test), shaped as in node_modules/ai/docs/03-ai-sdk-core/55-testing.mdx.

const usage = {
  inputTokens: { total: 100, noCache: 100, cacheRead: undefined, cacheWrite: undefined },
  outputTokens: { total: 50, text: 50, reasoning: undefined },
};

/** generateText: the model answers with `text`. */
export function mockTextModel(text: string) {
  return new MockLanguageModelV4({
    doGenerate: async () => ({
      content: [{ type: "text", text }],
      finishReason: { unified: "stop", raw: undefined },
      usage,
      warnings: [],
    }),
  });
}

/** generateText: never answers; rejects when the call is aborted (for timeout tests). */
export function mockHangingModel() {
  return new MockLanguageModelV4({
    doGenerate: ({ abortSignal }) =>
      new Promise((_, reject) => {
        abortSignal?.addEventListener("abort", () => reject(abortSignal.reason), { once: true });
      }),
  });
}

/** streamText: the model streams `text` split into `chunkSize`-character deltas. */
export function mockStreamModel(text: string, chunkSize = 12) {
  const deltas = text.match(new RegExp(`[\\s\\S]{1,${chunkSize}}`, "g")) ?? [];
  return new MockLanguageModelV4({
    doStream: async () => ({
      stream: simulateReadableStream({
        chunks: [
          { type: "text-start" as const, id: "t1" },
          ...deltas.map((delta) => ({ type: "text-delta" as const, id: "t1", delta })),
          { type: "text-end" as const, id: "t1" },
          { type: "finish" as const, finishReason: { unified: "stop" as const, raw: undefined }, logprobs: undefined, usage },
        ],
      }),
    }),
  });
}

/** streamText: the provider call fails. */
export function mockFailingStreamModel() {
  return new MockLanguageModelV4({
    doStream: async () => {
      throw new Error("provider down");
    },
  });
}

export function memoryLogger() {
  const entries: { level: "info" | "warn"; obj: Record<string, unknown>; msg?: string }[] = [];
  return {
    entries,
    info: (obj: object, msg?: string) => entries.push({ level: "info", obj: obj as Record<string, unknown>, msg }),
    warn: (obj: object, msg?: string) => entries.push({ level: "warn", obj: obj as Record<string, unknown>, msg }),
  };
}
