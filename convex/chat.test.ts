import { getThreadMetadata } from "@convex-dev/agent";
import { describe, expect, test } from "vitest";
import { api, components } from "./_generated/api";
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
