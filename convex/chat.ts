import {
  createThread,
  getThreadMetadata,
  listUIMessages,
  syncStreams,
  updateThreadMetadata,
  vStreamArgs,
} from "@convex-dev/agent";
import { paginationOptsValidator } from "convex/server";
import { v } from "convex/values";
import { z } from "zod";
import { components, internal } from "./_generated/api";
import {
  type ActionCtx,
  type MutationCtx,
  type QueryCtx,
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
    if (meta) {
      await ctx.db.patch(meta._id, { turnsSinceExtraction: turns });
    } else {
      await ctx.db.insert("threadMeta", {
        userId,
        threadId,
        turnsSinceExtraction: turns,
      });
    }

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
    const result = await dhee.streamText(
      ctx,
      { threadId, userId },
      { promptMessageId, system: buildSystemPrompt(contextBlock) },
      { saveStreamDeltas: { chunking: "word", throttleMs: 100 } },
    );
    await result.consumeStream();

    // Title the thread once there's a real exchange to summarize. Without
    // this every row in the conversation list reads "New conversation" and
    // history is unnavigable.
    await ctx.scheduler.runAfter(0, internal.chat.titleThread, { threadId });
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
      .withIndex("by_thread")
      .collect();
    for (const meta of metas) {
      if (meta.userId === userId) await ctx.db.delete(meta._id);
    }
    return page.length;
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
