// A small markdown parser for assistant replies. See
// docs/build/specs/markdown-replies.md.
//
// Why not a library: everything on npm either targets the DOM or ships a full
// CommonMark implementation plus a renderer we'd have to restyle anyway. What
// the chat bubble needs is a subset — emphasis, lists, quotes, code — parsed
// into a shape React Native primitives can draw.
//
// The parser runs on every stream delta, over text that is routinely cut
// mid-token. Two properties matter more than fidelity to the spec:
//
//   1. It never throws. Every input has a parse; the fallback is literal text.
//   2. An unclosed delimiter stays literal. Emphasis takes effect when it
//      closes, so the tail of a message never bolds and then un-bolds itself
//      one keystroke later.

/** A run of text with the marks that apply to it. Marks nest by combining. */
export type Span = {
  text: string;
  bold?: boolean;
  italic?: boolean;
  strike?: boolean;
  code?: boolean;
  href?: string;
};

export type Block =
  | { type: "paragraph"; spans: Span[] }
  | { type: "heading"; level: 1 | 2 | 3; spans: Span[] }
  | { type: "quote"; spans: Span[] }
  | {
      type: "item";
      ordered: boolean;
      marker: string;
      depth: number;
      spans: Span[];
    }
  | { type: "code"; text: string; lang?: string }
  | { type: "rule" };

const FENCE = /^ {0,3}(`{3,}|~{3,})\s*([^\s`]*)/;
const HEADING = /^ {0,3}(#{1,6})[ \t]+(.*)$/;
const RULE = /^ {0,3}(?:-{3,}|\*{3,}|_{3,})[ \t]*$/;
const QUOTE = /^ {0,3}>[ \t]?(.*)$/;
const BULLET = /^([ \t]*)[-*+][ \t]+(.*)$/;
const ORDERED = /^([ \t]*)(\d{1,9})[.)][ \t]+(.*)$/;

// One level of nesting is all a chat reply ever needs, and capping it keeps a
// stray indent from marching the text off the right edge.
const MAX_DEPTH = 1;

// Blocks that keep taking lines: a following plain line continues them rather
// than starting a paragraph of its own (CommonMark's lazy continuation).
type OpenBlock = { type: "paragraph" | "quote" | "item"; lines: string[] };

type Draft =
  | ({ type: "paragraph" } & OpenBlock)
  | ({ type: "quote" } & OpenBlock)
  | ({
      type: "item";
      ordered: boolean;
      marker: string;
      depth: number;
    } & OpenBlock)
  | { type: "heading"; level: 1 | 2 | 3; text: string }
  | { type: "code"; text: string; lang?: string }
  | { type: "rule" };

function depthOf(indent: string): number {
  // A tab, or two spaces, is one level — the shapes a model actually emits.
  const width = indent.replace(/\t/g, "  ").length;
  return Math.min(MAX_DEPTH, Math.floor(width / 2));
}

/** The drafts a following plain line can continue. */
type OpenDraft = Extract<Draft, { lines: string[] }>;

