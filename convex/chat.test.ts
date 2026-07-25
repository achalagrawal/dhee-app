import { getThreadMetadata } from "@convex-dev/agent";
import { describe, expect, test } from "vitest";
import { api, components } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { MEMORY_EXTRACTION_INTERVAL_TURNS } from "./config";
import { asUser, createUser, initTest } from "./test.setup";

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

// The extraction turn counter Dhee keeps alongside the agent's thread.
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
  test("first turn schedules the reply but not extraction", async () => {
    const t = initTest();
    const user = await createUser(t);
    const threadId = await asUser(t, user).mutation(api.chat.startThread, {});

    await asUser(t, user).mutation(api.chat.sendMessage, {
      threadId,
      prompt: "hi",
    });

    const names = await scheduledNames(t);
    expect(names.some((n) => n.includes("streamReply"))).toBe(true);
    expect(names.some((n) => n.includes("runExtraction"))).toBe(false);
  });

  test("extraction fires only once the turn counter crosses the interval", async () => {
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

    const names = await scheduledNames(t);
    expect(names.some((n) => n.includes("runExtraction"))).toBe(true);
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
});

describe("chat — stop generating", () => {
  // Stand in for a reply in flight: the component row `streamReply` would have
  // created. Building it directly keeps the model out of the test while still
  // exercising the real abort path.
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

    // Races the stream finishing on its own — losing that race is not a failure.
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
    // And the stream is untouched.
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
});

describe("chat — regenerate", () => {
  // A completed exchange, without the model: `sendMessage` writes the user
  // turn, and the assistant reply is written straight into the component the
  // way a finished `streamReply` would have left it.
  async function exchange(
    t: ReturnType<typeof initTest>,
    userId: Id<"users">,
    threadId: string,
    prompt: string,
    reply: string,
  ): Promise<void> {
    await asUser(t, userId).mutation(api.chat.sendMessage, {
      threadId,
      prompt,
    });
    await t.run(async (ctx) => {
      await ctx.runMutation(components.agent.messages.addMessages, {
        threadId,
        userId,
        agentName: "Dhee",
        messages: [
          {
            message: { role: "assistant", content: reply },
            status: "success",
          },
        ],
      });
    });
  }

  async function transcript(
    t: ReturnType<typeof initTest>,
    threadId: string,
  ): Promise<string[]> {
    const { page } = await t.run(
      async (ctx) =>
        await ctx.runQuery(components.agent.messages.listMessagesByThreadId, {
          threadId,
          order: "asc",
          paginationOpts: { cursor: null, numItems: 50 },
        }),
    );
    return page.map((m: { text?: string }) => m.text ?? "");
  }

  test("drops exactly the last reply and schedules one new one", async () => {
    const t = initTest();
    const user = await createUser(t);
    const as = asUser(t, user);
    const threadId = await as.mutation(api.chat.startThread, {});
    await exchange(t, user, threadId, "hello", "first answer");

    await as.mutation(api.chat.regenerate, { threadId });

    // The prompt stays, the reply is gone.
    expect(await transcript(t, threadId)).toEqual(["hello"]);
    const streamReplies = (await scheduledNames(t)).filter((n) =>
      n.includes("streamReply"),
    );
    // One from the original send, one from the regeneration.
    expect(streamReplies).toHaveLength(2);
  });

  test("does not count as a user turn", async () => {
    const t = initTest();
    const user = await createUser(t);
    const as = asUser(t, user);
    const threadId = await as.mutation(api.chat.startThread, {});
    await exchange(t, user, threadId, "hello", "first answer");

    const before = await turnCount(t, threadId);
    await as.mutation(api.chat.regenerate, { threadId });
    // Counting it would fire memory extraction early on a conversation that
    // hasn't actually moved forward.
    expect(await turnCount(t, threadId)).toBe(before);
  });

  test("feedback on the discarded reply is cleared", async () => {
    const t = initTest();
    const user = await createUser(t);
    const as = asUser(t, user);
    const threadId = await as.mutation(api.chat.startThread, {});
    await exchange(t, user, threadId, "hello", "first answer");

    // Rate the reply the way the client does — by its UIMessage key.
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

    // A thumbs-down is usually what prompts a regeneration; inheriting it
    // onto the replacement would be wrong.
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
    await exchange(t, user, threadId, "hello", "first answer");
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
    await exchange(t, owner, threadId, "hello", "first answer");

    await expect(
      asUser(t, other).mutation(api.chat.regenerate, { threadId }),
    ).rejects.toThrow("Not your conversation");
  });
});

