import { v } from "convex/values";
import { internalAction } from "./_generated/server";
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

export const semanticSearch = internalAction({
  args: {
    query: v.string(),
    topK: v.optional(v.number()),
    page: v.optional(v.number()),
    bookIds: v.optional(v.array(v.number())),
  },
  returns: v.string(),
  handler: async (_ctx, { query, topK, page, bookIds }) => {
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
  },
});

export const lexicalSearch = internalAction({
  args: {
    query: v.string(),
    page: v.optional(v.number()),
    bookIds: v.optional(v.array(v.number())),
  },
  returns: v.string(),
  handler: async (_ctx, { query, page, bookIds }) => {
    // Same treatment as the semantic search: this returns passages too, and its
    // long tail is the wider of the two.
    return capPassages(
      await callMcpTool("lexical_search_books", {
        query,
        page: page ?? 1,
        ...bookIdParam(bookIds),
      }),
    );
  },
});

export const lookupParibhasha = internalAction({
  args: { word: v.string(), exactOnly: v.optional(v.boolean()) },
  returns: v.string(),
  handler: async (_ctx, { word, exactOnly }) => {
    return await callMcpTool("lookup_paribhasha", {
      word,
      ...(exactOnly === undefined ? {} : { exact_only: exactOnly }),
    });
  },
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
    return await callMcpTool("get_book_page", {
      book_id: bookId,
      page_no: pageNo,
    });
  },
});
