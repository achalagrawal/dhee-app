import {
  type MessageDoc,
  abortStream,
  createThread,
  getThreadMetadata,
  listMessages,
  listStreams,
  listUIMessages,
  stepCountIs,
  syncStreams,
  updateThreadMetadata,
  vStreamArgs,
} from "@convex-dev/agent";
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
import {
  STUDY_STEPS,
  buildSystemPrompt,
  dhee,
  isCorpusLens,
} from "./agents/dhee";
import { backgroundModel } from "./agents/config";
import { MEMORY_EXTRACTION_INTERVAL_TURNS } from "./config";
import { detectsCrisis } from "./lib/crisis";
import { requireUserId } from "./users";

// Chat surface. Every entry point is user-scoped: a thread belongs to the
// person who created it, and no query returns another person's messages.
//
// Flow: `sendMessage` mutation saves the user turn and schedules the reply,
// so the client can render optimistically while `streamReply` streams deltas
// over websockets.
//
// Loop conventions are written down once in docs/build/specs/chat-loop.md.

// What the prompt builder needs about a person, as `users.personalizationForUser`
// returns it. Deliberately narrower than `PromptInputs`: no `contextBlock`.
type Personalization = {
  nickname?: string;
  occupation?: string;
  aboutYou?: string;
  traditions: string[];
};

const STOP_REASON = "Stopped by the person.";

// Bounds the read; a turn is a handful of rows, so it should never be reached.
const TURN_LOOKBACK = 100;

// Bounds the read and the delete to one mutation's budget.
const EDIT_LOOKBACK = 200;

// NOT the message `_id`: the agent collapses one assistant turn's several
// documents into a single UIMessage keyed by the first, and that key is what
// `messageFeedback.messageId` holds.
function uiMessageKey(doc: MessageDoc): string {
  return `${doc.threadId}-${doc.order}-${doc.stepOrder}`;
}

type Marks = { edited: string[]; stopped: string[] };

// Drops everything keyed to a message's position — rating, "edited" mark,
// "stopped" mark — and returns the marks that survived. Whatever replaces a
// discarded tail reuses those positions, so a mark left behind lands on the
// wrong message: a rating nobody gave, or a failure read as a deliberate stop.
async function clearMarksFor(
  ctx: MutationCtx,
  threadId: string,
  docs: MessageDoc[],
): Promise<Marks> {
  const keys = new Set(docs.map(uiMessageKey));
  for (const key of keys) {
    const row = await ctx.db
      .query("messageFeedback")
      .withIndex("by_message", (q) => q.eq("messageId", key))
      .unique();
    if (row) await ctx.db.delete(row._id);
  }
  const meta = await threadMetaFor(ctx, threadId);
  const edited = meta?.editedMessages ?? [];
  const stopped = meta?.stoppedMessages ?? [];
  const kept: Marks = {
    edited: edited.filter((k) => !keys.has(k)),
    stopped: stopped.filter((k) => !keys.has(k)),
  };
  const dropped =
    kept.edited.length !== edited.length ||
    kept.stopped.length !== stopped.length;
  if (meta && dropped) {
    await ctx.db.patch(meta._id, {
      editedMessages: kept.edited,
      stoppedMessages: kept.stopped,
    });
  }
  return kept;
}

