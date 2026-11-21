import { mkdirSync, readFileSync, writeFileSync } from "node:fs";

import { memoryLogger } from "../../src/ai/test-utils.ts";

export { memoryLogger };

export const evalsDir = new URL("../", import.meta.url);

export function loadDataset<T>(name: string): T[] {
  return JSON.parse(readFileSync(new URL(`datasets/${name}`, evalsDir), "utf8")) as T[];
}

/** Runs `fn` over items with at most `limit` in flight; keeps input order. */
export async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T, i: number) => Promise<R>): Promise<R[]> {
  const out = new Array<R>(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i]!, i);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return out;
}

export type CheckResult = { name: string; pass: boolean; detail?: string };

export const check = (name: string, pass: boolean, detail?: string): CheckResult => ({ name, pass, ...(detail && { detail }) });

/** The `ai call` log entries a component wrote during one case (model, ms, tokens, fallbackReason). */
export function aiCalls(log: ReturnType<typeof memoryLogger>) {
  return log.entries.filter((e) => "ai" in e.obj).map((e) => e.obj.ai as Record<string, unknown>);
}

export function saveResults(component: string, report: object, mock: boolean) {
  const dir = new URL("results/", evalsDir);
  mkdirSync(dir, { recursive: true });
  const stamp = new Date().toISOString().slice(0, 16).replace(/[:T]/g, "-");
  const file = new URL(`${component}-${stamp}${mock ? "-mock" : ""}.json`, dir);
  writeFileSync(file, JSON.stringify(report, null, 2) + "\n");
  return file.pathname;
}

export const pct = (n: number, d: number) => (d ? `${Math.round((100 * n) / d)}%` : "–");

export const wordCount = (s: string) => s.split(/\s+/).filter(Boolean).length;
