import { describe, expect, test } from "vitest";
import { api, components } from "./_generated/api";
import {
  asUser,
  createUser,
  initTest,
  seedExchange,
  seedReply,
  threadMessages,
} from "./test.setup";

// Tests for convex/share.ts — the app's only unauthenticated read path. See
// docs/build/specs/sharing.md.
//
// The tests that matter most here are the ones asserting what a stranger
// *cannot* get: anything past the snapshot boundary, anything from a revoked or
// deleted share, and anything beyond role and text.

// A shared conversation, ready to read: returns the slug.
async function shareOne(
  t: ReturnType<typeof initTest>,
  userId: Parameters<typeof asUser>[1],
  threadId: string,
): Promise<string> {
  const { slug } = await asUser(t, userId).mutation(api.share.shareThread, {
    threadId,
  });
  return slug;
}

// The public read, with no identity at all — which is the whole point.
async function readShared(t: ReturnType<typeof initTest>, slug: string) {
  const { page } = await t.query(api.share.listSharedMessages, {
    slug,
    paginationOpts: { cursor: null, numItems: 100 },
  });
  return page;
}

const texts = (page: { role: string; text: string }[]) =>
  page.map((m) => `${m.role}: ${m.text}`);

describe("share — authorization", () => {
  test("shareThread throws when unauthenticated", async () => {
    const t = initTest();
    const user = await createUser(t);
    const threadId = await asUser(t, user).mutation(api.chat.startThread, {});
    await expect(
      t.mutation(api.share.shareThread, { threadId }),
    ).rejects.toThrow("Not signed in");
  });

  test("shareThread rejects a thread the caller does not own", async () => {
    const t = initTest();
    const owner = await createUser(t);
    const other = await createUser(t);
    const threadId = await asUser(t, owner).mutation(api.chat.startThread, {});
    await seedExchange(t, owner, threadId, "hello", "hi");
    await expect(
      asUser(t, other).mutation(api.share.shareThread, { threadId }),
    ).rejects.toThrow("Not your conversation");
  });

  test("unshareThread rejects a thread the caller does not own", async () => {
    const t = initTest();
    const owner = await createUser(t);
    const other = await createUser(t);
    const threadId = await asUser(t, owner).mutation(api.chat.startThread, {});
    await seedExchange(t, owner, threadId, "hello", "hi");
    await shareOne(t, owner, threadId);
    await expect(
      asUser(t, other).mutation(api.share.unshareThread, { threadId }),
    ).rejects.toThrow("Not your conversation");
  });

  test("an empty conversation cannot be shared", async () => {
    const t = initTest();
    const user = await createUser(t);
    const threadId = await asUser(t, user).mutation(api.chat.startThread, {});
    await expect(
      asUser(t, user).mutation(api.share.shareThread, { threadId }),
    ).rejects.toThrow("nothing in it");
  });
});

describe("share — the public read", () => {
  test("a shared conversation is readable with no identity", async () => {
    const t = initTest();
    const user = await createUser(t);
    const threadId = await asUser(t, user).mutation(api.chat.startThread, {});
    await seedExchange(t, user, threadId, "what is anger?", "A signal.");
    const slug = await shareOne(t, user, threadId);

    expect(texts(await readShared(t, slug))).toEqual([
      "user: what is anger?",
      "assistant: A signal.",
    ]);
  });

  test("only role and text cross the boundary", async () => {
    const t = initTest();
    const user = await createUser(t);
    const threadId = await asUser(t, user).mutation(api.chat.startThread, {});
    await seedExchange(t, user, threadId, "hello", "hi");
    const slug = await shareOne(t, user, threadId);

    for (const message of await readShared(t, slug)) {
      expect(Object.keys(message).sort()).toEqual(["key", "role", "text"]);
    }
  });

  test("sharedConversation carries the title and the share time", async () => {
    const t = initTest();
    const user = await createUser(t);
    const as = asUser(t, user);
    const threadId = await as.mutation(api.chat.startThread, {});
    await seedExchange(t, user, threadId, "hello", "hi");
    await as.mutation(api.chat.renameThread, { threadId, title: "On anger" });
    const slug = await shareOne(t, user, threadId);

    const info = await t.query(api.share.sharedConversation, { slug });
    expect(info?.title).toBe("On anger");
    expect(typeof info?.sharedAt).toBe("number");
  });

  test("the title is frozen at share time", async () => {
    const t = initTest();
    const user = await createUser(t);
    const as = asUser(t, user);
    const threadId = await as.mutation(api.chat.startThread, {});
    await seedExchange(t, user, threadId, "hello", "hi");
    await as.mutation(api.chat.renameThread, { threadId, title: "On anger" });
    const slug = await shareOne(t, user, threadId);
    await as.mutation(api.chat.renameThread, { threadId, title: "Private" });

    const info = await t.query(api.share.sharedConversation, { slug });
    expect(info?.title).toBe("On anger");
  });

  test("an unknown slug returns null and an empty page, not an error", async () => {
    const t = initTest();
    expect(
      await t.query(api.share.sharedConversation, { slug: "nosuchslug" }),
    ).toBeNull();
    expect(await readShared(t, "nosuchslug")).toEqual([]);
  });

  test("failed and pending messages are left out", async () => {
    const t = initTest();
    const user = await createUser(t);
    const threadId = await asUser(t, user).mutation(api.chat.startThread, {});
    await seedExchange(t, user, threadId, "hello", "hi");
    await t.run(async (ctx) => {
      await ctx.runMutation(components.agent.messages.addMessages, {
        threadId,
        userId: user,
        agentName: "Dhee",
        messages: [
          {
            message: { role: "assistant", content: "half a thought" },
            status: "failed",
          },
        ],
      });
    });
    const slug = await shareOne(t, user, threadId);

    expect(texts(await readShared(t, slug))).toEqual([
      "user: hello",
      "assistant: hi",
    ]);
  });
});

