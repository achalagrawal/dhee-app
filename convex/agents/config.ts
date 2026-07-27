import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import type { Config } from "@convex-dev/agent";
import { BACKGROUND_MODEL, CHAT_MODEL } from "../config";

// Models are reached through OpenRouter so the provider can change without
// touching application code — including a move to open-weight models later.
// Only the slug in convex/config.ts needs to change.
//
// Pinned to @openrouter/ai-sdk-provider v2: v3 requires AI SDK v7, but
// @convex-dev/agent 0.6 requires v6. v2 also ships no runtime dependencies,
// so it doesn't fight the @ai-sdk/provider overrides in package.json.
const openrouter = createOpenRouter({
  apiKey: process.env.OPENROUTER_API_KEY,
  headers: {
    // Optional attribution shown on OpenRouter's dashboards.
    "HTTP-Referer": "https://dhee.app",
    "X-Title": "Dhee",
  },
});

// Settings shared by every model we reach for.
//
// `usage.include` is what makes cost and cache behaviour observable at all —
// without it the response carries no cached-token or cost figures, so there is
// no way to tell whether caching is working.
const shared = { usage: { include: true } } as const;

// Prompt caching. Measured against the live endpoint on a 1,847-token prefix:
// an uncached turn cost $0.00373, the cache write cost $0.00465 (the expected
// ~25% premium), and every read after that cost $0.00043 — an 88% saving on
// the prompt, paid back on the second turn of any thread.
//
// This is the largest cost lever in the pipeline, because the system prompt is
// large, stable per person, and re-sent on every single turn. Note Anthropic
// only caches a prefix above a minimum length (1,024 tokens on Sonnet 5), so
// a shorter prompt silently caches nothing rather than erroring — watch
// `cachedTokens` rather than assuming.
export const languageModel = openrouter.chat(CHAT_MODEL, {
  ...shared,
  cache_control: { type: "ephemeral" },
});

// Titling and other background work. A third of Sonnet's price, and neither
// job needs Sonnet's judgement. No `cache_control` here on purpose: Haiku's
// minimum cacheable prefix is 4,096 tokens and these prompts are far shorter,
// so it would only ever pay the write premium.
export const backgroundModel = openrouter.chat(BACKGROUND_MODEL, shared);

// Shared config applied to every Dhee-family agent. Embedding model is
// intentionally omitted — cross-thread vector recall isn't in MVP scope.
//
// `temperature` used to be pinned here at 0.7 with a comment about keeping
// replies grounded. It never did anything: echoing the upstream request body
// shows OpenRouter drops sampling parameters for this model before the call
// reaches Anthropic, which is just as well, since Claude Sonnet 5 rejects
// non-default ones outright. Steering tone is the system prompt's job.
export const defaultAgentConfig = {
  languageModel,
} satisfies Config;
