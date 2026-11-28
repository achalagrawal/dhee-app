import { createAnthropic } from "@ai-sdk/anthropic";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { wrapLanguageModel, type LanguageModelMiddleware } from "ai";
import type { Config } from "@convex-dev/agent";
import { internal } from "../_generated/api";
import { BACKGROUND_MODEL, ROUTER_MODEL } from "../config";
import {
  BASE_TIER,
  MODEL_SLUGS,
  answeringTierFor,
  type AnsweringTier,
} from "./models";
import { availableModelTiers } from "./availability";
import { withFallback } from "./fallback";
import { stripSpecialTokens } from "./specialTokens";
import {
  answeringModel,
  asUserId,
  classifyAgentCall,
  toUsageRecord,
} from "../usage";

// Open-weight models are reached through OpenRouter, so a model can change
// without touching application code — only its slug does.
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

// Claude goes to Anthropic's API directly. On 2026-11-24 OpenRouter restricted
// the account from closed-weight models, so Anthropic's models can no longer
// be reached through it; the key here is the account's own.
//
// The key is read when a call is made, not here, and Reflective only counts as
// available while it is set (`availableModelTiers`). It belongs on the
// production deployment alone, never in Convex's default environment
// variables, which copy it onto every preview and dev backend.
//
// Pinned to @ai-sdk/anthropic 3.0.103 exactly: it is the build made against the
// @ai-sdk/provider 3.0.14 and provider-utils 4.0.40 that package.json's
// overrides hold everything to.
const anthropic = createAnthropic();

