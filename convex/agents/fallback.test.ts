import { describe, expect, it, vi } from "vitest";
import { APICallError } from "@ai-sdk/provider";
import type { LanguageModelV3CallOptions } from "@ai-sdk/provider";
import { MockLanguageModelV3 } from "ai/test";
import { withFallback } from "./fallback";

// No network here: both sides are mocks. What is being pinned is when the
// fallback answers and when it must not.

const options = (signal?: AbortSignal) =>
  ({
    prompt: [{ role: "user", content: [{ type: "text", text: "hi" }] }],
    ...(signal ? { abortSignal: signal } : {}),
  }) as LanguageModelV3CallOptions;

const generated = (text: string) => ({
  content: [{ type: "text" as const, text }],
  finishReason: { unified: "stop" as const, raw: "stop" },
  usage: {
    inputTokens: {
      total: 1,
      noCache: 1,
      cacheRead: undefined,
      cacheWrite: undefined,
    },
    outputTokens: { total: 1, text: 1, reasoning: undefined },
  },
  warnings: [],
});

// The Anthropic API's answer when the credit has run out.
const creditExhausted = () =>
  new APICallError({
    message: "Your credit balance is too low to access the Anthropic API.",
    url: "https://api.anthropic.com/v1/messages",
    requestBodyValues: {},
    statusCode: 400,
  });

const failing = (error: unknown) =>
  new MockLanguageModelV3({
    provider: "anthropic.messages",
    modelId: "anthropic/claude-sonnet-5",
    doGenerate: async () => {
      throw error;
    },
    doStream: async () => {
      throw error;
    },
  });

const answering = (text: string) =>
  new MockLanguageModelV3({
    provider: "openrouter",
    modelId: "deepseek/deepseek-v4.1-flash-1017",
    doGenerate: async () => generated(text),
  });

describe("withFallback", () => {
  it("answers from the primary when it works", async () => {
    const model = withFallback(answering("primary"), answering("fallback"));
    const result = await model.doGenerate(options());
    expect(result.content).toEqual([{ type: "text", text: "primary" }]);
  });

  it("answers from the fallback when the primary fails before answering", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const model = withFallback(
      failing(creditExhausted()),
      answering("fallback"),
    );
    const result = await model.doGenerate(options());
    expect(result.content).toEqual([{ type: "text", text: "fallback" }]);
  });

  it("falls back on a failed stream as well", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const fallback = answering("fallback");
    const doStream = vi.fn(async () => ({
      stream: new ReadableStream(),
    }));
    fallback.doStream = doStream;
    const model = withFallback(failing(creditExhausted()), fallback);
    await model.doStream(options());
    expect(doStream).toHaveBeenCalledOnce();
  });

  it("does not answer a stopped generation on another model", async () => {
    // Stopping aborts the request on purpose; a fallback would undo the stop.
    const controller = new AbortController();
    controller.abort();
    const abort = Object.assign(new Error("aborted"), { name: "AbortError" });
    const fallback = answering("fallback");
    const doGenerate = vi.spyOn(fallback, "doGenerate");
    const model = withFallback(failing(abort), fallback);
    await expect(model.doGenerate(options(controller.signal))).rejects.toBe(
      abort,
    );
    expect(doGenerate).not.toHaveBeenCalled();
  });

  it("surfaces the primary's error while the fallback is switched off", async () => {
    // Quick and Thoughtful fall back to Claude only while the Anthropic key
    // is set; without it, OpenRouter's own error is the one worth seeing.
    const error = creditExhausted();
    const fallback = answering("fallback");
    const doGenerate = vi.spyOn(fallback, "doGenerate");
    const model = withFallback(failing(error), fallback, () => false);
    await expect(model.doGenerate(options())).rejects.toBe(error);
    expect(doGenerate).not.toHaveBeenCalled();
  });

  it("keeps the primary's name, which the usage ledger reads", () => {
    const model = withFallback(
      failing(creditExhausted()),
      answering("fallback"),
    );
    expect(model.modelId).toBe("anthropic/claude-sonnet-5");
    expect(model.provider).toBe("anthropic.messages");
  });
});
