import { describe, expect, test } from "vitest";
import {
  activeActivity,
  activityText,
  activityTrail,
  type Activity,
  type MessagePart,
} from "./activity";

// A tool part at each of the states the agent streams it through.
function call(
  toolCallId: string,
  toolName: string,
  state: string,
  input?: unknown,
): MessagePart {
  return { type: `tool-${toolName}`, toolCallId, state, input };
}

// The one activity a single-call turn produces.
function one(parts: MessagePart[]): Activity {
  const [activity, ...rest] = activityTrail(parts);
  if (!activity || rest.length > 0) throw new Error("expected one activity");
  return activity;
}

describe("activityTrail", () => {
  test("ignores everything that isn't a tool call", () => {
    expect(
      activityTrail([
        { type: "step-start" },
        { type: "text", state: "streaming" },
        { type: "reasoning", state: "done" },
      ]),
    ).toEqual([]);
  });

  test("reads a search, its query, and whether it has come back", () => {
    const parts = [
      call("a", "searchWisdom", "output-available", {
        query: "should I take this job",
      }),
    ];
    expect(activityTrail(parts)).toEqual([
      { id: "a", kind: "search", detail: "should I take this job", done: true },
    ]);
  });

  test("keeps the turn's steps in order, oldest first", () => {
    const trail = activityTrail([
      call("a", "searchWisdom", "output-available", { query: "grief" }),
      { type: "step-start" },
      call("b", "lookupDefinition", "input-available", { word: "जीवन" }),
    ]);
    expect(trail.map((a) => a.kind)).toEqual(["search", "paribhasha"]);
    expect(trail.map((a) => a.done)).toEqual([true, false]);
  });

  test("a call still streaming its input gets no detail rather than half a word", () => {
    // The agent leaves `input` undefined until the whole JSON object parses.
    expect(
      activityTrail([call("a", "searchWisdom", "input-streaming")]),
    ).toEqual([{ id: "a", kind: "search", detail: undefined, done: false }]);
  });

  test("a later part for the same call replaces the earlier one", () => {
    const trail = activityTrail([
      call("a", "searchWisdom", "input-streaming"),
      call("a", "searchWisdom", "output-available", { query: "loneliness" }),
    ]);
    expect(trail).toEqual([
      { id: "a", kind: "search", detail: "loneliness", done: true },
    ]);
  });

  test("a detail already read is not lost to a later part that omits it", () => {
    const trail = activityTrail([
      call("a", "searchWisdom", "input-available", { query: "loneliness" }),
      { type: "tool-searchWisdom", toolCallId: "a", state: "output-available" },
    ]);
    expect(trail).toEqual([
      { id: "a", kind: "search", detail: "loneliness", done: true },
    ]);
  });

  test("a step that has come back is never walked back to running", () => {
    // The saved step message and the live stream both carry the call, and they
    // don't arrive in one order.
    const trail = activityTrail([
      call("a", "searchWisdom", "output-available", { query: "grief" }),
      call("a", "searchWisdom", "input-available", { query: "grief" }),
    ]);
    expect(trail).toEqual([
      { id: "a", kind: "search", detail: "grief", done: true },
    ]);
  });

  test("a failed call counts as finished, not as still running", () => {
    expect(
      one([call("a", "readPage", "output-error", { bookId: 3, pageNo: 42 })])
        .done,
    ).toBe(true);
  });

  test("maps every tool Dhee has, and falls back for one it doesn't", () => {
    const kinds = activityTrail([
      call("a", "searchWisdom", "input-available", { query: "q" }),
      call("b", "searchExactPhrase", "input-available", { query: "q" }),
      call("c", "lookupDefinition", "input-available", { word: "w" }),
      call("d", "readPage", "input-available", { bookId: 1, pageNo: 7 }),
      call("e", "listBooks", "input-available", {}),
      call("f", "readBookToc", "input-available", { bookId: 1 }),
      call("g", "somethingNew", "input-available", { whatever: true }),
    ]).map((a) => a.kind);
    expect(kinds).toEqual([
      "search",
      "phrase",
      "paribhasha",
      "page",
      "books",
      "toc",
      "other",
    ]);
  });

  test("reads a dynamic tool's name off the part", () => {
    const trail = activityTrail([
      {
        type: "dynamic-tool",
        toolName: "lookupDefinition",
        toolCallId: "a",
        state: "input-available",
        input: { word: "व्यवस्था" },
      },
    ]);
    expect(trail).toEqual([
      { id: "a", kind: "paribhasha", detail: "व्यवस्था", done: false },
    ]);
  });

  test("a page number becomes a detail even though it arrives as a number", () => {
    expect(
      one([call("a", "readPage", "input-available", { bookId: 3, pageNo: 42 })])
        .detail,
    ).toBe("42");
  });

  test("a long query is cut to one line's worth", () => {
    const query = "why does more money never make the wanting stop for anyone";
    const detail =
      one([call("a", "searchWisdom", "input-available", { query })]).detail ??
      "";
    expect(detail.length).toBeLessThanOrEqual(49);
    expect(detail.endsWith("…")).toBe(true);
    expect(query.startsWith(detail.slice(0, -1))).toBe(true);
  });
});

describe("activeActivity", () => {
  test("is the first step still waiting on its result", () => {
    const trail = activityTrail([
      call("a", "searchWisdom", "output-available", { query: "grief" }),
      call("b", "readPage", "input-available", { bookId: 1, pageNo: 12 }),
    ]);
    expect(activeActivity(trail)?.id).toBe("b");
  });

  test("is nothing once everything has come back", () => {
    const trail = activityTrail([
      call("a", "searchWisdom", "output-available", { query: "grief" }),
    ]);
    expect(activeActivity(trail)).toBeNull();
  });
});

describe("activityText", () => {
  test("names what is being looked at, not the tool", () => {
    const search = one([
      call("a", "searchWisdom", "input-available", { query: "leaving home" }),
    ]);
    expect(activityText("en", search)).toBe(
      "Searching the books for “leaving home”",
    );
    expect(activityText("hi", search)).toContain("leaving home");
  });

  test("falls back to the generic line while the input is still streaming", () => {
    const search = one([call("a", "searchWisdom", "input-streaming")]);
    expect(activityText("en", search)).toBe("Searching the books");
    expect(activityText("en", search)).not.toContain("%s");
  });

  test("every kind has a line in both languages, and none leaks a placeholder", () => {
    const trail = activityTrail([
      call("a", "searchWisdom", "input-available", { query: "q" }),
      call("b", "searchExactPhrase", "input-available", { query: "q" }),
      call("c", "lookupDefinition", "input-available", { word: "w" }),
      call("d", "readPage", "input-available", { pageNo: 7 }),
      call("e", "listBooks", "input-available", {}),
      call("f", "readBookToc", "input-available", { bookId: 1 }),
      call("g", "somethingNew", "input-available", {}),
    ]);
    for (const activity of trail) {
      for (const lang of ["en", "hi"] as const) {
        const text = activityText(lang, activity);
        expect(text.length).toBeGreaterThan(0);
        expect(text).not.toContain("%s");
      }
    }
  });

  test("never renders a raw tool name", () => {
    const unknown = one([call("a", "someInternalTool", "input-available", {})]);
    expect(activityText("en", unknown)).not.toContain("someInternalTool");
  });
});
