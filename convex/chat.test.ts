import { getThreadMetadata } from "@convex-dev/agent";
import { describe, expect, test } from "vitest";
import { api, components } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { MEMORY_EXTRACTION_INTERVAL_TURNS } from "./config";
import { REPLY_CONTEXT_OPTIONS, replyOptionsFor } from "./chat";
import {
  asUser,
  createUser,
  initTest,
  seedExchange,
  threadMessages,
} from "./test.setup";

// Characterization tests for convex/chat.ts — they capture what the code does
// today so later changes to the chat spine are safe. They deliberately avoid the
// LLM: `streamReply`/`titleThread` are only *scheduled* by `sendMessage`, never
// run here, so nothing reaches the model. See
// docs/build/specs/chat-backend-characterization.md.

// Names of functions currently sitting on the scheduler queue (not yet run).
async function scheduledNames(
  t: ReturnType<typeof initTest>,
): Promise<string[]> {
  return await t.run(async (ctx) => {
    const fns = await ctx.db.system.query("_scheduled_functions").collect();
    return fns.map((f) => f.name);
  });
}

// Extraction jobs on the queue, with their timing and state — the idle flush
// is distinguished from the counter's run only by `scheduledTime`, and a
// cancelled job by its `state`.
async function scheduledExtractions(t: ReturnType<typeof initTest>) {
  return await t.run(async (ctx) => {
    const fns = await ctx.db.system.query("_scheduled_functions").collect();
    return fns.filter((f) => f.name.includes("runExtraction"));
  });
}

// Extraction jobs still due to run. A cancelled job stays on the queue with a
// "canceled" state, so filtering on `pending` is what tells the two apart.
async function livePendingExtractions(t: ReturnType<typeof initTest>) {
  return (await scheduledExtractions(t)).filter(
    (f) => f.state.kind === "pending",
  );
}

async function turnCount(
  t: ReturnType<typeof initTest>,
  threadId: string,
): Promise<number> {
  return await t.run(async (ctx) => {
    const meta = await ctx.db
      .query("threadMeta")
      .withIndex("by_thread", (q) => q.eq("threadId", threadId))
      .unique();
    return meta?.turnsSinceExtraction ?? 0;
  });
}
describe("chat — auth & authorization", () => {
  test("sendMessage throws when unauthenticated", async () => {
    const t = initTest();
    await expect(
      t.mutation(api.chat.sendMessage, { threadId: "x", prompt: "hi" }),
    ).rejects.toThrow("Not signed in");
  });

  test("sendMessage rejects a thread the caller does not own", async () => {
    const t = initTest();
    const owner = await createUser(t);
    const other = await createUser(t);
    const threadId = await asUser(t, owner).mutation(api.chat.startThread, {});
    await expect(
      asUser(t, other).mutation(api.chat.sendMessage, {
        threadId,
        prompt: "hi",
      }),
    ).rejects.toThrow("Not your conversation");
  });
});

