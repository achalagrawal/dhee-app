import type { ModelMessage } from "ai";
import { describe, expect, test } from "vitest";
import {
  keepFor,
  planPrefetch,
  prefetchNote,
  type PrefetchResult,
  withPrefetchNote,
} from "./prefetch";

describe("planPrefetch", () => {
  test("a term question: search, look the term up, and find it word for word", () => {
    expect(planPrefetch("पात्रता क्या है?")).toEqual({
      search: "पात्रता क्या है?",
      lookups: ["पात्रता"],
      exact: "पात्रता",
    });
  });

  test("darshan terms in English are looked up in the lexicon's spelling", () => {
    const plan = planPrefetch(
      "What does sah-astitva mean for vyavastha in a family?",
    )!;
    expect(plan.lookups).toEqual(["सहअस्तित्व", "व्यवस्था"]);
    expect(plan.exact).toBeUndefined();
  });

  test("everyday words are not looked up", () => {
    const plan = planPrefetch(
      "मेरे बेटे से हर दिन बहस हो जाती है, क्या करूँ?",
    )!;
    expect(plan.lookups).not.toContain("क्या");
    expect(plan.lookups).not.toContain("मेरे");
    expect(plan.lookups.length).toBeLessThanOrEqual(5);
  });

  test("a quoted line is searched word for word", () => {
    expect(
      planPrefetch('यह पंक्ति कहाँ है: "मानव ही जागृति का आधार है"')!.exact,
    ).toBe("मानव ही जागृति का आधार है");
  });

  test("nothing for a message too short to search", () => {
    expect(planPrefetch("ok")).toBeNull();
    expect(planPrefetch("  🙏 ")).toBeNull();
  });

  test("the search query is capped", () => {
    expect([...planPrefetch("क".repeat(2000))!.search!].length).toBe(500);
  });
});

describe("keepFor", () => {
  test("no passages where the books don't help", () => {
    for (const kind of [
      "acknowledgement",
      "drafting",
      "practical",
      "crisis",
      "short-follow-up",
    ] as const) {
      expect(keepFor(kind)).toEqual({
        search: false,
        lookups: false,
        exact: false,
      });
    }
  });
  test("a personal question gets perspective, not a glossary", () => {
    expect(keepFor("personal")).toEqual({
      search: true,
      lookups: false,
      exact: false,
    });
  });
  test("no kind (a fixed tier) keeps everything", () => {
    expect(keepFor(undefined)).toEqual({
      search: true,
      lookups: true,
      exact: true,
    });
  });
});

describe("prefetchNote", () => {
  const results: PrefetchResult[] = [
    {
      tool: "searchWisdom",
      input: { query: "q" },
      output: '{"count":1,"results":[{"book_id":139,"page_no":4,"text":"…"}]}',
    },
    {
      tool: "lookupDefinition",
      input: { word: "पात्रता" },
      output: '{"count":1,"results":[{"hindi":"पात्रता"}],"related":[]}',
    },
    {
      tool: "lookupDefinition",
      input: { word: "करूँ" },
      output: '{"count":0,"results":[],"related":[]}',
    },
  ];

  test("carries what was found, as results of the tools, and drops misses", () => {
    const note = prefetchNote(results, undefined)!;
    expect(note.role).toBe("user");
    const text = String(note.content);
    expect(text).toContain("Result of searchWisdom");
    expect(text).toContain('Result of lookupDefinition({"word":"पात्रता"})');
    expect(text).not.toContain("करूँ");
    expect(text).toContain("not from the person");
  });

  test("shows only what the kind keeps, and nothing when that is empty", () => {
    const personal = String(prefetchNote(results, "personal")!.content);
    expect(personal).toContain("searchWisdom");
    expect(personal).not.toContain("lookupDefinition");
    expect(prefetchNote(results, "drafting")).toBeNull();
    expect(prefetchNote([], undefined)).toBeNull();
  });
});

test("withPrefetchNote puts the note after the question, before the reply so far", () => {
  const m = (content: string): ModelMessage => ({ role: "user", content });
  const note = m("NOTE");
  const out = withPrefetchNote(
    {
      search: [],
      recent: [m("earlier")],
      inputMessages: [],
      inputPrompt: [m("question")],
      existingResponses: [{ role: "assistant", content: "partial" }],
    },
    note,
  );
  expect(out.map((x) => String(x.content))).toEqual([
    "earlier",
    "question",
    "NOTE",
    "partial",
  ]);
});
