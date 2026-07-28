import { v } from "convex/values";
import { components } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { type MutationCtx, internalMutation } from "./_generated/server";
import { dhee } from "./agents/dhee";

// Erasure. `triggers.user.onDelete` in auth.ts removes the app-side `users`
// row; this removes everything that hangs off it. Without it a deleted account
// leaves behind its profile photo, its conversations, and — the part that
// matters most — every inference Dhee drew about the person, orphaned under an
// id that no longer resolves to anyone.
//
// Deliberately keyed by `userId` rather than by identity: it runs from the
// delete trigger, after the row it would have authorized against is gone.

// Each of these carries a `by_user` index, which is what makes a purge a set of
// index reads rather than a table scan.
const USER_OWNED_TABLES = [
  "inquiries",
  "observations",
  "conceptsTouched",
  "contextBlocks",
  "threadMeta",
  "messageFeedback",
] as const;

// Threads live in the agent component and are deleted asynchronously, so ids
// are collected first: paging a list while deleting from it walks a moving
// cursor.
async function deleteThreads(
  ctx: MutationCtx,
  userId: Id<"users">,
): Promise<void> {
  const threadIds: string[] = [];
  let cursor: string | null = null;
  for (;;) {
    // Annotated because `cursor` is assigned from this call's own result, and
    // tsc won't infer a type that refers back to the variable feeding it.
    const {
      page,
      isDone,
      continueCursor,
    }: {
      page: Array<{ _id: string }>;
      isDone: boolean;
      continueCursor: string;
    } = await ctx.runQuery(components.agent.threads.listThreadsByUserId, {
      userId,
      paginationOpts: { cursor, numItems: 100 },
    });
    threadIds.push(...page.map((thread) => thread._id));
    if (isDone) break;
    cursor = continueCursor;
  }
  for (const threadId of threadIds) {
    await dhee.deleteThreadAsync(ctx, { threadId });
  }
}

export const purgeUserData = internalMutation({
  args: { userId: v.id("users") },
  returns: v.null(),
  handler: async (ctx, { userId }) => {
    const profile = await ctx.db
      .query("profiles")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .unique();
    if (profile) {
      // The photo is a storage object, not a row — deleting the profile alone
      // would leave the image itself sitting in storage.
      if (profile.avatarId) await ctx.storage.delete(profile.avatarId);
      await ctx.db.delete(profile._id);
    }

    // Before the generic sweep below, because deleting a `threadMeta` row
    // discards the scheduled-job id it holds. Each thread may have a memory
    // extraction queued minutes out; left running, one would wake after the
    // account is gone and write fresh observation rows under a userId that no
    // longer resolves to anyone — re-creating exactly what this function
    // exists to erase. Cancelling is best-effort; a job already run or already
    // cancelled must not abort an erasure.
    const metas = await ctx.db
      .query("threadMeta")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();
    for (const meta of metas) {
      if (!meta.pendingExtraction) continue;
      try {
        await ctx.scheduler.cancel(meta.pendingExtraction);
      } catch {
        // Already fired or gone.
      }
    }

    for (const table of USER_OWNED_TABLES) {
      const rows = await ctx.db
        .query(table)
        .withIndex("by_user", (q) => q.eq("userId", userId))
        .collect();
      for (const row of rows) await ctx.db.delete(row._id);
    }

    // Separately, because its index is `by_user_day` — the sweep above only
    // sees tables with a plain `by_user`. Reading the compound index on its
    // first field gives every day this person has.
    const counters = await ctx.db
      .query("usage")
      .withIndex("by_user_day", (q) => q.eq("userId", userId))
      .collect();
    for (const row of counters) await ctx.db.delete(row._id);

    await deleteThreads(ctx, userId);
    return null;
  },
});
