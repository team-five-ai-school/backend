import { createHash } from "node:crypto";

export type AiLogger = { info: (obj: object, msg?: string) => void; warn: (obj: object, msg?: string) => void };

/** What we log about user text: never the text itself. */
export function textFingerprint(text: string) {
  return { inputLength: text.length, inputHash: createHash("sha256").update(text).digest("hex").slice(0, 16) };
}

export type AiCallLog = {
  task: string;
  model: string | null;
  ms: number;
  ok: boolean;
  /** Why the fallback was used, if it was. */
  fallbackReason?: string;
  inputTokens?: number;
  outputTokens?: number;
  inputLength?: number;
  inputHash?: string;
};

export function logAiCall(log: AiLogger, entry: AiCallLog) {
  if (entry.ok) log.info({ ai: entry }, "ai call");
  else log.warn({ ai: entry }, "ai call fell back");
}

export function describeError(error: unknown): string {
  if (error instanceof Error) {
    if (error.name === "TimeoutError" || error.name === "AbortError") return "timeout";
    return error.name || "error";
  }
  return "error";
}
