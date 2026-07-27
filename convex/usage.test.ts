import { ConvexError } from "convex/values";
import { describe, expect, test } from "vitest";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { FREE_DAILY_MESSAGE_LIMIT } from "./config";
import {
  asUser,
  createUser,
  initTest,
  seedReply,
  threadMessages,
} from "./test.setup";

// The launch requirement: no account can send unlimited messages. Every test
// here hits the backend directly, because that is the bypass the client can't
// be trusted to prevent.

type Test = ReturnType<typeof initTest>;

const DAY_MS = 24 * 60 * 60 * 1000;

async function startThread(t: Test, userId: Id<"users">): Promise<string> {
  return await asUser(t, userId).mutation(api.chat.startThread, {});
}

async function send(
  t: Test,
  userId: Id<"users">,
  threadId: string,
  prompt: string,
): Promise<void> {
  await asUser(t, userId).mutation(api.chat.sendMessage, { threadId, prompt });
}

async function exhaust(
  t: Test,
  userId: Id<"users">,
  threadId: string,
): Promise<void> {
  for (let i = 0; i < FREE_DAILY_MESSAGE_LIMIT; i++) {
    await send(t, userId, threadId, `message ${i}`);
  }
}

async function scheduledCount(t: Test): Promise<number> {
  return await t.run(
    async (ctx) =>
      (await ctx.db.system.query("_scheduled_functions").collect()).length,
  );
}

/** The thrown error's `data`, or the raw error if it wasn't a ConvexError. */
async function limitError(promise: Promise<unknown>): Promise<unknown> {
  const error = await promise.then(
    () => undefined,
    (e: unknown) => e,
  );
  expect(error).toBeInstanceOf(ConvexError);
  return (error as ConvexError<unknown>).data;
}

