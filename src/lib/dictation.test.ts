import { describe, expect, test } from "vitest";
import {
  appendTranscript,
  failureMessageKey,
  formatElapsed,
  micErrorReason,
  pickMimeType,
} from "./dictation";

describe("pickMimeType", () => {
  test("prefers Opus in WebM", () => {
    expect(pickMimeType(() => true)).toBe("audio/webm;codecs=opus");
  });
  test("falls to MP4 for Safari", () => {
    expect(pickMimeType((t) => t === "audio/mp4")).toBe("audio/mp4");
  });
  test("lets the browser choose when nothing matches or the check throws", () => {
    expect(pickMimeType(() => false)).toBeUndefined();
    expect(
      pickMimeType(() => {
        throw new Error("no");
      }),
    ).toBeUndefined();
  });
});

describe("formatElapsed", () => {
  test.each([
    [0, "0:00"],
    [7_400, "0:07"],
    [102_000, "1:42"],
    [-5, "0:00"],
  ])("%d ms → %s", (ms, text) => {
    expect(formatElapsed(ms)).toBe(text);
  });
});

describe("appendTranscript", () => {
  test("fills an empty box", () => {
    expect(appendTranscript("", " hello ")).toBe("hello");
    expect(appendTranscript("  ", "hello")).toBe("hello");
  });
  test("continues what is typed, with one space", () => {
    expect(appendTranscript("My question:", "what is jeevan?")).toBe(
      "My question: what is jeevan?",
    );
    expect(appendTranscript("line one\n", "line two")).toBe(
      "line one\nline two",
    );
  });
  test("leaves the box alone for an empty transcript", () => {
    expect(appendTranscript("typed", "  ")).toBe("typed");
  });
});

describe("errors", () => {
  test("maps getUserMedia rejections", () => {
    expect(micErrorReason({ name: "NotAllowedError" })).toBe("blocked");
    expect(micErrorReason({ name: "NotFoundError" })).toBe("no-mic");
    expect(micErrorReason(new Error("x"))).toBe("failed");
    expect(micErrorReason(null)).toBe("failed");
  });
  test("has a message for every failure", () => {
    expect(failureMessageKey("blocked")).toBe("micBlocked");
    expect(failureMessageKey("not-audio")).toBe("dictationFailed");
    expect(failureMessageKey("nothing-heard")).toBe("dictationNothingHeard");
  });
});