describe("share — the snapshot", () => {
  test("messages sent after sharing are not published", async () => {
    const t = initTest();
    const user = await createUser(t);
    const threadId = await asUser(t, user).mutation(api.chat.startThread, {});
    await seedExchange(t, user, threadId, "first", "one");
    const slug = await shareOne(t, user, threadId);
    await seedExchange(t, user, threadId, "second", "two");

    expect(texts(await readShared(t, slug))).toEqual([
      "user: first",
      "assistant: one",
    ]);
  });

  test("a reply that lands after sharing completes its own turn", async () => {
    const t = initTest();
    const user = await createUser(t);
    const threadId = await asUser(t, user).mutation(api.chat.startThread, {});
    // Shared mid-turn: the prompt is saved, the reply has not arrived yet.
    await asUser(t, user).mutation(api.chat.sendMessage, {
      threadId,
      prompt: "first",
    });
    const slug = await shareOne(t, user, threadId);
    await seedReply(t, user, threadId, "one");

    expect(texts(await readShared(t, slug))).toEqual([
      "user: first",
      "assistant: one",
    ]);
  });

  test("re-sharing extends the snapshot and keeps the slug", async () => {
    const t = initTest();
    const user = await createUser(t);
    const threadId = await asUser(t, user).mutation(api.chat.startThread, {});
    await seedExchange(t, user, threadId, "first", "one");
    const slug = await shareOne(t, user, threadId);
    await seedExchange(t, user, threadId, "second", "two");

    expect(await shareOne(t, user, threadId)).toBe(slug);
    expect(texts(await readShared(t, slug))).toEqual([
      "user: first",
      "assistant: one",
      "user: second",
      "assistant: two",
    ]);
  });

  test("editing inside the snapshot revokes the link rather than rewriting it", async () => {
    const t = initTest();
    const user = await createUser(t);
    const as = asUser(t, user);
    const threadId = await as.mutation(api.chat.startThread, {});
    await seedExchange(t, user, threadId, "first", "one");
    const slug = await shareOne(t, user, threadId);

    // The edit deletes the shared exchange, and its replacement takes the same
    // order numbers — so neither bound on the row can tell them apart. The
    // link has to die.
    const [prompt] = await threadMessages(t, threadId);
    await as.mutation(api.chat.editAndResend, {
      threadId,
      messageId: prompt._id,
      prompt: "first, reworded",
    });
    await seedReply(t, user, threadId, "a different answer");

    expect(await readShared(t, slug)).toEqual([]);
    expect(await as.query(api.share.shareForThread, { threadId })).toBeNull();
  });

  test("regenerating a shared reply revokes the link", async () => {
    const t = initTest();
    const user = await createUser(t);
    const as = asUser(t, user);
    const threadId = await as.mutation(api.chat.startThread, {});
    await seedExchange(t, user, threadId, "first", "one");
    const slug = await shareOne(t, user, threadId);

    await as.mutation(api.chat.regenerate, { threadId });

    expect(await readShared(t, slug)).toEqual([]);
  });

  test("editing past the snapshot leaves the link alone", async () => {
    const t = initTest();
    const user = await createUser(t);
    const as = asUser(t, user);
    const threadId = await as.mutation(api.chat.startThread, {});
    await seedExchange(t, user, threadId, "first", "one");
    const slug = await shareOne(t, user, threadId);
    await seedExchange(t, user, threadId, "second", "two");

    // The second turn was never published, so rewriting it changes nothing
    // anyone holds a link to.
    const later = (await threadMessages(t, threadId)).find(
      (m) => m.text === "second",
    );
    await as.mutation(api.chat.editAndResend, {
      threadId,
      messageId: later!._id,
      prompt: "second, reworded",
    });

    expect(texts(await readShared(t, slug))).toEqual([
      "user: first",
      "assistant: one",
    ]);
  });
});