// A message and everything after it. Collected rather than deleted by order
// range because `clearMarksFor` needs the keys.
async function messagesFrom(
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

// A started reply is an active stream; one only scheduled is a pending row in
// `tail`. Both checked here, so a third caller can't inherit half a guard.
async function assertNoActiveReply(
  ctx: MutationCtx,
  threadId: string,
  tail: MessageDoc[],
): Promise<void> {
  const streaming = await listStreams(ctx, components.agent, {
    threadId,
    includeStatuses: ["streaming"],
  });
  if (streaming.length > 0 || tail.some((m) => m.status === "pending")) {
    throw new Error("Dhee is still replying.");
  }
}

// Compares positions rather than assuming how the component numbers a reply
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

function threadMetaFor(ctx: QueryCtx | MutationCtx, threadId: string) {
  return ctx.db
    .query("threadMeta")
    .withIndex("by_thread", (q) => q.eq("threadId", threadId))
    .unique();
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
    editedMessages: string[];
    stoppedMessages: string[];
    crisisFlagged: boolean;
  }>,
): Promise<void> {
  const meta = await threadMetaFor(ctx, threadId);
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
    const meta = await threadMetaFor(ctx, threadId);
    const turns = (meta?.turnsSinceExtraction ?? 0) + 1;
    await upsertThreadMeta(ctx, threadId, userId, {
      turnsSinceExtraction: turns,
      // Sticky once raised: the banner stays for the rest of the conversation
      // rather than blinking away on the next ordinary message. Never cleared
      // here — a new conversation is how someone leaves it behind.
      ...(meta?.crisisFlagged || detectsCrisis(prompt)
        ? { crisisFlagged: true }
        : {}),
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
  // Incognito persists nothing, so the crisis flag cannot live on threadMeta
  // the way it does for a saved thread. It comes back with the reply instead
  // and the client holds it for the session — the safety net has to reach the
  // people who chose not to be recorded too.
  returns: v.object({ text: v.string(), crisisFlagged: v.boolean() }),
  handler: async (ctx, { messages }) => {
    const userId = await requireUserId(ctx);
    const crisisFlagged = messages.some(
      (m) => m.role === "user" && detectsCrisis(m.text),
    );
    // Personalization applies, memory does not. Incognito means "don't save
    // this", not "pretend you don't know me" — a nickname is a setting the
    // person maintains, while the memory block is derived from exactly the
    // saved conversations they opted out of. See the spec's incognito section.
    // Annotated rather than inferred: this action reads through `internal`,
    // which includes this module, and TypeScript can't unwind that on its own.
    //
    // Typed to what the query actually returns rather than to `PromptInputs`.
    // The wider type would let a `contextBlock` field flow straight into the
    // one place the spec says memory must never reach.
    const personalization: Personalization = await ctx.runQuery(
      internal.users.personalizationForUser,
      { userId },
    );
    const { text } = await dhee.generateText(
      ctx,
      { userId },
      {
        system: buildSystemPrompt(personalization),
        messages: messages.map((m) => ({ role: m.role, content: m.text })),
        // Study mode is a setting, and settings apply in incognito.
        ...replyOptionsFor(personalization.traditions),
      },
      {
        // Persist nothing, and pull in no prior context — a userId is required
        // by the agent, but recentMessages:0 + no search keeps the turn
        // sandboxed to just what the client sent.
        storageOptions: { saveMessages: "none" },
        contextOptions: { recentMessages: 0, searchOptions: { limit: 0 } },
      },
    );
    return { text, crisisFlagged };
  },
});

/**
 * How much prior conversation a reply is built on.
 *
 * The Agent's default is 100 recent messages *including tool traffic* — the
 * doc comment on `excludeToolMessages` claims the opposite, but the component
 * reads `args.excludeToolMessages ? [false] : [true, false]`, so tool messages
 * are in unless you say otherwise. That default is expensive here in a way it
 * isn't for most agents: a study-mode turn can add a dozen steps of raw Hindi
 * corpus passages, and every one of them would be replayed on every later turn
 * for the life of the thread.
 *
 * Dropping them is safe because the corpus never reaches the person through a
 * tool message anyway — study mode already requires the reply itself to name
 * the book and page, so what matters survives in the assistant text.
 */
export const REPLY_CONTEXT_OPTIONS = {
  recentMessages: 20,
  excludeToolMessages: true,
} as const;

/**
 * The per-turn options that depend on who is asking. Split out as a pure
 * function so the step budget and the context window can be asserted directly
 * — the spec asks for this to be checked on the arguments rather than by
 * running the model.
 */
export function replyOptionsFor(traditions: string[] | undefined) {
  return {
    // A study question spends steps before it can answer: find the book,
    // read the page, look up the terms it turns on. Five is the budget for
    // "search, maybe read a page, reply", and it runs out. Everyone else
    // keeps the Agent's default.
    ...(isCorpusLens(traditions) ? { stopWhen: stepCountIs(STUDY_STEPS) } : {}),
  };
}

export const streamReply = internalAction({
  args: {
    threadId: v.string(),
    promptMessageId: v.string(),
    userId: v.id("users"),
  },
  returns: v.null(),
  handler: async (ctx, { threadId, promptMessageId, userId }) => {
    const [contextBlock, personalization] = await Promise.all([
      ctx.runQuery(internal.memory.contextBlockForUser, { userId }),
      ctx.runQuery(internal.users.personalizationForUser, { userId }),
    ]);
    try {
      const result = await dhee.streamText(
        ctx,
        { threadId, userId },
        {
          promptMessageId,
          system: buildSystemPrompt({ contextBlock, ...personalization }),
          ...replyOptionsFor(personalization.traditions),
        },
        {
          saveStreamDeltas: { chunking: "word", throttleMs: 100 },
          contextOptions: REPLY_CONTEXT_OPTIONS,
        },
      );
      await result.consumeStream();
    } finally {
      // In `finally` because a stopped stream makes the consume throw, and a
      // thread stopped on its first turn still needs a name.
      //
      // `titleThread` no-ops once a title exists, so scheduling it every turn
      // spent an action invocation per turn to do this same read and give up.
      // Reading it here keeps the read and drops the scheduler round-trip.
      const { title } = await getThreadMetadata(ctx, components.agent, {
        threadId,
      });
      if (!title?.trim()) {
        await ctx.scheduler.runAfter(0, internal.chat.titleThread, {
          threadId,
        });
      }
    }
    return null;
  },
});

// Aborting cancels the model request itself: the component's stream row leaves
// "streaming", the generating action's next delta write fails, and that aborts
// the `AbortController` whose signal `streamText` handed to the model call.
// Deltas already written are finalized into a real message, so the partial
// reply stays readable.
export const stopGeneration = mutation({
  args: { threadId: v.string() },
  // False when there was nothing in flight — a no-op, not an error.
  returns: v.boolean(),
  handler: async (ctx, { threadId }) => {
    await authorizeThread(ctx, threadId);
    const userId = await requireUserId(ctx);
    const active = await listStreams(ctx, components.agent, {
      threadId,
      includeStatuses: ["streaming"],
    });
    let stopped = false;
    const marked: string[] = [];
    for (const stream of active) {
      const didAbort = await abortStream(ctx, components.agent, {
        streamId: stream.streamId,
        reason: STOP_REASON,
      });
      if (didAbort) {
        marked.push(`${threadId}-${stream.order}-${stream.stepOrder}`);
      }
      stopped = stopped || didAbort;
    }
    // The turn finalizes as `failed` either way, so without this the client
    // can't tell a stop from a model failure and would show an error card on
    // something that worked exactly as asked. Spec §7.
    if (marked.length > 0) {
      const meta = await threadMetaFor(ctx, threadId);
      await upsertThreadMeta(ctx, threadId, userId, {
        stoppedMessages: [...(meta?.stoppedMessages ?? []), ...marked],
      });
    }
    return stopped;
  },
});

// Replaces rather than appends: no "1 of 2 responses" browser, so keeping the
// discarded reply would only leave an unreachable row. Spec §5.
export const regenerate = mutation({
  args: { threadId: v.string() },
  returns: v.null(),
  handler: async (ctx, { threadId }) => {
    await authorizeThread(ctx, threadId);
    const userId = await requireUserId(ctx);

    const turn = await lastUserTurn(ctx, threadId);
    if (!turn || turn.after.length === 0) {
      throw new Error("There's no reply to try again yet.");
    }
    await assertNoActiveReply(ctx, threadId, turn.after);

    await clearMarksFor(ctx, threadId, turn.after);
    await dhee.deleteMessages(ctx, {
      messageIds: turn.after.map((m) => m._id),
    });

    // `turnsSinceExtraction` deliberately untouched: not a new user turn, and
    // counting it would fire memory extraction on a conversation that hasn't moved.
    await ctx.scheduler.runAfter(0, internal.chat.streamReply, {
      threadId,
      promptMessageId: turn.prompt._id,
      userId,
    });
    return null;
  },
});

// Forks the conversation at the edited turn: the replies that followed
// answered a question nobody is asking any more. Spec §6.
export const editAndResend = mutation({
  args: { threadId: v.string(), messageId: v.string(), prompt: v.string() },
  returns: v.null(),
  handler: async (ctx, { threadId, messageId, prompt }) => {
    await authorizeThread(ctx, threadId);
    const userId = await requireUserId(ctx);

    const trimmed = prompt.trim();
    if (!trimmed) throw new Error("A message needs something in it.");

    const [target] = await ctx.runQuery(
      components.agent.messages.getMessagesByIds,
      { messageIds: [messageId] },
    );
    if (!target || target.threadId !== threadId) {
      throw new Error("That message is not in this conversation.");
    }
    // Refused, not just hidden in the UI: memory extraction would later read a
    // rewritten assistant message back as something Dhee said.
    if (target.message?.role !== "user") {
      throw new Error("Only your own messages can be edited.");
    }

    const discarded = await messagesFrom(ctx, threadId, target._id);
    await assertNoActiveReply(ctx, threadId, discarded);

    const marks = await clearMarksFor(ctx, threadId, discarded);
    await dhee.deleteMessages(ctx, { messageIds: discarded.map((m) => m._id) });

    const { messageId: newMessageId, message: saved } = await dhee.saveMessage(
      ctx,
      { threadId, prompt: trimmed, skipEmbeddings: true },
    );

    await upsertThreadMeta(ctx, threadId, userId, {
      editedMessages: [...marks.edited, uiMessageKey(saved)],
    });

    // An edit is a way of writing a message like any other, so the safety net
    // covers it — otherwise rewording through edit slips past the banner.
    // Sticky like sendMessage's: set, never cleared here.
    if (detectsCrisis(trimmed)) {
      await upsertThreadMeta(ctx, threadId, userId, { crisisFlagged: true });
    }

    // No turn bump: this replaces a turn rather than adding one, so counting it
    // would run memory extraction a turn early.
    await ctx.scheduler.runAfter(0, internal.chat.streamReply, {
      threadId,
      promptMessageId: newMessageId,
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
        // corpus tools or answer anything, just label what was said. For the
        // same reason it doesn't need the chat model — labelling is the one
        // job in the pipeline where the cheaper model is plainly enough.
        model: backgroundModel,
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
    const meta = await threadMetaFor(ctx, threadId);
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

// Whether this conversation has raised the support banner. Authorized like
// every other thread read, so one person's flag is never visible to another.
export const threadCrisisFlag = query({
  args: { threadId: v.string() },
  returns: v.boolean(),
  handler: async (ctx, { threadId }) => {
    await authorizeThread(ctx, threadId);
    const meta = await ctx.db
      .query("threadMeta")
      .withIndex("by_thread", (q) => q.eq("threadId", threadId))
      .unique();
    return !!meta?.crisisFlagged;
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

// Both marks on one subscription: the screen needs them at the same moments,
// and each extra query is another socket round-trip per delta.
export const threadMarks = query({
  args: { threadId: v.string() },
  returns: v.object({
    edited: v.array(v.string()),
    stopped: v.array(v.string()),
  }),
  handler: async (ctx, { threadId }) => {
    await authorizeThread(ctx, threadId);
    const meta = await threadMetaFor(ctx, threadId);
    return {
      edited: meta?.editedMessages ?? [],
      stopped: meta?.stoppedMessages ?? [],
    };
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