describe("chat — sendMessage bookkeeping", () => {
  test("the first turn schedules a reply now and an extraction later", async () => {
    const t = initTest();
    const user = await createUser(t);
    const threadId = await asUser(t, user).mutation(api.chat.startThread, {});

    await asUser(t, user).mutation(api.chat.sendMessage, {
      threadId,
      prompt: "hi",
    });

    const names = await scheduledNames(t);
    expect(names.some((n) => n.includes("streamReply"))).toBe(true);
    // The point of the idle flush: a conversation this short used to leave no
    // trace at all, because the turn counter never reached the interval.
    const extractions = await scheduledExtractions(t);
    expect(extractions).toHaveLength(1);
    expect(extractions[0].scheduledTime).toBeGreaterThan(Date.now());
  });

  test("extraction also fires immediately once the turn counter crosses the interval", async () => {
    const t = initTest();
    const user = await createUser(t);
    const threadId = await asUser(t, user).mutation(api.chat.startThread, {});
    // Seed one below the threshold so the next turn crosses it.
    await t.run(async (ctx) => {
      await ctx.db.insert("threadMeta", {
        userId: user,
        threadId,
        turnsSinceExtraction: MEMORY_EXTRACTION_INTERVAL_TURNS - 1,
      });
    });

    await asUser(t, user).mutation(api.chat.sendMessage, {
      threadId,
      prompt: "hi",
    });

    // Two: the debounced idle flush, and the counter's immediate run.
    const extractions = await scheduledExtractions(t);
    expect(extractions).toHaveLength(2);
    expect(extractions.some((f) => f.scheduledTime <= Date.now())).toBe(true);
  });

  test("crossing the interval resets the counter immediately, not when the run lands", async () => {
    const t = initTest();
    const user = await createUser(t);
    const as = asUser(t, user);
    const threadId = await as.mutation(api.chat.startThread, {});

    for (let i = 0; i < MEMORY_EXTRACTION_INTERVAL_TURNS; i++) {
      await as.mutation(api.chat.sendMessage, { threadId, prompt: `t${i}` });
    }
    expect(await turnCount(t, threadId)).toBe(0);

    // Extraction is a workflow that takes seconds to land. Without the reset
    // above, every turn from here on would still be over the threshold and
    // would start another run.
    await as.mutation(api.chat.sendMessage, { threadId, prompt: "next" });
    expect(await turnCount(t, threadId)).toBe(1);
    expect(
      (await scheduledExtractions(t)).filter(
        (f) => f.scheduledTime <= Date.now(),
      ),
    ).toHaveLength(1);
  });

  test("each turn replaces the pending idle flush instead of stacking one up", async () => {
    const t = initTest();
    const user = await createUser(t);
    const as = asUser(t, user);
    const threadId = await as.mutation(api.chat.startThread, {});

    for (const prompt of ["one", "two", "three"]) {
      await as.mutation(api.chat.sendMessage, { threadId, prompt });
    }

    // Three turns at an interval of 2 means one counter run (on turn 2) plus
    // exactly one live idle flush — the first two were cancelled, not queued.
    const pending = (await scheduledExtractions(t)).filter(
      (f) => f.state.kind === "pending",
    );
    expect(pending.filter((f) => f.scheduledTime > Date.now())).toHaveLength(1);
  });
});

describe("chat — star / pin flags", () => {
  test("setStarred and setPinned surface through threadFlags", async () => {
    const t = initTest();
    const user = await createUser(t);
    const as = asUser(t, user);
    const threadId = await as.mutation(api.chat.startThread, {});

    await as.mutation(api.chat.setStarred, { threadId, starred: true });
    expect(await as.query(api.chat.threadFlags, {})).toEqual([
      { threadId, starred: true, pinned: false },
    ]);

    await as.mutation(api.chat.setPinned, { threadId, pinned: true });
    expect(await as.query(api.chat.threadFlags, {})).toEqual([
      { threadId, starred: true, pinned: true },
    ]);
  });

  test("threadFlags is scoped to the caller", async () => {
    const t = initTest();
    const a = await createUser(t);
    const b = await createUser(t);
    const threadA = await asUser(t, a).mutation(api.chat.startThread, {});
    await asUser(t, a).mutation(api.chat.setStarred, {
      threadId: threadA,
      starred: true,
    });
    expect(await asUser(t, b).query(api.chat.threadFlags, {})).toEqual([]);
  });
});

describe("chat — threadInfo", () => {
  test("reports the conversation's name and flags, null until it is named", async () => {
    const t = initTest();
    const user = await createUser(t);
    const as = asUser(t, user);
    const threadId = await as.mutation(api.chat.startThread, {});

    expect(await as.query(api.chat.threadInfo, { threadId })).toEqual({
      title: null,
      starred: false,
      pinned: false,
    });

    await as.mutation(api.chat.renameThread, { threadId, title: "Grief" });
    await as.mutation(api.chat.setStarred, { threadId, starred: true });
    expect(await as.query(api.chat.threadInfo, { threadId })).toEqual({
      title: "Grief",
      starred: true,
      pinned: false,
    });
  });

  test("another person's conversation is not readable", async () => {
    const t = initTest();
    const a = await createUser(t);
    const b = await createUser(t);
    const threadId = await asUser(t, a).mutation(api.chat.startThread, {});

    await expect(
      asUser(t, b).query(api.chat.threadInfo, { threadId }),
    ).rejects.toThrow("Not your conversation");
  });
});

describe("chat — rename", () => {
  test("empty title is rejected; a valid title is trimmed and stored", async () => {
    const t = initTest();
    const user = await createUser(t);
    const as = asUser(t, user);
    const threadId = await as.mutation(api.chat.startThread, {});

    await expect(
      as.mutation(api.chat.renameThread, { threadId, title: "   " }),
    ).rejects.toThrow("needs a name");

    await as.mutation(api.chat.renameThread, { threadId, title: "  Grief  " });
    const meta = await t.run((ctx) =>
      getThreadMetadata(ctx, components.agent, { threadId }),
    );
    expect(meta.title).toBe("Grief");
  });
});

