import { describe, expect, test } from "vitest";
import { parseInline, parseMarkdown, type Span } from "./markdown";

// The parser behind formatted assistant replies. See
// docs/build/specs/markdown-replies.md. Pure input → output, which is why it
// is tested here and the rendering is checked by eye against the mockup.

/** The plain reading of a set of spans — what a person would see, unstyled. */
const flatten = (spans: Span[]) => spans.map((s) => s.text).join("");

describe("blocks", () => {
  test("a blank line separates paragraphs; a single newline stays inside one", () => {
    const blocks = parseMarkdown("First thought.\nstill first.\n\nSecond.");
    expect(blocks).toHaveLength(2);
    expect(blocks[0]).toMatchObject({ type: "paragraph" });
    expect(flatten((blocks[0] as { spans: Span[] }).spans)).toBe(
      "First thought.\nstill first.",
    );
    expect(flatten((blocks[1] as { spans: Span[] }).spans)).toBe("Second.");
  });

  test("headings cap at three levels and drop closing hashes", () => {
    expect(parseMarkdown("# One")).toMatchObject([
      { type: "heading", level: 1 },
    ]);
    expect(parseMarkdown("###### Six")).toMatchObject([
      { type: "heading", level: 3 },
    ]);
    const [closed] = parseMarkdown("## Title ##");
    expect(flatten((closed as { spans: Span[] }).spans)).toBe("Title");
  });

  test("a hash without a space is not a heading", () => {
    expect(parseMarkdown("#notaheading")).toMatchObject([
      { type: "paragraph" },
    ]);
  });

  test("bullets take any of the three markers", () => {
    const blocks = parseMarkdown("- one\n* two\n+ three");
    expect(blocks).toHaveLength(3);
    expect(blocks.every((b) => b.type === "item" && !b.ordered)).toBe(true);
  });

  test("ordered lists keep the author's own numbering", () => {
    const blocks = parseMarkdown("3. third\n4) fourth");
    expect(blocks).toMatchObject([
      { type: "item", ordered: true, marker: "3." },
      { type: "item", ordered: true, marker: "4." },
    ]);
  });

  test("an indented bullet nests one level, and no further", () => {
    const blocks = parseMarkdown("- top\n  - under\n      - way under");
    expect(blocks.map((b) => (b.type === "item" ? b.depth : -1))).toEqual([
      0, 1, 1,
    ]);
  });

  test("a line after a list item continues that item", () => {
    const blocks = parseMarkdown("- something\n  that wrapped");
    expect(blocks).toHaveLength(1);
    expect(flatten((blocks[0] as { spans: Span[] }).spans)).toBe(
      "something\nthat wrapped",
    );
  });

  test("consecutive quote lines are one quote", () => {
    const blocks = parseMarkdown("> a line\n> and another\n\nafter");
    expect(blocks).toHaveLength(2);
    expect(flatten((blocks[0] as { spans: Span[] }).spans)).toBe(
      "a line\nand another",
    );
  });

  test("a fenced block keeps its text verbatim, indentation and all", () => {
    const blocks = parseMarkdown("```py\nif x:\n    go()\n```\nafter");
    expect(blocks[0]).toEqual({
      type: "code",
      lang: "py",
      text: "if x:\n    go()",
    });
    expect(blocks[1]).toMatchObject({ type: "paragraph" });
  });

  test("a rule is a rule, not a bullet holding dashes", () => {
    expect(parseMarkdown("---")).toEqual([{ type: "rule" }]);
    expect(parseMarkdown("***")).toEqual([{ type: "rule" }]);
  });

  test("empty and whitespace-only input produce no blocks", () => {
    expect(parseMarkdown("")).toEqual([]);
    expect(parseMarkdown("   \n\n  ")).toEqual([]);
  });
});

describe("inline marks", () => {
  test("bold, italic, strike and code each mark their run", () => {
    expect(parseInline("a **b** c")).toEqual([
      { text: "a " },
      { text: "b", bold: true },
      { text: " c" },
    ]);
    expect(parseInline("_soft_")).toEqual([{ text: "soft", italic: true }]);
    expect(parseInline("~~gone~~")).toEqual([{ text: "gone", strike: true }]);
    expect(parseInline("`x = 1`")).toEqual([{ text: "x = 1", code: true }]);
  });

  test("marks nest", () => {
    expect(parseInline("**bold and *both***")).toEqual([
      { text: "bold and ", bold: true },
      { text: "both", bold: true, italic: true },
    ]);
  });

  test("markdown inside code is text", () => {
    expect(parseInline("`a **b** c`")).toEqual([
      { text: "a **b** c", code: true },
    ]);
  });

  test("a link carries its href", () => {
    expect(parseInline("see [the page](https://dhee.app/x) now")).toEqual([
      { text: "see " },
      { text: "the page", href: "https://dhee.app/x" },
      { text: " now" },
    ]);
  });

  test("arithmetic and identifiers are left alone", () => {
    expect(flatten(parseInline("2 * 3 * 4"))).toBe("2 * 3 * 4");
    expect(parseInline("2 * 3 * 4").some((s) => s.italic)).toBe(false);
    expect(parseInline("snake_case_name")).toEqual([
      { text: "snake_case_name" },
    ]);
  });

  test("a backslash escapes the punctuation after it", () => {
    expect(parseInline("\\*not bold\\*")).toEqual([{ text: "*not bold*" }]);
  });
});

describe("mid-stream text", () => {
  test("an unclosed delimiter stays literal", () => {
    expect(parseInline("he said **some")).toEqual([{ text: "he said **some" }]);
    expect(parseInline("half `code")).toEqual([{ text: "half `code" }]);
    expect(parseInline("[label](htt")).toEqual([{ text: "[label](htt" }]);
  });

  test("an unclosed fence captures the rest of the reply", () => {
    expect(parseMarkdown("here:\n```\nline one\nline two")).toMatchObject([
      { type: "paragraph" },
      { type: "code", text: "line one\nline two" },
    ]);
  });

  test("every prefix of a formatted reply parses, and only completes marks", () => {
    const reply = [
      "# Heading",
      "",
      "Some **bold** and *soft* words, `code`, [a link](https://dhee.app).",
      "",
      "- one",
      "- two",
      "",
      "> a quote",
      "",
      "```js",
      "const x = 1;",
      "```",
      "",
      "Closing thought.",
    ].join("\n");

    // Everything the model has sent is on screen at every prefix — formatted
    // where a mark has closed, literal where it hasn't yet. Compared with the
    // markdown punctuation and whitespace taken off both sides, since that is
    // exactly what the parser is allowed to move around.
    const strip = (text: string) => text.replace(/[\s*_~`#>+•[\]()-]/g, "");
    const shown = (blocks: ReturnType<typeof parseMarkdown>) =>
      blocks
        .map((b) =>
          b.type === "code"
            ? `${b.lang ?? ""}${b.text}`
            : b.type === "rule"
              ? ""
              : b.spans.map((s) => `${s.text}${s.href ?? ""}`).join(""),
        )
        .join("");

    for (let i = 1; i <= reply.length; i++) {
      const partial = reply.slice(0, i);
      expect(strip(shown(parseMarkdown(partial)))).toBe(strip(partial));
    }

    // heading, paragraph, two items, quote, fence, closing paragraph.
    expect(parseMarkdown(reply).map((b) => b.type)).toEqual([
      "heading",
      "paragraph",
      "item",
      "item",
      "quote",
      "code",
      "paragraph",
    ]);
  });
});
