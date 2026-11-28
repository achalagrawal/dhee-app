import { v } from "convex/values";
import { internalMutation } from "./_generated/server";

// The record of what the model cost, kept because nothing else keeps it.
//
// The agent component stores usage on the message a call produced. That is most
// of the picture and none of the rest: titling and incognito pass
// `saveMessages: "none"`, and memory extraction never goes through the agent at
// all, so three whole classes of call leave no row anywhere and their spend
// reads as zero. A bill that disagrees with the dashboard by an unknown amount
// is not a measurement, and every decision downstream of it — which model, what
// to charge, whether an optimisation worked — inherits the uncertainty.
//
// Nothing here records what was said. Counts and a `userId`, so cost can be
// attributed to an account; no prompt, no reply, no title, no observation.

export const usageKind = v.union(
  v.literal("chat"),
  v.literal("title"),
  v.literal("extraction"),
  v.literal("incognito"),
  v.literal("eval"),
  v.literal("routing"),
  v.literal("transcription"),
);

export type UsageKind =
  | "chat"
  | "title"
  | "extraction"
  | "incognito"
  | "eval"
  | "routing"
  | "transcription";

/**
 * The userId the eval harness runs under. Not a users id — the harness has no
 * account — but the agent needs one to call at all, and this is what lets the
 * ledger tell harness spend from a person's. Rows it produces are filed as
 * `eval` with no user, so a cost query can leave them out on purpose rather
 * than by accident.
 */
export const EVAL_USER_ID = "eval-harness";

/** The shape the AI SDK reports, as much of it as we care about. */
export type ReportedUsage = {
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
  inputTokens?: number;
  outputTokens?: number;
  reasoningTokens?: number;
  cachedInputTokens?: number;
  /** AI SDK v6's breakdown of `inputTokens`, where the provider gives one. */
  inputTokenDetails?: {
    noCacheTokens?: number;
    cacheReadTokens?: number;
    cacheWriteTokens?: number;
  };
};

export type UsageRecord = {
  kind: UsageKind;
  model: string;
  provider?: string;
  agentName?: string;
  promptTokens: number;
  completionTokens: number;
  cachedInputTokens?: number;
  reasoningTokens?: number;
  costUsd?: number;
  estimatedCostUsd?: number;
};

/**
 * Anthropic's list prices, in dollars per million tokens, for the Claude
 * models the app calls directly. Checked 2026-11-28.
 *
 * Only for `estimatedCostUsd`, never `costUsd`. Anthropic's API reports no
 * cost, so since Reflective moved there on 2026-11-24 its rows carried tokens
 * and nothing else — about 70% of that week's spend invisible in the ledger.
 * An estimate in its own field closes that gap without passing itself off as
 * a bill: `costUsd` stays "what a provider charged", and a stale entry here
 * shows up as a drift between the two sums, not as a wrong measurement. Add a
 * model here when MODEL_SLUGS gains one; a slug missing from this table is
 * left unestimated, which is visible.
 *
 * `cacheWrite` is the five-minute TTL's rate (1.25x input), the only one the
 * cache middleware in convex/agents/config.ts asks for.
 */
export const CLAUDE_PRICES: Record<
  string,
  { input: number; cacheWrite: number; cacheRead: number; output: number }
> = {
  "anthropic/claude-sonnet-5-5": {
    input: 2,
    cacheWrite: 2.5,
    cacheRead: 0.1,
    output: 10,
  },
};

/**
 * A Claude call's cost from its tokens and CLAUDE_PRICES, or undefined for a
 * model not in the table.
 *
 * `promptTokens` is the total, cache reads and writes included (that is how
 * the Anthropic provider reports it). The split comes from the usage's own
 * breakdown when there is one, else from `cachedInputTokens` and the
 * provider's `cacheCreationInputTokens`.
 */