describe("chat — delete", () => {
  test("deleteAllThreads removes only the caller's threads and flags", async () => {
    const t = initTest();
    const a = await createUser(t);
    const b = await createUser(t);

    const threadA = await asUser(t, a).mutation(api.chat.startThread, {});
    await asUser(t, a).mutation(api.chat.setStarred, {
      threadId: threadA,
      starred: true,
    });
    const threadB = await asUser(t, b).mutation(api.chat.startThread, {});
    await asUser(t, b).mutation(api.chat.setStarred, {
      threadId: threadB,
      starred: true,
    });

    const removed = await asUser(t, a).mutation(api.chat.deleteAllThreads, {});
    expect(removed).toBe(1);
    expect(await asUser(t, a).query(api.chat.threadFlags, {})).toEqual([]);
    expect(await asUser(t, b).query(api.chat.threadFlags, {})).toEqual([
      { threadId: threadB, starred: true, pinned: false },
    ]);
  });

  test("deleting a thread cancels its queued extraction, and leaves other threads' alone", async () => {
    const t = initTest();
    const user = await createUser(t);
    const as = asUser(t, user);
    const doomed = await as.mutation(api.chat.startThread, {});
    const kept = await as.mutation(api.chat.startThread, {});
    await as.mutation(api.chat.sendMessage, {
      threadId: doomed,
      prompt: "something I'd rather you forgot",
    });
    await as.mutation(api.chat.sendMessage, {
      threadId: kept,
      prompt: "something I don't mind you keeping",
    });
    expect(await livePendingExtractions(t)).toHaveLength(2);

    await as.mutation(api.chat.deleteThread, { threadId: doomed });

    // `deleteThreadAsync` pages messages out in the background, so a surviving
    // flush could wake mid-deletion and extract memories from the very
    // conversation the person asked us to forget.
    expect(await livePendingExtractions(t)).toHaveLength(1);
  });
});

