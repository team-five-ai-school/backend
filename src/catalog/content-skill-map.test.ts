import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { listCourses } from "../content/courses.ts";
import { skillSeeds } from "../seed/skills.ts";
import { skillLessons } from "./content-skill-map.ts";
import { lessonSkills, validateSkillMap } from "./sync-content.ts";

describe("content skill map", () => {
  it("references only existing lessons and skills, and no excluded courses", () => {
    assert.doesNotThrow(() => validateSkillMap());
  });

  it("covers every skill of the taxonomy (an empty list is an explicit slot)", () => {
    assert.deepEqual(Object.keys(skillLessons).sort(), skillSeeds.map((s) => s.slug).sort());
  });

  it("rejects typos and excluded lessons", () => {
    const courses = listCourses();
    assert.throws(() => validateSkillMap(courses, { "draft-replies": ["no-such-lesson"] }), /unknown lesson/);
    assert.throws(() => validateSkillMap(courses, { "write-cv": [] }), /unknown skill/);
    assert.throws(() => validateSkillMap(courses, { "draft-replies": ["ai-for-hr-l1"] }), /excluded lesson/);
  });

  it("inverts skill → lessons into lesson → skills", () => {
    const map = lessonSkills({ a: ["l1", "l2"], b: ["l1"] });
    assert.deepEqual(map.get("l1"), ["a", "b"]);
    assert.deepEqual(map.get("l2"), ["a"]);
  });
});