describe("chat — edit & resend", () => {
  async function exchange(
    t: ReturnType<typeof initTest>,
    userId: Id<"users">,
    threadId: string,
    prompt: string,
    reply: string,
  ): Promise<void> {
    await asUser(t, userId).mutation(api.chat.sendMessage, {
      threadId,
      prompt,
    });
    await t.run(async (ctx) => {
      await ctx.runMutation(components.agent.messages.addMessages, {
        threadId,
        userId,
        agentName: "Dhee",
        messages: [
          { message: { role: "assistant", content: reply }, status: "success" },
        ],
      });
    });
  }

  async function docs(
    t: ReturnType<typeof initTest>,
    threadId: string,
  ): Promise<{ _id: string; text?: string; order: number }[]> {
    const { page } = await t.run(
      async (ctx) =>
        await ctx.runQuery(components.agent.messages.listMessagesByThreadId, {
          threadId,
          order: "asc",
          paginationOpts: { cursor: null, numItems: 50 },
        }),
    );
    return page;
  }

  test("editing the first of three turns drops everything after it", async () => {
    const t = initTest();
    const user = await createUser(t);
    const as = asUser(t, user);
    const threadId = await as.mutation(api.chat.startThread, {});
    await exchange(t, user, threadId, "first", "reply one");
    await exchange(t, user, threadId, "second", "reply two");
    await exchange(t, user, threadId, "third", "reply three");

    const first = (await docs(t, threadId))[0];
    await as.mutation(api.chat.editAndResend, {
      threadId,
      messageId: first._id,
      prompt: "first, rewritten",
    });

    // The fork keeps nothing after the edit point, and the new prompt is the
    // only thing left.
    expect((await docs(t, threadId)).map((m) => m.text)).toEqual([
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
    await exchange(t, user, threadId, "hello", "an answer");

    const reply = (await docs(t, threadId))[1];
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
    await exchange(t, user, threadId, "hello", "an answer");

    const first = (await docs(t, threadId))[0];
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
    await exchange(t, owner, threadId, "hello", "an answer");

    const first = (await docs(t, threadId))[0];
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
    await exchange(t, user, mine, "hello", "an answer");
    await exchange(t, user, other, "elsewhere", "another answer");

    const elsewhere = (await docs(t, other))[0];
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
    await exchange(t, user, threadId, "first", "reply one");
    await exchange(t, user, threadId, "second", "reply two");

    const before = await turnCount(t, threadId);
    const first = (await docs(t, threadId))[0];
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
    await exchange(t, user, threadId, "first", "reply one");
    await exchange(t, user, threadId, "second", "reply two");

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
    await exchange(t, user, threadId, "hello", "an answer");
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
    const first = (await docs(t, threadId))[0];
    await expect(
      as.mutation(api.chat.editAndResend, {
        threadId,
        messageId: first._id,
        prompt: "changed my mind",
      }),
    ).rejects.toThrow("still replying");
    // And nothing was deleted.
    expect((await docs(t, threadId)).map((m) => m.text)).toEqual([
      "hello",
      "an answer",
    ]);
  });

  test("refuses while a reply is scheduled but not yet streaming", async () => {
    const t = initTest();
    const user = await createUser(t);
    const as = asUser(t, user);
    const threadId = await as.mutation(api.chat.startThread, {});
    await exchange(t, user, threadId, "hello", "an answer");
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

    const first = (await docs(t, threadId))[0];
    await expect(
      as.mutation(api.chat.editAndResend, {
        threadId,
        messageId: first._id,
        prompt: "changed my mind",
      }),
    ).rejects.toThrow("still replying");
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
