import type { LanguageModelV3StreamPart } from "@ai-sdk/provider";
import { describe, expect, test } from "vitest";
import { cutAtSpecialToken, stripSpecialTokensStream } from "./specialTokens";

// What two of the broken replies on the 2026-11-28 export ended with: a real
// answer would come first, then DeepSeek's tool-call markup written as text.
const DSML = `\n\n<｜DSML｜ calls>\n<｜DSML｜ invoke name="readPage">\n<｜DSML｜ parameter name="bookId" string="false">144</｜DSML｜ parameter>`;
const DSML_ZWSP = `\n\n<​｜DSML｜ calls>\n<​｜DSML｜ invoke name="readPage">`;

describe("cutAtSpecialToken", () => {
  test("keeps the answer and drops the markup after it", () => {
    expect(cutAtSpecialToken(`स्वत्व का अर्थ है…${DSML}`)).toEqual({
      text: "स्वत्व का अर्थ है…",
      cut: true,
    });
  });

  test("catches the variant with a zero-width space", () => {
    expect(cutAtSpecialToken(`Answer.${DSML_ZWSP}`).text).toBe("Answer.");
  });

  test("a reply that is only markup becomes empty", () => {
    expect(cutAtSpecialToken(DSML).text).toBe("");
  });

  test("ordinary text, angle brackets included, is untouched", () => {
    const text = "Use <b>bold</b> sparingly; 3 < 4 and a｜b are fine.";
    expect(cutAtSpecialToken(text)).toEqual({ text, cut: false });
  });
});

async function run(deltas: string[]): Promise<string> {
  const parts: LanguageModelV3StreamPart[] = [
    { type: "text-start", id: "t" },
    ...deltas.map((delta) => ({ type: "text-delta" as const, id: "t", delta })),
    { type: "text-end", id: "t" },
  ];
  const stream = new ReadableStream<LanguageModelV3StreamPart>({
    start(controller) {
      for (const part of parts) controller.enqueue(part);
      controller.close();
    },
  }).pipeThrough(stripSpecialTokensStream());
  let out = "";
  const reader = stream.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value.type === "text-delta") out += value.delta;
  }
  return out;
}

describe("stripSpecialTokensStream", () => {
  test("passes ordinary text through unchanged", async () => {
    expect(await run(["Hello ", "there, ", "a < b."])).toBe(
      "Hello there, a < b.",
    );
  });

  test("drops markup that arrives in its own delta", async () => {
    expect(await run(["The answer.", DSML])).toBe("The answer.");
  });

  test("catches a marker split across deltas", async () => {
    // Whitespace already streamed before the marker can't be taken back;
    // the markup is what matters.
    expect(
      (await run(["The answer.\n\n<", "｜DSML｜ calls>", " more"])).trimEnd(),
    ).toBe("The answer.");
    expect(await run(["The answer.<", "​", "｜DSML｜"])).toBe("The answer.");
  });

  test("a held-back '<' that turns out to be text is still delivered", async () => {
    expect(await run(["if a <", " b then"])).toBe("if a < b then");
    expect(await run(["ends with <"])).toBe("ends with <");
  });
});
