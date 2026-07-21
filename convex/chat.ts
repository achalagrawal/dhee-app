import { paginationOptsValidator } from "convex/server";
import { v } from "convex/values";
import {
  createThread,
  listUIMessages,
  syncStreams,
  vStreamArgs,
} from "@convex-dev/agent";
import { components, internal } from "./_generated/api";
import {
  internalAction,
  mutation,
  query,
} from "./_generated/server";
import { dhee } from "./agents/dhee";

// M1 chat surface. Anonymous threads for now — auth wiring lands in M3.
//
// Recommended pattern from the Convex Agent docs:
//   mutation `sendMessage` saves the user turn + schedules the response
//   internalAction `streamReply` runs streamText with saveStreamDeltas
//   query `listThreadMessages` returns paginated messages + live stream deltas
// Clients subscribe to the query and get delta-based streaming over websockets.

export const startThread = mutation({
  args: {},
  returns: v.string(),
  handler: async (ctx) => {
    const threadId = await createThread(ctx, components.agent);
    return threadId;
  },
});

export const sendMessage = mutation({
  args: {
    threadId: v.string(),
    prompt: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, { threadId, prompt }) => {
    const { messageId } = await dhee.saveMessage(ctx, {
      threadId,
      prompt,
      // Deferred to the streaming action; keeps this mutation fast.
      skipEmbeddings: true,
    });
    await ctx.scheduler.runAfter(0, internal.chat.streamReply, {
      threadId,
      promptMessageId: messageId,
    });
    return null;
  },
});

export const streamReply = internalAction({
  args: {
    threadId: v.string(),
    promptMessageId: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, { threadId, promptMessageId }) => {
    const result = await dhee.streamText(
      ctx,
      { threadId },
      { promptMessageId },
      { saveStreamDeltas: { chunking: "word", throttleMs: 100 } },
    );
    // Drain the stream so all deltas land before the action returns.
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
