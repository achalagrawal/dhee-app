import type { LanguageModel, ModelMessage } from "ai";
import { describe, expect, test } from "vitest";
import {
  FINAL_STEP_NOTE,
  answerOnlyMessages,
  flattenToolHistory,
  isAnthropicModel,
  stepGuard,
  withoutToolParts,
} from "./steps";

// A turn the way DeepSeek's broken ones looked: a question, reasoning, a tool
// call with its result, then more calls. Built by hand so nothing here reaches
// a model.
const turn: ModelMessage[] = [
  { role: "user", content: "स्वत्व स्वतंत्रता स्वराज्य को पूरी तरह से समझाएं" },
  {
    role: "assistant",
    content: [
      { type: "reasoning", text: "I should look up the terms." },
      {
        type: "tool-call",
        toolCallId: "c1",
        toolName: "lookupDefinition",
        input: { word: "स्वत्व" },
      },
    ],
  },
  {
    role: "tool",
    content: [
      {
        type: "tool-result",
        toolCallId: "c1",
        toolName: "lookupDefinition",
        output: { type: "text", value: "स्वत्व: स्वयं में अधिकार…" },
      },
    ],
  },
  {
    role: "assistant",
    content: [
      { type: "text", text: "Let me read the page." },
      {
        type: "tool-call",
        toolCallId: "c2",
        toolName: "readPage",
        input: { bookId: 144, page: 12 },
      },
    ],
  },
  {
    role: "tool",
    content: [
      {
        type: "tool-result",
        toolCallId: "c2",
        toolName: "readPage",
        output: { type: "json", value: { text: "x".repeat(9000) } },
      },
    ],
  },
];

const openrouterModel = {
  provider: "openrouter.chat",
  modelId: "deepseek/deepseek-v4.1-flash-1017",
} as unknown as LanguageModel;
const claude = {
  provider: "anthropic.messages",
  modelId: "anthropic/claude-sonnet-5-5",
} as unknown as LanguageModel;

function hasToolParts(messages: ModelMessage[]): boolean {
  return messages.some(
    (m) =>
      m.role === "tool" ||
      (Array.isArray(m.content) &&
        m.content.some(
          (p) => p.type === "tool-call" || p.type === "tool-result",
        )),
  );
}

describe("flattenToolHistory", () => {
  test("leaves no tool calls, tool results or reasoning to imitate", () => {
    const flat = flattenToolHistory(turn);
    expect(hasToolParts(flat)).toBe(false);
    expect(JSON.stringify(flat)).not.toContain("I should look up the terms");
  });

  test("keeps what was looked up and what came back, as text", () => {
    const text = JSON.stringify(flattenToolHistory(turn));
    expect(text).toContain("lookupDefinition");
    expect(text).toContain("स्वत्व: स्वयं में अधिकार");
    expect(text).toContain("Let me read the page.");
  });

  test("cuts a long result down rather than replaying a whole page", () => {
    const results = flattenToolHistory(turn).filter(
      (m) => m.role === "user" && String(m.content).includes("readPage"),
    );
    expect(String(results[0]!.content).length).toBeLessThan(5000);
  });

  test("keeps the person's own messages exactly", () => {
    expect(flattenToolHistory(turn)[0]).toEqual(turn[0]);
  });
});

describe("withoutToolParts", () => {
  test("drops tool traffic and keeps the text that was written", () => {
    const out = withoutToolParts(turn);
    expect(hasToolParts(out)).toBe(false);
    expect(JSON.stringify(out)).toContain("Let me read the page.");
    expect(JSON.stringify(out)).not.toContain("I should look up");
  });
});

describe("stepGuard", () => {
  const steps = 12;
  const guard = stepGuard(steps);

  test("an ordinary step on an open-weight model is left alone", () => {
    expect(
      guard({ stepNumber: 3, model: openrouterModel, messages: turn }),
    ).toEqual({});
  });

  test("the last step on an open-weight model sends no tools and no tool history", () => {
    const out = guard({
      stepNumber: steps - 1,
      model: openrouterModel,
      messages: turn,
    });
    expect(out).toMatchObject({ toolChoice: "none", activeTools: [] });
    const messages = (out as { messages: ModelMessage[] }).messages;
    expect(hasToolParts(messages)).toBe(false);
    expect(String(messages.at(-1)!.content)).toContain(FINAL_STEP_NOTE);
  });

  test("the two steps before it carry a warning of how many are left", () => {
    for (const [stepNumber, left] of [
      [steps - 3, "2 more lookup steps"],
      [steps - 2, "one more lookup step"],
    ] as const) {
      const out = guard({ stepNumber, model: openrouterModel, messages: turn });
      const messages = (out as { messages: ModelMessage[] }).messages;
      // The turn is passed through untouched, with the note on the end.
      expect(messages.slice(0, turn.length)).toEqual(turn);
      expect(String(messages.at(-1)!.content)).toContain(left);
    }
  });

  test("Claude keeps the plain final-step guard and no mid-turn notes", () => {
    // Sonnet 5.5 checks replayed thinking against the conversation, so its
    // history is never rewritten; `toolChoice: "none"` already works there.
    expect(
      guard({ stepNumber: steps - 1, model: claude, messages: turn }),
    ).toEqual({
      toolChoice: "none",
    });
    expect(
      guard({ stepNumber: steps - 2, model: claude, messages: turn }),
    ).toEqual({});
  });
});

describe("stepGuard with a budget", () => {
  const guard = stepGuard(12, { openRouterSteps: 6, maxToolCalls: 4 });
  const taken = (calls: number[]) =>
    calls.map((n) => ({ toolCalls: Array.from({ length: n }, () => ({})) }));

  test("an open-weight model answers at its own, smaller step budget", () => {
    const out = guard({
      stepNumber: 5,
      model: openrouterModel,
      messages: turn,
    });
    expect(out).toMatchObject({ toolChoice: "none", activeTools: [] });
    const warned = guard({
      stepNumber: 4,
      model: openrouterModel,
      messages: turn,
    }) as { messages: ModelMessage[] };
    expect(String(warned.messages.at(-1)!.content)).toContain(
      "one more lookup step",
    );
  });

  test("any model answers once its tool calls are spent", () => {
    expect(
      guard({
        stepNumber: 1,
        model: openrouterModel,
        messages: turn,
        steps: taken([4]),
      }),
    ).toMatchObject({ toolChoice: "none", activeTools: [] });
    expect(
      guard({
        stepNumber: 2,
        model: claude,
        messages: turn,
        steps: taken([2, 2]),
      }),
    ).toEqual({ toolChoice: "none" });
  });

  test("Claude keeps the full step budget while it has calls left", () => {
    expect(
      guard({
        stepNumber: 7,
        model: claude,
        messages: turn,
        steps: taken([1]),
      }),
    ).toEqual({});
  });

  test("calls under the budget leave an early step alone", () => {
    expect(
      guard({
        stepNumber: 1,
        model: openrouterModel,
        messages: turn,
        steps: taken([3]),
      }),
    ).toEqual({});
  });
});

test("answerOnlyMessages ends on the note to answer now", () => {
  const out = answerOnlyMessages(turn);
  expect(out.at(-1)).toMatchObject({ role: "user" });
  expect(String(out.at(-1)!.content)).toContain(
    "Answer the person's message now",
  );
});

test("isAnthropicModel reads the provider, not the slug", () => {
  expect(isAnthropicModel(claude)).toBe(true);
  expect(isAnthropicModel(openrouterModel)).toBe(false);
  expect(isAnthropicModel("anthropic/claude-sonnet-5-5")).toBe(false);
});