describe("free-tier daily message limit", () => {
  test("a message under the limit is saved and its reply scheduled", async () => {
    const t = initTest();
    const userId = await createUser(t);
    const threadId = await startThread(t, userId);

    await send(t, userId, threadId, "hello");

    expect(await threadMessages(t, threadId)).toHaveLength(1);
    expect(await asUser(t, userId).query(api.chat.usage, {})).toMatchObject({
      plan: "free",
      used: 1,
      limit: FREE_DAILY_MESSAGE_LIMIT,
      remaining: FREE_DAILY_MESSAGE_LIMIT - 1,
    });
  });

  test("at the limit, sendMessage throws and writes nothing", async () => {
    const t = initTest();
    const userId = await createUser(t);
    const threadId = await startThread(t, userId);
    await exhaust(t, userId, threadId);

    const before = await threadMessages(t, threadId);
    const scheduledBefore = await scheduledCount(t);

    const data = await limitError(send(t, userId, threadId, "one more"));
    expect(data).toMatchObject({ code: "LIMIT_REACHED" });

    expect(await threadMessages(t, threadId)).toHaveLength(before.length);
    expect(await scheduledCount(t)).toBe(scheduledBefore);
    expect(await asUser(t, userId).query(api.chat.usage, {})).toMatchObject({
      used: FREE_DAILY_MESSAGE_LIMIT,
      remaining: 0,
    });
  });

  test("a refused first message leaves no empty conversation behind", async () => {
    const t = initTest();
    const userId = await createUser(t);
    const threadId = await startThread(t, userId);
    await exhaust(t, userId, threadId);

    await limitError(
      asUser(t, userId).mutation(api.chat.sendMessage, { prompt: "hello" }),
    );

    const { page } = await asUser(t, userId).query(api.chat.listThreads, {
      paginationOpts: { cursor: null, numItems: 10 },
    });
    expect(page).toHaveLength(1);
  });

  test("the reset instant is the next UTC midnight", async () => {
    const t = initTest();
    const userId = await createUser(t);
    const { resetsAt } = await asUser(t, userId).query(api.chat.usage, {});

    expect(resetsAt % DAY_MS).toBe(0);
    expect(resetsAt).toBeGreaterThan(Date.now());
    expect(resetsAt - Date.now()).toBeLessThanOrEqual(DAY_MS);
  });

  test("one person hitting the limit leaves another untouched", async () => {
    const t = initTest();
    const [a, b] = [await createUser(t), await createUser(t)];
    const threadA = await startThread(t, a);
    const threadB = await startThread(t, b);
    await exhaust(t, a, threadA);

    await send(t, b, threadB, "still fine");

    expect(await asUser(t, b).query(api.chat.usage, {})).toMatchObject({
      used: 1,
      remaining: FREE_DAILY_MESSAGE_LIMIT - 1,
    });
  });

  test("a new UTC day starts a fresh counter", async () => {
    const t = initTest();
    const userId = await createUser(t);
    const threadId = await startThread(t, userId);

    // Yesterday's counter, already spent. A new day is a new key, so it must
    // not be read today.
    const yesterday = new Date(Date.now() - DAY_MS).toISOString().slice(0, 10);
    await t.run(async (ctx) => {
      await ctx.db.insert("usage", {
        userId,
        day: yesterday,
        messages: FREE_DAILY_MESSAGE_LIMIT,
      });
    });

    await send(t, userId, threadId, "good morning");

    expect(await asUser(t, userId).query(api.chat.usage, {})).toMatchObject({
      used: 1,
      remaining: FREE_DAILY_MESSAGE_LIMIT - 1,
    });
  });

  test("an unlimited plan has no ceiling", async () => {
    const t = initTest();
    const userId = await createUser(t, { email: "patron@example.test" });
    await t.mutation(internal.users.setPlan, {
      email: "patron@example.test",
      plan: "unlimited",
    });
    const threadId = await startThread(t, userId);

    await exhaust(t, userId, threadId);
    await send(t, userId, threadId, "and one more");

    expect(await asUser(t, userId).query(api.chat.usage, {})).toMatchObject({
      plan: "unlimited",
      used: FREE_DAILY_MESSAGE_LIMIT + 1,
      limit: null,
      remaining: null,
    });
  });

  test("a user row with no plan is treated as free", async () => {
    const t = initTest();
    const userId = await createUser(t);
    expect(
      await t.run(async (ctx) =>
        Object.hasOwn((await ctx.db.get(userId))!, "plan"),
      ),
    ).toBe(false);

    const threadId = await startThread(t, userId);
    await exhaust(t, userId, threadId);

    expect(
      await limitError(send(t, userId, threadId, "one more")),
    ).toMatchObject({ code: "LIMIT_REACHED" });
  });

  test("regenerate and edit-and-resend spend the allowance too", async () => {
    // Both schedule a fresh model call, so neither can be a free way past the
    // ceiling once the client is bypassed.
    const t = initTest();
    const userId = await createUser(t);
    const as = asUser(t, userId);
    const threadId = await startThread(t, userId);

    await send(t, userId, threadId, "first");
    await seedReply(t, userId, threadId, "a reply");
    await as.mutation(api.chat.regenerate, { threadId });
    expect(await as.query(api.chat.usage, {})).toMatchObject({ used: 2 });

    const [prompt] = await threadMessages(t, threadId);
    await as.mutation(api.chat.editAndResend, {
      threadId,
      messageId: prompt._id,
      prompt: "first, reworded",
    });
    expect(await as.query(api.chat.usage, {})).toMatchObject({ used: 3 });
  });

  test("incognito is refused once the allowance is spent", async () => {
    // The action would otherwise reach the model, so the check has to come
    // first — this test never gets that far.
    const t = initTest();
    const userId = await createUser(t);
    const threadId = await startThread(t, userId);
    await exhaust(t, userId, threadId);

    const data = await limitError(
      asUser(t, userId).action(api.chat.incognitoReply, {
        messages: [{ role: "user", text: "off the record" }],
      }),
    );
    expect(data).toMatchObject({ code: "LIMIT_REACHED" });
  });

  test("usage requires a signed-in person", async () => {
    const t = initTest();
    await expect(t.query(api.chat.usage, {})).rejects.toThrow("Not signed in");
  });
});

describe("users.setPlan", () => {
  test("flips the plan by email", async () => {
    const t = initTest();
    const userId = await createUser(t, { email: "someone@example.test" });

    await t.mutation(internal.users.setPlan, {
      email: "someone@example.test",
      plan: "unlimited",
    });
    expect(await t.run(async (ctx) => (await ctx.db.get(userId))?.plan)).toBe(
      "unlimited",
    );

    await t.mutation(internal.users.setPlan, {
      email: "someone@example.test",
      plan: "free",
    });
    expect(await t.run(async (ctx) => (await ctx.db.get(userId))?.plan)).toBe(
      "free",
    );
  });

  test("says so when nobody has that email", async () => {
    const t = initTest();
    await expect(
      t.mutation(internal.users.setPlan, {
        email: "nobody@example.test",
        plan: "unlimited",
      }),
    ).rejects.toThrow("nobody@example.test");
  });
});
