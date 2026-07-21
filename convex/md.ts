import { v } from "convex/values";
import { internalAction } from "./_generated/server";
import { callMcpTool } from "./lib/mcp";

// Retrieval layer over the MD corpus MCP server. These are internal-only:
// the client never touches the corpus directly, it reaches it through the
// agent's tool calls in convex/tools/md.ts.

export const semanticSearch = internalAction({
  args: {
    query: v.string(),
    topK: v.optional(v.number()),
  },
  returns: v.string(),
  handler: async (_ctx, { query, topK }) => {
    return await callMcpTool("semantic_search", {
      query,
      topK: topK ?? 6,
      rerank: true,
    });
  },
});

export const lexicalSearch = internalAction({
  args: {
    query: v.string(),
    page: v.optional(v.number()),
  },
  returns: v.string(),
  handler: async (_ctx, { query, page }) => {
    return await callMcpTool("lexical_search_books", {
      query,
      page: page ?? 1,
    });
  },
});

export const lookupParibhasha = internalAction({
  args: { word: v.string() },
  returns: v.string(),
  handler: async (_ctx, { word }) => {
    return await callMcpTool("lookup_paribhasha", { word });
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
