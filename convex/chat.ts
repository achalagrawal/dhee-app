import {
  type MessageDoc,
  abortStream,
  createThread,
  getThreadMetadata,
  listMessages,
  listStreams,
  listUIMessages,
  syncStreams,
  updateThreadMetadata,
  vStreamArgs,
} from "@convex-dev/agent";
import { getAuthUserId } from "@convex-dev/auth/server";
import { paginationOptsValidator } from "convex/server";
import { v } from "convex/values";
import { z } from "zod";
import { components, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import {
  type ActionCtx,
  type MutationCtx,
  type QueryCtx,
  action,
  internalAction,
  mutation,
  query,
} from "./_generated/server";
import { buildSystemPrompt, dhee } from "./agents/dhee";
import { MEMORY_EXTRACTION_INTERVAL_TURNS } from "./config";
import { requireUserId } from "./users";

// Chat surface. Every entry point is user-scoped: a thread belongs to the
// person who created it, and no query returns another person's messages.
//
// Flow: `sendMessage` mutation saves the user turn and schedules the reply,
// so the client can render optimistically while `streamReply` streams deltas
// over websockets.
//
// Conventions for the whole loop — what a stopped message leaves behind, how
// failures are surfaced, when auto-scroll may move the view — are written down
// once in docs/build/specs/chat-loop.md.

// Recorded on the aborted stream. Distinguishes a deliberate stop from a
// model or network failure when reading the component's stream rows.
const STOP_REASON = "Stopped by the person.";

// How far back to look for the turn a regeneration restarts from. A single
// turn is a handful of rows (the reply, plus any tool calls), so this is
// generous — it exists to bound the read, not to be reached.
const TURN_LOOKBACK = 100;

// The key the client rates a message by. NOT the message's `_id`: the agent
// collapses the several documents of one assistant turn (tool call, tool
// result, text) into a single UIMessage keyed by the first document's
// coordinates, and that key is what `messageFeedback.messageId` holds.
function uiMessageKey(doc: MessageDoc): string {
  return `${doc.threadId}-${doc.order}-${doc.stepOrder}`;
}

// Drop feedback rows belonging to messages that are being discarded, so a
// thumbs-down never carries over onto whatever replaces them.
async function clearFeedbackFor(
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

// The newest user message, plus everything that came after it. That tail is
// what a regeneration discards and an edit truncates.
//
// Comparing positions rather than assuming how the component numbers a reply
// relative to its prompt: `listMessages` returns newest-first, so everything
// before the first user message it yields is later in the conversation.
async function lastUserTurn(
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

async function authorizeThread(
  ctx: QueryCtx | MutationCtx | ActionCtx,
  threadId: string,
): Promise<void> {
  const userId = await requireUserId(ctx as QueryCtx);
  const { userId: threadUserId } = await getThreadMetadata(
    ctx,
    components.agent,
    { threadId },
  );
  if (threadUserId !== userId) {
    throw new Error("Not your conversation.");
  }
}

// Upsert Dhee's per-thread metadata row. Threads originate in the agent
// component, so their first `threadMeta` row is created lazily the first time
// we need to attach something (a turn count, a star, a pin).
async function upsertThreadMeta(
  ctx: MutationCtx,
  threadId: string,
  userId: Id<"users">,
  patch: Partial<{
    turnsSinceExtraction: number;
    starred: boolean;
    pinned: boolean;
  }>,
): Promise<void> {
  const meta = await ctx.db
    .query("threadMeta")
    .withIndex("by_thread", (q) => q.eq("threadId", threadId))
    .unique();
  if (meta) {
    await ctx.db.patch(meta._id, patch);
  } else {
    await ctx.db.insert("threadMeta", {
      userId,
      threadId,
      turnsSinceExtraction: 0,
      ...patch,
    });
  }
}

export const listThreads = query({
  args: { paginationOpts: paginationOptsValidator },
  handler: async (ctx, { paginationOpts }) => {
    const userId = await requireUserId(ctx);
    return await ctx.runQuery(components.agent.threads.listThreadsByUserId, {
      userId,
      paginationOpts,
    });
  },
});

export const startThread = mutation({
  args: {},
  returns: v.string(),
  handler: async (ctx) => {
    const userId = await requireUserId(ctx);
    return await createThread(ctx, components.agent, { userId });
  },
});

export const sendMessage = mutation({
  args: {
    threadId: v.string(),
    prompt: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, { threadId, prompt }) => {
    await authorizeThread(ctx, threadId);
    const userId = await requireUserId(ctx);

    const { messageId } = await dhee.saveMessage(ctx, {
      threadId,
      prompt,
      skipEmbeddings: true,
    });

    // Count turns so the extraction workflow fires every N.
    const meta = await ctx.db
      .query("threadMeta")
      .withIndex("by_thread", (q) => q.eq("threadId", threadId))
      .unique();
    const turns = (meta?.turnsSinceExtraction ?? 0) + 1;
    await upsertThreadMeta(ctx, threadId, userId, {
      turnsSinceExtraction: turns,
    });

    await ctx.scheduler.runAfter(0, internal.chat.streamReply, {
      threadId,
      promptMessageId: messageId,
      userId,
    });

    if (turns >= MEMORY_EXTRACTION_INTERVAL_TURNS) {
      await ctx.scheduler.runAfter(0, internal.memory.runExtraction, {
        userId,
        threadId,
      });
    }
    return null;
  },
});

// Incognito: a one-shot reply that persists nothing. It reads no personal
// context block and passes `saveMessages: "none"`, so the exchange leaves no
// trace — no thread, no message rows, no memory extraction. The client holds
// the transcript in memory and sends the whole history each turn. It still
// grounds in the corpus (tools run during generation), just statelessly.
export const incognitoReply = action({
  args: {
    messages: v.array(
      v.object({
        role: v.union(v.literal("user"), v.literal("assistant")),
        text: v.string(),
      }),
    ),
  },
  returns: v.string(),
  handler: async (ctx, { messages }) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) throw new Error("Not signed in.");
    const { text } = await dhee.generateText(
      ctx,
      { userId },
      {
        system: buildSystemPrompt(""),
        messages: messages.map((m) => ({ role: m.role, content: m.text })),
      },
      {
        // Persist nothing, and pull in no prior context — a userId is required
        // by the agent, but recentMessages:0 + no search keeps the turn
        // sandboxed to just what the client sent.
        storageOptions: { saveMessages: "none" },
        contextOptions: { recentMessages: 0, searchOptions: { limit: 0 } },
      },
    );
    return text;
  },
});

export const streamReply = internalAction({
  args: {
    threadId: v.string(),
    promptMessageId: v.string(),
    userId: v.id("users"),
  },
  returns: v.null(),
  handler: async (ctx, { threadId, promptMessageId, userId }) => {
    const contextBlock = await ctx.runQuery(
      internal.memory.contextBlockForUser,
      { userId },
    );
    try {
      const result = await dhee.streamText(
        ctx,
        { threadId, userId },
        { promptMessageId, system: buildSystemPrompt(contextBlock) },
        { saveStreamDeltas: { chunking: "word", throttleMs: 100 } },
      );
      await result.consumeStream();
    } finally {
      // Title the thread once there's a real exchange to summarize. Without
      // this every row in the conversation list reads "New conversation" and
      // history is unnavigable.
      //
      // In `finally` because a stopped stream (see `stopGeneration`) makes the
      // consume above throw. A thread the person stopped on its first turn
      // still needs a name, so titling must not be collateral damage.
      await ctx.scheduler.runAfter(0, internal.chat.titleThread, { threadId });
    }
    return null;
  },
});

// Stop a reply mid-flight.
//
// Aborting flips the component's stream row out of "streaming", which makes the
// generating action's next delta write fail. That failure aborts the
// `AbortController` whose signal was handed to the model request — so the model
// call genuinely ends rather than being hidden while it finishes at our expense.
//
// The partial text survives: when the aborted action finalizes its pending
// message, the component derives real message rows from the deltas written so
// far, so a stopped reply stays readable in `listThreadMessages` afterwards.
//
// The target is found server-side from the already-authorized thread rather
// than taken from the client. A client-supplied streamId would have to be
// checked against the caller's thread anyway, and looking it up here also
// covers the case of more than one active stream.
export const stopGeneration = mutation({
  args: { threadId: v.string() },
  // Whether anything was actually stopped — false when the reply had already
  // finished. Stopping nothing is a no-op, not an error: the button races the
  // stream ending on its own, and losing that race is not a failure.
  returns: v.boolean(),
  handler: async (ctx, { threadId }) => {
    await authorizeThread(ctx, threadId);
    const active = await listStreams(ctx, components.agent, {
      threadId,
      includeStatuses: ["streaming"],
    });
    let stopped = false;
    for (const stream of active) {
      const didAbort = await abortStream(ctx, components.agent, {
        streamId: stream.streamId,
        reason: STOP_REASON,
      });
      stopped = stopped || didAbort;
    }
    return stopped;
  },
});

// Try again: throw away the last reply and ask for another from the same
// prompt. Replaces rather than appends — there is no "1 of 2 responses"
// browser, so the discarded reply is deleted rather than kept around
// unreachable. See docs/build/specs/chat-loop.md §5.
export const regenerate = mutation({
  args: { threadId: v.string() },
  returns: v.null(),
  handler: async (ctx, { threadId }) => {
    await authorizeThread(ctx, threadId);
    const userId = await requireUserId(ctx);

    const active = await listStreams(ctx, components.agent, {
      threadId,
      includeStatuses: ["streaming"],
    });
    if (active.length > 0) throw new Error("Dhee is still replying.");

    const turn = await lastUserTurn(ctx, threadId);
    if (!turn || turn.after.length === 0) {
      throw new Error("There's no reply to try again yet.");
    }
    // A reply already on its way but not yet streaming — scheduled, or saved
    // and about to be. Regenerating now would race it and leave two.
    if (turn.after.some((m) => m.status === "pending")) {
      throw new Error("Dhee is still replying.");
    }

    await clearFeedbackFor(ctx, turn.after);
    await dhee.deleteMessages(ctx, {
      messageIds: turn.after.map((m) => m._id),
    });

    // Deliberately does not touch `turnsSinceExtraction`: a regeneration is
    // not a new user turn, and counting it would fire memory extraction early
    // on a conversation that hasn't actually moved.
    await ctx.scheduler.runAfter(0, internal.chat.streamReply, {
      threadId,
      promptMessageId: turn.prompt._id,
      userId,
    });
    return null;
  },
});

export const titleThread = internalAction({
  args: { threadId: v.string() },
  returns: v.null(),
  handler: async (ctx, { threadId }) => {
    const meta = await getThreadMetadata(ctx, components.agent, { threadId });
    // First reply wins; later turns leave the established title alone.
    if (meta.title?.trim()) return null;

    const { object } = await dhee.generateObject(
      ctx,
      { threadId },
      {
        // Deliberately not the Dhee persona: this call should not reach for
        // corpus tools or answer anything, just label what was said.
        system:
          "You write short labels for saved conversations. Write in the same language the person used. Use their own plain words — never introduce specialized or philosophical vocabulary. The title is for finding this conversation again in a list.",
        schema: z.object({
          title: z
            .string()
            .describe(
              "At most six words naming what this conversation is about, from the person's point of view. No quotes, no trailing punctuation.",
            ),
          summary: z
            .string()
            .describe("One plain sentence describing what was discussed."),
        }),
        prompt:
          "Write a title and one-sentence summary for the conversation so far.",
      },
      { storageOptions: { saveMessages: "none" } },
    );

    await updateThreadMetadata(ctx, components.agent, {
      threadId,
      patch: { title: object.title, summary: object.summary },
    });
    return null;
  },
});

export const renameThread = mutation({
  args: { threadId: v.string(), title: v.string() },
  returns: v.null(),
  handler: async (ctx, { threadId, title }) => {
    await authorizeThread(ctx, threadId);
    const trimmed = title.trim();
    if (!trimmed) throw new Error("A conversation needs a name.");
    await updateThreadMetadata(ctx, components.agent, {
      threadId,
      patch: { title: trimmed.slice(0, 120) },
    });
    return null;
  },
});

export const deleteThread = mutation({
  args: { threadId: v.string() },
  returns: v.null(),
  handler: async (ctx, { threadId }) => {
    await authorizeThread(ctx, threadId);
    // Async deletion pages through messages and streams, so a long
    // conversation doesn't blow the mutation's time budget.
    await dhee.deleteThreadAsync(ctx, { threadId });
    const meta = await ctx.db
      .query("threadMeta")
      .withIndex("by_thread", (q) => q.eq("threadId", threadId))
      .unique();
    if (meta) await ctx.db.delete(meta._id);
    const feedback = await ctx.db
      .query("messageFeedback")
      .withIndex("by_thread", (q) => q.eq("threadId", threadId))
      .collect();
    for (const row of feedback) await ctx.db.delete(row._id);
    return null;
  },
});

// Deletes conversations only. What Dhee has learned about the person lives
// in the user-model tables and is cleared separately by
// `understanding.forgetEverything`, so each can be chosen on its own.
export const deleteAllThreads = mutation({
  args: {},
  returns: v.number(),
  handler: async (ctx) => {
    const userId = await requireUserId(ctx);
    const { page } = await ctx.runQuery(
      components.agent.threads.listThreadsByUserId,
      { userId, paginationOpts: { cursor: null, numItems: 500 } },
    );
    for (const thread of page) {
      await dhee.deleteThreadAsync(ctx, { threadId: thread._id });
    }
    const metas = await ctx.db
      .query("threadMeta")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();
    for (const meta of metas) await ctx.db.delete(meta._id);
    const feedback = await ctx.db
      .query("messageFeedback")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();
    for (const row of feedback) await ctx.db.delete(row._id);
    return page.length;
  },
});

// ---- Star / pin -----------------------------------------------------------

export const setStarred = mutation({
  args: { threadId: v.string(), starred: v.boolean() },
  returns: v.null(),
  handler: async (ctx, { threadId, starred }) => {
    await authorizeThread(ctx, threadId);
    const userId = await requireUserId(ctx);
    await upsertThreadMeta(ctx, threadId, userId, { starred });
    return null;
  },
});

export const setPinned = mutation({
  args: { threadId: v.string(), pinned: v.boolean() },
  returns: v.null(),
  handler: async (ctx, { threadId, pinned }) => {
    await authorizeThread(ctx, threadId);
    const userId = await requireUserId(ctx);
    await upsertThreadMeta(ctx, threadId, userId, { pinned });
    return null;
  },
});

// The star/pin flags for the signed-in person's threads. Returned as a flat
// list (only threads that carry a flag) so the client can build a lookup and
// merge it onto the agent component's thread list.
export const threadFlags = query({
  args: {},
  returns: v.array(
    v.object({
      threadId: v.string(),
      starred: v.boolean(),
      pinned: v.boolean(),
    }),
  ),
  handler: async (ctx) => {
    const userId = await requireUserId(ctx);
    const metas = await ctx.db
      .query("threadMeta")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();
    return metas
      .filter((m) => m.starred || m.pinned)
      .map((m) => ({
        threadId: m.threadId,
        starred: !!m.starred,
        pinned: !!m.pinned,
      }));
  },
});

// ---- Message feedback -----------------------------------------------------

export const setMessageFeedback = mutation({
  args: {
    threadId: v.string(),
    messageId: v.string(),
    // null clears an existing rating (toggling the active thumb off).
    rating: v.union(v.literal("up"), v.literal("down"), v.null()),
  },
  returns: v.null(),
  handler: async (ctx, { threadId, messageId, rating }) => {
    await authorizeThread(ctx, threadId);
    const userId = await requireUserId(ctx);
    const existing = await ctx.db
      .query("messageFeedback")
      .withIndex("by_message", (q) => q.eq("messageId", messageId))
      .unique();
    if (rating === null) {
      if (existing) await ctx.db.delete(existing._id);
      return null;
    }
    if (existing) {
      await ctx.db.patch(existing._id, { rating });
    } else {
      await ctx.db.insert("messageFeedback", {
        userId,
        threadId,
        messageId,
        rating,
        createdAt: Date.now(),
      });
    }
    return null;
  },
});

export const threadFeedback = query({
  args: { threadId: v.string() },
  returns: v.array(
    v.object({
      messageId: v.string(),
      rating: v.union(v.literal("up"), v.literal("down")),
    }),
  ),
  handler: async (ctx, { threadId }) => {
    await authorizeThread(ctx, threadId);
    const rows = await ctx.db
      .query("messageFeedback")
      .withIndex("by_thread", (q) => q.eq("threadId", threadId))
      .collect();
    return rows.map((r) => ({ messageId: r.messageId, rating: r.rating }));
  },
});

export const listThreadMessages = query({
  args: {
    threadId: v.string(),
    paginationOpts: paginationOptsValidator,
    streamArgs: vStreamArgs,
  },
  handler: async (ctx, args) => {
    await authorizeThread(ctx, args.threadId);
    const streams = await syncStreams(ctx, components.agent, {
      threadId: args.threadId,
      streamArgs: args.streamArgs,
    });
    const paginated = await listUIMessages(ctx, components.agent, {
      threadId: args.threadId,
      paginationOpts: args.paginationOpts,
    });
    return { ...paginated, streams };
  },
});
