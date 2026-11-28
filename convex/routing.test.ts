import { describe, expect, test } from "vitest";
import { api, internal } from "./_generated/api";
import { deepTier } from "./routing";
import { asUser, createUser, initTest } from "./test.setup";

// The Convex half of Auto: what a decision leaves behind and who can read it.
// Routing itself (convex/agents/router.ts) is tested with a stub classifier;
// nothing here reaches a model.

async function route(
  t: ReturnType<typeof initTest>,
  args: {
    userId: Awaited<ReturnType<typeof createUser>>;
    threadId: string;
    order: number;
    tier: "quick" | "thoughtful" | "reflective";
  },
) {
  await t.mutation(internal.routing.record, {
    ...args,
    kind: "concept",
    by: "classifier",
    latencyMs: 800,
  });
}

describe("routing — what a decision leaves behind", () => {
  test("the next turn reads where the previous one went", async () => {
    const t = initTest();
    const userId = await createUser(t);
    const threadId = await asUser(t, userId).mutation(api.chat.startThread, {});
    await route(t, { userId, threadId, order: 0, tier: "quick" });
    await route(t, { userId, threadId, order: 1, tier: "reflective" });
    expect(
      await t.query(internal.routing.previousTier, { threadId, order: 2 }),
    ).toBe("reflective");
    expect(
      await t.query(internal.routing.previousTier, { threadId, order: 1 }),
    ).toBe("quick");
    expect(
      await t.query(internal.routing.previousTier, { threadId, order: 0 }),
    ).toBeNull();
  });

  test("a regenerated turn replaces its decision rather than adding one", async () => {
    const t = initTest();
    const userId = await createUser(t);
    const as = asUser(t, userId);
    const threadId = await as.mutation(api.chat.startThread, {});
    await route(t, { userId, threadId, order: 0, tier: "quick" });
    await route(t, { userId, threadId, order: 0, tier: "reflective" });
    expect(await as.query(api.routing.threadRoutes, { threadId })).toEqual([
      { order: 0, tier: "reflective" },
    ]);
  });

  test("someone else's thread shows no routes", async () => {
    const t = initTest();
    const owner = await createUser(t);
    const other = await createUser(t);
    const threadId = await asUser(t, owner).mutation(api.chat.startThread, {});
    await route(t, { userId: owner, threadId, order: 0, tier: "reflective" });
    expect(
      await asUser(t, other).query(api.routing.threadRoutes, { threadId }),
    ).toEqual([]);
  });

  test("deleting the thread deletes its decisions", async () => {
    const t = initTest();
    const userId = await createUser(t);
    const as = asUser(t, userId);
    const threadId = await as.mutation(api.chat.startThread, {});
    await route(t, { userId, threadId, order: 0, tier: "reflective" });
    await as.mutation(api.chat.deleteThread, { threadId });
    const left = await t.run((ctx) => ctx.db.query("turnRoutes").collect());
    expect(left).toEqual([]);
  });

  test("deleting every conversation deletes every decision", async () => {
    const t = initTest();
    const userId = await createUser(t);
    const as = asUser(t, userId);
    const a = await as.mutation(api.chat.startThread, {});
    const b = await as.mutation(api.chat.startThread, {});
    await route(t, { userId, threadId: a, order: 0, tier: "quick" });
    await route(t, { userId, threadId: b, order: 0, tier: "reflective" });
    await as.mutation(api.chat.deleteAllThreads, {});
    const left = await t.run((ctx) => ctx.db.query("turnRoutes").collect());
    expect(left).toEqual([]);
  });
});

test("deep turns go to Reflective where it can answer, else to Thoughtful", () => {
  expect(deepTier(["auto", "quick", "thoughtful", "reflective"])).toBe(
    "reflective",
  );
  expect(deepTier(["auto", "quick", "thoughtful"])).toBe("thoughtful");
});
