import { afterEach, describe, expect, test, vi } from "vitest";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { TRANSCRIBE_FALLBACK_MODEL, TRANSCRIBE_MODEL } from "./config";
import { asUser, createUser, initTest } from "./test.setup";
import { MAX_CLIP_BYTES, extensionFor } from "./voice";

// Dictation's server half. The transcription vendor is stubbed at `fetch`, so
// nothing here reaches the network; what matters is what gets refused, what
// gets deleted, and what the ledger keeps (a cost, never words or audio).

type T = ReturnType<typeof initTest>;

async function store(t: T, type: string, bytes = 16): Promise<Id<"_storage">> {
  return await t.run((ctx) =>
    ctx.storage.store(new Blob([new Uint8Array(bytes)], { type })),
  );
}

async function blobCount(t: T) {
  return await t.run(
    async (ctx) => (await ctx.db.system.query("_storage").collect()).length,
  );
}

async function usageRows(t: T) {
  return await t.run((ctx) => ctx.db.query("llmUsage").collect());
}

/** Stubs the transcription endpoint; records which models were asked. */
function stubTranscription(
  respond: (model: string) => Response | Promise<Response>,
) {
  const models: string[] = [];
  const prompts: string[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url: string, init: RequestInit) => {
      const form = init.body as FormData;
      const model = String(form.get("model"));
      models.push(model);
      prompts.push(String(form.get("prompt") ?? ""));
      return respond(model);
    }),
  );
  return { models, prompts };
}

const ok = (text: string) =>
  new Response(JSON.stringify({ text, usage: { cost: 0.0003 } }), {
    status: 200,
  });

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("voice — auth", () => {
  test("generateUploadUrl throws when unauthenticated", async () => {
    const t = initTest();
    await expect(t.mutation(api.voice.generateUploadUrl, {})).rejects.toThrow(
      "Not signed in",
    );
  });

  test("transcribe throws when unauthenticated, and leaves the clip", async () => {
    const t = initTest();
    const storageId = await store(t, "audio/webm");
    await expect(t.action(api.voice.transcribe, { storageId })).rejects.toThrow(
      "Not signed in",
    );
    expect(await blobCount(t)).toBe(1);
  });
});

describe("voice — transcribe", () => {
  test("returns the text, deletes the clip, and records only the cost", async () => {
    const t = initTest();
    const user = await createUser(t);
    const storageId = await store(t, "audio/webm;codecs=opus");
    const calls = stubTranscription(() => ok("  सह-अस्तित्व क्या है?  "));

    const result = await asUser(t, user).action(api.voice.transcribe, {
      storageId,
    });

    expect(result).toEqual({ ok: true, text: "सह-अस्तित्व क्या है?" });
    expect(calls.models).toEqual([TRANSCRIBE_MODEL]);
    expect(calls.prompts[0]).toContain("मध्यस्थ दर्शन");
    expect(await blobCount(t)).toBe(0);
    const rows = await usageRows(t);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      kind: "transcription",
      model: TRANSCRIBE_MODEL,
      costUsd: 0.0003,
      userId: user,
    });
    expect(JSON.stringify(rows[0])).not.toContain("क्या");
  });

  test("falls back to the second model when the first fails", async () => {
    const t = initTest();
    const user = await createUser(t);
    const storageId = await store(t, "audio/mp4");
    const calls = stubTranscription((model) =>
      model === TRANSCRIBE_MODEL
        ? new Response("upstream down", { status: 502 })
        : ok("hello"),
    );

    const result = await asUser(t, user).action(api.voice.transcribe, {
      storageId,
    });

    expect(result).toEqual({ ok: true, text: "hello" });
    expect(calls.models).toEqual([TRANSCRIBE_MODEL, TRANSCRIBE_FALLBACK_MODEL]);
    expect((await usageRows(t))[0]?.model).toBe(TRANSCRIBE_FALLBACK_MODEL);
    expect(await blobCount(t)).toBe(0);
  });

  test("says failed, and still deletes the clip, when both models fail", async () => {
    const t = initTest();
    const user = await createUser(t);
    const storageId = await store(t, "audio/webm");
    stubTranscription(() => new Response("nope", { status: 500 }));

    const result = await asUser(t, user).action(api.voice.transcribe, {
      storageId,
    });

    expect(result).toEqual({ ok: false, reason: "failed" });
    expect(await blobCount(t)).toBe(0);
    expect(await usageRows(t)).toHaveLength(0);
  });

  test("says nothing-heard for an empty transcript", async () => {
    const t = initTest();
    const user = await createUser(t);
    const storageId = await store(t, "audio/webm");
    stubTranscription(() => ok("   "));

    const result = await asUser(t, user).action(api.voice.transcribe, {
      storageId,
    });

    expect(result).toEqual({ ok: false, reason: "nothing-heard" });
    expect(await blobCount(t)).toBe(0);
  });

  test("refuses a file that isn't audio, and leaves it alone", async () => {
    const t = initTest();
    const user = await createUser(t);
    const storageId = await store(t, "image/jpeg");
    const calls = stubTranscription(() => ok("should not be called"));

    const result = await asUser(t, user).action(api.voice.transcribe, {
      storageId,
    });

    expect(result).toEqual({ ok: false, reason: "not-audio" });
    expect(calls.models).toHaveLength(0);
    expect(await blobCount(t)).toBe(1);
  });

  test("refuses a clip over the size cap, and deletes it", async () => {
    const t = initTest();
    const user = await createUser(t);
    const storageId = await store(t, "audio/webm", MAX_CLIP_BYTES + 1);
    const calls = stubTranscription(() => ok("should not be called"));

    const result = await asUser(t, user).action(api.voice.transcribe, {
      storageId,
    });

    expect(result).toEqual({ ok: false, reason: "too-long" });
    expect(calls.models).toHaveLength(0);
    expect(await blobCount(t)).toBe(0);
  });
});

describe("voice — extensionFor", () => {
  test.each([
    ["audio/webm;codecs=opus", "webm"],
    ["video/webm", "webm"],
    ["audio/ogg", "ogg"],
    ["audio/mp4", "m4a"],
    ["audio/mpeg", "mp3"],
    ["audio/x-wav", "wav"],
    ["application/octet-stream", "webm"],
  ])("%s → %s", (type, ext) => {
    expect(extensionFor(type)).toBe(ext);
  });
});
