import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { DomainEvents } from "../events/index.ts";
import { fillSlotsForLesson, type SlotRepo } from "./slots.ts";

type Item = { id: string; skillSlug: string; status: string; lessonId: string | null };

function memoryRepo(items: Item[], lessons: { id: string; skillSlugs: string[]; published: boolean }[]): SlotRepo {
  return {
    async findPublishedLesson(id) {
      const l = lessons.find((x) => x.id === id && x.published);
      return l ? { id: l.id, skillSlugs: l.skillSlugs } : null;
    },
    async fillSlots(skillSlugs, lessonId) {
      let n = 0;
      for (const item of items) {
        if (item.status === "slot" && skillSlugs.includes(item.skillSlug)) {
          Object.assign(item, { status: "ready", lessonId });
          n++;
        }
      }
      return n;
    },
  };
}

describe("lesson.published → fill plan slots", () => {
  it("fills only slots with the lesson's skills, and is idempotent", async () => {
    const items: Item[] = [
      { id: "1", skillSlug: "extract", status: "slot", lessonId: null },
      { id: "2", skillSlug: "extract", status: "in_progress", lessonId: "old" },
      { id: "3", skillSlug: "remind", status: "slot", lessonId: null },
      { id: "4", skillSlug: "report", status: "slot", lessonId: null },
    ];
    const repo = memoryRepo(items, [{ id: "L1", skillSlugs: ["extract", "remind"], published: true }]);

    const events = new DomainEvents({ error: () => assert.fail("handler must not fail") });
    const filled: number[] = [];
    events.on("lesson.published", async ({ lessonId }) => filled.push(await fillSlotsForLesson(lessonId, repo)));

    await events.publish("lesson.published", { lessonId: "L1" });
    assert.deepEqual(items.map((i) => [i.id, i.status, i.lessonId]), [
      ["1", "ready", "L1"],
      ["2", "in_progress", "old"],
      ["3", "ready", "L1"],
      ["4", "slot", null],
    ]);

    const snapshot = structuredClone(items);
    await events.publish("lesson.published", { lessonId: "L1" });
    assert.deepEqual(items, snapshot);
    assert.deepEqual(filled, [2, 0]);
  });

  it("ignores lessons that are not published", async () => {
    const items: Item[] = [{ id: "1", skillSlug: "extract", status: "slot", lessonId: null }];
    const repo = memoryRepo(items, [{ id: "L1", skillSlugs: ["extract"], published: false }]);
    assert.equal(await fillSlotsForLesson("L1", repo), 0);
    assert.equal(items[0]!.status, "slot");
  });

  it("a failing handler is logged and does not break publish", async () => {
    const errors: unknown[] = [];
    const events = new DomainEvents({ error: (e) => errors.push(e) });
    events.on("lesson.published", () => {
      throw new Error("boom");
    });
    await events.publish("lesson.published", { lessonId: "x" });
    assert.equal(errors.length, 1);
  });
});