export function estimateClaudeCostUsd(args: {
  model: string;
  promptTokens: number;
  completionTokens: number;
  usage: ReportedUsage;
  providerMetadata?: unknown;
}): number | undefined {
  const price = CLAUDE_PRICES[args.model];
  if (!price) return undefined;
  const details = args.usage.inputTokenDetails;
  const anthropic =
    typeof args.providerMetadata === "object" && args.providerMetadata !== null
      ? ((args.providerMetadata as Record<string, unknown>).anthropic as
          Record<string, unknown> | undefined)
      : undefined;
  const read =
    finite(details?.cacheReadTokens) ??
    finite(args.usage.cachedInputTokens) ??
    0;
  const write =
    finite(details?.cacheWriteTokens) ??
    finite(anthropic?.cacheCreationInputTokens) ??
    0;
  const fresh =
    finite(details?.noCacheTokens) ??
    Math.max(0, args.promptTokens - read - write);
  return (
    (fresh * price.input +
      write * price.cacheWrite +
      read * price.cacheRead +
      args.completionTokens * price.output) /
    1_000_000
  );
}

function finite(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value)
    ? value
    : undefined;
}

/**
 * Dollar cost as the provider billed it.
 *
 * OpenRouter reports this only because `usage: { include: true }` is set on the
 * model (convex/agents/config.ts). If that ever comes off, this returns
 * undefined and the ledger keeps counting tokens — which is the right failure:
 * a missing cost is visibly missing, where a cost inferred from a hardcoded
 * price table would look identical to a real one long after the table went
 * stale.
 *
 * Claude calls go to Anthropic's API directly since 2026-11-24, and Anthropic
 * does not report a cost, so those rows carry no `costUsd` — by the same
 * reasoning. They carry `estimatedCostUsd` instead (see CLAUDE_PRICES), and
 * the bill itself is in the Anthropic Console.
 */
export function costFromProviderMetadata(
  metadata: unknown,
): number | undefined {
  if (typeof metadata !== "object" || metadata === null) return undefined;
  const openrouter = (metadata as Record<string, unknown>).openrouter;
  if (typeof openrouter !== "object" || openrouter === null) return undefined;
  const usage = (openrouter as Record<string, unknown>).usage;
  if (typeof usage !== "object" || usage === null) return undefined;
  return finite((usage as Record<string, unknown>).cost);
}

/**
 * The model that actually answered a call.
 *
 * Reflective falls back to the default model when Anthropic fails before
 * answering (convex/agents/fallback.ts), and the agent still reports the call
 * under Reflective's name, because that is the model it was configured with.
 * A Claude call does not go through OpenRouter, so OpenRouter metadata on one
 * means the fallback answered it.
 */
export function answeringModel(args: {
  model: string;
  provider?: string;
  providerMetadata: unknown;
  fallbackModel: string;
  /** The Claude model that answers for an open-weight tier OpenRouter failed. */
  claudeFallbackModel?: string;
}): { model: string; provider?: string } {
  const has = (key: string) =>
    typeof args.providerMetadata === "object" &&
    args.providerMetadata !== null &&
    key in args.providerMetadata;
  if (args.model.startsWith("anthropic/") && has("openrouter")) {
    return { model: args.fallbackModel, provider: "openrouter" };
  }
  // The other direction: an open-weight tier's call that Claude answered,
  // because OpenRouter failed (convex/agents/config.ts).
  if (
    args.claudeFallbackModel &&
    !args.model.startsWith("anthropic/") &&
    has("anthropic") &&
    !has("openrouter")
  ) {
    return { model: args.claudeFallbackModel, provider: "anthropic.messages" };
  }
  return {
    model: args.model,
    ...(args.provider ? { provider: args.provider } : {}),
  };
}

/**
 * Normalise one reported call into a ledger row.
 *
 * Token field names have moved between AI SDK versions — `promptTokens` became
 * `inputTokens`, `completionTokens` became `outputTokens` — and the agent
 * component sits between us and whichever the provider used. Reading both means
 * an upgrade that renames them degrades to zeroes we can see rather than a
 * handler that throws inside a background action nobody is watching.
 */
