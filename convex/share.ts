import {
  type MessageDoc,
  getThreadMetadata,
  toUIMessages,
} from "@convex-dev/agent";
import { paginationOptsValidator } from "convex/server";
import { v } from "convex/values";
import { components } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import {
  type MutationCtx,
  type QueryCtx,
  mutation,
  query,
} from "./_generated/server";
import { requireUserId } from "./users";

// Sharing a conversation as a read-only link. Spec: docs/build/specs/sharing.md.
//
// This is the only unauthenticated read path in the app, which is why it lives
// in its own file rather than among the thread functions in chat.ts — every
// handler there opens with an authorization call, and a public one sitting in
// the middle of them is a thing that gets lost. Here the two public queries are
// next to each other and the absence of `requireUserId` is the point.
//
// Two rules hold the whole design up:
//
//   1. A share is a *snapshot*, not a mirror. Carrying on the conversation must
//      never extend what a link already handed out. See `throughOrder`.
//   2. Only role and text leave the server. Tool calls, reasoning, file ids and
//      message metadata are not part of what was said, and an anonymous reader
//      has no business holding them.

// 80 bits of randomness in the URL. Guessing is the only attack there is, and
// anything derived from the thread or the user would be enumerable.
const SLUG_LENGTH = 20;

function newSlug(): string {
  return crypto.randomUUID().replace(/-/g, "").slice(0, SLUG_LENGTH);
}

// What a reader gets, and the exhaustive list of it.
const vSharedMessage = v.object({
  key: v.string(),
  role: v.union(v.literal("user"), v.literal("assistant")),
  text: v.string(),
});

async function activeShareForThread(
  ctx: QueryCtx | MutationCtx,
  threadId: string,
): Promise<Doc<"sharedThreads"> | null> {
  const rows = await ctx.db
    .query("sharedThreads")
    .withIndex("by_thread", (q) => q.eq("threadId", threadId))
    .collect();
  return rows.find((row) => row.revokedAt === undefined) ?? null;
}

// A missing slug, a revoked one and one whose thread has been deleted all
// answer the same way. Telling them apart would turn this into an oracle for
// which links once existed.
async function activeShareBySlug(
  ctx: QueryCtx,
  slug: string,
): Promise<Doc<"sharedThreads"> | null> {
  const row = await ctx.db
    .query("sharedThreads")
    .withIndex("by_slug", (q) => q.eq("slug", slug))
    .unique();
  return row && row.revokedAt === undefined ? row : null;
}

// The newest message that would appear in the conversation — the boundary a
// fresh share ends at. Tool messages are skipped because they are never shown;
// ending the snapshot on one would be an invisible boundary.
async function lastVisibleMessage(
  ctx: MutationCtx,
  threadId: string,
): Promise<MessageDoc | undefined> {
  const { page } = await ctx.runQuery(
    components.agent.messages.listMessagesByThreadId,
    {
      threadId,
      order: "desc",
      statuses: ["success"],
      excludeToolMessages: true,
      paginationOpts: { cursor: null, numItems: 1 },
    },
  );
  return page[0];
}

async function authorizeThread(
  ctx: QueryCtx | MutationCtx,
  threadId: string,
): Promise<void> {
  const userId = await requireUserId(ctx);
  const { userId: threadUserId } = await getThreadMetadata(
    ctx,
    components.agent,
    { threadId },
  );
  if (threadUserId !== userId) {
    throw new Error("Not your conversation.");
  }
}

/** Delete every share of a thread. Called from `chat.deleteThread` and
 *  `chat.deleteAllThreads` — the messages go with the thread, and a row
 *  pointing at nothing would serve a page that can never be revoked. */
export async function deleteSharesForThread(
  ctx: MutationCtx,
  threadId: string,
): Promise<void> {
  const rows = await ctx.db
    .query("sharedThreads")
    .withIndex("by_thread", (q) => q.eq("threadId", threadId))
    .collect();
  for (const row of rows) await ctx.db.delete(row._id);
}

/** Revoke the thread's link if a rewrite reaches inside what it published.
 *
 *  Editing and regenerating *delete* messages, and the replacements take the
 *  same `order` numbers the deleted ones had — so neither the boundary id nor
 *  the order bound can tell the new conversation from the shared one. Whoever
 *  holds the link was given a particular exchange; once that exchange no longer
 *  exists, the honest answer is that the link is dead, not that it now shows
 *  something else. Re-sharing is one tap.
 *
 *  Call with the messages about to be deleted, before deleting them. */
export async function revokeSharesTouching(
  ctx: MutationCtx,
  threadId: string,
  deleted: { order: number }[],
): Promise<void> {
  if (deleted.length === 0) return;
  const share = await activeShareForThread(ctx, threadId);
  if (!share) return;
  const reachesSnapshot = deleted.some((m) => m.order <= share.throughOrder);
  if (reachesSnapshot) {
    await ctx.db.patch(share._id, { revokedAt: Date.now() });
  }
}

/** Every share this person holds. `chat.deleteAllThreads` is "delete my
 *  conversations", and a link that outlived the conversation behind it is
 *  exactly what that is meant to prevent. */