describe("chat — stop generating", () => {
  // The row `streamReply` would have created — built directly so the real
  // abort path runs without the model.
  async function startStream(
    t: ReturnType<typeof initTest>,
    threadId: string,
  ): Promise<string> {
    return await t.run(
      async (ctx) =>
        await ctx.runMutation(components.agent.streams.create, {
          threadId,
          order: 1,
          stepOrder: 0,
          format: "UIMessageChunk",
        }),
    );
  }

  async function streamStatuses(
    t: ReturnType<typeof initTest>,
    threadId: string,
  ): Promise<string[]> {
    const streams = await t.run(
      async (ctx) =>
        await ctx.runQuery(components.agent.streams.list, {
          threadId,
          statuses: ["streaming", "finished", "aborted"],
        }),
    );
    return streams.map((s: { status: string }) => s.status);
  }

  test("aborts the thread's active stream", async () => {
    const t = initTest();
    const user = await createUser(t);
    const as = asUser(t, user);
    const threadId = await as.mutation(api.chat.startThread, {});
    await startStream(t, threadId);

    expect(await streamStatuses(t, threadId)).toEqual(["streaming"]);
    expect(await as.mutation(api.chat.stopGeneration, { threadId })).toBe(true);
    expect(await streamStatuses(t, threadId)).toEqual(["aborted"]);
  });

  test("stopping with nothing in flight is a no-op, not an error", async () => {
    const t = initTest();
    const user = await createUser(t);
    const as = asUser(t, user);
    const threadId = await as.mutation(api.chat.startThread, {});

    expect(await as.mutation(api.chat.stopGeneration, { threadId })).toBe(
      false,
    );
  });

  test("rejects a thread the caller does not own", async () => {
    const t = initTest();
    const owner = await createUser(t);
    const other = await createUser(t);
    const threadId = await asUser(t, owner).mutation(api.chat.startThread, {});
    await startStream(t, threadId);

    await expect(
      asUser(t, other).mutation(api.chat.stopGeneration, { threadId }),
    ).rejects.toThrow("Not your conversation");
    expect(await streamStatuses(t, threadId)).toEqual(["streaming"]);
  });

  test("the thread still reads and accepts a new message afterwards", async () => {
    const t = initTest();
    const user = await createUser(t);
    const as = asUser(t, user);
    const threadId = await as.mutation(api.chat.startThread, {});
    await as.mutation(api.chat.sendMessage, { threadId, prompt: "hello" });
    await startStream(t, threadId);
    await as.mutation(api.chat.stopGeneration, { threadId });

    const before = await as.query(api.chat.listThreadMessages, {
      threadId,
      paginationOpts: { cursor: null, numItems: 20 },
      streamArgs: undefined,
    });
    expect(before.page.map((m) => m.text)).toContain("hello");

    await as.mutation(api.chat.sendMessage, {
      threadId,
      prompt: "still here?",
    });
    const after = await as.query(api.chat.listThreadMessages, {
      threadId,
      paginationOpts: { cursor: null, numItems: 20 },
      streamArgs: undefined,
    });
    expect(after.page.map((m) => m.text)).toContain("still here?");
  });

  // A stopped turn and a turn the model failed both finalize as `failed`.
  // These marks are the only thing that tells them apart, and the client shows
  // an error card on one and nothing at all on the other. Spec §7 / #59 / #60.
  test("records the stopped reply's position", async () => {
    const t = initTest();
    const user = await createUser(t);
    const as = asUser(t, user);
    const threadId = await as.mutation(api.chat.startThread, {});
    await startStream(t, threadId);

    expect(
      (await as.query(api.chat.threadMarks, { threadId })).stopped,
    ).toEqual([]);
    await as.mutation(api.chat.stopGeneration, { threadId });

    // `startStream` builds the row at order 1, stepOrder 0.
    expect(
      (await as.query(api.chat.threadMarks, { threadId })).stopped,
    ).toEqual([`${threadId}-1-0`]);
  });

  test("stopping with nothing in flight marks nothing", async () => {
    const t = initTest();
    const user = await createUser(t);
    const as = asUser(t, user);
    const threadId = await as.mutation(api.chat.startThread, {});

    await as.mutation(api.chat.stopGeneration, { threadId });

    expect(
      (await as.query(api.chat.threadMarks, { threadId })).stopped,
    ).toEqual([]);
  });

  test("the mark goes when regenerate discards the stopped reply", async () => {
    const t = initTest();
    const user = await createUser(t);
    const as = asUser(t, user);
    const threadId = await as.mutation(api.chat.startThread, {});
    await as.mutation(api.chat.sendMessage, { threadId, prompt: "hello" });
    // The stopped reply lands at the position `startStream` used.
    await t.run(async (ctx) => {
      await ctx.runMutation(components.agent.messages.addMessages, {
        threadId,
        userId: user,
        agentName: "Dhee",
        messages: [
          {
            message: { role: "assistant", content: "half a thou" },
            status: "success",
          },
        ],
      });
    });
    const reply = await t.run(async (ctx) => {
      const { page } = await ctx.runQuery(
        components.agent.messages.listMessagesByThreadId,
        {
          threadId,
          order: "desc",
          paginationOpts: { cursor: null, numItems: 1 },
        },
      );
      return page[0];
    });
    // Stopped through the real path, at the position that reply occupies.
    await t.run(async (ctx) => {
      await ctx.runMutation(components.agent.streams.create, {
        threadId,
        order: reply.order,
        stepOrder: reply.stepOrder,
        format: "UIMessageChunk",
      });
    });
    await as.mutation(api.chat.stopGeneration, { threadId });
    expect(
      (await as.query(api.chat.threadMarks, { threadId })).stopped,
    ).toEqual([`${threadId}-${reply.order}-${reply.stepOrder}`]);

    await as.mutation(api.chat.regenerate, { threadId });

    // The new reply reuses that position: a mark left behind would read as a
    // stop the person never made, and swallow a real failure's error card.
    expect(
      (await as.query(api.chat.threadMarks, { threadId })).stopped,
    ).toEqual([]);
  });
});

