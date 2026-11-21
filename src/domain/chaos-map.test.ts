import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { ChaosType } from "../db/schema/index.ts";
import { buildChaosMap, HUMAN_LANE_ID, type ChaosTaskInput } from "./chaos-map.ts";

const info = (slug: string) => ({ title: `T:${slug}`, chaosType: "reports" as ChaosType });
const task = (id: string, skillSlug: string, hoursPerWeek: number, aiCapability: ChaosTaskInput["aiCapability"]): ChaosTaskInput => ({
  id,
  skillSlug,
  chaosType: "reports",
  hoursPerWeek,
  aiCapability,
});

describe("buildChaosMap", () => {
  it("computes totals with the configured factors (auto 0.8, assist 0.4, human 0)", () => {
    // Accountant template: 5 auto, 3 auto, 2 assist, 2 auto, 2 human = 14 h; AI: 4 + 2.4 + 0.8 + 1.6 = 8.8
    const { totals } = buildChaosMap(
      [task("a", "extract", 5, "auto"), task("b", "remind", 3, "auto"), task("c", "report", 2, "assist"), task("d", "triage", 2, "auto"), task("e", "faq", 2, "human")],
      info,
    );
    assert.deepEqual(totals, { hoursTotal: 14, hoursAiCan: 8.8, hoursHuman: 5.2, aiSharePercent: 63 });
  });

  it("groups tasks by skill, sorts lanes by AI hours and puts human tasks in a separate last lane", () => {
    const { lanes } = buildChaosMap(
      [task("a", "small", 1, "auto"), task("b", "big", 4, "auto"), task("c", "big", 2, "assist"), task("d", "big", 3, "human")],
      info,
    );
    assert.deepEqual(lanes.map((l) => l.id), ["big", "small", HUMAN_LANE_ID]);
    assert.deepEqual(lanes[0]!.taskIds, ["b", "c"]);
    assert.equal(lanes[0]!.hoursTotal, 6);
    assert.equal(lanes[0]!.hoursAiCan, 4);
    assert.equal(lanes[0]!.aiSharePercent, 67);
    assert.equal(lanes[0]!.title, "T:big");
    const human = lanes[2]!;
    assert.equal(human.kind, "human");
    assert.equal(human.skillSlug, null);
    assert.deepEqual(human.taskIds, ["d"]);
    assert.equal(human.hoursAiCan, 0);
  });

  it("handles no tasks without dividing by zero", () => {
    assert.deepEqual(buildChaosMap([], info), { lanes: [], totals: { hoursTotal: 0, hoursAiCan: 0, hoursHuman: 0, aiSharePercent: 0 } });
  });

  it("accepts custom factors", () => {
    const { totals } = buildChaosMap([task("a", "x", 10, "assist")], info, { auto: 1, assist: 0.5, human: 0 });
    assert.equal(totals.hoursAiCan, 5);
    assert.equal(totals.aiSharePercent, 50);
  });
});
