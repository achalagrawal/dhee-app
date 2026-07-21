import { anthropic } from "@ai-sdk/anthropic";
import type { Config } from "@convex-dev/agent";
import { CHAT_MODEL } from "../config";

// Anthropic reads ANTHROPIC_API_KEY from the Convex env automatically.
export const languageModel = anthropic(CHAT_MODEL);

// Shared config knobs applied to every Dhee-family agent.
// Embedding model is intentionally omitted for MVP — thread vector search
// isn't part of M1..M6. Add later if we start doing cross-thread recall.
export const defaultAgentConfig = {
  languageModel,
  callSettings: {
    // A touch below default to keep replies grounded and unhurried.
    temperature: 0.7,
  },
} satisfies Config;
