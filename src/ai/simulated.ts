import { MockLanguageModelV4 } from "ai/test";

/**
 * A stand-in "mentor" model for local runs without an API key (AI_SIMULATE=1, never in production).
 * It answers through the same AI SDK path as the real model: structured JSON for the requested schema,
 * after a short delay, so prompts → parsing → guards → DB → UI all run as they will with Claude.
 *
 * Scenario switches in a learner question: "#fail" → provider error (503), "#slow" → never answers (timeout).
 */

const usage = {
  inputTokens: { total: 0, noCache: 0, cacheRead: undefined, cacheWrite: undefined },
  outputTokens: { total: 0, text: 0, reasoning: undefined },
};

type Part = { type: string; text?: string };
type Msg = { role: string; content: string | Part[] };

function lastUserText(prompt: Msg[]) {
  const last = [...prompt].reverse().find((m) => m.role === "user");
  if (!last) return "";
  return typeof last.content === "string" ? last.content : last.content.map((p) => p.text ?? "").join("\n");
}

function lessonTitle(prompt: Msg[]) {
  const system = prompt.find((m) => m.role === "system");
  const text = typeof system?.content === "string" ? system.content : "";
  return /LESSON: (.+)/.exec(text)?.[1] ?? "this lesson";
}

function answer(keys: string[], prompt: Msg[]) {
  const user = lastUserText(prompt);
  const lesson = lessonTitle(prompt);

  if (keys.includes("what")) {
    const learner = /The learner answered: (.+)/.exec(user)?.[1] ?? "your answer";
    return {
      reply: `Close, but this answer leaves the assistant guessing. In **${lesson}** the key is to give the AI the facts it can't know.`,
      points: ["Re-read the question: what does the assistant need to know?", "Compare what each option tells the AI."],
      example: { title: "Before → after", text: "“Write a job ad” → “Write a job ad for a support agent. Duties: … Must-have: …”" },
      promptExample: null,
      suggestions: ["Why does this matter at work?", "Give me another example"],
      what: `You picked ${learner}, which leaves out details the AI needs.`,
      why: "Without real details the AI fills the gaps with generic text.",
      how: "Look for the option that tells the AI who, what and what result you need.",
      followUpIndex: 0,
    };
  }
  if (keys.includes("summary")) {
    const missed = (user.match(/Missed on the first try/g) ?? []).length;
    return {
      summary: missed
        ? `Solid work on ${lesson}. ${missed} exercise${missed > 1 ? "s" : ""} took a second try, so that's where to practise.`
        : `Clean run on ${lesson}: everything right on the first try.`,
      recommendations: missed
        ? ["Redo the exercises you missed with a real task from this week.", "Write one prompt at work using the lesson's checklist."]
        : ["Use the lesson's checklist on one real task this week."],
    };
  }
  const question = /Question: (.+)/s.exec(user)?.[1]?.trim() ?? user;
  return {
    reply: `Good question. In **${lesson}** the short answer is: tell the AI what it can't guess, then check what it gives back.`,
    points: ["Say who it's for and what you need.", "Give the facts and the format.", "Read the result before you use it."],
    example: null,
    promptExample: `You are helping me with: ${question.slice(0, 80)}. Ask me for any missing facts before you answer.`,
    suggestions: ["Show me an example", "What's the most common mistake here?"],
  };
}

export function simulatedMentorModel() {
  return new MockLanguageModelV4({
    doGenerate: async ({ prompt, responseFormat, abortSignal }) => {
      const user = lastUserText(prompt as Msg[]);
      if (user.includes("#fail")) throw new Error("simulated provider error");
      if (user.includes("#slow")) {
        await new Promise((_, reject) => abortSignal?.addEventListener("abort", () => reject(abortSignal.reason), { once: true }));
      }
      await new Promise((r) => setTimeout(r, 1200));
      const schema = responseFormat?.type === "json" ? (responseFormat.schema as { properties?: object } | undefined) : undefined;
      const keys = Object.keys(schema?.properties ?? {});
      return {
        content: [{ type: "text", text: JSON.stringify(answer(keys, prompt as Msg[])) }],
        finishReason: { unified: "stop", raw: undefined },
        usage,
        warnings: [],
      };
    },
  });
}
