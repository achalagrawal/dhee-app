import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { wrapLanguageModel, type LanguageModelMiddleware } from "ai";
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

// Prompt caching, in two directives that cover different misses. Measured
// against the live endpoint on a 1,847-token prefix: an uncached turn cost
// $0.00373, the cache write cost $0.00465 (the expected ~25% premium), and
// every read after that cost $0.00043 — an 88% saving on the prompt.
//
// The top-level `cache_control` in the model settings is OpenRouter's
// automatic caching. Within a turn every step extends the previous request
// exactly, so the tool loop reads it reliably — mid-turn steps hit 98% on the
// 2026-08-07 prod snapshot. It was also all the caching there was, and it is
// why turn *openings* missed 87% of the time, even inside the TTL: the next
// turn rebuilds history with `excludeToolMessages: true` (REPLY_CONTEXT_OPTIONS
// in convex/chat.ts), so after any turn that used tools — most of them — its
// prompt no longer extends anything the automatic mode cached, and it missed
// from token zero.
//
// `systemCacheBreakpoint` closes that gap: an explicit breakpoint on the
// system message, the one large prefix every call for a person shares —
// instructions plus context block, identical across turns and threads until
// an extraction rewrites it. It survives both the tool-message exclusion and
// the sliding history window, so a turn-opening call reads it even though
// everything after it changed. Verified against the live endpoint, 2026-08-07,
// on the Amazon Bedrock route (where all of production's traffic goes): one
// request carrying both directives is accepted, and with the breakpoint a
// second call with the same 3.5k-token system message but a different tail
// read the whole system prefix from cache — 3,553 of 3,572 prompt tokens
// cached, $0.0008 against the $0.0090 the control pair paid twice. Watch
// `cachedTokens` in the `llmUsage` ledger rather than assuming — and note
// Anthropic only caches a prefix above a minimum length (1,024 tokens on
// Sonnet 5); DHEE_INSTRUCTIONS alone is several times that, so every real
// prompt qualifies.
//
// `ephemeral` means the five-minute TTL. The one-hour question is worth
// re-opening now that turn openings can actually hit — re-run that math
// against the ledger once this has a week of data.
const systemCacheBreakpoint: LanguageModelMiddleware = {
  specificationVersion: "v3",
  transformParams: async ({ params }) => ({
    ...params,
    prompt: params.prompt.map((message) =>
      message.role === "system"
        ? {
            ...message,
            providerOptions: {
              ...message.providerOptions,
              openrouter: {
                ...message.providerOptions?.openrouter,
                cacheControl: { type: "ephemeral" },
              },
            },
          }
        : message,
    ),
  }),
};

// Exported for the test that pins what the middleware emits — the provider
// only turns `openrouter.cacheControl` on a message into a `cache_control`
// block, so the exact shape is load-bearing and must not drift silently.
export const cacheMiddlewareForTest = systemCacheBreakpoint;

// The `reflective` tier, and the default. `cache_control` is Anthropic's
// mechanism and is only set on the model that goes to Anthropic — see the
// note above.
export const reflectiveModel = wrapLanguageModel({
  model: openrouter.chat(MODEL_SLUGS.reflective, {
    ...shared,
    cache_control: { type: "ephemeral" },
  }),
  middleware: systemCacheBreakpoint,
});

// The `quick` tier, opt-in from the composer's picker. Deliberately no
// `cache_control` and no breakpoint middleware: both are Anthropic mechanisms,
// and this tier does not route there. DeepSeek caches context on its own terms
// rather than on a breakpoint we set, so there is nothing to mark — and
// passing the parameter anyway would either be dropped upstream or rejected,
// both of which are worse than not sending it.
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

/**
 * A model for the eval harness, from a tier name or a raw OpenRouter slug.
 *
 * Tier names get the exact production model, wrapper and all — an eval of
 * "reflective" that skipped the cache middleware would measure a cost profile
 * nobody pays. A raw slug is for models the app doesn't ship yet (an Opus
 * comparison, a candidate upgrade): anthropic/* slugs get the same caching
 * treatment as the reflective tier so the comparison is fair on cost, and
 * everything else is reached bare, the way the quick tier is.
 */
export function evalModelFor(spec: string) {
  if (spec === "quick" || spec === "reflective") return MODEL_BY_TIER[spec];
  if (spec.startsWith("anthropic/"))
    return wrapLanguageModel({
      model: openrouter.chat(spec, {
        ...shared,
        cache_control: { type: "ephemeral" },
      }),
      middleware: systemCacheBreakpoint,
    });
  return openrouter.chat(spec, shared);
}

/** The slug a spec resolves to — what the run payload records as `model`. */
export function evalModelSlugFor(spec: string): string {
  return spec === "quick" || spec === "reflective" ? MODEL_SLUGS[spec] : spec;
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
