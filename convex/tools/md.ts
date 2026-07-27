import { createTool, type ToolCtx } from "@convex-dev/agent";
import { z } from "zod";
import { internal } from "../_generated/api";

// Tools the Dhee agent can call. Descriptions say when to reach for each tool
// and nothing about how to render what comes back.
//
// What to do with a result is a product decision that changes per person — the
// corpus lens may quote it verbatim, everyone else gets it translated — so it
// lives in DHEE_INSTRUCTIONS where the lens section can override it. A tool
// description is baked into the Agent at construction and cannot vary.
//
// These descriptions are Dhee's own, not the MCP server's. The server ships
// richer ones for its other consumer, but this client never calls `tools/list`
// — it only calls `tools/call` — so the wording the model sees is entirely
// what is written here, phrased for a companion rather than for a librarian.
//
// Every tool returns one JSON envelope: `{ count, ...metadata, results: [...] }`.

export const searchWisdom = createTool({
  description: `Search the grounding corpus for perspective on a question about living — meaning, relationships, purpose, suffering, values, work, decisions, desire, conflict, or change. Use this whenever someone brings a real question about their life, before you answer. Search using the person's own situation as the query, in plain words. Each result carries the book id and page it came from.`,
  inputSchema: z.object({
    query: z
      .string()
      .describe(
        "What the person is really grappling with, phrased as a plain-language question or description. English or Hindi both work.",
      ),
    bookIds: z
      .array(z.number())
      .optional()
      .describe(
        "Restrict the search to these book ids, from listBooks or an earlier result. Use when someone names a book they want you to look in.",
      ),
    page: z
      .number()
      .optional()
      .describe(
        "Fetch a later page of results, starting at 1. Only worth doing when the first page genuinely didn't hold what you needed.",
      ),
  }),
  execute: async (ctx: ToolCtx, { query, bookIds, page }): Promise<string> => {
    return await ctx.runAction(internal.md.semanticSearch, {
      query,
      bookIds,
      page,
    });
  },
});

export const searchExactPhrase = createTool({
  description: `Find passages containing an exact word or phrase. Use only when you already know a specific term and want the passages that use it — for a person's open-ended life question, use searchWisdom instead. Results say how many pages of hits there are, so you can ask for a later one. Some hits are front matter rather than a numbered page; those are marked and must not be cited as a page.`,
  inputSchema: z.object({
    query: z.string().describe("The exact word or phrase to find."),
    bookIds: z
      .array(z.number())
      .optional()
      .describe("Restrict the search to these book ids."),
    page: z
      .number()
      .optional()
      .describe(
        "Which page of results to fetch, starting at 1. Defaults to 1; the result says how many pages exist.",
      ),
  }),
  execute: async (ctx: ToolCtx, { query, bookIds, page }): Promise<string> => {
    return await ctx.runAction(internal.md.lexicalSearch, {
      query,
      bookIds,
      page,
    });
  },
});

export const lookupDefinition = createTool({
  description: `Look up how the source tradition precisely defines one of its own terms. Use this to sharpen your own understanding when a search result hinges on a term you want to be accurate about. The definitions come back dense and technical. Alongside the term you asked for, the result names related terms in the lexicon, which you can look up in turn if one of them is what you actually meant.`,
  inputSchema: z.object({
    word: z
      .string()
      .describe(
        "The term to define, in Hindi or romanized form (e.g. 'jeevan').",
      ),
    exactOnly: z
      .boolean()
      .optional()
      .describe(
        "Return only the exact term, without the list of related ones. Use when you already know precisely which term you want.",
      ),
  }),
  execute: async (ctx: ToolCtx, { word, exactOnly }): Promise<string> => {
    return await ctx.runAction(internal.md.lookupParibhasha, {
      word,
      exactOnly,
    });
  },
});

export const readPage = createTool({
  description: `Read a full page from a source book, when a search result was promising but you need the surrounding context to get the idea right. Pass the book id and page number from listBooks, a table of contents, or a prior search result. The result also says whether there is a page before and after, so you can keep reading if the thought runs on.`,
  inputSchema: z.object({
    bookId: z.number().describe("Book id from a search result."),
    pageNo: z.number().describe("Page number from a search result."),
  }),
  execute: async (ctx: ToolCtx, { bookId, pageNo }): Promise<string> => {
    return await ctx.runAction(internal.md.getBookPage, { bookId, pageNo });
  },
});

// Without these two, a person naming a book cannot be answered: `readPage`
// needs an id, and nothing else produces one except a lucky search hit.
export const listBooks = createTool({
  description:
    "List every book in the corpus with its id, title, author and page count. Use this to find the book id for a book someone names, since titles are in Devanagari and they may write the name in Roman script. Also use it when someone asks what is in the corpus.",
  inputSchema: z.object({}),
  execute: async (ctx: ToolCtx): Promise<string> => {
    return await ctx.runAction(internal.md.listBooks, {});
  },
});

export const readBookToc = createTool({
  description:
    "Read a book's table of contents, so you can find which page covers a topic before reading it. Pass a book id from listBooks or a search result. Entries marked as front matter have no citable page number.",
  inputSchema: z.object({
    bookId: z.number().describe("Book id from listBooks or a search result."),
  }),
  execute: async (ctx: ToolCtx, { bookId }): Promise<string> => {
    return await ctx.runAction(internal.md.getBookToc, { bookId });
  },
});

export const mdTools = {
  searchWisdom,
  searchExactPhrase,
  lookupDefinition,
  readPage,
  listBooks,
  readBookToc,
};
