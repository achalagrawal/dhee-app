import { listMessages } from "@convex-dev/agent";
import { WorkflowManager } from "@convex-dev/workflow";
import { generateObject } from "ai";
import { v } from "convex/values";
import { z } from "zod";
import { components, internal } from "./_generated/api";
import {
  internalAction,
  internalMutation,
  internalQuery,
} from "./_generated/server";
import { backgroundModel } from "./agents/config";
import { observationKind } from "./schema";

export const workflow = new WorkflowManager(components.workflow);

// Layer 2 write path. Runs on a turn counter and on an idle flush, well away
// from the response path, so a slow or failed extraction never delays a reply.
//
// Conservative by design: this records only what the person actually said.
// The exclusion list below is not advisory — it is the reason this feature
// is safe to ship, and it is repeated in the prompt because models drift
// toward being helpfully comprehensive.
//
// Names of people in someone's personal life are deliberately NOT excluded.
// A companion that cannot say "your sister Meera" is a companion that sounds
// like it wasn't listening, and the names themselves are the least sensitive
// thing in most of these conversations. What stays excluded is the sensitive
// *categories* — and they stay excluded about named third parties just as
// firmly as about the person themselves, which is why the rule is spelled out
// twice below rather than left to inference.

export const EXTRACTION_EXCLUSIONS = `\
NEVER record any of the following, even when the person states it plainly and even if it seems central to their situation:
- health conditions, diagnoses, symptoms, medications, or disabilities
- political affiliation, party preference, or views on political figures
- sexual orientation, sexual activity, or romantic explicitness
- financial specifics: salary figures, debts, account details, net worth
- names of employers, colleagues, clients, or any organisation they deal with
- contact details, addresses, and identifiers of any kind

You MAY record the first names of people in their personal life — family, partner, close friends — where knowing the name would let you speak to them naturally. Use only the name they used, never a full name, and only for someone they clearly have a personal relationship with.

The categories above stay excluded for those people too. "Their brother Arun" is fine; "their brother Arun's depression" is not, and neither is anything that would let the excluded fact be reconstructed.

If something you would otherwise record depends on excluded information, either write it at a level that omits the detail, or skip it entirely. Skipping is always acceptable. A sparse, safe record is the goal — not a complete one.`;

export const extractionSchema = z.object({
  inquiries: z
    .array(
      z.object({
        question: z
          .string()
          .describe(
            "A life question this person is genuinely sitting with, written in their own framing, in plain language and first person. E.g. 'Whether to keep pushing in a career that no longer feels like mine'.",
          ),
      }),
    )
    .describe(
      "Open questions the person is living with. Only questions they actually voiced or clearly implied. Usually 0-2 per conversation. Empty array is a good answer.",
    ),
  observations: z
    .array(
      z.object({
        kind: z
          .enum(["value", "relationship", "aspiration", "pattern", "context"])
          .describe(
            "value = what matters to them; relationship = how they relate to a particular person or to people generally; aspiration = what they want; pattern = a recurring way they respond; context = stable life circumstances.",
          ),
        text: z
          .string()
          .describe(
            "One short plain-language sentence. No specialized vocabulary, no diagnoses. First names of people in their personal life are allowed; employer and organisation names are not.",
          ),
        confidence: z
          .enum(["stated", "inferred"])
          .describe(
            "'stated' only if they said it near-verbatim. Anything you concluded is 'inferred'.",
          ),
      }),
    )
    .describe(
      "Durable facts about who this person is. Not events, not what happened today. Only things likely still true in six months.",
    ),
  concepts: z
    .array(
      z.object({
        conceptSlug: z
          .string()
          .describe(
            "Short kebab-case identifier, e.g. 'expectation-and-disappointment'.",
          ),
        plainLanguageLabel: z
          .string()
          .describe(
            "How to name this idea to the person in everyday words. This string is shown to them directly, so it must contain no specialized vocabulary.",
          ),
        familiarity: z
          .enum(["new", "exploring", "resonating"])
          .describe(
            "'new' = just introduced; 'exploring' = engaging with it; 'resonating' = it visibly landed.",
          ),
      }),
    )
    .describe("Ideas explored in this conversation, named in plain language."),
});

export const extractionWorkflow = workflow
  .define({
    args: { userId: v.id("users"), threadId: v.string() },
  })
  .handler(async (step, args): Promise<void> => {
    await step.runAction(internal.memory.extractFromThread, args, {
      retry: true,
    });
    await step.runMutation(internal.memory.buildContextBlock, {
      userId: args.userId,
    });
  });

