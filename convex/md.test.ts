import { afterEach, describe, expect, test, vi } from "vitest";
import { bookIdParam, exactPhraseOrClosest, lookupWithRecovery } from "./md";

/** Answers MCP tool calls from a table, SSE-framed like the real server. */
function stubMcp(
  answer: (name: string, args: Record<string, unknown>) => unknown,
) {
  const calls: Array<{ name: string; args: Record<string, unknown> }> = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url: string, init: RequestInit) => {
      const { params } = JSON.parse(String(init.body)) as {
        params: { name: string; arguments: Record<string, unknown> };
      };
      calls.push({ name: params.name, args: params.arguments });
      const text = JSON.stringify(answer(params.name, params.arguments));
      return new Response(
        `data: ${JSON.stringify({ result: { content: [{ type: "text", text }] } })}\n\n`,
      );
    }),
  );
  return calls;
}

const none = { count: 0, results: [], related: [] };
const entry = (hindi: string) => ({
  count: 1,
  results: [{ hindi, pageno: 193, paribhasha: ["…"] }],
  related: [],
});

afterEach(() => vi.unstubAllGlobals());

describe("md — lookups recover in the same call", () => {
  test("a hit is returned with a note on what its page number is", async () => {
    stubMcp(() => entry("जीवन"));
    const out = JSON.parse(await lookupWithRecovery("जीवन"));
    expect(out.results[0].hindi).toBe("जीवन");
    expect(out.about_pageno).toContain("readPage");
  });

  test("another spelling is tried when the first has no entry", async () => {
    const calls = stubMcp((_n, args) =>
      args.word === "सहअस्तित्व" ? entry("सहअस्तित्व") : none,
    );
    const out = JSON.parse(await lookupWithRecovery("सह-अस्तित्व"));
    expect(out.results[0].hindi).toBe("सहअस्तित्व");
    expect(out.note).toContain('"सहअस्तित्व"');
    expect(calls[0]!.args.word).toBe("सह-अस्तित्व");
  });

  test("a phrase falls back to the entries for its words", async () => {
    stubMcp((_n, args) =>
      args.word === "जीवन" || args.word === "क्रिया"
        ? entry(String(args.word))
        : none,
    );
    const out = JSON.parse(await lookupWithRecovery("जीवन क्रिया"));
    expect(out.count).toBe(0);
    expect(out.note).toContain("क्रिया, जीवन");
    expect(out.word_entries).toHaveLength(2);
  });

  test("a true miss says to search the books instead", async () => {
    stubMcp(() => none);
    const out = JSON.parse(await lookupWithRecovery("दुःख"));
    expect(out.count).toBe(0);
    expect(out.note).toContain("search the books");
  });
});

describe("md — exact search recovers in the same call", () => {
  test("nothing word for word → closest passages by meaning, labelled", async () => {
    const calls = stubMcp((name) =>
      name === "lexical_search_books"
        ? { count: 0, results: [] }
        : { count: 1, results: [{ book_id: 139, page_no: 4, text: "…" }] },
    );
    const out = JSON.parse(
      await exactPhraseOrClosest({ query: "कार्य कर्म अंतर पहचान" }),
    );
    expect(calls.map((c) => c.name)).toEqual([
      "lexical_search_books",
      "semantic_search",
    ]);
    expect(out.exact_matches).toBe(0);
    expect(out.note).toContain("closest passages by meaning");
    expect(out.note).toContain("one to three words");
  });

  test("hits, and the empty end of a later page, come back untouched", async () => {
    let calls = stubMcp(() => ({ count: 1, results: [{ text: "…" }] }));
    expect(
      JSON.parse(await exactPhraseOrClosest({ query: "समाधान" })).count,
    ).toBe(1);
    expect(calls).toHaveLength(1);
    calls = stubMcp(() => ({ count: 0, results: [] }));
    await exactPhraseOrClosest({ query: "समाधान", page: 3 });
    expect(calls).toHaveLength(1);
  });
});

// The MCP server takes `book_ids` as a comma-separated string. Passing a JSON
// array is rejected with `-32602 Invalid arguments` at call time — a failure
// no amount of type-checking catches, because the wire format isn't in the
// type system. Pinning the conversion here is the cheap way to keep it.

describe("md — book_ids wire format", () => {
  test("joins ids into the comma-separated string the server expects", () => {
    expect(bookIdParam([142, 110])).toEqual({ book_ids: "142,110" });
  });

  test("sends a single id without a trailing comma", () => {
    expect(bookIdParam([142])).toEqual({ book_ids: "142" });
  });

  test("omits the parameter entirely when there is no filter", () => {
    // Sending an empty filter would be read as "restrict to nothing".
    expect(bookIdParam(undefined)).toEqual({});
    expect(bookIdParam([])).toEqual({});
  });
});
