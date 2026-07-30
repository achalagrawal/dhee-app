import { describe, expect, test } from "vitest";
import { BACKGROUND_MODEL, CHAT_MODEL } from "./config";
import {
  classifyAgentCall,
  costFromProviderMetadata,
  toUsageRecord,
} from "./usage";
import { initTest, createUser } from "./test.setup";
import { internal } from "./_generated/api";

describe("classifyAgentCall", () => {
  const backgroundModel = BACKGROUND_MODEL;

  test("a reply in a thread is chat", () => {
    expect(
      classifyAgentCall({ model: CHAT_MODEL, threadId: "t1", backgroundModel }),
    ).toBe("chat");
  });

  test("the background model means titling", () => {
    // Titling is the only agent call that runs on the cheaper model, which is
    // what makes this inferable at all.
    expect(
      classifyAgentCall({
        model: backgroundModel,
        threadId: "t1",
        backgroundModel,
      }),
    ).toBe("title");
  });

  test("no thread means incognito", () => {
    // Incognito saves nothing, so it has no thread to belong to — that absence
    // is the signal.
    expect(
      classifyAgentCall({
        model: CHAT_MODEL,
        threadId: undefined,
        backgroundModel,
      }),
    ).toBe("incognito");
  });
});

describe("costFromProviderMetadata", () => {
  test("reads the billed cost the provider reports", () => {
    expect(
      costFromProviderMetadata({ openrouter: { usage: { cost: 0.0213 } } }),
    ).toBe(0.0213);
  });

  test("returns undefined rather than guessing when nothing is reported", () => {
    // A missing cost must stay visibly missing. Inferring one from a price
    // table would look identical to a measurement long after it went stale.
    expect(costFromProviderMetadata(undefined)).toBeUndefined();
    expect(costFromProviderMetadata(null)).toBeUndefined();
    expect(costFromProviderMetadata({})).toBeUndefined();
    expect(costFromProviderMetadata({ openrouter: {} })).toBeUndefined();
    expect(
      costFromProviderMetadata({ openrouter: { usage: {} } }),
    ).toBeUndefined();
    expect(
      costFromProviderMetadata({ openrouter: { usage: { cost: "0.02" } } }),
    ).toBeUndefined();
  });

  test("rejects a non-finite cost", () => {
    expect(
      costFromProviderMetadata({ openrouter: { usage: { cost: NaN } } }),
    ).toBeUndefined();
  });
});

describe("toUsageRecord", () => {
  test("carries counts and cost through", () => {
    const record = toUsageRecord({
      kind: "chat",
      model: CHAT_MODEL,
      provider: "openrouter",
      agentName: "Dhee",
      usage: {
        promptTokens: 9000,
        completionTokens: 300,
        cachedInputTokens: 6000,
        reasoningTokens: 120,
      },
      providerMetadata: { openrouter: { usage: { cost: 0.02 } } },
    });
    expect(record).toMatchObject({
      kind: "chat",
      promptTokens: 9000,
      completionTokens: 300,
      cachedInputTokens: 6000,
      reasoningTokens: 120,
      costUsd: 0.02,
    });
  });

  test("reads the newer AI SDK token field names too", () => {
    // These were renamed between SDK versions and the component sits between
    // us and whichever the provider used. Reading both means a rename degrades
    // to a visible zero rather than a silently empty ledger.
    const record = toUsageRecord({
      kind: "title",
      model: BACKGROUND_MODEL,
      usage: { inputTokens: 1200, outputTokens: 40 },
    });
    expect(record.promptTokens).toBe(1200);
    expect(record.completionTokens).toBe(40);
  });

  test("survives a call that reports no usage at all", () => {
    const record = toUsageRecord({
      kind: "extraction",
      model: BACKGROUND_MODEL,
      usage: undefined,
    });
    expect(record.promptTokens).toBe(0);
    expect(record.completionTokens).toBe(0);
    expect(record.costUsd).toBeUndefined();
  });

  test("omits cached tokens rather than defaulting them to zero", () => {
    // Absent and zero mean different things — "not told" versus "nothing was
    // cached" — and a cache hit rate is only honest if they stay apart.
    const record = toUsageRecord({
      kind: "chat",
      model: CHAT_MODEL,
      usage: { promptTokens: 10, completionTokens: 2 },
    });
    expect("cachedInputTokens" in record).toBe(false);
  });
});

describe("usage.record", () => {
  test("writes a row that carries no conversation content", async () => {
    const t = initTest();
    const userId = await createUser(t, { email: "one@example.com" });

    await t.mutation(internal.usage.record, {
      userId,
      threadId: "thread-1",
      kind: "extraction",
      model: BACKGROUND_MODEL,
      provider: "openrouter",
      promptTokens: 4000,
      completionTokens: 220,
      costUsd: 0.006,
    });

    const rows = await t.run(async (ctx) => ctx.db.query("llmUsage").collect());
    expect(rows).toHaveLength(1);
    const [row] = rows;
    expect(row).toMatchObject({
      kind: "extraction",
      promptTokens: 4000,
      completionTokens: 220,
      costUsd: 0.006,
    });
    expect(row!.createdAt).toBeGreaterThan(0);

    // The ledger is about money, not about people. Anything resembling message
    // text in here would make it a second copy of the conversation store.
    const fields = Object.keys(row!);
    for (const forbidden of ["text", "prompt", "reply", "content", "title"]) {
      expect(fields).not.toContain(forbidden);
    }
  });

  test("separates the kinds that write no message from the ones that do", async () => {
    // The reason this table exists: titling, incognito and extraction all leave
    // no message row, so without a ledger their spend is indistinguishable from
    // zero. This is the assertion that they land somewhere countable.
    const t = initTest();
    const userId = await createUser(t, { email: "two@example.com" });

    for (const kind of ["chat", "title", "extraction", "incognito"] as const) {
      await t.mutation(internal.usage.record, {
        userId,
        kind,
        model:
          kind === "chat" || kind === "incognito"
            ? CHAT_MODEL
            : BACKGROUND_MODEL,
        promptTokens: 100,
        completionTokens: 10,
        costUsd: 0.001,
      });
    }

    const invisible = await t.run(async (ctx) =>
      ctx.db
        .query("llmUsage")
        .withIndex("by_kind", (q) => q.eq("kind", "extraction"))
        .collect(),
    );
    expect(invisible).toHaveLength(1);

    const all = await t.run(async (ctx) => ctx.db.query("llmUsage").collect());
    expect(new Set(all.map((r) => r.kind)).size).toBe(4);
  });
});
