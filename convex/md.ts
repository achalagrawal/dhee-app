import { v } from "convex/values";
import { internalAction } from "./_generated/server";
import {
  type Book,
  LEXICON_PAGE_NOTE,
  annotate,
  explainPageError,
  isEmpty,
  parseEnvelope,
  phraseWords,
  spellingVariants,
  wordCount,
} from "./lib/corpusRecovery";
import { callMcpTool } from "./lib/mcp";
import { capPassages } from "./lib/passages";

// Retrieval layer over the MD corpus MCP server. These are internal-only:
// the client never touches the corpus directly, it reaches it through the
// agent's tool calls in convex/tools/md.ts.
//
// These are deliberately thin. There used to be a shaping layer here
// (convex/lib/mdShape.ts) that deduped passages, stitched overlapping chunks,
// capped runaway lexicon lookups, stripped HTML and flagged front matter. The
// server now does all of it at the source — it guarantees one passage per
// distinct (book, page), merges overlaps on the shared text, returns the exact
// lexicon term plus the *names* of related ones, emits match offsets instead of
// markup, and marks front matter with `is_front_matter`. Every tool returns one
// JSON envelope of `{ count, ...metadata, results: [...] }`.
//
// Shaping it again here would only risk truncating twice, so it is gone. If
// payload size becomes a problem again, measure before adding a layer back:
// tool results are no longer replayed on later turns (see REPLY_CONTEXT_OPTIONS
// in convex/chat.ts), so their cost is paid once per turn rather than forever.
//
// What this layer does do is recover from an empty answer inside the same
// call — another spelling, the closest passages by meaning, which ids exist —
// because an empty answer costs the model a whole extra round to find out.
// See convex/lib/corpusRecovery.ts.

/**
 * The server takes `book_ids` as a comma-separated string, not a JSON array —
 * passing an array is rejected with `-32602 Invalid arguments`. The tool layer
 * and these actions use `number[]` because that is what the model and the type
 * system want; the conversion belongs here, at the wire boundary.
 */
export function bookIdParam(bookIds: number[] | undefined) {
  return bookIds === undefined || bookIds.length === 0
    ? {}
    : { book_ids: bookIds.join(",") };
}

export async function semanticSearchText({
  query,
  topK,
  page,
  bookIds,
}: {
  query: string;
  topK?: number;
  page?: number;
  bookIds?: number[];
}): Promise<string> {
  // Breadth stays; depth is capped. Six distinct sources is what makes a
  // search worth running, so the count is untouched — `capPassages` shortens
  // each passage instead, which is the half `readPage` can restore on demand.
  return capPassages(
    await callMcpTool("semantic_search", {
      query,
      // Six distinct sources. This was briefly raised to compensate for the
      // server spending slots on repeats of one page; that defect is fixed at
      // the source, so six again means six.
      topK: topK ?? 6,
      rerank: true,
      ...(page === undefined ? {} : { page }),
      ...bookIdParam(bookIds),
    }),
  );
}

export const semanticSearch = internalAction({
  args: {
    query: v.string(),
    topK: v.optional(v.number()),
    page: v.optional(v.number()),
    bookIds: v.optional(v.array(v.number())),
  },
  returns: v.string(),
  handler: async (_ctx, args) => await semanticSearchText(args),
});

export async function lexicalSearchText({
  query,
  page,
  bookIds,
}: {
  query: string;
  page?: number;
  bookIds?: number[];
}): Promise<string> {
  // Same treatment as the semantic search: this returns passages too, and its
  // long tail is the wider of the two.
  return capPassages(
    await callMcpTool("lexical_search_books", {
      query,
      page: page ?? 1,
      ...bookIdParam(bookIds),
    }),
  );
}

/** Exact phrase, recovering in the same call when nothing contains it. */
export async function exactPhraseOrClosest(args: {
  query: string;
  page?: number;
  bookIds?: number[];
}): Promise<string> {
  const exact = await lexicalSearchText(args);
  const envelope = parseEnvelope(exact);
  // Only the first page of a search that found nothing. A later page that is
  // empty is the end of a real result list, not a miss.
  if (!isEmpty(envelope) || (args.page ?? 1) > 1) return exact;
  // Models use exact search as a keyword search, and a bundle of keywords
  // rarely occurs verbatim. Rather than hand back nothing and let the model
  // spend a round finding that out, answer with the closest passages by
  // meaning, and say so plainly so nothing is cited as an exact occurrence.
  const closest = parseEnvelope(
    await semanticSearchText({ query: args.query, bookIds: args.bookIds }),
  );
  if (!closest) return exact;
  const hint =
    wordCount(args.query) > 3
      ? " Exact search works with one to three words; search for a single term rather than several keywords."
      : "";
  return annotate(closest, {
    exact_matches: 0,
    note: `No passage contains "${args.query}" word for word. These are the closest passages by meaning instead — don't present them as occurrences of the phrase.${hint}`,
  });
}