describe("chat — regenerate", () => {
  // The transcript as plain text, oldest first.
  async function transcript(
    t: ReturnType<typeof initTest>,
    threadId: string,
  ): Promise<string[]> {
    return (await threadMessages(t, threadId)).map((m) => m.text ?? "");
  }

  test("drops exactly the last reply and schedules one new one", async () => {
    const t = initTest();
    const user = await createUser(t);
    const as = asUser(t, user);
    const threadId = await as.mutation(api.chat.startThread, {});
    await seedExchange(t, user, threadId, "hello", "first answer");

    await as.mutation(api.chat.regenerate, { threadId });

    expect(await transcript(t, threadId)).toEqual(["hello"]);
    const streamReplies = (await scheduledNames(t)).filter((n) =>
      n.includes("streamReply"),
    );
    expect(streamReplies).toHaveLength(2);
  });

  test("does not count as a user turn", async () => {
    const t = initTest();
    const user = await createUser(t);
    const as = asUser(t, user);
    const threadId = await as.mutation(api.chat.startThread, {});
    await seedExchange(t, user, threadId, "hello", "first answer");

    const before = await turnCount(t, threadId);
    await as.mutation(api.chat.regenerate, { threadId });
    expect(await turnCount(t, threadId)).toBe(before);
  });

  test("feedback on the discarded reply is cleared", async () => {
    const t = initTest();
    const user = await createUser(t);
    const as = asUser(t, user);
    const threadId = await as.mutation(api.chat.startThread, {});
    await seedExchange(t, user, threadId, "hello", "first answer");

    // Rate it the way the client does — by UIMessage key.
    const { page } = await t.run(
      async (ctx) =>
        await ctx.runQuery(components.agent.messages.listMessagesByThreadId, {
          threadId,
          order: "desc",
          paginationOpts: { cursor: null, numItems: 10 },
        }),
    );
    const reply = page[0];
    await as.mutation(api.chat.setMessageFeedback, {
      threadId,
      messageId: `${threadId}-${reply.order}-${reply.stepOrder}`,
      rating: "down",
    });
    expect(await as.query(api.chat.threadFeedback, { threadId })).toHaveLength(
      1,
    );

    await as.mutation(api.chat.regenerate, { threadId });

    expect(await as.query(api.chat.threadFeedback, { threadId })).toEqual([]);
  });

  test("throws when there is no reply to replace", async () => {
    const t = initTest();
    const user = await createUser(t);
    const as = asUser(t, user);
    const threadId = await as.mutation(api.chat.startThread, {});
    await as.mutation(api.chat.sendMessage, { threadId, prompt: "hello" });

    await expect(
      as.mutation(api.chat.regenerate, { threadId }),
    ).rejects.toThrow("no reply to try again");
  });

  test("refuses while a reply is still streaming", async () => {
    const t = initTest();
    const user = await createUser(t);
    const as = asUser(t, user);
    const threadId = await as.mutation(api.chat.startThread, {});
    await seedExchange(t, user, threadId, "hello", "first answer");
    await t.run(async (ctx) => {
      await ctx.runMutation(components.agent.streams.create, {
        threadId,
        order: 2,
        stepOrder: 0,
        format: "UIMessageChunk",
      });
    });

    await expect(
      as.mutation(api.chat.regenerate, { threadId }),
    ).rejects.toThrow("still replying");
  });

  test("rejects a thread the caller does not own", async () => {
    const t = initTest();
    const owner = await createUser(t);
    const other = await createUser(t);
    const threadId = await asUser(t, owner).mutation(api.chat.startThread, {});
    await seedExchange(t, owner, threadId, "hello", "first answer");

    await expect(
      asUser(t, other).mutation(api.chat.regenerate, { threadId }),
    ).rejects.toThrow("Not your conversation");
  });
});

