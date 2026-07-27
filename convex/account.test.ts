import { describe, expect, test } from "vitest";
import { api, components, internal } from "./_generated/api";
import { asUser, createUser, initTest } from "./test.setup";

// Erasure. `triggers.user.onDelete` in auth.ts drops the app-side `users` row;
// these cover the purge that has to go with it, because a row-only delete
// leaves a person's conversations and every inference about them behind.
//
// The agent component drops a thread from its own tables as soon as the delete
// is asked for and finishes the message rows on its internal scheduler, so
// "gone from the thread list" is assertable here. Nothing reaches the LLM.

async function seedEverything(
  t: ReturnType<typeof initTest>,
  userId: Awaited<ReturnType<typeof createUser>>,
) {
  const threadId = await asUser(t, userId).mutation(api.chat.startThread, {});
  await asUser(t, userId).mutation(api.chat.setStarred, {
    threadId,
    starred: true,
  });
  await asUser(t, userId).mutation(api.chat.setMessageFeedback, {
    threadId,
    messageId: `${userId}-m1`,
    rating: "up",
  });

  const storageId = await t.run(
    async (ctx) => await ctx.storage.store(new Blob(["avatar"])),
  );

  await t.run(async (ctx) => {
    await ctx.db.insert("profiles", {
      userId,
      name: "Someone",
      preferredLanguage: "en",
      onboarded: true,
      createdAt: Date.now(),
      avatarId: storageId,
    });
    await ctx.db.insert("inquiries", {
      userId,
      question: "Whether to stay",
      status: "living",
      firstAskedAt: Date.now(),
      threadIds: [threadId],
      userEdited: false,
    });
    await ctx.db.insert("observations", {
      userId,
      kind: "value",
      text: "Values steadiness over speed",
      sourceThreadId: threadId,
      confidence: "inferred",
      createdAt: Date.now(),
      userEdited: false,
    });
    await ctx.db.insert("conceptsTouched", {
      userId,
      conceptSlug: "expectation-and-disappointment",
      plainLanguageLabel: "Expecting and being let down",
      familiarity: "resonating",
      lastTouchedAt: Date.now(),
    });
    await ctx.db.insert("contextBlocks", {
      userId,
      block: "Questions they are sitting with:\n- Whether to stay",
      generatedAt: Date.now(),
    });
  });

  return { threadId, storageId };
}

async function rowCounts(
  t: ReturnType<typeof initTest>,
  userId: Awaited<ReturnType<typeof createUser>>,
) {
  return await t.run(async (ctx) => {
    const of = async (
      table:
        | "profiles"
        | "inquiries"
        | "observations"
        | "conceptsTouched"
        | "contextBlocks"
        | "threadMeta"
        | "messageFeedback",
    ) =>
      (
        await ctx.db
          .query(table)
          .withIndex("by_user", (q) => q.eq("userId", userId))
          .collect()
      ).length;

    return {
      profiles: await of("profiles"),
      inquiries: await of("inquiries"),
      observations: await of("observations"),
      concepts: await of("conceptsTouched"),
      contextBlocks: await of("contextBlocks"),
      threadMeta: await of("threadMeta"),
      feedback: await of("messageFeedback"),
    };
  });
}

describe("account — purgeUserData", () => {
  test("removes every table that hangs off the user", async () => {
    const t = initTest();
    const user = await createUser(t);
    await seedEverything(t, user);

    expect(await rowCounts(t, user)).toEqual({
      profiles: 1,
      inquiries: 1,
      observations: 1,
      concepts: 1,
      contextBlocks: 1,
      threadMeta: 1,
      feedback: 1,
    });

    await t.mutation(internal.account.purgeUserData, { userId: user });

    expect(await rowCounts(t, user)).toEqual({
      profiles: 0,
      inquiries: 0,
      observations: 0,
      concepts: 0,
      contextBlocks: 0,
      threadMeta: 0,
      feedback: 0,
    });
  });

  test("cancels a queued memory extraction instead of letting it outlive the account", async () => {
    const t = initTest();
    const user = await createUser(t);
    const threadId = await asUser(t, user).mutation(api.chat.startThread, {});
    // A real turn, so `sendMessage` queues the debounced idle extraction.
    await asUser(t, user).mutation(api.chat.sendMessage, {
      threadId,
      prompt: "I've been restless lately.",
    });

    const livePendingExtractions = async () =>
      await t.run(async (ctx) => {
        const fns = await ctx.db.system.query("_scheduled_functions").collect();
        return fns.filter(
          (f) => f.name.includes("runExtraction") && f.state.kind === "pending",
        );
      });

    // Asserted before as well as after, so the test can't quietly go vacuous
    // if the idle flush ever stops being scheduled here.
    expect(await livePendingExtractions()).toHaveLength(1);

    await t.mutation(internal.account.purgeUserData, { userId: user });

    // Left alone, this would wake minutes later and write fresh observation
    // rows under a userId that no longer resolves to anyone — re-creating the
    // very thing the purge exists to erase.
    expect(await livePendingExtractions()).toHaveLength(0);
  });

  test("deletes the stored avatar, not just the row pointing at it", async () => {
    const t = initTest();
    const user = await createUser(t);
    const { storageId } = await seedEverything(t, user);

    await t.mutation(internal.account.purgeUserData, { userId: user });

    const blob = await t.run(async (ctx) => await ctx.storage.get(storageId));
    expect(blob).toBeNull();
  });

  test("deletes the person's conversations", async () => {
    const t = initTest();
    const user = await createUser(t);
    await seedEverything(t, user);

    await t.mutation(internal.account.purgeUserData, { userId: user });

    const threads = await t.run(
      async (ctx) =>
        await ctx.runQuery(components.agent.threads.listThreadsByUserId, {
          userId: user,
          paginationOpts: { cursor: null, numItems: 100 },
        }),
    );
    expect(threads.page).toEqual([]);
  });

  test("leaves another person's data alone", async () => {
    const t = initTest();
    const gone = await createUser(t);
    const kept = await createUser(t);
    await seedEverything(t, gone);
    await seedEverything(t, kept);

    await t.mutation(internal.account.purgeUserData, { userId: gone });

    expect(await rowCounts(t, kept)).toEqual({
      profiles: 1,
      inquiries: 1,
      observations: 1,
      concepts: 1,
      contextBlocks: 1,
      threadMeta: 1,
      feedback: 1,
    });
    expect(await asUser(t, kept).query(api.chat.threadFlags, {})).toHaveLength(
      1,
    );
  });

  test("is safe to run twice", async () => {
    const t = initTest();
    const user = await createUser(t);
    await seedEverything(t, user);

    await t.mutation(internal.account.purgeUserData, { userId: user });
    await t.mutation(internal.account.purgeUserData, { userId: user });

    expect((await rowCounts(t, user)).profiles).toBe(0);
  });
});
