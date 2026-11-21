import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { getExercise, getLesson } from "../content/courses.ts";
import { reviewLesson, scoreLesson } from "./lesson-review.ts";
import { askMentor, reviewMistake } from "./mentor.ts";
import { memoryLogger, mockHangingModel, mockTextModel } from "./test-utils.ts";

const { lesson, course } = getLesson("ai-for-hr-l1")!;
const exercise = getExercise("ai-for-hr-l1-e1")!.exercise; // single select, correct option index 1
const correctText =
  "Write a job ad for a sales coordinator. Daily duties: handle quotes, update the CRM. Must-have: 2 years of customer contact. Nice-to-have: CRM experience.";
const attempt = { id: "00000000-0000-4000-8000-000000000001", answer: { optionIds: ["0"] }, attempt: 1, createdAt: new Date() };

const review = (over: Record<string, unknown> = {}) =>
  JSON.stringify({
    reply: "Look at which prompt gives **real duties**.",
    points: ["Name the role", "List must-haves"],
    example: null,
    promptExample: null,
    suggestions: ["Why do duties matter?"],
    what: "Your prompt left the assistant guessing.",
    why: "Vague ads attract the wrong people.",
    how: "Check which prompt names the duties.",
    followUpIndex: 0,
    ...over,
  });

describe("reviewMistake", () => {
  it("falls back to a hint-based note without a model", async () => {
    const log = memoryLogger();
    const r = await reviewMistake({ lesson, exercise, attempt, revealed: new Set(), log, model: undefined });
    // No AI_MODEL_MENTOR in tests → fallback.
    assert.equal(r.source, "fallback");
    assert.equal(r.message.mistake?.why, exercise.hint);
    assert.equal(r.message.extraTasks.length, 1);
  });

  it("returns blocks, the mistake note and a follow-up task from the model", async () => {
    const r = await reviewMistake({
      lesson, exercise, attempt, revealed: new Set(), log: memoryLogger(),
      model: { model: mockTextModel(review()), modelId: "mock" },
    });
    assert.equal(r.source, "llm");
    assert.equal(r.message.blocks[0]?.type, "text");
    assert.match((r.message.blocks[0] as { text: string }).text, /==real duties==/);
    assert.equal(r.message.mistake?.how, "Check which prompt names the duties.");
    assert.equal(r.message.extraTasks[0]?.description, lesson.mentor.follow_up_tasks[0]);
  });

  it("blocks a reply that quotes the hidden correct answer", async () => {
    const r = await reviewMistake({
      lesson, exercise, attempt, revealed: new Set(), log: memoryLogger(),
      model: { model: mockTextModel(review({ reply: `The answer is: ${correctText}` })), modelId: "mock" },
    });
    assert.equal(r.source, "fallback");
    assert.equal(r.fallbackReason, "answer_leak");
  });

  it("allows the answer once the exercise is revealed", async () => {
    const r = await reviewMistake({
      lesson, exercise, attempt, revealed: new Set([exercise.id]), log: memoryLogger(),
      model: { model: mockTextModel(review({ reply: `The best one: ${correctText}` })), modelId: "mock" },
    });
    assert.equal(r.source, "llm");
  });

  it("falls back on a timeout", async () => {
    const r = await reviewMistake({
      lesson, exercise, attempt, revealed: new Set(), log: memoryLogger(),
      model: { model: mockHangingModel(), modelId: "mock" }, timeoutMs: 50,
    });
    assert.equal(r.source, "fallback");
  });
});

describe("askMentor", () => {
  const body = { text: "How do I avoid buzzwords?", context: { source: "lesson" as const, lessonId: lesson.id, exerciseId: null }, history: [] };

  it("reports not configured without a model", async () => {
    const r = await askMentor({ lesson, body, revealed: new Set(), log: memoryLogger() });
    assert.deepEqual(r, { ok: false, reason: r.ok ? "" : r.reason, configured: false });
  });

  it("answers with blocks and suggestions", async () => {
    const r = await askMentor({
      lesson, body, revealed: new Set(), log: memoryLogger(),
      model: { model: mockTextModel(review()), modelId: "mock" },
    });
    assert.ok(r.ok);
    if (r.ok) assert.deepEqual(r.message.suggestions, ["Why do duties matter?"]);
  });
});

describe("lesson review", () => {
  const attempts = [
    { exerciseId: "ai-for-hr-l1-e1", attempt: 1, verdict: "incorrect", answer: { optionIds: ["0"] } },
    { exerciseId: "ai-for-hr-l1-e1", attempt: 2, verdict: "correct", answer: { optionIds: ["1"] } },
  ];

  it("scores first tries by skill in code", () => {
    const s = scoreLesson(lesson, attempts);
    assert.equal(s.weak[0]?.exercise.id, "ai-for-hr-l1-e1");
    assert.ok(s.total >= 1);
  });

  it("writes a fallback review without a model", async () => {
    const r = await reviewLesson({ lesson, courseId: course.id, attempts, log: memoryLogger() });
    assert.equal(r.source, "fallback");
    assert.ok(r.weakSpots.some((w) => w.exerciseId === "ai-for-hr-l1-e1"));
    assert.ok(r.recommendations.length > 0);
  });

  it("uses the model's summary and recommendations", async () => {
    const r = await reviewLesson({
      lesson, courseId: course.id, attempts, log: memoryLogger(),
      model: { model: mockTextModel(JSON.stringify({ summary: "Good start.", recommendations: ["Rewrite one old job ad."] })), modelId: "mock" },
    });
    assert.equal(r.source, "llm");
    assert.equal(r.summary, "Good start.");
  });
});
