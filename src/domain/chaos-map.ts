import { onboardingConfig } from "../config/onboarding.ts";
import type { AiCapability, ChaosLane, ChaosTotals, ChaosType } from "../db/schema/index.ts";

export type ChaosTaskInput = {
  id: string;
  skillSlug: string;
  chaosType: ChaosType;
  hoursPerWeek: number;
  aiCapability: AiCapability;
};
export type SkillInfo = { title: string; chaosType: ChaosType };
export type AiFactors = Record<AiCapability, number>;

export const HUMAN_LANE_ID = "human";
export const HUMAN_LANE_TITLE = "Your decision";

const round1 = (n: number) => Math.round(n * 10) / 10;
const percent = (part: number, total: number) => (total > 0 ? Math.round((part / total) * 100) : 0);

/** Weekly hours AI can take over for one task. */
export const aiHours = (t: Pick<ChaosTaskInput, "hoursPerWeek" | "aiCapability">, factors: AiFactors) =>
  t.hoursPerWeek * factors[t.aiCapability];

/**
 * Deterministic chaos map: lanes = tasks grouped by skill, plus one "your decision" lane for tasks AI
 * cannot do (`human`). Skill lanes are sorted by hours AI can take, highest first.
 */
export function buildChaosMap(
  tasks: ChaosTaskInput[],
  skillInfo: (slug: string) => SkillInfo | undefined,
  factors: AiFactors = onboardingConfig.aiFactors,
): { lanes: ChaosLane[]; totals: ChaosTotals } {
  const bySkill = new Map<string, ChaosTaskInput[]>();
  const human: ChaosTaskInput[] = [];
  for (const t of tasks) {
    if (t.aiCapability === "human") human.push(t);
    else bySkill.set(t.skillSlug, [...(bySkill.get(t.skillSlug) ?? []), t]);
  }

  const lane = (id: string, kind: ChaosLane["kind"], group: ChaosTaskInput[], skillSlug: string | null): ChaosLane => {
    const hoursTotal = group.reduce((s, t) => s + t.hoursPerWeek, 0);
    const hoursAiCan = group.reduce((s, t) => s + aiHours(t, factors), 0);
    const info = skillSlug ? skillInfo(skillSlug) : undefined;
    return {
      id,
      kind,
      skillSlug,
      title: kind === "human" ? HUMAN_LANE_TITLE : (info?.title ?? skillSlug ?? id),
      chaosType: kind === "human" ? null : (info?.chaosType ?? group[0]!.chaosType),
      taskIds: group.map((t) => t.id),
      hoursTotal: round1(hoursTotal),
      hoursAiCan: round1(hoursAiCan),
      aiSharePercent: percent(hoursAiCan, hoursTotal),
    };
  };

  const lanes = [...bySkill]
    .map(([slug, group]) => lane(slug, "skill", group, slug))
    .sort((a, b) => b.hoursAiCan - a.hoursAiCan || a.id.localeCompare(b.id));
  if (human.length) lanes.push(lane(HUMAN_LANE_ID, "human", human, null));

  const hoursTotal = tasks.reduce((s, t) => s + t.hoursPerWeek, 0);
  const hoursAiCan = tasks.reduce((s, t) => s + aiHours(t, factors), 0);
  return {
    lanes,
    totals: {
      hoursTotal: round1(hoursTotal),
      hoursAiCan: round1(hoursAiCan),
      hoursHuman: round1(hoursTotal - hoursAiCan),
      aiSharePercent: percent(hoursAiCan, hoursTotal),
    },
  };
}