/** The Anthropic API's model id for an `anthropic/…` slug. */
export function anthropicModelId(slug: string): string {
  return slug.replace(/^anthropic\//, "");
}

// Settings shared by every model we reach through OpenRouter.
//
// `usage.include` is what makes cost and cache behaviour observable at all —
// without it the response carries no cached-token or cost figures, so there is
// no way to tell whether caching is working.
const shared = { usage: { include: true } } as const;

// Prompt caching on Claude, in two directives that cover different misses.
// Measured against the live endpoint on a 1,847-token prefix: an uncached turn
// cost $0.00373, the cache write cost $0.00465 (the expected ~25% premium),
// and every read after that cost $0.00043 — an 88% saving on the prompt.
//
// These measurements were made through OpenRouter, which passed both
// directives through to Anthropic; on the direct API they are the same two
// directives in Anthropic's own form, which `anthropicCacheBreakpoint` writes.
//
// The top-level `cache_control` is automatic caching. Within a turn every
// step extends the previous request exactly, so the tool loop reads it reliably — mid-turn steps hit 98% on the
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
const anthropicCacheBreakpoint: LanguageModelMiddleware = {
  specificationVersion: "v3",
  transformParams: async ({ params }) => ({
    ...params,
    // Top level: automatic caching of the last cacheable block.
    providerOptions: {
      ...params.providerOptions,
      anthropic: {
        ...params.providerOptions?.anthropic,
        cacheControl: { type: "ephemeral" },
      },
    },
    // And the explicit breakpoint on the system message.
    prompt: params.prompt.map((message) =>
      message.role === "system"
        ? {
            ...message,
            providerOptions: {
              ...message.providerOptions,
              anthropic: {
                ...message.providerOptions?.anthropic,
                cacheControl: { type: "ephemeral" },
              },
            },
          }
        : message,
    ),
  }),
};

// Exported for the test that pins what the middleware emits — the provider
// only turns `anthropic.cacheControl` into a `cache_control` block, so the
// exact shape is load-bearing and must not drift silently.
export const cacheMiddlewareForTest = anthropicCacheBreakpoint;

// Earlier turns' thinking stays behind; only the current turn's goes back.
//
// Sonnet 5.5 (and every Claude model after it) checks a replayed thinking
// block against the conversation it came from: the system prompt, the tools
// and every message before it must be exactly as they were when the block was
// written. On accounts created from 2026-08-31 a mismatch is a 400, which
// `withFallback` would turn into a Quick reply, quietly, on every turn but
// the first. Dhee's history never passes that check from one turn to the next:
// the system prompt changes when extraction rewrites the context block or the
// reply script changes, REPLY_CONTEXT_OPTIONS drops earlier turns' tool
// messages, and the 20-message window slides. Within a turn none of that
// happens, and there the blocks must go back: a step after a tool call
// continues the thinking that made the call.
//
// So reasoning is dropped from assistant messages before the latest user
// message and kept after it. The earlier turns' reasoning is not lost to the
// person; it was never shown, and their replies' text still goes back.
const dropEarlierTurnsReasoning: LanguageModelMiddleware = {
  specificationVersion: "v3",
  transformParams: async ({ params }) => {
    const lastUser = params.prompt.findLastIndex(
      (message) => message.role === "user",
    );
    if (lastUser <= 0) return params;
    const prompt = params.prompt.flatMap((message, index) => {
      if (index >= lastUser || message.role !== "assistant") return [message];
      const content = message.content.filter(
        (part) => part.type !== "reasoning",
      );
      if (content.length === message.content.length) return [message];
      return content.length ? [{ ...message, content }] : [];
    });
    return { ...params, prompt };
  },
};

export const reasoningMiddlewareForTest = dropEarlierTurnsReasoning;

/**
 * A Claude model on Anthropic's API, with both cache directives and only the
 * current turn's thinking replayed, keeping the
 * `anthropic/…` slug as its id so the ledger and eval reports name it the same
 * way they did when it came through OpenRouter.
 */
function claudeModel(slug: string) {
  return wrapLanguageModel({
    model: anthropic(anthropicModelId(slug)),
    middleware: [anthropicCacheBreakpoint, dropEarlierTurnsReasoning],
    modelId: slug,
  });
}

// The `quick` tier, and the default. Deliberately no
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
//
// Wrapped so DeepSeek's own tool-call markup never reaches a reply as text —
// see convex/agents/specialTokens.ts.
const quickOnOpenRouter = wrapLanguageModel({
  model: openrouter.chat(MODEL_SLUGS.quick, shared),
  middleware: stripSpecialTokens,
});

// Claude, answering for an open-weight tier when OpenRouter cannot — the
// account cut off, out of credit, or down, as on 2026-11-24 when every Quick
// reply failed. Only while the Anthropic key is set; without it the
// OpenRouter error is what surfaces. Not for Reflective, whose own fallback
// is Quick: the two would otherwise call each other.
const anthropicAvailable = () => Boolean(process.env.ANTHROPIC_API_KEY);

export const quickModel = withFallback(
  quickOnOpenRouter,
  claudeModel(MODEL_SLUGS.reflective),
  anthropicAvailable,
);

// The `reflective` tier: Claude on Anthropic's API, falling back to Quick when
// the call fails before it starts — the credit has run out, the key was
// revoked, Anthropic is overloaded. Someone who chose Reflective gets a
// slower-to-notice downgrade for that reply rather than an error. The usage
// handler below books such a reply to Quick's model, not Sonnet's.
export const reflectiveModel = withFallback(
  claudeModel(MODEL_SLUGS.reflective),
  quickOnOpenRouter,
);

// The `thoughtful` tier: Kimi K3.1 Pro through OpenRouter, built the way
// Quick is — no cache directives (Kimi caches on its own terms; about 60% of
// input tokens came from cache in the eval) and no fallback (OpenRouter
// already spreads Kimi across several upstream providers).
//
// Reasoning at `high` rather than Kimi's default `max`, Achal's call on
// 2026-11-24: at `max` the eval measured $0.048 a reply, more than Sonnet 5
// cost. `high` has not been evaluated; watch the `llmUsage` ledger and
// feedback, and run the eval at `high` before treating it as settled.
const thoughtfulOnOpenRouter = wrapLanguageModel({
  model: openrouter.chat(MODEL_SLUGS.thoughtful, {
    ...shared,
    reasoning: { effort: "high" },
  }),
  middleware: stripSpecialTokens,
});

export const thoughtfulModel = withFallback(
  thoughtfulOnOpenRouter,
  claudeModel(MODEL_SLUGS.reflective),
  anthropicAvailable,
);

/** The model each tier answers with. */
export const MODEL_BY_TIER = {
  quick: quickModel,
  thoughtful: thoughtfulModel,
  reflective: reflectiveModel,
} as const satisfies Record<AnsweringTier, unknown>;

/**
 * The model that writes a reply when the one asked could not: the turn ended
 * with nothing written (see `rescueEmptyReply` in convex/chat.ts). Claude when
 * this deployment has the key, since an answer that has to be written from a
 * pile of lookups in one go is the job it is most reliable at; otherwise Kimi.
 */
export function rescueModel() {
  return availableModelTiers().includes("reflective")
    ? reflectiveModel
    : thoughtfulModel;
}

/**
 * The model for a stored preference or a routed tier, falling back to the
 * base tier. An Auto preference that was not routed answers on the base tier.
 */
export function languageModelFor(stored: string | undefined) {
  return MODEL_BY_TIER[answeringTierFor(stored, availableModelTiers())];
}

/**
 * A model for the eval harness, from a tier name or a raw OpenRouter slug.
 *
 * Tier names get the exact production model, wrapper and all — an eval of
 * "reflective" that skipped the cache middleware would measure a cost profile
 * nobody pays. A raw slug is for models the app doesn't ship yet (an Opus
 * comparison, a candidate upgrade): anthropic/* slugs go to Anthropic's API
 * with the same caching as the reflective tier, so the comparison is fair on
 * cost, and everything else goes through OpenRouter bare, the way the quick
 * tier does. The reflective tier's fallback is left out of evals on purpose:
 * a run that quietly measured Quick under Reflective's name would be worse
 * than one that failed.
 */
export function evalModelFor(spec: string) {
  // Without their Claude fallback, for the same reason Reflective goes
  // without its own: a run must measure the model it names.
  if (spec === "quick") return quickOnOpenRouter;
  if (spec === "thoughtful") return thoughtfulOnOpenRouter;
  if (spec === "reflective") return claudeModel(MODEL_SLUGS.reflective);
  if (spec.startsWith("anthropic/")) return claudeModel(spec);
  return openrouter.chat(spec, shared);
}

/** The slug a spec resolves to — what the run payload records as `model`. */
export function evalModelSlugFor(spec: string): string {
  return spec === "quick" || spec === "thoughtful" || spec === "reflective"
    ? MODEL_SLUGS[spec]
    : spec;
}

// What the Agent is constructed with, and what every call that doesn't name a
// model gets: the base tier, which is what an unrouted turn answers on.
export const languageModel = MODEL_BY_TIER[BASE_TIER];

// Titling and memory extraction, on an open-weight model (BACKGROUND_MODEL in
// convex/config.ts says which and why). Kept on open weights by decision:
// what Dhee remembers about people must not depend on a provider that can
// cut the account off. No cache directives: DeepSeek caches on its own terms.
export const backgroundModel = openrouter.chat(BACKGROUND_MODEL, shared);

/**
 * Auto's classifier (convex/agents/router.ts), on `slug`. Reasoning is off:
 * the job is a one-word label, and with DeepSeek's default thinking the call
 * took about three seconds — a third of them past the router's timeout — in a
 * place where every second is a second before the reply starts.
 */
export function classifierModel(slug: string = ROUTER_MODEL) {
  return openrouter.chat(slug, { ...shared, reasoning: { effort: "none" } });
}

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
      // A Reflective reply the fallback answered is booked to the model that
      // answered it — see `answeringModel`.
      const answered = answeringModel({
        model: args.model,
        provider: args.provider,
        providerMetadata: args.providerMetadata,
        fallbackModel: MODEL_SLUGS[BASE_TIER],
        claudeFallbackModel: MODEL_SLUGS.reflective,
      });
      await ctx.runMutation(internal.usage.record, {
        ...toUsageRecord({
          kind: classifyAgentCall({
            model: answered.model,
            threadId: args.threadId,
            backgroundModel: BACKGROUND_MODEL,
            userId: args.userId,
          }),
          model: answered.model,
          provider: answered.provider,
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