export async function deleteSharesForUser(
  ctx: MutationCtx,
  userId: Id<"users">,
): Promise<void> {
  const rows = await ctx.db
    .query("sharedThreads")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .collect();
  for (const row of rows) await ctx.db.delete(row._id);
}

export const shareThread = mutation({
  args: { threadId: v.string() },
  returns: v.object({ slug: v.string() }),
  handler: async (ctx, { threadId }) => {
    const userId = await requireUserId(ctx);
    const { userId: threadUserId, title } = await getThreadMetadata(
      ctx,
      components.agent,
      { threadId },
    );
    if (threadUserId !== userId) throw new Error("Not your conversation.");

    // The sticky flag from `chat.sendMessage`. Publishing a conversation that
    // raised the support banner is the worst thing this feature could do, so
    // it is refused here rather than only hidden in the UI.
    const meta = await ctx.db
      .query("threadMeta")
      .withIndex("by_thread", (q) => q.eq("threadId", threadId))
      .unique();
    if (meta?.crisisFlagged) {
      throw new Error("This conversation can't be shared.");
    }

    const last = await lastVisibleMessage(ctx, threadId);
    if (!last) throw new Error("This conversation has nothing in it yet.");

    const snapshot = {
      title: title ?? undefined,
      throughMessageId: last._id,
      throughOrder: last.order,
    };

    // Re-sharing an active link extends it to here and keeps the slug: the
    // person means "share more of this", not "hand out a second address".
    const existing = await activeShareForThread(ctx, threadId);
    if (existing) {
      await ctx.db.patch(existing._id, snapshot);
      return { slug: existing.slug };
    }

    // After a revocation, though, a new slug. The revoked row stays behind as
    // a tombstone so the dead link is never reused.
    const slug = newSlug();
    await ctx.db.insert("sharedThreads", {
      userId,
      threadId,
      slug,
      createdAt: Date.now(),
      ...snapshot,
    });
    return { slug };
  },
});

export const unshareThread = mutation({
  args: { threadId: v.string() },
  returns: v.null(),
  handler: async (ctx, { threadId }) => {
    await authorizeThread(ctx, threadId);
    const existing = await activeShareForThread(ctx, threadId);
    // Not an error when there's nothing to revoke: two taps on Unshare, or a
    // stale screen, should not surface a failure.
    if (existing) await ctx.db.patch(existing._id, { revokedAt: Date.now() });
    return null;
  },
});

/** The author's own view of whether this conversation has a live link. */
export const shareForThread = query({
  args: { threadId: v.string() },
  returns: v.union(
    v.null(),
    v.object({ slug: v.string(), sharedAt: v.number() }),
  ),
  handler: async (ctx, { threadId }) => {
    await authorizeThread(ctx, threadId);
    const existing = await activeShareForThread(ctx, threadId);
    return existing
      ? { slug: existing.slug, sharedAt: existing.createdAt }
      : null;
  },
});

// ---- The public path. Nothing below this line calls requireUserId. ---------

export const sharedConversation = query({
  args: { slug: v.string() },
  returns: v.union(
    v.null(),
    v.object({ title: v.optional(v.string()), sharedAt: v.number() }),
  ),
  handler: async (ctx, { slug }) => {
    const share = await activeShareBySlug(ctx, slug);
    return share ? { title: share.title, sharedAt: share.createdAt } : null;
  },
});

export const listSharedMessages = query({
  args: { slug: v.string(), paginationOpts: paginationOptsValidator },
  returns: v.object({
    page: v.array(vSharedMessage),
    isDone: v.boolean(),
    continueCursor: v.string(),
  }),
  handler: async (ctx, { slug, paginationOpts }) => {
    const share = await activeShareBySlug(ctx, slug);
    // A dead link is a page that says so, not an error boundary.
    if (!share) {
      return { page: [], isDone: true, continueCursor: "" };
    }

    // The component query rather than the `listUIMessages` helper: only this
    // one takes `upToAndIncludingMessageId`, which is what bounds the snapshot
    // in the index rather than after the read.
    const result = await ctx.runQuery(
      components.agent.messages.listMessagesByThreadId,
      {
        threadId: share.threadId,
        order: "asc",
        statuses: ["success"],
        excludeToolMessages: true,
        upToAndIncludingMessageId: share.throughMessageId,
        paginationOpts,
      },
    );

    // The bound again, this time on the rows. `upToAndIncludingMessageId`
    // silently means "no bound" once that message is gone — and an edit deletes
    // messages — so without this a shared thread would start publishing the
    // conversation that replaced it.
    const withinSnapshot = result.page.filter(
      (m) => m.order <= share.throughOrder,
    );

    // toUIMessages collapses a multi-step assistant turn into one message and
    // keeps only text, reasoning and tool parts separate; taking `.text` is
    // what leaves the reasoning behind.
    const page = toUIMessages(withinSnapshot)
      .filter((m) => m.role === "user" || m.role === "assistant")
      .filter((m) => m.text.trim().length > 0)
      .map((m) => ({
        key: m.key,
        role: m.role as "user" | "assistant",
        text: m.text,
      }));

    return {
      page,
      isDone: result.isDone,
      continueCursor: result.continueCursor,
    };
  },
});