export const runExtraction = internalAction({
  args: { userId: v.id("users"), threadId: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    await workflow.start(ctx, internal.memory.extractionWorkflow, args);
    return null;
  },
});

/**
 * The conversation as the extractor should see it: what the person said and
 * what Dhee said back, oldest first.
 *
 * Takes a page exactly as `listMessages` returns it, which is **newest first**
 * (the client hardcodes `order: "desc"`; chat.ts:146 says the same). This
 * reverses. Feeding the model a conversation backwards costs nothing visible —
 * it still returns well-formed observations — which is precisely why it went
 * unnoticed, so the reversal lives here rather than at the call site where a
 * second caller could forget it.
 *
 * Tool messages are excluded deliberately. They carry role `"tool"` and
 * non-empty text, so an unfiltered join drops whole pages of the Madhyasth
 * Darshan corpus into a prompt whose entire job is to record facts *about the
 * person*. That is wasted tokens at best, and at worst it invites the model to
 * write down philosophy as though the person had said it — exactly what the
 * "record only what this person actually said about themselves" rule below is
 * there to prevent.
 */
export function buildTranscript(
  page: Array<{ text?: string; message?: { role?: string } | null }>,
): string {
  return [...page]
    .reverse()
    .filter(
      (m) => m.message?.role === "user" || m.message?.role === "assistant",
    )
    .map((m) => {
      const text = (m.text ?? "").trim();
      return text ? `${m.message?.role}: ${text}` : "";
    })
    .filter(Boolean)
    .join("\n\n");
}

/**
 * Split a newest-first page at the watermark: everything newer than
 * `throughOrder` is what this run is actually for, and a few messages either
 * side of the line come along as context so a thought spread over two turns
 * still reads as one.
 *
 * Returning `fresh: false` when nothing is new is what stops the idle flush
 * from paying for a model call on a thread that was already extracted and then
 * simply left open.
 */
export function windowSinceWatermark<
  T extends {
    order?: number;
    text?: string;
    message?: { role?: string } | null;
  },
>(
  page: T[],
  throughOrder: number | undefined,
  contextMessages = 4,
): { window: T[]; fresh: boolean; highestOrder: number | undefined } {
  const orders = page
    .map((m) => m.order)
    .filter((o): o is number => typeof o === "number");
  const highestOrder = orders.length ? Math.max(...orders) : undefined;

  if (throughOrder === undefined) {
    return { window: page, fresh: page.length > 0, highestOrder };
  }

  // Newest-first, so the new messages are the leading slice.
  const firstOld = page.findIndex(
    (m) => typeof m.order === "number" && m.order <= throughOrder,
  );
  if (firstOld === -1)
    return { window: page, fresh: page.length > 0, highestOrder };

  return {
    window: page.slice(0, firstOld + contextMessages),
    fresh: firstOld > 0,
    highestOrder,
  };
}

// Exported so convex/evals/extraction.ts can run the real prompt against a
// different model rather than a copy of it. config.ts blocks moving extraction
// to BACKGROUND_MODEL until an eval proves the cheaper model still refuses the
// excluded categories, and an eval that tests a hand-copied prompt would prove
// nothing about the one that ships.
export const EXTRACTION_SYSTEM = `You maintain a careful, minimal record of a person based on their conversations with a companion app.

Record only what this person actually said about themselves. Do not infer beyond the text. Do not fill gaps with plausible detail. When in doubt, record nothing — an empty result is a correct and common answer.

This runs often, on short stretches of conversation. A brief exchange can carry as much about someone as a long one, so do not hold back merely because there is little text — but equally, do not stretch a small amount of text into a large claim.

You will be shown what is already recorded. Do not restate it in different words. Record something only if it is genuinely new, or if it is a sharper version of something vague already on file.

${EXTRACTION_EXCLUSIONS}

Everything you write may be shown to this person verbatim in a screen called "Dhee's understanding of you". Write so that reading it would feel accurate and respectful, never presumptuous or clinical.`;

export const extractionPrompt = (transcript: string, known?: string) =>
  [
    known?.trim()
      ? `Already recorded about this person — do not repeat any of it:\n\n${known.trim()}`
      : "Nothing is recorded about this person yet.",
    `Here is the recent conversation. Extract what is durable, new, and safe to remember.\n\n${transcript}`,
  ].join("\n\n---\n\n");

