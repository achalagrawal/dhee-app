import { listMessages, type MessageDoc } from "@convex-dev/agent";
import { v } from "convex/values";
import { components, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import {
  type ActionCtx,
  type MutationCtx,
  internalMutation,
  internalQuery,
  query,
} from "./_generated/server";
import { availableModelTiers } from "./agents/availability";
import { classifierModel } from "./agents/config";
import type { AnsweringTier } from "./agents/models";
import {
  type ClassifierUsage,
  type RouteDecision,
  classifyWith,
  routeTurn,
} from "./agents/router";
import { ROUTER_MODEL } from "./config";
import { toUsageRecord } from "./usage";
import { requireUserId } from "./users";

// The Convex side of Auto: reading what the router needs, running it, and
// keeping what it decided. The deciding itself is in convex/agents/router.ts.

const tierValidator = v.union(
  v.literal("quick"),
  v.literal("thoughtful"),
  v.literal("reflective"),
);

/** Where Auto's deep turns go: Reflective where it can answer, else Kimi. */
export function deepTier(available: readonly string[]): AnsweringTier {
  return available.includes("reflective") ? "reflective" : "thoughtful";
}

/** The tier the most recent routed turn before `order` went to. */
export const previousTier = internalQuery({
  args: { threadId: v.string(), order: v.number() },
  returns: v.union(tierValidator, v.null()),
  handler: async (ctx, { threadId, order }) => {
    const row = await ctx.db
      .query("turnRoutes")
      .withIndex("by_thread_and_order", (q) =>
        q.eq("threadId", threadId).lt("order", order),
      )
      .order("desc")
      .first();
    return row?.tier ?? null;
  },
});

/** Keeps a decision, replacing any earlier one for the same turn. */
export const record = internalMutation({
  args: {
    userId: v.id("users"),
    threadId: v.string(),
    order: v.number(),
    tier: tierValidator,
    kind: v.string(),
    by: v.union(
      v.literal("rule"),
      v.literal("classifier"),
      v.literal("fallback"),
    ),
    latencyMs: v.number(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("turnRoutes")
      .withIndex("by_thread_and_order", (q) =>
        q.eq("threadId", args.threadId).eq("order", args.order),
      )
      .take(10);
    for (const row of existing) await ctx.db.delete(row._id);
    await ctx.db.insert("turnRoutes", { ...args, createdAt: Date.now() });
    return null;
  },
});

/** Removes a thread's decisions, for thread deletion. */
export async function deleteRoutesForThread(
  ctx: MutationCtx,
  threadId: string,
) {
  const rows = await ctx.db
    .query("turnRoutes")
    .withIndex("by_thread_and_order", (q) => q.eq("threadId", threadId))
    .collect();
  for (const row of rows) await ctx.db.delete(row._id);
}

/**
 * Which tier answered each Auto turn of a thread, for the label under a
 * reply. Keyed by the turn's `order`, which a UIMessage carries.
 */
export const threadRoutes = query({
  args: { threadId: v.string() },
  returns: v.array(v.object({ order: v.number(), tier: tierValidator })),
  handler: async (ctx, { threadId }) => {
    const userId = await requireUserId(ctx);
    const rows = await ctx.db
      .query("turnRoutes")
      .withIndex("by_thread_and_order", (q) => q.eq("threadId", threadId))
      .take(500);
    return rows
      .filter((row) => row.userId === userId)
      .map(({ order, tier }) => ({ order, tier }));
  },
});

function messageText(doc: MessageDoc | undefined): string {
  const content = doc?.message?.content;
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return doc?.text ?? "";
  return content
    .map((part) =>
      typeof part === "object" && part && "text" in part
        ? String(part.text)
        : "",
    )
    .join("\n");
}

function hasImage(doc: MessageDoc | undefined): boolean {
  const content = doc?.message?.content;
  if (!Array.isArray(content)) return false;
  return content.some(
    (part) =>
      typeof part === "object" &&
      part !== null &&
      (part.type === "image" ||
        (part.type === "file" &&
          "mediaType" in part &&
          String(part.mediaType).startsWith("image/"))),
  );
}

async function recordClassifierUsage(
  ctx: ActionCtx,
  args: {
    userId: Id<"users">;
    threadId?: string;
    usage: ClassifierUsage;
    providerMetadata: unknown;
  },
) {
  try {
    await ctx.runMutation(internal.usage.record, {
      ...toUsageRecord({
        kind: "routing",
        model: ROUTER_MODEL,
        usage: args.usage,
        providerMetadata: args.providerMetadata,
      }),
      userId: args.userId,
      ...(args.threadId ? { threadId: args.threadId } : {}),
    });
  } catch (error) {
    console.error("routing usage ledger write failed", error);
  }
}

/**
 * Routes one Auto turn of a saved thread and keeps the decision.
 *
 * Never throws: whatever goes wrong, the turn answers on the base tier, the
 * way it would have before Auto existed.
 */

/** What Auto decided for a turn: the tier, and the kind when it was read. */
export type Route = { tier: AnsweringTier; kind?: RouteDecision["kind"] };

export async function routeSavedTurn(
  ctx: ActionCtx,
  args: { threadId: string; userId: Id<"users">; promptMessageId: string },
): Promise<Route> {
  const started = Date.now();
  try {
    const { page } = await listMessages(ctx, components.agent, {
      threadId: args.threadId,
      excludeToolMessages: true,
      paginationOpts: { cursor: null, numItems: 12 },
    });
    const prompt = page.find((m) => m._id === args.promptMessageId);
    if (!prompt) return { tier: "quick" };
    const previousUser = page
      .filter((m) => m.order < prompt.order && m.message?.role === "user")
      .sort((a, b) => b.order - a.order)[0];
    const previous = await ctx.runQuery(internal.routing.previousTier, {
      threadId: args.threadId,
      order: prompt.order,
    });
    let usage: { usage: ClassifierUsage; providerMetadata: unknown } | null =
      null;
    const decision: RouteDecision = await routeTurn(
      {
        text: messageText(prompt),
        hasImage: hasImage(prompt),
        previousText: previousUser ? messageText(previousUser) : undefined,
        previousTier: previous ?? undefined,
        deepTier: deepTier(availableModelTiers()),
      },
      classifyWith(classifierModel(), (u, providerMetadata) => {
        usage = { usage: u, providerMetadata };
      }),
    );
    const latencyMs = Date.now() - started;
    await ctx.runMutation(internal.routing.record, {
      userId: args.userId,
      threadId: args.threadId,
      order: prompt.order,
      tier: decision.tier,
      kind: decision.kind,
      by: decision.by,
      latencyMs,
    });
    if (usage) {
      await recordClassifierUsage(ctx, {
        userId: args.userId,
        threadId: args.threadId,
        ...(usage as { usage: ClassifierUsage; providerMetadata: unknown }),
      });
    }
    return { tier: decision.tier, kind: decision.kind };
  } catch (error) {
    console.error("auto routing failed; answering on quick", error);
    return { tier: "quick" };
  }
}

/**
 * Routes one incognito Auto turn. Nothing is kept but the ledger row every
 * incognito call already leaves: incognito saves no conversation, so there is
 * no thread to hang a decision on.
 */
export async function routeIncognitoTurn(
  ctx: ActionCtx,
  args: {
    userId: Id<"users">;
    text: string;
    previousText?: string;
  },
): Promise<Route> {
  try {
    let usage: { usage: ClassifierUsage; providerMetadata: unknown } | null =
      null;
    const decision = await routeTurn(
      {
        text: args.text,
        hasImage: false,
        previousText: args.previousText,
        deepTier: deepTier(availableModelTiers()),
      },
      classifyWith(classifierModel(), (u, providerMetadata) => {
        usage = { usage: u, providerMetadata };
      }),
    );
    if (usage) {
      await recordClassifierUsage(ctx, {
        userId: args.userId,
        ...(usage as { usage: ClassifierUsage; providerMetadata: unknown }),
      });
    }
    return { tier: decision.tier, kind: decision.kind };
  } catch (error) {
    console.error("auto routing failed; answering on quick", error);
    return { tier: "quick" };
  }
}
