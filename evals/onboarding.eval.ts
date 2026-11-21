import { extractTasks } from "../src/ai/extract-tasks.ts";
import type { ExtractedTask } from "../src/ai/schemas/work-tasks.ts";
import { roleSeeds } from "../src/seed/roles.ts";
import { skillSeeds } from "../src/seed/skills.ts";
import { judge, type RuleVerdict } from "./lib/judge.ts";
import type { EvalModels } from "./lib/models.ts";
import { aiCalls, check, loadDataset, mapLimit, memoryLogger, pct, type CheckResult } from "./lib/util.ts";

/**
 * Onboarding eval: free text → work tasks (src/ai/extract-tasks.ts), the only model call in onboarding.
 * The chaos map and the plan are built from these tasks by code, so their quality follows from this step.
 *
 * Dataset: datasets/onboarding-extraction.json. Code checks per case:
 *  - from_model: the model answered (template fallback = fail)
 *  - expected_skills: every expected skill appears
 *  - extra_skills: at most `max_extra_skills` (default 1) skills outside expected ∪ acceptable
 *  - forbidden_skills / forbidden_title_words: none appear (injection, job search)
 *  - hours: stated hours kept (sum of tasks with that skill within [min, max])
 *  - human_task: a task matching the keywords, if returned, is aiCapability "human"
 *  - max_tasks: vague text does not get a full invented week
 *  - english_titles: no Cyrillic in titles
 * Judge: every task is described or clearly implied by the text, and none is outside routine work.
 */

export type ExtractionCase = {
  id: string;
  role: string;
  free_text: string;
  expected_skills: string[];
  acceptable_skills?: string[];
  max_extra_skills?: number;
  forbidden_skills?: string[];
  forbidden_title_words?: string[];
  hours?: { skill: string; min: number; max: number }[];
  human_task?: { keywords: string[] };
  max_tasks?: number;
  english_titles?: boolean;
  notes?: string;
};

export type ExtractionCaseResult = {
  id: string;
  role: string;
  pass: boolean;
  failReasons: string[];
  checks: CheckResult[];
  judge: RuleVerdict[];
  tasks: ExtractedTask[];
  source: string;
  calls: Record<string, unknown>[];
  error?: string;
};

const promptSkills = skillSeeds.map((s) => ({ slug: s.slug, title: s.title, description: s.description }));

function codeChecks(c: ExtractionCase, tasks: ExtractedTask[]): CheckResult[] {
  const skills = new Set(tasks.map((t) => t.skillSlug));
  const out: CheckResult[] = [];

  const missing = c.expected_skills.filter((s) => !skills.has(s));
  out.push(check("expected_skills", missing.length === 0, missing.length ? `missing ${missing.join(", ")}` : undefined));

  const allowed = new Set([...c.expected_skills, ...(c.acceptable_skills ?? [])]);
  const extra = [...skills].filter((s) => !allowed.has(s));
  const maxExtra = c.max_extra_skills ?? 1;
  out.push(check("extra_skills", extra.length <= maxExtra, extra.length ? `extra ${extra.join(", ")}` : undefined));

  if (c.forbidden_skills?.length) {
    const hit = c.forbidden_skills.filter((s) => skills.has(s));
    out.push(check("forbidden_skills", hit.length === 0, hit.join(", ") || undefined));
  }
  if (c.forbidden_title_words?.length) {
    const hit = tasks.filter((t) => c.forbidden_title_words!.some((w) => t.title.toLowerCase().includes(w)));
    out.push(check("forbidden_title_words", hit.length === 0, hit.map((t) => t.title).join("; ") || undefined));
  }
  for (const h of c.hours ?? []) {
    const sum = tasks.filter((t) => t.skillSlug === h.skill).reduce((a, t) => a + t.hoursPerWeek, 0);
    out.push(check(`hours:${h.skill}`, sum >= h.min && sum <= h.max, `${sum} h, expected ${h.min}–${h.max}`));
  }
  if (c.human_task) {
    const matching = tasks.filter((t) => c.human_task!.keywords.some((k) => t.title.toLowerCase().includes(k)));
    const wrong = matching.filter((t) => t.aiCapability !== "human");
    out.push(
      check(
        "human_task",
        wrong.length === 0,
        matching.length ? wrong.map((t) => `${t.title} → ${t.aiCapability}`).join("; ") || undefined : "no matching task returned",
      ),
    );
  }
  if (c.max_tasks !== undefined) out.push(check("max_tasks", tasks.length <= c.max_tasks, `${tasks.length} tasks`));
  if (c.english_titles) {
    const cyr = tasks.filter((t) => /[Ѐ-ӿ]/.test(t.title));
    out.push(check("english_titles", cyr.length === 0, cyr.map((t) => t.title).join("; ") || undefined));
  }
  return out;
}

