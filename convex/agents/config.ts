import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import type { Config } from "@convex-dev/agent";
import { CHAT_MODEL } from "../config";

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

export const languageModel = openrouter.chat(CHAT_MODEL);

// Shared config applied to every Dhee-family agent. Embedding model is
// intentionally omitted — cross-thread vector recall isn't in MVP scope.
export const defaultAgentConfig = {
  languageModel,
  callSettings: {
    // A touch below default to keep replies grounded and unhurried.
    temperature: 0.7,
  },
} satisfies Config;
