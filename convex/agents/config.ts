import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import type { Config } from "@convex-dev/agent";
import { internal } from "../_generated/api";
import { BACKGROUND_MODEL } from "../config";
import {
  DEFAULT_MODEL_TIER,
  MODEL_SLUGS,
  resolveModelTier,
  type ModelTier,
} from "./models";
import { asUserId, classifyAgentCall, toUsageRecord } from "../usage";

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
// the prompt.
//
// Correction to what this comment used to claim. It said the write was "paid
// back on the second turn of any thread". In production it almost never is —
// and not because of the five-minute TTL. Measured on the 2026-08-07 snapshot:
// 87% of turn-opening calls read zero cached tokens, including most follow-up
// turns sent well inside the TTL, while mid-turn steps hit 98% of the time.
// The cause is structural. A turn's steps each extend the previous request, so
// every step reads the one before it. The *next* turn rebuilds history with
// `excludeToolMessages: true` (see REPLY_CONTEXT_OPTIONS in convex/chat.ts),
// so after any turn that used tools — most of them — its prompt is no longer
// an extension of anything this directive cached, and it misses from token
// zero. What the saving reliably buys today is the tool loop within a turn.
//
// The fix, when it lands, is an explicit `cache_control` breakpoint on the
// system message: that prefix (instructions + context block, the largest and
// most stable part of every prompt) survives both the tool-message exclusion
// and the sliding history window. Until then, do not "fix" the miss rate by
// reaching for Anthropic's one-hour TTL — a longer-lived cache entry that the
// next turn's prompt cannot match is the same miss at double the write premium
// (1.25x -> 2x base). Re-run that math against the `llmUsage` ledger after the
// breakpoint change, not before.
//
// The system prompt is still large, stable per person, and re-sent on every
// single call, so this remains the cheapest lever available — it is simply an
// intra-turn one. Note Anthropic only caches a prefix above a minimum length
// (1,024 tokens on Sonnet 5), so a shorter prompt silently caches nothing
// rather than erroring — watch `cachedTokens` rather than assuming.
//
// The `reflective` tier, and the default. `cache_control` is Anthropic's
// mechanism and is only set on the model that goes to Anthropic — see the
// note above.
export const reflectiveModel = openrouter.chat(MODEL_SLUGS.reflective, {
  ...shared,
  cache_control: { type: "ephemeral" },
});

// The `quick` tier, opt-in from the composer's picker. Deliberately no
// `cache_control`: it is an Anthropic parameter, and this tier does not route
// there. DeepSeek caches
// context on its own terms rather than on a breakpoint we set, so there is
// nothing to mark — and passing the parameter anyway would either be dropped
// upstream or rejected, both of which are worse than not sending it.
//
// The consequence worth knowing: the cost shape of this tier is not the one
// documented above. Prompt caching is what makes the large system prompt cheap
// on the reflective tier, and none of that reasoning transfers here. Read the
// `llmUsage` ledger for what this tier actually costs rather than assuming it
// is simply cheaper because the per-token price is lower.
export const quickModel = openrouter.chat(MODEL_SLUGS.quick, shared);

/** The model each tier answers with. */
export const MODEL_BY_TIER = {
  quick: quickModel,
  reflective: reflectiveModel,
} as const satisfies Record<ModelTier, unknown>;

/** The model for a stored preference, falling back to the default tier. */
export function languageModelFor(stored: string | undefined) {
  return MODEL_BY_TIER[resolveModelTier(stored)];
}

// What the Agent is constructed with, and what every call that doesn't name a
// model gets. Kept pointing at the default tier so the two cannot drift.
export const languageModel = MODEL_BY_TIER[DEFAULT_MODEL_TIER];

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

  // Every agent call, written to `llmUsage`. Configured here rather than at
  // each call site because it must not be possible to add a call site and
  // forget it — the whole reason this exists is that some spend was invisible.
  //
  // Wrapped so a failure here can never cost a reply. A dropped accounting row
  // is a gap in a chart; an exception thrown out of this callback would abort
  // the generation that was about to answer someone.
  usageHandler: async (ctx, args) => {
    try {
      await ctx.runMutation(internal.usage.record, {
        ...toUsageRecord({
          kind: classifyAgentCall({
            model: args.model,
            threadId: args.threadId,
            backgroundModel: BACKGROUND_MODEL,
          }),
          model: args.model,
          provider: args.provider,
          agentName: args.agentName,
          usage: args.usage,
          providerMetadata: args.providerMetadata,
        }),
        ...(args.threadId ? { threadId: args.threadId } : {}),
        ...(asUserId(args.userId) ? { userId: asUserId(args.userId) } : {}),
      });
    } catch (error) {
      console.error("usage ledger write failed", error);
    }
  },
} satisfies Config;
