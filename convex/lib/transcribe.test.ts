import { describe, expect, test, vi } from "vitest";
import {
  TRANSCRIPTION_URL,
  characterErrorRate,
  transcribeAudio,
} from "./transcribe";

const asFetch = (fn: unknown) => fn as typeof fetch;

describe("transcribeAudio", () => {
  test("posts a multipart upload and reads text, cost and tokens", async () => {
    const fetchImpl = vi.fn(
      async (_url: string, _init: RequestInit) =>
        new Response(
          JSON.stringify({
            text: " hi ",
            usage: { cost: 0.001, input_tokens: 40 },
          }),
        ),
    );
    const out = await transcribeAudio({
      audio: new Blob(["x"], { type: "audio/webm" }),
      filename: "clip.webm",
      model: "m/one",
      apiKey: "k",
      language: "hi",
      prompt: "vocab",
      fetchImpl: asFetch(fetchImpl),
    });
    expect(out).toEqual({ text: "hi", costUsd: 0.001, inputTokens: 40 });
    const [url, init] = fetchImpl.mock.calls[0]!;
    expect(url).toBe(TRANSCRIPTION_URL);
    expect((init.headers as Record<string, string>).Authorization).toBe(
      "Bearer k",
    );
    const form = init.body as FormData;
    expect(form.get("model")).toBe("m/one");
    expect(form.get("language")).toBe("hi");
    expect(form.get("prompt")).toBe("vocab");
    expect((form.get("file") as File).name).toBe("clip.webm");
  });

  test("leaves out language and prompt when not given", async () => {
    const fetchImpl = vi.fn(
      async (_url: string, _init: RequestInit) =>
        new Response(JSON.stringify({ text: "ok" })),
    );
    const out = await transcribeAudio({
      audio: new Blob(["x"]),
      filename: "clip.webm",
      model: "m",
      apiKey: "k",
      fetchImpl: asFetch(fetchImpl),
    });
    expect(out).toEqual({ text: "ok" });
    const form = fetchImpl.mock.calls[0]![1].body as FormData;
    expect(form.has("language")).toBe(false);
    expect(form.has("prompt")).toBe(false);
  });

  test("throws on an error status or a body without text", async () => {
    const base = {
      audio: new Blob(["x"]),
      filename: "c.webm",
      model: "m",
      apiKey: "k",
    };
    await expect(
      transcribeAudio({
        ...base,
        fetchImpl: asFetch(async () => new Response("bad", { status: 403 })),
      }),
    ).rejects.toThrow("transcription 403");
    await expect(
      transcribeAudio({
        ...base,
        fetchImpl: asFetch(async () => new Response(JSON.stringify({}))),
      }),
    ).rejects.toThrow("no text");
  });
});

describe("characterErrorRate", () => {
  test("is zero for the same words, whatever the punctuation and spacing", () => {
    expect(
      characterErrorRate("सह-अस्तित्व क्या है?", "सहअस्तित्व  क्या है"),
    ).toBe(0);
    expect(characterErrorRate("Hello, World", "hello world")).toBe(0);
  });

  test("counts edits against the reference length", () => {
    expect(characterErrorRate("abcd", "abxd")).toBe(0.25);
    expect(characterErrorRate("abcd", "")).toBe(1);
    expect(characterErrorRate("", "")).toBe(0);
  });
});