export function toUsageRecord(args: {
  kind: UsageKind;
  model: string;
  provider?: string;
  agentName?: string;
  usage: ReportedUsage | undefined;
  providerMetadata?: unknown;
}): UsageRecord {
  const usage = args.usage ?? {};
  const cost = costFromProviderMetadata(args.providerMetadata);
  const cached = finite(usage.cachedInputTokens);
  const reasoning = finite(usage.reasoningTokens);
  const promptTokens =
    finite(usage.promptTokens) ?? finite(usage.inputTokens) ?? 0;
  const completionTokens =
    finite(usage.completionTokens) ?? finite(usage.outputTokens) ?? 0;
  // Only where no provider billed a cost: an estimate never sits beside a
  // real figure for the same call.
  const estimate =
    cost === undefined
      ? estimateClaudeCostUsd({
          model: args.model,
          promptTokens,
          completionTokens,
          usage,
          providerMetadata: args.providerMetadata,
        })
      : undefined;
  return {
    kind: args.kind,
    model: args.model,
    ...(args.provider ? { provider: args.provider } : {}),
    ...(args.agentName ? { agentName: args.agentName } : {}),
    promptTokens,
    completionTokens,
    ...(cached === undefined ? {} : { cachedInputTokens: cached }),
    ...(reasoning === undefined ? {} : { reasoningTokens: reasoning }),
    ...(cost === undefined ? {} : { costUsd: cost }),
    ...(estimate === undefined ? {} : { estimatedCostUsd: estimate }),
  };
}

/**
 * What an agent call was for, from what the handler is given.
 *
 * The agent's usage callback reports the model, the thread and the user, and
 * nothing about intent — so intent is reconstructed from the two things that
 * already differ per call site:
 *
 *   - the eval harness is the only caller running as `EVAL_USER_ID`
 *   - titling is the only agent call that runs on the background model
 *   - incognito is the only one with no thread, because it saves nothing
 *
 * Derived rather than threaded through because the callback is configured once,
 * on the shared agent, and cannot see its caller. Keyed off the configured
 * model name rather than a hardcoded slug, so swapping models in config.ts
 * keeps this correct.
 */
export function classifyAgentCall(args: {
  model: string;
  threadId: string | undefined;
  backgroundModel: string;
  userId?: string | undefined;
}): UsageKind {
  if (args.userId === EVAL_USER_ID) return "eval";
  if (args.model === args.backgroundModel) return "title";
  return args.threadId ? "chat" : "incognito";
}

export const record = internalMutation({
  args: {
    // A string, not v.id("users"): the agent hands over whatever userId it was
    // given, and the eval harness deliberately runs under `EVAL_USER_ID`. The
    // cast-and-hope version of this made every eval call log a validation
    // error — the ledger must not be the thing that throws, so the narrowing
    // happens here, where the db can actually decide. The row is kept either
    // way; an id that fails to narrow is dropped from it, and said so, unless
    // it is the harness's, which is expected.
    userId: v.optional(v.string()),
    threadId: v.optional(v.string()),
    kind: usageKind,
    model: v.string(),
    provider: v.optional(v.string()),
    agentName: v.optional(v.string()),
    promptTokens: v.number(),
    completionTokens: v.number(),
    cachedInputTokens: v.optional(v.number()),
    reasoningTokens: v.optional(v.number()),
    costUsd: v.optional(v.number()),
    estimatedCostUsd: v.optional(v.number()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const userId = args.userId
      ? (ctx.db.normalizeId("users", args.userId) ?? undefined)
      : undefined;
    if (args.userId && !userId && args.kind !== "eval") {
      console.warn(
        "usage ledger: userId is not a users id; row kept without one",
        {
          userId: args.userId,
          kind: args.kind,
          model: args.model,
        },
      );
    }
    await ctx.db.insert("llmUsage", {
      ...args,
      userId,
      createdAt: Date.now(),
    });
    return null;
  },
});

/**
 * Resolve a userId string from the agent into one this app's tables accept.
 *
 * A pass-through with the narrowing left to `record`'s normalizeId — only the
 * db can tell a real users id from an arbitrary string, and the ledger must
 * not be the thing that throws. Accounting is not worth failing a reply over.
 */
export function asUserId(userId: string | undefined): string | undefined {
  return userId || undefined;
}