export function parseMarkdown(source: string): Block[] {
  const lines = source.replace(/\r\n?/g, "\n").split("\n");
  const drafts: Draft[] = [];
  // The block a plain line would continue, or null after a blank line or a
  // block that can't take more (heading, fence, rule). It is what `push`
  // returns rather than something it assigns, so the type stays honest.
  let open: OpenDraft | null = null;

  const push = (draft: Draft): OpenDraft | null => {
    drafts.push(draft);
    return "lines" in draft ? draft : null;
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? "";

    const fence = FENCE.exec(line);
    if (fence) {
      const marker = fence[1] ?? "```";
      const closer = new RegExp(
        `^ {0,3}${marker[0]}{${marker.length},}[ \t]*$`,
      );
      const body: string[] = [];
      // Runs to the end of the input when the fence hasn't closed yet, which
      // is the mid-stream case: the block grows, rather than appearing whole
      // once the closing fence lands.
      for (i++; i < lines.length; i++) {
        if (closer.test(lines[i] ?? "")) break;
        body.push(lines[i] ?? "");
      }
      open = push({
        type: "code",
        text: body.join("\n"),
        lang: fence[2] || undefined,
      });
      continue;
    }

    if (!line.trim()) {
      open = null;
      continue;
    }

    const heading = HEADING.exec(line);
    if (heading) {
      const hashes = (heading[1] ?? "#").length;
      open = push({
        type: "heading",
        level: Math.min(3, hashes) as 1 | 2 | 3,
        // Trailing hashes are decoration in `## Title ##`, not content.
        text: (heading[2] ?? "").replace(/[ \t]+#+[ \t]*$/, "").trim(),
      });
      continue;
    }

    // Ahead of the bullet check, so a `---` separator isn't read as a bullet
    // holding two dashes.
    if (RULE.test(line)) {
      open = push({ type: "rule" });
      continue;
    }

    const quote = QUOTE.exec(line);
    if (quote) {
      if (open?.type === "quote") open.lines.push((quote[1] ?? "").trim());
      else open = push({ type: "quote", lines: [(quote[1] ?? "").trim()] });
      continue;
    }

    const bullet = BULLET.exec(line);
    if (bullet) {
      open = push({
        type: "item",
        ordered: false,
        marker: "•",
        depth: depthOf(bullet[1] ?? ""),
        lines: [(bullet[2] ?? "").trim()],
      });
      continue;
    }

    const ordered = ORDERED.exec(line);
    if (ordered) {
      open = push({
        type: "item",
        ordered: true,
        // The author's own numbering, so a list starting at 3 still says 3.
        marker: `${ordered[2] ?? "1"}.`,
        depth: depthOf(ordered[1] ?? ""),
        lines: [(ordered[3] ?? "").trim()],
      });
      continue;
    }

    if (open) open.lines.push(line.trim());
    else open = push({ type: "paragraph", lines: [line.trim()] });
  }

  const blocks: Block[] = [];
  for (const draft of drafts) {
    switch (draft.type) {
      case "code":
        blocks.push({ type: "code", text: draft.text, lang: draft.lang });
        break;
      case "rule":
        blocks.push({ type: "rule" });
        break;
      case "heading":
        if (draft.text)
          blocks.push({
            type: "heading",
            level: draft.level,
            spans: parseInline(draft.text),
          });
        break;
      case "item":
        blocks.push({
          type: "item",
          ordered: draft.ordered,
          marker: draft.marker,
          depth: draft.depth,
          spans: parseInline(draft.lines.join("\n")),
        });
        break;
      default: {
        const text = draft.lines.join("\n");
        if (text) blocks.push({ type: draft.type, spans: parseInline(text) });
      }
    }
  }
  return blocks;
}

const ESCAPABLE = /[\\`*_~[\]()#>+\-.!]/;
const PUNCT_OR_SPACE = /[\s!-/:-@[-`{-~]/;

/**
 * Split a line into styled runs. `base` carries the marks of the enclosing
 * span, so `**bold with *emphasis*** ` comes out as one bold run and one
 * bold-italic run.
 */
export function parseInline(
  source: string,
  base: Omit<Span, "text"> = {},
): Span[] {
  const spans: Span[] = [];
  let buffer = "";

  const flush = () => {
    if (buffer) spans.push({ ...base, text: buffer });
    buffer = "";
  };
  const nest = (inner: string, marks: Omit<Span, "text">) => {
    flush();
    spans.push(...parseInline(inner, { ...base, ...marks }));
  };

  let i = 0;
  while (i < source.length) {
    const ch = source[i] ?? "";
    const rest = source.slice(i);

    // A backslash before punctuation means the punctuation, literally — the
    // way to write an asterisk that stays an asterisk.
    if (ch === "\\" && ESCAPABLE.test(source[i + 1] ?? "")) {
      buffer += source[i + 1];
      i += 2;
      continue;
    }

    if (ch === "`") {
      const run = /^`+/.exec(rest)?.[0] ?? "`";
      const close = source.indexOf(run, i + run.length);
      if (close !== -1) {
        flush();
        spans.push({
          ...base,
          code: true,
          text: source.slice(i + run.length, close).trim(),
        });
        i = close + run.length;
        continue;
      }
    }

    if (!base.code) {
      const link = /^\[([^\]\n]*)\]\(([^\s)]+)\)/.exec(rest);
      if (link) {
        nest(link[1] ?? "", { href: link[2] });
        i += link[0].length;
        continue;
      }

      const pair = rest.startsWith("**")
        ? { delim: "**", marks: { bold: true } }
        : rest.startsWith("__")
          ? { delim: "__", marks: { bold: true } }
          : rest.startsWith("~~")
            ? { delim: "~~", marks: { strike: true } }
            : ch === "*"
              ? { delim: "*", marks: { italic: true } }
              : ch === "_"
                ? { delim: "_", marks: { italic: true } }
                : null;

      if (pair) {
        const inner = emphasized(source, i, pair.delim);
        if (inner !== null) {
          nest(inner, pair.marks);
          i += pair.delim.length * 2 + inner.length;
          continue;
        }
      }
    }

    buffer += ch;
    i++;
  }

  flush();
  return spans;
}

/**
 * The text a delimiter opened at `start` encloses, or null if it doesn't
 * enclose anything — which is the mid-stream case, and also `2 * 3 * 4` and
 * `snake_case`. Null means "leave the character alone as text".
 */
function emphasized(
  source: string,
  start: number,
  delim: string,
): string | null {
  const from = start + delim.length;
  const opensWord = !/\s/.test(source[from] ?? "");
  if (!opensWord) return null;
  // Underscores turn up inside identifiers far more often than they mean
  // emphasis, so they only open one at a word boundary.
  if (delim.startsWith("_")) {
    const before = source[start - 1];
    if (before !== undefined && !PUNCT_OR_SPACE.test(before)) return null;
  }

  let at = from;
  while (at < source.length) {
    let close = source.indexOf(delim, at);
    if (close === -1) return null;
    if (close === from) {
      at = close + delim.length;
      continue;
    }
    // `***both***` closes on the last two of the three, leaving the odd one
    // inside for the nested pass to read as italic.
    const run = /^[*_~]+/.exec(source.slice(close))?.[0].length ?? delim.length;
    if (source[close] === delim[0] && run > delim.length) {
      close += run - delim.length;
    }
    const closesWord = !/\s/.test(source[close - 1] ?? " ");
    const boundaryAfter =
      !delim.startsWith("_") ||
      source[close + delim.length] === undefined ||
      PUNCT_OR_SPACE.test(source[close + delim.length] ?? " ");
    if (closesWord && boundaryAfter) return source.slice(from, close);
    at = close + delim.length;
  }
  return null;
}