describe("chat — edit & resend", () => {
  test("editing the first of three turns drops everything after it", async () => {
    const t = initTest();
    const user = await createUser(t);
    const as = asUser(t, user);
    const threadId = await as.mutation(api.chat.startThread, {});
    await seedExchange(t, user, threadId, "first", "reply one");
    await seedExchange(t, user, threadId, "second", "reply two");
    await seedExchange(t, user, threadId, "third", "reply three");

    const first = (await threadMessages(t, threadId))[0];
    await as.mutation(api.chat.editAndResend, {
      threadId,
      messageId: first._id,
      prompt: "first, rewritten",
    });

    // The fork keeps nothing after the edit point, and the new prompt is the
    // only thing left.
    expect((await threadMessages(t, threadId)).map((m) => m.text)).toEqual([
      "first, rewritten",
    ]);
    const streamReplies = (await scheduledNames(t)).filter((n) =>
      n.includes("streamReply"),
    );
    // Three from the original sends, one from the edit.
    expect(streamReplies).toHaveLength(4);
  });

  test("editing an assistant message is refused", async () => {
    const t = initTest();
    const user = await createUser(t);
    const as = asUser(t, user);
    const threadId = await as.mutation(api.chat.startThread, {});
    await seedExchange(t, user, threadId, "hello", "an answer");

    const reply = (await threadMessages(t, threadId))[1];
    await expect(
      as.mutation(api.chat.editAndResend, {
        threadId,
        messageId: reply._id,
        prompt: "words I did not say",
      }),
    ).rejects.toThrow("Only your own messages");
  });

  test("an empty edit is refused", async () => {
    const t = initTest();
    const user = await createUser(t);
    const as = asUser(t, user);
    const threadId = await as.mutation(api.chat.startThread, {});
    await seedExchange(t, user, threadId, "hello", "an answer");

    const first = (await threadMessages(t, threadId))[0];
    await expect(
      as.mutation(api.chat.editAndResend, {
        threadId,
        messageId: first._id,
        prompt: "   ",
      }),
    ).rejects.toThrow("needs something in it");
  });

  test("editing in someone else's thread is refused", async () => {
    const t = initTest();
    const owner = await createUser(t);
    const other = await createUser(t);
    const threadId = await asUser(t, owner).mutation(api.chat.startThread, {});
    await seedExchange(t, owner, threadId, "hello", "an answer");

    const first = (await threadMessages(t, threadId))[0];
    await expect(
      asUser(t, other).mutation(api.chat.editAndResend, {
        threadId,
        messageId: first._id,
        prompt: "not mine to edit",
      }),
    ).rejects.toThrow("Not your conversation");
  });

  test("a message id from another thread is refused", async () => {
    const t = initTest();
    const user = await createUser(t);
    const as = asUser(t, user);
    const mine = await as.mutation(api.chat.startThread, {});
    const other = await as.mutation(api.chat.startThread, {});
    await seedExchange(t, user, mine, "hello", "an answer");
    await seedExchange(t, user, other, "elsewhere", "another answer");

    const elsewhere = (await threadMessages(t, other))[0];
    await expect(
      as.mutation(api.chat.editAndResend, {
        threadId: mine,
        messageId: elsewhere._id,
        prompt: "reaching across",
      }),
    ).rejects.toThrow("not in this conversation");
  });

  test("the turn counter does not double-count the replaced turn", async () => {
    const t = initTest();
    const user = await createUser(t);
    const as = asUser(t, user);
    const threadId = await as.mutation(api.chat.startThread, {});
    await seedExchange(t, user, threadId, "first", "reply one");
    await seedExchange(t, user, threadId, "second", "reply two");

    const before = await turnCount(t, threadId);
    const first = (await threadMessages(t, threadId))[0];
    await as.mutation(api.chat.editAndResend, {
      threadId,
      messageId: first._id,
      prompt: "first, rewritten",
    });
    // The edited turn replaces a turn rather than adding one.
    expect(await turnCount(t, threadId)).toBe(before);
  });

  test("feedback on the dropped replies is cleaned up", async () => {
    const t = initTest();
    const user = await createUser(t);
    const as = asUser(t, user);
    const threadId = await as.mutation(api.chat.startThread, {});
    await seedExchange(t, user, threadId, "first", "reply one");
    await seedExchange(t, user, threadId, "second", "reply two");

    const all = await t.run(
      async (ctx) =>
        (
          await ctx.runQuery(components.agent.messages.listMessagesByThreadId, {
            threadId,
            order: "asc",
            paginationOpts: { cursor: null, numItems: 50 },
          })
        ).page,
    );
    for (const doc of all.filter(
      (m: { message?: { role: string } }) => m.message?.role === "assistant",
    )) {
      await as.mutation(api.chat.setMessageFeedback, {
        threadId,
        messageId: `${threadId}-${doc.order}-${doc.stepOrder}`,
        rating: "up",
      });
    }
    expect(await as.query(api.chat.threadFeedback, { threadId })).toHaveLength(
      2,
    );

    await as.mutation(api.chat.editAndResend, {
      threadId,
      messageId: all[0]._id,
      prompt: "first, rewritten",
    });

    // Nothing may survive: the replies after an edit reuse the same positions,
    // so a stale row would rate a message nobody rated.
    expect(await as.query(api.chat.threadFeedback, { threadId })).toEqual([]);
  });

  test("refuses while a reply is streaming", async () => {
    const t = initTest();
    const user = await createUser(t);
    const as = asUser(t, user);
    const threadId = await as.mutation(api.chat.startThread, {});
    await seedExchange(t, user, threadId, "hello", "an answer");
    await t.run(async (ctx) => {
      await ctx.runMutation(components.agent.streams.create, {
        threadId,
        order: 2,
        stepOrder: 0,
        format: "UIMessageChunk",
      });
    });

    // Editing mid-stream would delete the pending reply out from under the
    // running action — same guard regenerate already has.
    const first = (await threadMessages(t, threadId))[0];
    await expect(
      as.mutation(api.chat.editAndResend, {
        threadId,
        messageId: first._id,
        prompt: "changed my mind",
      }),
    ).rejects.toThrow("still replying");
    // And nothing was deleted.
    expect((await threadMessages(t, threadId)).map((m) => m.text)).toEqual([
      "hello",
      "an answer",
    ]);
  });

  test("refuses while a reply is scheduled but not yet streaming", async () => {
    const t = initTest();
    const user = await createUser(t);
    const as = asUser(t, user);
    const threadId = await as.mutation(api.chat.startThread, {});
    await seedExchange(t, user, threadId, "hello", "an answer");
    // A pending row is what a scheduled-but-not-started reply looks like.
    await t.run(async (ctx) => {
      await ctx.runMutation(components.agent.messages.addMessages, {
        threadId,
        userId: user,
        agentName: "Dhee",
        messages: [
          { message: { role: "assistant", content: "" }, status: "pending" },
        ],
      });
    });

    const first = (await threadMessages(t, threadId))[0];
    await expect(
      as.mutation(api.chat.editAndResend, {
        threadId,
        messageId: first._id,
        prompt: "changed my mind",
      }),
    ).rejects.toThrow("still replying");
  });

  test("the rewritten message is marked edited, at its own position", async () => {
    const t = initTest();
    const user = await createUser(t);
    const as = asUser(t, user);
    const threadId = await as.mutation(api.chat.startThread, {});
    await seedExchange(t, user, threadId, "first", "reply one");

    expect((await as.query(api.chat.threadMarks, { threadId })).edited).toEqual(
      [],
    );

    const first = (await threadMessages(t, threadId))[0];
    await as.mutation(api.chat.editAndResend, {
      threadId,
      messageId: first._id,
      prompt: "first, rewritten",
    });

    // The key the client renders by, so the label lands on the right bubble.
    const rewritten = (await threadMessages(t, threadId))[0];
    expect((await as.query(api.chat.threadMarks, { threadId })).edited).toEqual(
      [`${threadId}-${rewritten.order}-${rewritten.stepOrder}`],
    );
  });

  test("the mark goes when a later edit discards the message wearing it", async () => {
    const t = initTest();
    const user = await createUser(t);
    const as = asUser(t, user);
    const threadId = await as.mutation(api.chat.startThread, {});
    await seedExchange(t, user, threadId, "first", "reply one");
    await seedExchange(t, user, threadId, "second", "reply two");

    // Edit the second turn, then edit the first — which discards the second.
    const before = await threadMessages(t, threadId);
    await as.mutation(api.chat.editAndResend, {
      threadId,
      messageId: before[2]._id,
      prompt: "second, rewritten",
    });
    expect(
      (await as.query(api.chat.threadMarks, { threadId })).edited,
    ).toHaveLength(1);

    await as.mutation(api.chat.editAndResend, {
      threadId,
      messageId: before[0]._id,
      prompt: "first, rewritten",
    });

    // Only the first turn is marked now. Positions are reused, so a mark left
    // behind would label a message nobody edited.
    const rewritten = (await threadMessages(t, threadId))[0];
    expect((await as.query(api.chat.threadMarks, { threadId })).edited).toEqual(
      [`${threadId}-${rewritten.order}-${rewritten.stepOrder}`],
    );
  });

  test("regenerate marks nothing", async () => {
    const t = initTest();
    const user = await createUser(t);
    const as = asUser(t, user);
    const threadId = await as.mutation(api.chat.startThread, {});
    await seedExchange(t, user, threadId, "first", "reply one");

    await as.mutation(api.chat.regenerate, { threadId });

    expect((await as.query(api.chat.threadMarks, { threadId })).edited).toEqual(
      [],
    );
  });
});

