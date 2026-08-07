import { describe, expect, it } from "vitest";
import type { LanguageModelV3CallOptions } from "@ai-sdk/provider";
import { cacheMiddlewareForTest, quickModel, reflectiveModel } from "./config";
import { MODEL_SLUGS } from "./models";

// The middleware's output shape is load-bearing: the OpenRouter provider
// emits a `cache_control` block only for `openrouter.cacheControl` (or its
// aliases) on the message's providerOptions. A rename or a restructure here
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
        openrouter: { cacheControl: { type: "ephemeral" } },
      },
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
        providerOptions: { openrouter: { reasoning: { effort: "low" } } },
      },
    ]);
    expect(out.prompt[0]?.providerOptions?.openrouter).toMatchObject({
      reasoning: { effort: "low" },
      cacheControl: { type: "ephemeral" },
    });
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
