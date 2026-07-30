import { describe, expect, it } from "vitest";
import { capPassages, PASSAGE_CHAR_BUDGET, trimToSentence } from "./passages";

const envelope = (results: unknown[], extra: Record<string, unknown> = {}) =>
  JSON.stringify({
    count: results.length,
    query: "q",
    page: 1,
    results,
    ...extra,
  });

const parse = (raw: string) =>
  JSON.parse(raw) as {
    results: { text?: string; truncated?: boolean; score?: number }[];
    note?: string;
    count?: number;
    has_more?: boolean;
  };

describe("trimToSentence", () => {
  it("leaves text that already fits completely alone", () => {
    expect(trimToSentence("Short enough.", 100)).toBe("Short enough.");
  });

  it("cuts at the last full stop inside the budget", () => {
    const text =
      "One sentence. Two sentence. Three sentence that runs on and on.";
    expect(trimToSentence(text, 30)).toBe("One sentence. Two sentence.");
  });

  it("understands the Devanagari danda as a sentence end", () => {
    const text =
      "पहला वाक्य । दूसरा वाक्य । तीसरा वाक्य जो बहुत लंबा चलता है और रुकता नहीं ।";
    const out = trimToSentence(text, 30);
    expect(out.endsWith("।")).toBe(true);
    expect(out.length).toBeLessThanOrEqual(30);
  });

  it("falls back to a word boundary when no sentence ends early enough", () => {
    const text = "a ".repeat(200);
    const out = trimToSentence(text, 40);
    expect(out.length).toBeLessThanOrEqual(40);
    expect(out.endsWith(" ")).toBe(false);
  });

  it("never returns more than the budget", () => {
    const text =
      "no punctuation here just one very long unbroken run of words".repeat(20);
    expect(trimToSentence(text, 50).length).toBeLessThanOrEqual(50);
  });
});

describe("capPassages", () => {
  it("shortens a long passage and flags it", () => {
    const long = "क्रिया पूर्णता का अर्थ यही है । ".repeat(60);
    const out = parse(
      capPassages(envelope([{ book_id: 1, page_no: 2, text: long }]), 200),
    );
    expect(out.results[0]!.text!.length).toBeLessThanOrEqual(200);
    expect(out.results[0]!.truncated).toBe(true);
    expect(out.note).toContain("readPage");
  });

  it("leaves short passages untouched and adds no note", () => {
    const out = parse(capPassages(envelope([{ text: "Brief." }]), 200));
    expect(out.results[0]!.text).toBe("Brief.");
    expect(out.results[0]!.truncated).toBeUndefined();
    expect(out.note).toBeUndefined();
  });

  it("leaves a realistic search result completely untouched at the default budget", () => {
    // The point of the default: it is a ceiling against an upstream change, not
    // a token budget. A passage of the size the corpus service actually returns
    // must pass through whole — a result is ranked as a passage, not sentence
    // by sentence, so the line that answers the question can sit anywhere in it
    // and trimming the tail can remove exactly the part that mattered.
    const realistic = "यह एक वाक्य है जो अर्थ पूरा करता है । ".repeat(30);
    expect(realistic.length).toBeLessThan(PASSAGE_CHAR_BUDGET);

    const out = parse(capPassages(envelope([{ text: realistic }])));
    expect(out.results[0]!.text).toBe(realistic);
    expect(out.results[0]!.truncated).toBeUndefined();
    expect(out.note).toBeUndefined();
  });

  it("still catches a passage large enough to be an upstream defect", () => {
    // The case the ceiling exists for: something returns an entire chapter.
    const runaway = "एक लंबा वाक्य जो चलता ही जाता है । ".repeat(400);
    expect(runaway.length).toBeGreaterThan(PASSAGE_CHAR_BUDGET);

    const out = parse(capPassages(envelope([{ text: runaway }])));
    expect(out.results[0]!.text!.length).toBeLessThanOrEqual(
      PASSAGE_CHAR_BUDGET,
    );
    expect(out.results[0]!.truncated).toBe(true);
    // The note has to tell the model the text is incomplete, not merely tidied.
    expect(out.note).toContain("missing");
    expect(out.note).toContain("readPage");
  });

  it("drops the ranker score, which the model never reads", () => {
    const out = parse(
      capPassages(envelope([{ text: "Brief.", score: 0.47 }]), 200),
    );
    expect(out.results[0]!.score).toBeUndefined();
  });

  it("keeps every result rather than dropping any", () => {
    // Breadth is what search is for — six distinct sources stay six. Only the
    // depth of each is trimmed, because readPage can restore that on demand.
    const long = "A sentence that goes on. ".repeat(40);
    const out = parse(
      capPassages(
        envelope(Array.from({ length: 6 }, () => ({ text: long }))),
        100,
      ),
    );
    expect(out.results).toHaveLength(6);
  });

  it("preserves envelope metadata the model needs for paging", () => {
    const out = parse(
      capPassages(envelope([{ text: "Brief." }], { has_more: true }), 200),
    );
    expect(out.has_more).toBe(true);
    expect(out.count).toBe(1);
  });

  it("passes anything it cannot parse straight through", () => {
    // This sits between a remote server and the model. An unexpected shape must
    // reach the model as-is rather than be mangled into something else.
    expect(capPassages("not json at all")).toBe("not json at all");
    expect(capPassages('"a bare string"')).toBe('"a bare string"');
    expect(capPassages("[1,2,3]")).toBe("[1,2,3]");
    expect(capPassages('{"error":"upstream unavailable"}')).toBe(
      '{"error":"upstream unavailable"}',
    );
  });

  it("survives results that are not objects, or carry no text", () => {
    const out = parse(capPassages(envelope([null, 42, { book_id: 3 }]), 100));
    expect(out.results).toHaveLength(3);
  });

  it("is idempotent — trimming an already-trimmed envelope changes nothing", () => {
    const long =
      "One. Two. Three. Four. Five. Six. Seven. Eight. Nine. Ten. ".repeat(10);
    const once = capPassages(envelope([{ text: long }]), 120);
    expect(capPassages(once, 120)).toBe(once);
  });
});
