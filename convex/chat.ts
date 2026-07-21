import {
  createThread,
  getThreadMetadata,
  listUIMessages,
  syncStreams,
  vStreamArgs,
} from "@convex-dev/agent";
import { paginationOptsValidator } from "convex/server";
import { v } from "convex/values";
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
    return null;
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