/** How far back a run reads. Beyond the watermark this is just a safety net. */
const EXTRACTION_LOOKBACK = 40;

/** Watermark plus what Dhee already knows — one round trip instead of two. */
export const extractionState = internalQuery({
  args: { userId: v.id("users"), threadId: v.string() },
  returns: v.object({
    extractedThroughOrder: v.optional(v.number()),
    known: v.string(),
  }),
  handler: async (ctx, { userId, threadId }) => {
    const [meta, block] = await Promise.all([
      ctx.db
        .query("threadMeta")
        .withIndex("by_thread", (q) => q.eq("threadId", threadId))
        .unique(),
      ctx.db
        .query("contextBlocks")
        .withIndex("by_user", (q) => q.eq("userId", userId))
        .unique(),
    ]);
    return {
      extractedThroughOrder: meta?.extractedThroughOrder,
      known: block?.block ?? "",
    };
  },
});

export const extractFromThread = internalAction({
  args: { userId: v.id("users"), threadId: v.string() },
  returns: v.null(),
  handler: async (ctx, { userId, threadId }) => {
    const { extractedThroughOrder, known } = await ctx.runQuery(
      internal.memory.extractionState,
      { userId, threadId },
    );

    const { page } = await listMessages(ctx, components.agent, {
      threadId,
      paginationOpts: { numItems: EXTRACTION_LOOKBACK, cursor: null },
    });

    const { window, fresh, highestOrder } = windowSinceWatermark(
      page,
      extractedThroughOrder,
    );
    // Both triggers can land on a thread with nothing new — the idle flush
    // after a turn-counter run, most often. Bailing here is what keeps a short
    // interval from turning into a stream of redundant model calls.
    if (!fresh) return null;

    const transcript = buildTranscript(window);
    if (!transcript.trim()) return null;

    const { object } = await generateObject({
      model: backgroundModel,
      schema: extractionSchema,
      system: EXTRACTION_SYSTEM,
      prompt: extractionPrompt(transcript, known),
    });

    await ctx.runMutation(internal.memory.applyExtraction, {
      userId,
      threadId,
      inquiries: object.inquiries,
      observations: object.observations,
      concepts: object.concepts,
      ...(highestOrder === undefined
        ? {}
        : { extractedThroughOrder: highestOrder }),
    });
    return null;
  },
});