describe("share — revocation", () => {
  test("unsharing kills the link", async () => {
    const t = initTest();
    const user = await createUser(t);
    const threadId = await asUser(t, user).mutation(api.chat.startThread, {});
    await seedExchange(t, user, threadId, "hello", "hi");
    const slug = await shareOne(t, user, threadId);
    await asUser(t, user).mutation(api.share.unshareThread, { threadId });

    expect(await t.query(api.share.sharedConversation, { slug })).toBeNull();
    expect(await readShared(t, slug)).toEqual([]);
  });

  test("sharing again after unsharing mints a new slug and the old stays dead", async () => {
    const t = initTest();
    const user = await createUser(t);
    const threadId = await asUser(t, user).mutation(api.chat.startThread, {});
    await seedExchange(t, user, threadId, "hello", "hi");
    const first = await shareOne(t, user, threadId);
    await asUser(t, user).mutation(api.share.unshareThread, { threadId });
    const second = await shareOne(t, user, threadId);

    expect(second).not.toBe(first);
    expect(await readShared(t, first)).toEqual([]);
    expect(texts(await readShared(t, second))).toEqual([
      "user: hello",
      "assistant: hi",
    ]);
  });

  test("unsharing an unshared thread is a no-op, not an error", async () => {
    const t = initTest();
    const user = await createUser(t);
    const threadId = await asUser(t, user).mutation(api.chat.startThread, {});
    await seedExchange(t, user, threadId, "hello", "hi");
    await expect(
      asUser(t, user).mutation(api.share.unshareThread, { threadId }),
    ).resolves.toBeNull();
  });

  test("deleting the conversation kills its link", async () => {
    const t = initTest();
    const user = await createUser(t);
    const threadId = await asUser(t, user).mutation(api.chat.startThread, {});
    await seedExchange(t, user, threadId, "hello", "hi");
    const slug = await shareOne(t, user, threadId);
    await asUser(t, user).mutation(api.chat.deleteThread, { threadId });

    expect(await t.query(api.share.sharedConversation, { slug })).toBeNull();
    expect(await readShared(t, slug)).toEqual([]);
    expect(
      await t.run(async (ctx) => await ctx.db.query("sharedThreads").collect()),
    ).toEqual([]);
  });

  test("deleting every conversation kills every link", async () => {
    const t = initTest();
    const user = await createUser(t);
    const as = asUser(t, user);
    const first = await as.mutation(api.chat.startThread, {});
    const second = await as.mutation(api.chat.startThread, {});
    await seedExchange(t, user, first, "hello", "hi");
    await seedExchange(t, user, second, "hello again", "hi again");
    const slugs = [
      await shareOne(t, user, first),
      await shareOne(t, user, second),
    ];
    await as.mutation(api.chat.deleteAllThreads, {});

    for (const slug of slugs) {
      expect(await t.query(api.share.sharedConversation, { slug })).toBeNull();
    }
  });
});

describe("share — what cannot be shared", () => {
  test("a crisis-flagged conversation refuses", async () => {
    const t = initTest();
    const user = await createUser(t);
    const as = asUser(t, user);
    const threadId = await as.mutation(api.chat.startThread, {});
    await as.mutation(api.chat.sendMessage, {
      threadId,
      prompt: "some days I just want to die",
    });
    await seedReply(t, user, threadId, "I'm glad you told me.");

    await expect(
      as.mutation(api.share.shareThread, { threadId }),
    ).rejects.toThrow("can't be shared");
  });

  test("a conversation flagged after sharing keeps its existing link", async () => {
    // Deliberate: revoking behind someone's back would be a surprise, and the
    // flag is about the author's safety, not the reader's. Refusing *new*
    // shares is the guard; this pins that it isn't retroactive.
    const t = initTest();
    const user = await createUser(t);
    const as = asUser(t, user);
    const threadId = await as.mutation(api.chat.startThread, {});
    await seedExchange(t, user, threadId, "hello", "hi");
    const slug = await shareOne(t, user, threadId);
    await as.mutation(api.chat.sendMessage, {
      threadId,
      prompt: "some days I just want to die",
    });

    expect(await readShared(t, slug)).toHaveLength(2);
  });
});

describe("share — the author's view", () => {
  test("shareForThread reports the active link, or null", async () => {
    const t = initTest();
    const user = await createUser(t);
    const as = asUser(t, user);
    const threadId = await as.mutation(api.chat.startThread, {});
    await seedExchange(t, user, threadId, "hello", "hi");

    expect(await as.query(api.share.shareForThread, { threadId })).toBeNull();
    const slug = await shareOne(t, user, threadId);
    expect((await as.query(api.share.shareForThread, { threadId }))?.slug).toBe(
      slug,
    );
    await as.mutation(api.share.unshareThread, { threadId });
    expect(await as.query(api.share.shareForThread, { threadId })).toBeNull();
  });

  test("shareForThread does not answer for someone else's thread", async () => {
    const t = initTest();
    const owner = await createUser(t);
    const other = await createUser(t);
    const threadId = await asUser(t, owner).mutation(api.chat.startThread, {});
    await seedExchange(t, owner, threadId, "hello", "hi");
    await shareOne(t, owner, threadId);

    await expect(
      asUser(t, other).query(api.share.shareForThread, { threadId }),
    ).rejects.toThrow("Not your conversation");
  });
});