export const lexicalSearch = internalAction({
  args: {
    query: v.string(),
    page: v.optional(v.number()),
    bookIds: v.optional(v.array(v.number())),
  },
  returns: v.string(),
  handler: async (_ctx, args) => await exactPhraseOrClosest(args),
});

async function lookupOnce(word: string, exactOnly?: boolean) {
  return await callMcpTool("lookup_paribhasha", {
    word,
    ...(exactOnly === undefined ? {} : { exact_only: exactOnly }),
  });
}

/**
 * An exact lookup with no recovery: for the app's own prefetch, which only
 * wants words that really are entries. A hit carries the page note.
 */
export async function lookupExactOnly(word: string): Promise<string> {
  const text = await lookupOnce(word, true);
  const envelope = parseEnvelope(text);
  return envelope && !isEmpty(envelope)
    ? annotate(envelope, { about_pageno: LEXICON_PAGE_NOTE })
    : text;
}

/**
 * A paribhasha lookup that tries other spellings, then the words of a phrase,
 * before giving up — all in the one call. Every answer carries a note on what
 * its `pageno` is, because models were citing the lexicon's page numbers as
 * pages of real books and trying to open them with readPage.
 */
export async function lookupWithRecovery(
  word: string,
  exactOnly?: boolean,
): Promise<string> {
  const first = await lookupOnce(word, exactOnly);
  const envelope = parseEnvelope(first);
  if (!envelope) return first;
  if (!isEmpty(envelope)) {
    return annotate(envelope, { about_pageno: LEXICON_PAGE_NOTE });
  }

  // Other spellings, all at once: each lookup is under a tenth of a second.
  const tried = await Promise.all(
    spellingVariants(word).map(async (variant) => ({
      variant,
      envelope: parseEnvelope(await lookupOnce(variant, exactOnly)),
    })),
  );
  const hit = tried.find((t) => t.envelope && !isEmpty(t.envelope));
  if (hit?.envelope) {
    return annotate(hit.envelope, {
      note: `No entry is spelled "${word}"; this is the entry spelled "${hit.variant}".`,
      about_pageno: LEXICON_PAGE_NOTE,
    });
  }

  // A phrase the lexicon doesn't hold may still be made of words it does.
  const words = phraseWords(word);
  if (words.length > 1) {
    const parts = await Promise.all(
      words.map(async (w) => ({
        w,
        envelope: parseEnvelope(await lookupOnce(w, true)),
      })),
    );
    const found = parts.filter((p) => p.envelope && !isEmpty(p.envelope));
    if (found.length > 0) {
      return JSON.stringify({
        count: 0,
        query: word,
        note: `The lexicon has no entry for the phrase "${word}". It has entries for these of its words: ${found.map((p) => p.w).join(", ")}.`,
        about_pageno: LEXICON_PAGE_NOTE,
        word_entries: found.flatMap((p) => p.envelope?.results ?? []),
      });
    }
  }
  return annotate(envelope, {
    note: `The lexicon has no entry for "${word}" in any common spelling. It isn't one of the darshan's defined terms; search the books for how it is used instead.`,
  });
}

export const lookupParibhasha = internalAction({
  args: { word: v.string(), exactOnly: v.optional(v.boolean()) },
  returns: v.string(),
  handler: async (_ctx, { word, exactOnly }) =>
    await lookupWithRecovery(word, exactOnly),
});

export const listBooks = internalAction({
  args: {},
  returns: v.string(),
  handler: async () => {
    return await callMcpTool("list_books", {});
  },
});

export const getBookToc = internalAction({
  args: { bookId: v.number() },
  returns: v.string(),
  handler: async (_ctx, { bookId }) => {
    return await callMcpTool("get_book_toc", { book_id: bookId });
  },
});

export const getBookPage = internalAction({
  args: {
    bookId: v.number(),
    pageNo: v.number(),
  },
  returns: v.string(),
  handler: async (_ctx, { bookId, pageNo }) => {
    const page = await callMcpTool("get_book_page", {
      book_id: bookId,
      page_no: pageNo,
    });
    // The happy path costs nothing extra. Only a failed read fetches the book
    // list, to say which ids or pages do exist instead of a bare 404.
    if (!parseEnvelope(page)?.error) return page;
    try {
      const books = (parseEnvelope(await callMcpTool("list_books", {}))
        ?.results ?? []) as Book[];
      const explained = explainPageError(books, bookId, pageNo);
      return explained ? JSON.stringify({ error: explained }) : page;
    } catch {
      return page;
    }
  },
});