export const applyExtraction = internalMutation({
  args: {
    userId: v.id("users"),
    threadId: v.string(),
    inquiries: v.array(v.object({ question: v.string() })),
    observations: v.array(
      v.object({
        kind: observationKind,
        text: v.string(),
        confidence: v.union(v.literal("stated"), v.literal("inferred")),
      }),
    ),
    concepts: v.array(
      v.object({
        conceptSlug: v.string(),
        plainLanguageLabel: v.string(),
        familiarity: v.union(
          v.literal("new"),
          v.literal("exploring"),
          v.literal("resonating"),
        ),
      }),
    ),
    extractedThroughOrder: v.optional(v.number()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const now = Date.now();

    const existingInquiries = await ctx.db
      .query("inquiries")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .collect();

    for (const inquiry of args.inquiries) {
      const match = existingInquiries.find(
        (row) => row.question.toLowerCase() === inquiry.question.toLowerCase(),
      );
      if (match) {
        if (!match.threadIds.includes(args.threadId)) {
          await ctx.db.patch(match._id, {
            threadIds: [...match.threadIds, args.threadId],
          });
        }
      } else {
        await ctx.db.insert("inquiries", {
          userId: args.userId,
          question: inquiry.question,
          status: "living",
          firstAskedAt: now,
          threadIds: [args.threadId],
          userEdited: false,
        });
      }
    }

    const existingObservations = await ctx.db
      .query("observations")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .collect();

    for (const observation of args.observations) {
      const duplicate = existingObservations.some(
        (row) => row.text.toLowerCase() === observation.text.toLowerCase(),
      );
      if (duplicate) continue;
      await ctx.db.insert("observations", {
        userId: args.userId,
        kind: observation.kind,
        text: observation.text,
        sourceThreadId: args.threadId,
        confidence: observation.confidence,
        createdAt: now,
        userEdited: false,
      });
    }

    for (const concept of args.concepts) {
      const existing = await ctx.db
        .query("conceptsTouched")
        .withIndex("by_user_concept", (q) =>
          q.eq("userId", args.userId).eq("conceptSlug", concept.conceptSlug),
        )
        .unique();
      if (existing) {
        await ctx.db.patch(existing._id, {
          familiarity: concept.familiarity,
          plainLanguageLabel: concept.plainLanguageLabel,
          lastTouchedAt: now,
        });
      } else {
        await ctx.db.insert("conceptsTouched", {
          userId: args.userId,
          conceptSlug: concept.conceptSlug,
          plainLanguageLabel: concept.plainLanguageLabel,
          familiarity: concept.familiarity,
          lastTouchedAt: now,
        });
      }
    }

    // Only the watermark is written back. `turnsSinceExtraction` is reset by
    // `sendMessage` when it schedules a run, not here when one lands — see the
    // note there. Resetting it from this side as well would silently discard
    // the turns that arrived while the run was in flight.
    const meta = await ctx.db
      .query("threadMeta")
      .withIndex("by_thread", (q) => q.eq("threadId", args.threadId))
      .unique();
    if (meta && args.extractedThroughOrder !== undefined) {
      await ctx.db.patch(meta._id, {
        extractedThroughOrder: args.extractedThroughOrder,
      });
    }
    return null;
  },
});

// How many observations reach the system prompt. Raised alongside the shorter
// extraction interval: more rows arrive now, and the ranking below decides
// which of them survive the cut rather than the clock alone.
const CONTEXT_OBSERVATION_LIMIT = 30;

// Layer 3. Rebuilt from layer 2 rather than accumulated, so deleting an
// observation in the UI actually removes it from what the agent sees.
export const buildContextBlock = internalMutation({
  args: { userId: v.id("users") },
  returns: v.null(),
  handler: async (ctx, { userId }) => {
    const [inquiries, observations, concepts] = await Promise.all([
      ctx.db
        .query("inquiries")
        .withIndex("by_user", (q) => q.eq("userId", userId))
        .collect(),
      ctx.db
        .query("observations")
        .withIndex("by_user", (q) => q.eq("userId", userId))
        .collect(),
      ctx.db
        .query("conceptsTouched")
        .withIndex("by_user", (q) => q.eq("userId", userId))
        .collect(),
    ]);

    const sections: string[] = [];

    const living = inquiries.filter((row) => row.status === "living");
    if (living.length > 0) {
      sections.push(
        `Questions they are sitting with:\n${living
          .map((row) => `- ${row.question}`)
          .join("\n")}`,
      );
    }

    if (observations.length > 0) {
      // Recency alone was fine when extraction ran every fourth turn and rows
      // accumulated slowly. Now that it runs on a short interval and an idle
      // flush, a pure `slice(0, 20)` would quietly push the things someone
      // told Dhee months ago out of the prompt in favour of whatever they
      // happened to mention this morning. So rank first: a row the person
      // edited by hand is the strongest signal there is, then what they stated
      // outright, then what was inferred — and only sort by recency inside
      // each band.
      const rank = (row: (typeof observations)[number]) =>
        row.userEdited ? 0 : row.confidence === "stated" ? 1 : 2;
      const kept = observations
        .sort((a, b) => rank(a) - rank(b) || b.createdAt - a.createdAt)
        .slice(0, CONTEXT_OBSERVATION_LIMIT);
      sections.push(
        `What you know about them:\n${kept
          .map((row) => `- (${row.kind}) ${row.text}`)
          .join("\n")}`,
      );
    }

    const resonating = concepts.filter(
      (row) => row.familiarity === "resonating",
    );
    if (resonating.length > 0) {
      sections.push(
        `Ideas that have landed with them before:\n${resonating
          .map((row) => `- ${row.plainLanguageLabel}`)
          .join("\n")}`,
      );
    }

    const block = sections.join("\n\n");

    const existing = await ctx.db
      .query("contextBlocks")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .unique();
    if (existing) {
      await ctx.db.patch(existing._id, { block, generatedAt: Date.now() });
    } else {
      await ctx.db.insert("contextBlocks", {
        userId,
        block,
        generatedAt: Date.now(),
      });
    }
    return null;
  },
});

export const contextBlockForUser = internalQuery({
  args: { userId: v.id("users") },
  returns: v.string(),
  handler: async (ctx, { userId }) => {
    const row = await ctx.db
      .query("contextBlocks")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .unique();
    return row?.block ?? "";
  },
});
