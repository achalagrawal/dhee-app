import { type MessageDoc, listMessages, listStreams } from "@convex-dev/agent";
import { components } from "../_generated/api";
import type { MutationCtx } from "../_generated/server";

// Helpers for the destructive rewrites of a conversation's tail — regenerate
// (drop the last reply) and edit-and-resend (fork at an earlier turn). Both
// live in convex/chat.ts; the mechanics of finding a tail, guarding it, and
// clearing its feedback live here.

// How far back to look for the turn a regeneration restarts from. A single
// turn is a handful of rows (the reply, plus any tool calls), so this is
// generous — it exists to bound the read, not to be reached.
const TURN_LOOKBACK = 100;

// How far back an edit may reach. Editing forks the conversation and deletes
// everything after the edited turn, so this bounds both the read and the
// delete to what one mutation can do. ~100 exchanges back is further than
// anyone edits in practice; past it the person is told plainly rather than
// having part of the tail silently survive.
const EDIT_LOOKBACK = 200;

// The key the client rates a message by. NOT the message's `_id`: the agent
// collapses the several documents of one assistant turn (tool call, tool
// result, text) into a single UIMessage keyed by the first document's
// coordinates, and that key is what `messageFeedback.messageId` holds.
export function uiMessageKey(doc: MessageDoc): string {
  return `${doc.threadId}-${doc.order}-${doc.stepOrder}`;
}

// Drop feedback rows belonging to messages that are being discarded, so a
// thumbs-down never carries over onto whatever replaces them.
export async function clearFeedbackFor(
  ctx: MutationCtx,
  docs: MessageDoc[],
): Promise<void> {
  for (const key of new Set(docs.map(uiMessageKey))) {
    const row = await ctx.db
      .query("messageFeedback")
      .withIndex("by_message", (q) => q.eq("messageId", key))
      .unique();
    if (row) await ctx.db.delete(row._id);
  }
}

// Refuse the destructive rewrites while a reply is being generated. Deleting
// the pending message would pull it out from under the running action, which
// then fails trying to finalize it — stop first, or wait.
export async function assertNoActiveReply(
  ctx: MutationCtx,
  threadId: string,
): Promise<void> {
  const active = await listStreams(ctx, components.agent, {
    threadId,
    includeStatuses: ["streaming"],
  });
  if (active.length > 0) throw new Error("Dhee is still replying.");
}

// A message and everything that came after it — the tail an edit discards.
//
// Collected rather than deleted by order range because the feedback rows have
// to go too, and they are keyed by each message's position. Leaving one behind
// would be worse than an orphan: the replies that follow an edit reuse the
// same positions, so a stale row would attach a rating to a message nobody
// rated.
export async function messagesFrom(
  ctx: MutationCtx,
  threadId: string,
  messageId: string,
): Promise<MessageDoc[]> {
  const { page } = await listMessages(ctx, components.agent, {
    threadId,
    paginationOpts: { cursor: null, numItems: EDIT_LOOKBACK },
  });
  // Newest first, so the tail is everything up to and including the target.
  const index = page.findIndex((m) => m._id === messageId);
  if (index === -1) {
    throw new Error("That message is too far back to edit.");
  }
  return page.slice(0, index + 1);
}

// The newest user message, plus everything that came after it. That tail is
// what a regeneration discards.
//
// Comparing positions rather than assuming how the component numbers a reply
// relative to its prompt: `listMessages` returns newest-first, so everything
// before the first user message it yields is later in the conversation.
export async function lastUserTurn(
  ctx: MutationCtx,
  threadId: string,
): Promise<{ prompt: MessageDoc; after: MessageDoc[] } | null> {
  const { page } = await listMessages(ctx, components.agent, {
    threadId,
    paginationOpts: { cursor: null, numItems: TURN_LOOKBACK },
  });
  const index = page.findIndex((m) => m.message?.role === "user");
  const prompt = index === -1 ? undefined : page[index];
  if (!prompt) return null;
  return { prompt, after: page.slice(0, index) };
}
