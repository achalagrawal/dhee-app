import { describe, expect, it } from "vitest";
import type { LanguageModelV3CallOptions } from "@ai-sdk/provider";
import {
  anthropicModelId,
  cacheMiddlewareForTest,
  quickModel,
  reasoningMiddlewareForTest,
  reflectiveModel,
} from "./config";
import { MODEL_SLUGS } from "./models";

// The middleware's output shape is load-bearing: the Anthropic provider
// emits a `cache_control` block only for `anthropic.cacheControl` in
// providerOptions — on a message for a breakpoint, at the top level for
// automatic caching. A rename or a restructure here
// wouldn't error — it would silently stop caching, which looks exactly like
// working caching from every seat except the invoice.

const transform = (prompt: LanguageModelV3CallOptions["prompt"]) =>
  cacheMiddlewareForTest.transformParams!({
    type: "generate",
    params: { prompt } as LanguageModelV3CallOptions,
    model: reflectiveModel,
  });

describe("the system-message cache breakpoint", () => {
  it("stamps an ephemeral breakpoint on the system message", async () => {
    const out = await transform([
      { role: "system", content: "instructions" },
      { role: "user", content: [{ type: "text", text: "hi" }] },
    ]);
    expect(out.prompt[0]).toMatchObject({
      role: "system",
      content: "instructions",
      providerOptions: {
        anthropic: { cacheControl: { type: "ephemeral" } },
      },
    });
  });

  it("turns on automatic caching at the top level too", async () => {
    const out = await transform([{ role: "system", content: "instructions" }]);
    expect(out.providerOptions).toMatchObject({
      anthropic: { cacheControl: { type: "ephemeral" } },
    });
  });

  it("leaves every other message untouched", async () => {
    const user = { role: "user", content: [{ type: "text", text: "hi" }] };
    const out = await transform([
      { role: "system", content: "instructions" },
      user,
    ] as LanguageModelV3CallOptions["prompt"]);
    expect(out.prompt[1]).toBe(user);
  });

  it("keeps other provider options already on the system message", async () => {
    const out = await transform([
      {
        role: "system",
        content: "instructions",
        providerOptions: { anthropic: { sendReasoning: true } },
      },
    ]);
    expect(out.prompt[0]?.providerOptions?.anthropic).toMatchObject({
      sendReasoning: true,
      cacheControl: { type: "ephemeral" },
    });
  });

  it("calls Anthropic with the model id, not the slug", () => {
    expect(anthropicModelId("anthropic/claude-sonnet-5")).toBe(
      "claude-sonnet-5",
    );
  });

  it("wraps the reflective tier without changing its identity", () => {
    // The usage ledger and the eval report both key on modelId; a wrapper
    // that renamed the model would fork every chart at the wrap date.
    expect(reflectiveModel.modelId).toBe(MODEL_SLUGS.reflective);
  });

  it("does not wrap the quick tier", () => {
    // DeepSeek caches implicitly; an Anthropic breakpoint there is at best
    // noise. If quick ever gains middleware, this test is the prompt to say
    // why in convex/agents/config.ts rather than a blocker.
    expect(quickModel.modelId).toBe(MODEL_SLUGS.quick);
  });
});

describe("replaying thinking to Claude", () => {
  // Sonnet 5.5 rejects a thinking block whose conversation has changed since
  // it was written, and Dhee's always has by the next turn (the context block,
  // the dropped tool messages, the sliding window). Within a turn the blocks
  // must go back, or a step after a tool call loses the thinking behind it.
  const reasoning = (text: string) => ({ type: "reasoning", text }) as const;
  const text = (t: string) => ({ type: "text", text: t }) as const;
  const strip = async (prompt: LanguageModelV3CallOptions["prompt"]) =>
    (
      await reasoningMiddlewareForTest.transformParams!({
        type: "stream",
        params: { prompt } as LanguageModelV3CallOptions,
        model: reflectiveModel,
      })
    ).prompt;

  it("drops thinking from earlier turns and keeps their replies", async () => {
    const out = await strip([
      { role: "system", content: "instructions" },
      { role: "user", content: [text("first")] },
      { role: "assistant", content: [reasoning("why"), text("answer")] },
      { role: "user", content: [text("second")] },
    ]);
    expect(out[2]).toEqual({ role: "assistant", content: [text("answer")] });
    expect(out).toHaveLength(4);
  });

  it("keeps the current turn's thinking for the steps after a tool call", async () => {
    const current = {
      role: "assistant",
      content: [
        reasoning("look it up"),
        { type: "tool-call", toolCallId: "1", toolName: "search", input: {} },
      ],
    } as const;
    const out = await strip([
      { role: "user", content: [text("question")] },
      current,
    ] as LanguageModelV3CallOptions["prompt"]);
    expect(out[1]).toBe(current);
  });

  it("drops an earlier assistant message that held nothing but thinking", async () => {
    const out = await strip([
      { role: "user", content: [text("first")] },
      { role: "assistant", content: [reasoning("only this")] },
      { role: "user", content: [text("second")] },
    ]);
    expect(out.map((m) => m.role)).toEqual(["user", "user"]);
  });

  it("leaves a first turn alone", async () => {
    const prompt: LanguageModelV3CallOptions["prompt"] = [
      { role: "system", content: "instructions" },
      { role: "user", content: [text("hi")] },
    ];
    expect(await strip(prompt)).toEqual(prompt);
  });
});
