import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { DefaultTask, QuizQuestionConfig } from "../db/schema/index.ts";
import { roleSeeds } from "../seed/roles.ts";
import { validateSeeds } from "../seed/index.ts";
import { applyQuiz, publicQuiz, validateAnswers } from "./quiz.ts";

const tasks: DefaultTask[] = [
  { title: "Messages", skillSlug: "faq-answers", hoursPerWeek: 4, aiCapability: "auto" },
  { title: "Schedule", skillSlug: "schedule-planning", hoursPerWeek: 3, aiCapability: "assist" },
];
const quiz: QuizQuestionConfig[] = [
  {
    id: "q1",
    kind: "single",
    text: "Messages per day?",
    options: [
      { id: "few", label: "Few", effect: { multiply: { "faq-answers": 0.5 } } },
      { id: "normal", label: "Normal" },
      { id: "many", label: "Many", effect: { multiply: { "faq-answers": 2 } } },
    ],
  },
  {
    id: "q2",
    kind: "multi",
    text: "Channels?",
    options: [
      { id: "a", label: "A", effect: { multiply: { "faq-answers": 1.5 } } },
      { id: "b", label: "B", effect: { multiply: { "faq-answers": 1.5, "schedule-planning": 20 } } },
    ],
  },
];

describe("applyQuiz", () => {
  it("multiplies the hours of tasks with the affected skills", () => {
    const [faq, schedule] = applyQuiz(tasks, quiz, [{ questionId: "q1", optionIds: ["many"] }]);
    assert.equal(faq!.hoursPerWeek, 8);
    assert.equal(schedule!.hoursPerWeek, 3);
  });

  it("combines several answers multiplicatively, rounds to 0.5 h and clamps to 40 h", () => {
    const [faq, schedule] = applyQuiz(tasks, quiz, [
      { questionId: "q1", optionIds: ["few"] },
      { questionId: "q2", optionIds: ["a", "b"] },
    ]);
    assert.equal(faq!.hoursPerWeek, 4.5); // 4 × 0.5 × 1.5 × 1.5 = 4.5
    assert.equal(schedule!.hoursPerWeek, 40); // 3 × 20 = 60 → 40
  });

  it("ignores options without an effect and unknown answers", () => {
    const result = applyQuiz(tasks, quiz, [
      { questionId: "q1", optionIds: ["normal"] },
      { questionId: "nope", optionIds: ["x"] },
    ]);
    assert.deepEqual(result, tasks);
  });
});

describe("validateAnswers", () => {
  it("rejects unknown questions and options, and several options on a single question", () => {
    assert.match(validateAnswers(quiz, [{ questionId: "nope", optionIds: ["x"] }])!, /Unknown question/);
    assert.match(validateAnswers(quiz, [{ questionId: "q1", optionIds: ["x"] }])!, /Unknown option/);
    assert.match(validateAnswers(quiz, [{ questionId: "q1", optionIds: ["few", "many"] }])!, /one option/);
    assert.equal(validateAnswers(quiz, [{ questionId: "q2", optionIds: ["a", "b"] }]), null);
  });
});

describe("role seeds", () => {
  it("reference only known skills", () => assert.doesNotThrow(validateSeeds));

  it("have 6–8 quiz questions per role with unique ids, and the public quiz hides effects", () => {
    for (const role of roleSeeds) {
      assert.ok(role.quiz.length >= 6 && role.quiz.length <= 8, `${role.slug}: ${role.quiz.length} questions`);
      assert.equal(new Set(role.quiz.map((q) => q.id)).size, role.quiz.length);
      assert.ok(!JSON.stringify(publicQuiz(role.quiz)).includes("multiply"));
    }
  });
});
