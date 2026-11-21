import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { extractTasks, sanitizeExtractedTasks, streamExtractTasks, type ExtractionInput, type ExtractionResult } from "./extract-tasks.ts";
import type { ExtractedTask } from "./schemas/work-tasks.ts";
import { memoryLogger, mockFailingStreamModel, mockHangingModel, mockStreamModel, mockTextModel } from "./test-utils.ts";

const skills = [
  { slug: "messages-to-crm", title: "CRM", description: "d" },
  { slug: "summarize-reports", title: "Reports", description: "d" },
  { slug: "draft-replies", title: "Replies", description: "d" },
];
const fallbackTasks: ExtractedTask[] = [
  {
    title: "Template task",
    skillSlug: "summarize-reports",
    hoursPerWeek: 2,
    aiCapability: "assist",
  },
];
const freeText = "Every day I copy Instagram leads into a spreadsheet. My phone is 0501234567.";

const modelOutput = {
  tasks: [
    {
      title: "Instagram leads into a spreadsheet",
      skillSlug: "messages-to-crm",
      hoursPerWeek: 5,
      aiCapability: "auto",
    },
    {
      title: "Report for my manager",
      skillSlug: "summarize-reports",
      hoursPerWeek: 55,
      aiCapability: "assist",
    },
    {
      title: "Discounts",
      skillSlug: "draft-replies",
      hoursPerWeek: 1.3,
      aiCapability: "human",
    },
  ],
};

function input(
  model: ExtractionInput["model"],
  log = memoryLogger(),
  extra: Partial<ExtractionInput> = {},
): ExtractionInput {
  return {
    freeText,
    roleTitle: "Sales manager",
    skills,
    fallbackTasks,
    log,
    model,
    ...extra,
  };
}

async function drain(gen: AsyncGenerator<string>) {
  let text = "";
  for await (const chunk of gen) text += chunk;
  return text;
}

describe("extractTasks (generateText + Output.object)", () => {
  it("returns the model's tasks, clamped to 0–40 h and rounded", async () => {
    const log = memoryLogger();
    const result = await extractTasks(input({ model: mockTextModel(JSON.stringify(modelOutput)), modelId: "mock" }, log));
    assert.equal(result.source, "llm");
    assert.deepEqual(result.tasks.map((t) => [t.skillSlug, t.hoursPerWeek]), [
      ["messages-to-crm", 5],
      ["summarize-reports", 40],
      ["draft-replies", 1.5],
    ]);
    const entry = log.entries.at(-1)!;
    assert.equal(entry.level, "info");
    const ai = entry.obj.ai as Record<string, unknown>;
    assert.equal(ai.model, "mock");
    assert.equal(ai.inputTokens, 100);
    assert.equal(ai.inputLength, freeText.length);
    assert.ok(!JSON.stringify(log.entries).includes("0501234567"), "user text must not be logged");
  });

  it("falls back to the template on NoObjectGeneratedError", async () => {
    const log = memoryLogger();
    const result = await extractTasks(input({ model: mockTextModel("Sorry, I can't help with that."), modelId: "mock" }, log));
    assert.deepEqual(result, { tasks: fallbackTasks, source: "template", fallbackReason: "no_object" });
    assert.equal(log.entries.at(-1)!.level, "warn");
  });

  it("falls back when the model invents a skill (enum rejects it)", async () => {
    const bad = { tasks: [{ title: "x", skillSlug: "write-cv", hoursPerWeek: 2, aiCapability: "auto" }] };
    const result = await extractTasks(input({ model: mockTextModel(JSON.stringify(bad)), modelId: "mock" }));
    assert.equal(result.source, "template");
  });

  it("falls back on timeout", async () => {
    const result = await extractTasks(input({ model: mockHangingModel(), modelId: "mock" }, memoryLogger(), { timeoutMs: 50 }));
    assert.equal(result.source, "template");
    assert.equal(result.fallbackReason, "timeout");
  });

  it("falls back when no model is configured", async () => {
    const result = await extractTasks({ ...input(undefined), model: undefined });
    assert.equal(result.source, "template");
    assert.match(result.fallbackReason!, /^no_/);
  });

  it("falls back when the model returns no tasks", async () => {
    const result = await extractTasks(input({ model: mockTextModel('{"tasks":[]}'), modelId: "mock" }));
    assert.equal(result.fallbackReason, "empty");
  });
});

describe("streamExtractTasks (streamText + Output.object)", () => {
  it("streams a JSON document task by task and reports the result to onDone", async () => {
    let done: ExtractionResult | undefined;
    const text = await drain(
      streamExtractTasks(input({ model: mockStreamModel(JSON.stringify(modelOutput)), modelId: "mock" }), async (r) => {
        done = r;
      }),
    );
    const doc = JSON.parse(text);
    assert.equal(doc.source, "llm");
    assert.equal(doc.tasks.length, 3);
    assert.equal(doc.tasks[1].hoursPerWeek, 40);
    assert.deepEqual(done?.tasks, doc.tasks);
  });

  it("streams the template when the provider fails", async () => {
    let done: ExtractionResult | undefined;
    const text = await drain(
      streamExtractTasks(input({ model: mockFailingStreamModel(), modelId: "mock" }), async (r) => {
        done = r;
      }),
    );
    assert.deepEqual(JSON.parse(text), { tasks: fallbackTasks, source: "template" });
    assert.equal(done?.source, "template");
  });

  it("streams the template when the output is not valid JSON", async () => {
    const text = await drain(streamExtractTasks(input({ model: mockStreamModel("no json here"), modelId: "mock" }), async () => {}));
    assert.equal(JSON.parse(text).source, "template");
  });
});

describe("sanitizeExtractedTasks", () => {
  it("drops unknown skills and empty titles and keeps at most 12", () => {
    const many = Array.from({ length: 15 }, (_, i) => ({ title: `t${i}`, skillSlug: "draft-replies", hoursPerWeek: 1, aiCapability: "auto" as const }));
    const result = sanitizeExtractedTasks(
      [{ title: "  ", skillSlug: "draft-replies", hoursPerWeek: 1, aiCapability: "auto" }, { title: "x", skillSlug: "nope", hoursPerWeek: 1, aiCapability: "auto" }, ...many],
      new Set(["draft-replies"]),
    );
    assert.equal(result.length, 12);
    assert.equal(result[0]!.title, "t0");
  });
});