describe("chat — crisis flag", () => {
  test("an ordinary message does not raise it", async () => {
    const t = initTest();
    const user = await createUser(t);
    const as = asUser(t, user);
    const threadId = await as.mutation(api.chat.startThread, {});

    await as.mutation(api.chat.sendMessage, {
      threadId,
      prompt: "I'm trying to decide whether to change jobs",
    });
    expect(await as.query(api.chat.threadCrisisFlag, { threadId })).toBe(false);
  });

  test("a crisis phrase raises it", async () => {
    const t = initTest();
    const user = await createUser(t);
    const as = asUser(t, user);
    const threadId = await as.mutation(api.chat.startThread, {});

    await as.mutation(api.chat.sendMessage, {
      threadId,
      prompt: "some days I just want to die",
    });
    expect(await as.query(api.chat.threadCrisisFlag, { threadId })).toBe(true);
  });

  test("Hindi phrasing raises it too", async () => {
    const t = initTest();
    const user = await createUser(t);
    const as = asUser(t, user);
    const threadId = await as.mutation(api.chat.startThread, {});

    await as.mutation(api.chat.sendMessage, {
      threadId,
      prompt: "मैं आत्महत्या के बारे में सोच रहा हूँ",
    });
    expect(await as.query(api.chat.threadCrisisFlag, { threadId })).toBe(true);
  });

  test("stays raised for the rest of the conversation", async () => {
    const t = initTest();
    const user = await createUser(t);
    const as = asUser(t, user);
    const threadId = await as.mutation(api.chat.startThread, {});

    await as.mutation(api.chat.sendMessage, {
      threadId,
      prompt: "I want to die",
    });
    // An ordinary message afterwards must not make the banner blink away.
    await as.mutation(api.chat.sendMessage, {
      threadId,
      prompt: "anyway, about work",
    });
    expect(await as.query(api.chat.threadCrisisFlag, { threadId })).toBe(true);
  });

  test("is per-thread, and never leaks to another person", async () => {
    const t = initTest();
    const a = await createUser(t);
    const b = await createUser(t);
    const flagged = await asUser(t, a).mutation(api.chat.startThread, {});
    const calm = await asUser(t, a).mutation(api.chat.startThread, {});
    await asUser(t, a).mutation(api.chat.sendMessage, {
      threadId: flagged,
      prompt: "I want to die",
    });

    // A different conversation of their own starts clear.
    expect(
      await asUser(t, a).query(api.chat.threadCrisisFlag, { threadId: calm }),
    ).toBe(false);
    // And nobody else can read it at all.
    await expect(
      asUser(t, b).query(api.chat.threadCrisisFlag, { threadId: flagged }),
    ).rejects.toThrow("Not your conversation");
  });

  test("an edited message can raise it too", async () => {
    const t = initTest();
    const user = await createUser(t);
    const as = asUser(t, user);
    const threadId = await as.mutation(api.chat.startThread, {});

    await as.mutation(api.chat.sendMessage, {
      threadId,
      prompt: "thinking about work",
    });
    expect(await as.query(api.chat.threadCrisisFlag, { threadId })).toBe(false);

    // Edit is a way of writing a message like any other — the safety net has
    // to cover it, or rewording through edit slips past the banner.
    const { page } = await t.run(
      async (ctx) =>
        await ctx.runQuery(components.agent.messages.listMessagesByThreadId, {
          threadId,
          order: "asc",
          paginationOpts: { cursor: null, numItems: 10 },
        }),
    );
    await as.mutation(api.chat.editAndResend, {
      threadId,
      messageId: page[0]._id,
      prompt: "some days I want to die",
    });
    expect(await as.query(api.chat.threadCrisisFlag, { threadId })).toBe(true);
  });
});

