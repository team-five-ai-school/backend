import { parseArgs } from "node:util";

import { resolveEvalModels } from "./lib/models.ts";
import { saveResults } from "./lib/util.ts";
import { runMentorEval } from "./mentor.eval.ts";
import { runOnboardingEval } from "./onboarding.eval.ts";

/**
 * npm run evals -- [mentor|onboarding|all] [--mock] [--only id1,id2] [--concurrency N]
 * Results: evals/results/<component>-<timestamp>.json (mock runs get a -mock suffix).
 */

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    mock: { type: "boolean", default: false },
    only: { type: "string" },
    concurrency: { type: "string", default: "3" },
  },
});

const target = positionals[0] ?? "all";
if (!["mentor", "onboarding", "all"].includes(target)) {
  console.error(`Unknown target "${target}". Use mentor, onboarding or all.`);
  process.exit(2);
}

let models;
try {
  models = resolveEvalModels(values.mock);
} catch (error) {
  console.error((error as Error).message);
  process.exit(2);
}
const opts = { only: values.only ? new Set(values.only.split(",")) : undefined, concurrency: Math.max(1, Number(values.concurrency) || 3) };
const meta = { ranAt: new Date().toISOString(), mock: models.mock, models: models.describe };
console.log(`Models: ${JSON.stringify(models.describe)}${models.mock ? "  (MOCK: scores are meaningless)" : ""}\n`);

let failed = false;
if (target === "mentor" || target === "all") {
  console.log("Mentor");
  const report = await runMentorEval(models, opts);
  console.log(`  → ${saveResults("mentor", { ...meta, ...report }, models.mock)}\n`);
  failed ||= report.summary.passed < report.summary.cases;
}
if (target === "onboarding" || target === "all") {
  console.log("Onboarding extraction");
  const report = await runOnboardingEval(models, opts);
  console.log(`  → ${saveResults("onboarding", { ...meta, ...report }, models.mock)}\n`);
  failed ||= report.summary.passed < report.summary.cases;
}
process.exitCode = failed ? 1 : 0;
