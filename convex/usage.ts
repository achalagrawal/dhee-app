import { ConvexError, v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import {
  type MutationCtx,
  type QueryCtx,
  internalMutation,
} from "./_generated/server";
import { FREE_DAILY_MESSAGE_LIMIT } from "./config";
import { type Plan, planFor, planValidator } from "./lib/plan";

// The free tier's daily message allowance. Enforced here rather than at each
// call site so no path that schedules a model call can miss it.

const DAY_MS = 24 * 60 * 60 * 1000;

const utcDay = (at: number) => new Date(at).toISOString().slice(0, 10);

export const usageValidator = v.object({
  plan: planValidator,
  used: v.number(),
  // Both null on an unlimited plan — there is no ceiling to render.
  limit: v.union(v.number(), v.null()),
  remaining: v.union(v.number(), v.null()),
  resetsAt: v.number(),
});

type Usage = {
  plan: Plan;
  used: number;
  limit: number | null;
  remaining: number | null;
  resetsAt: number;
};

async function todayFor(ctx: QueryCtx, userId: Id<"users">) {
  const at = Date.now();
  const day = utcDay(at);
  const [user, row] = await Promise.all([
    ctx.db.get(userId),
    ctx.db
      .query("usage")
      .withIndex("by_user_day", (q) => q.eq("userId", userId).eq("day", day))
      .unique(),
  ]);
  return { at, day, row, plan: planFor(user) };
}

export async function usageFor(
  ctx: QueryCtx,
  userId: Id<"users">,
): Promise<Usage> {
  const { at, row, plan } = await todayFor(ctx, userId);
  const used = row?.messages ?? 0;
  const limit = plan === "unlimited" ? null : FREE_DAILY_MESSAGE_LIMIT;
  return {
    plan,
    used,
    limit,
    remaining: limit === null ? null : Math.max(0, limit - used),
    resetsAt: Math.floor(at / DAY_MS) * DAY_MS + DAY_MS,
  };
}

/**
 * Spend one message of today's allowance, or refuse. Thrown as a `ConvexError`
 * with a code so the client can branch on it rather than match a string.
 */
export async function spendMessage(
  ctx: MutationCtx,
  userId: Id<"users">,
): Promise<void> {
  const { at, day, row, plan } = await todayFor(ctx, userId);
  const used = row?.messages ?? 0;
  if (plan !== "unlimited" && used >= FREE_DAILY_MESSAGE_LIMIT) {
    throw new ConvexError({
      code: "LIMIT_REACHED",
      resetsAt: Math.floor(at / DAY_MS) * DAY_MS + DAY_MS,
    });
  }
  if (row) {
    await ctx.db.patch(row._id, { messages: used + 1 });
  } else {
    await ctx.db.insert("usage", { userId, day, messages: 1 });
  }
}

/**
 * Start today over. For the moment a plan ends: the counter runs on every plan
 * because it is also the usage history, so without this a downgrade would hand
 * someone a day already spent on messages their plan had covered.
 */
export async function clearTodaysUsage(
  ctx: MutationCtx,
  userId: Id<"users">,
): Promise<void> {
  const { row } = await todayFor(ctx, userId);
  if (row) await ctx.db.patch(row._id, { messages: 0 });
}

/** The action-side entry point: `chat.incognitoReply` has no `ctx.db`. */
export const spend = internalMutation({
  args: { userId: v.id("users") },
  returns: v.null(),
  handler: async (ctx, { userId }) => {
    await spendMessage(ctx, userId);
    return null;
  },
});