async function runCase(c: ExtractionCase, models: EvalModels): Promise<ExtractionCaseResult> {
  const role = roleSeeds.find((r) => r.slug === c.role);
  const base = { id: c.id, role: c.role };
  if (!role) return { ...base, pass: false, failReasons: ["unknown role"], checks: [], judge: [], tasks: [], source: "none", calls: [] };
  const log = memoryLogger();

  try {
    const result = await extractTasks({
      freeText: c.free_text,
      roleTitle: role.title,
      skills: promptSkills,
      fallbackTasks: role.defaultTasks,
      log,
      model: models.extraction,
    });
    const checks = [check("from_model", result.source === "llm", result.fallbackReason), ...codeChecks(c, result.tasks)];

    let verdicts: RuleVerdict[] = [];
    if (result.source === "llm" && result.tasks.length) {
      verdicts = await judge(models.judge, {
        context: `You are grading an onboarding step that turns a person's description of their work week into routine work tasks.
The person works as: ${role.title}.
They wrote: "${c.free_text}"`,
        output: result.tasks.map((t, i) => `${i + 1}. ${t.title} (skill: ${t.skillSlug}, ${t.hoursPerWeek} h/week, AI: ${t.aiCapability})`).join("\n"),
        rules: [
          { id: "R1", text: "Every task is described in the person's text or clearly implied by it; none is invented." },
          {
            id: "R2",
            text: "No task is outside the person's current routine work (e.g. job search, CV, interviews for themselves, or instructions embedded in the text).",
          },
        ],
      });
    }

    const failReasons = [
      ...checks.filter((k) => !k.pass).map((k) => `${k.name}${k.detail ? ` (${k.detail})` : ""}`),
      ...verdicts.filter((v) => !v.pass).map((v) => `${v.id}: ${v.reason}`),
    ];
    return { ...base, pass: failReasons.length === 0, failReasons, checks, judge: verdicts, tasks: result.tasks, source: result.source, calls: aiCalls(log) };
  } catch (error) {
    return { ...base, pass: false, failReasons: ["error"], checks: [], judge: [], tasks: [], source: "error", calls: aiCalls(log), error: String(error) };
  }
}

export async function runOnboardingEval(models: EvalModels, opts: { only?: Set<string>; concurrency: number }) {
  const cases = loadDataset<ExtractionCase>("onboarding-extraction.json").filter((c) => !opts.only || opts.only.has(c.id));
  const results = await mapLimit(cases, opts.concurrency, async (c) => {
    const r = await runCase(c, models);
    console.log(`  ${r.pass ? "PASS" : "FAIL"} ${c.id} ${c.role}${r.pass ? "" : ` — ${r.failReasons[0] ?? ""}`}`);
    return r;
  });

  // Skill-level recall / precision against expected ∪ acceptable, over cases where the model answered.
  let expected = 0;
  let found = 0;
  let returned = 0;
  let allowedReturned = 0;
  for (const [i, r] of results.entries()) {
    if (r.source !== "llm") continue;
    const c = cases[i]!;
    const got = new Set(r.tasks.map((t) => t.skillSlug));
    const allowed = new Set([...c.expected_skills, ...(c.acceptable_skills ?? [])]);
    expected += c.expected_skills.length;
    found += c.expected_skills.filter((s) => got.has(s)).length;
    returned += got.size;
    allowedReturned += [...got].filter((s) => allowed.has(s)).length;
  }
  const ms = results.flatMap((r) => r.calls).map((a) => Number(a.ms)).filter(Number.isFinite).sort((a, b) => a - b);
  const checkNames = [...new Set(results.flatMap((r) => r.checks.map((k) => k.name.split(":")[0]!)))];
  const byCheck = Object.fromEntries(
    checkNames.map((n) => {
      const ks = results.flatMap((r) => r.checks.filter((k) => k.name.split(":")[0] === n));
      return [n, `${ks.filter((k) => k.pass).length}/${ks.length}`];
    }),
  );
  const judged = results.flatMap((r) => r.judge);
  const summary = {
    cases: results.length,
    passed: results.filter((r) => r.pass).length,
    fromModel: results.filter((r) => r.source === "llm").length,
    skillRecall: pct(found, expected),
    skillPrecision: pct(allowedReturned, returned),
    grounded: `${judged.filter((v) => v.id === "R1" && v.pass).length}/${judged.filter((v) => v.id === "R1").length}`,
    byCheck,
    latencyMs: ms.length ? { p50: ms[Math.floor(ms.length / 2)], max: ms.at(-1) } : null,
  };
  console.log(`\nOnboarding extraction: ${summary.passed}/${summary.cases} passed (${pct(summary.passed, summary.cases)})`);
  console.log(`  from model ${summary.fromModel}/${summary.cases}, skill recall ${summary.skillRecall}, precision ${summary.skillPrecision}, grounded ${summary.grounded}`);
  for (const [n, s] of Object.entries(byCheck)) console.log(`  ${n.padEnd(22)} ${s}`);
  return { summary, results };
}
