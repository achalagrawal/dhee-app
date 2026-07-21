import { createTool, type ToolCtx } from "@convex-dev/agent";
import { z } from "zod";
import { internal } from "../_generated/api";

// Tools the Dhee agent can call. Descriptions are written for the model:
// they say when to reach for each tool and — critically — restate that
// whatever comes back is raw source material in specialized vocabulary
// that must never reach the user unchanged.

const TRANSLATE_REMINDER =
  "Results are raw passages in specialized Hindi philosophical vocabulary. Never quote or paraphrase them directly to the person. Understand the underlying idea, then say it in plain everyday language in their own language.";

export const searchWisdom = createTool({
  description: `Search the grounding corpus for perspective on a question about living — meaning, relationships, purpose, suffering, values, work, decisions, desire, conflict, or change. Use this whenever someone brings a real question about their life, before you answer. Search using the person's own situation as the query, in plain words. ${TRANSLATE_REMINDER}`,
  inputSchema: z.object({
    query: z
      .string()
      .describe(
        "What the person is really grappling with, phrased as a plain-language question or description. English or Hindi both work.",
      ),
  }),
  execute: async (ctx: ToolCtx, { query }): Promise<string> => {
    return await ctx.runAction(internal.md.semanticSearch, { query });
  },
});

export const searchExactPhrase = createTool({
  description: `Find passages containing an exact word or phrase. Use only when you already know a specific term and want the passages that use it — for a person's open-ended life question, use searchWisdom instead. ${TRANSLATE_REMINDER}`,
  inputSchema: z.object({
    query: z.string().describe("The exact word or phrase to find."),
  }),
  execute: async (ctx: ToolCtx, { query }): Promise<string> => {
    return await ctx.runAction(internal.md.lexicalSearch, { query });
  },
});

export const lookupDefinition = createTool({
  description: `Look up how the source tradition precisely defines one of its own terms. Use this to sharpen your own understanding when a search result hinges on a term you want to be accurate about. The definitions come back dense and technical — they are for your understanding only. ${TRANSLATE_REMINDER}`,
  inputSchema: z.object({
    word: z
      .string()
      .describe("The term to define, in Hindi or romanized form (e.g. 'jeevan')."),
  }),
  execute: async (ctx: ToolCtx, { word }): Promise<string> => {
    return await ctx.runAction(internal.md.lookupParibhasha, { word });
  },
});

export const readPage = createTool({
  description: `Read a full page from a source book, when a search result was promising but truncated and you need the surrounding context to get the idea right. Pass the book id and page number from a prior search result. ${TRANSLATE_REMINDER}`,
  inputSchema: z.object({
    bookId: z.number().describe("Book id from a search result."),
    pageNo: z.number().describe("Page number from a search result."),
  }),
  execute: async (ctx: ToolCtx, { bookId, pageNo }): Promise<string> => {
    return await ctx.runAction(internal.md.getBookPage, { bookId, pageNo });
  },
});

export const mdTools = {
  searchWisdom,
  searchExactPhrase,
  lookupDefinition,
  readPage,
};
