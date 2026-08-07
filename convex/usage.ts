import { v } from "convex/values";
import { internalMutation } from "./_generated/server";
import type { Id } from "./_generated/dataModel";

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
);

export type UsageKind = "chat" | "title" | "extraction" | "incognito";

/** The shape the AI SDK reports, as much of it as we care about. */
export type ReportedUsage = {
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
  inputTokens?: number;
  outputTokens?: number;
  reasoningTokens?: number;
  cachedInputTokens?: number;
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
};

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
  return {
    kind: args.kind,
    model: args.model,
    ...(args.provider ? { provider: args.provider } : {}),
    ...(args.agentName ? { agentName: args.agentName } : {}),
    promptTokens: finite(usage.promptTokens) ?? finite(usage.inputTokens) ?? 0,
    completionTokens:
      finite(usage.completionTokens) ?? finite(usage.outputTokens) ?? 0,
    ...(cached === undefined ? {} : { cachedInputTokens: cached }),
    ...(reasoning === undefined ? {} : { reasoningTokens: reasoning }),
    ...(cost === undefined ? {} : { costUsd: cost }),
  };
}

/**
 * What an agent call was for, from what the handler is given.
 *
 * The agent's usage callback reports the model, the thread and the user, and
 * nothing about intent — so intent is reconstructed from the two things that
 * already differ per call site:
 *
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
}): UsageKind {
  if (args.model === args.backgroundModel) return "title";
  return args.threadId ? "chat" : "incognito";
}

export const record = internalMutation({
  args: {
    // A string, not v.id("users"): the agent hands over whatever userId it was
    // given, and the eval harness deliberately runs under an opaque one
    // ("eval-harness"). The cast-and-hope version of this made every eval call
    // log a validation error — the ledger must not be the thing that throws,
    // so the narrowing happens here, where the db can actually decide.
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
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const userId = args.userId
      ? (ctx.db.normalizeId("users", args.userId) ?? undefined)
      : undefined;
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