describe("chat — message feedback", () => {
  test("feedback round-trips and clears with a null rating", async () => {
    const t = initTest();
    const user = await createUser(t);
    const as = asUser(t, user);
    const threadId = await as.mutation(api.chat.startThread, {});

    await as.mutation(api.chat.setMessageFeedback, {
      threadId,
      messageId: "m1",
      rating: "up",
    });
    expect(await as.query(api.chat.threadFeedback, { threadId })).toEqual([
      { messageId: "m1", rating: "up" },
    ]);

    await as.mutation(api.chat.setMessageFeedback, {
      threadId,
      messageId: "m1",
      rating: null,
    });
    expect(await as.query(api.chat.threadFeedback, { threadId })).toEqual([]);
  });
});

describe("chat — per-turn model options", () => {
  // Spec test 12 (docs/build/specs/personalization.md): assert on the
  // arguments, not by running the model. `replyOptionsFor` exists so this can
  // be checked directly rather than inferred from a scheduled function.
  test("the raised step budget is reserved for the corpus lens", () => {
    expect(replyOptionsFor(["Madhyasth Darshan"])).toHaveProperty("stopWhen");
    expect(replyOptionsFor(["मध्यस्थ दर्शन"])).toHaveProperty("stopWhen");
  });

  test("a framing lens does not raise the step budget", () => {
    // Decision 2 must not leak into the other 24 traditions.
    expect(replyOptionsFor(["Stoicism"])).not.toHaveProperty("stopWhen");
    expect(replyOptionsFor([])).not.toHaveProperty("stopWhen");
    expect(replyOptionsFor(undefined)).not.toHaveProperty("stopWhen");
  });

  test("replies are built on a bounded window that excludes tool traffic", () => {
    // The Agent default is 100 messages *including* tool results, which would
    // replay raw corpus passages on every later turn of the thread.
    expect(REPLY_CONTEXT_OPTIONS.excludeToolMessages).toBe(true);
    expect(REPLY_CONTEXT_OPTIONS.recentMessages).toBeLessThanOrEqual(20);
  });
});
