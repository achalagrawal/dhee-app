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
import { languageModel } from "./agents/config";
import { observationKind } from "./schema";

export const workflow = new WorkflowManager(components.workflow);

// Layer 2 write path. Runs every N turns, well away from the response path,
// so a slow or failed extraction never delays a reply.
//
// Conservative by design: this records only what the person actually said.
// The exclusion list below is not advisory — it is the reason this feature
// is safe to ship, and it is repeated in the prompt because models drift
// toward being helpfully comprehensive.

const EXTRACTION_EXCLUSIONS = `\
NEVER record any of the following, even when the person states it plainly and even if it seems central to their situation:
- health conditions, diagnoses, symptoms, medications, or disabilities
- political affiliation, party preference, or views on political figures
- sexual orientation, sexual activity, or romantic explicitness
- names of family members, partners, friends, employers, or any other person
- financial specifics: salary figures, debts, account details, net worth

If something you would otherwise record depends on excluded information, either write it at a level that omits the detail, or skip it entirely. Skipping is always acceptable. A sparse, safe record is the goal — not a complete one.`;

const extractionSchema = z.object({
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
            "value = what matters to them; relationship = how they relate to people generally, with no names; aspiration = what they want; pattern = a recurring way they respond; context = stable life circumstances.",
          ),
        text: z
          .string()
          .describe(
            "One short plain-language sentence. No specialized vocabulary, no names, no diagnoses.",
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
          .describe("Short kebab-case identifier, e.g. 'expectation-and-disappointment'."),
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

export const extractFromThread = internalAction({
  args: { userId: v.id("users"), threadId: v.string() },
  returns: v.null(),
  handler: async (ctx, { userId, threadId }) => {
    const { page } = await listMessages(ctx, components.agent, {
      threadId,
      paginationOpts: { numItems: 20, cursor: null },
    });

    const transcript = page
      .map((message) => {
        const text = message.text ?? "";
        return text ? `${message.message?.role ?? "unknown"}: ${text}` : "";
      })
      .filter(Boolean)
      .join("\n\n");

    if (!transcript.trim()) return null;

    const { object } = await generateObject({
      model: languageModel,
      schema: extractionSchema,
      system: `You maintain a careful, minimal record of a person based on their conversations with a companion app.

Record only what this person actually said about themselves. Do not infer beyond the text. Do not fill gaps with plausible detail. When in doubt, record nothing — an empty result is a correct and common answer.

${EXTRACTION_EXCLUSIONS}

Everything you write may be shown to this person verbatim in a screen called "Dhee's understanding of you". Write so that reading it would feel accurate and respectful, never presumptuous or clinical.`,
      prompt: `Here is the recent conversation. Extract what is durable and safe to remember.\n\n${transcript}`,
    });

    await ctx.runMutation(internal.memory.applyExtraction, {
      userId,
      threadId,
      inquiries: object.inquiries,
      observations: object.observations,
      concepts: object.concepts,
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

    const meta = await ctx.db
      .query("threadMeta")
      .withIndex("by_thread", (q) => q.eq("threadId", args.threadId))
      .unique();
    if (meta) {
      await ctx.db.patch(meta._id, { turnsSinceExtraction: 0 });
    }
    return null;
  },
});

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
      const recent = observations
        .sort((a, b) => b.createdAt - a.createdAt)
        .slice(0, 20);
      sections.push(
        `What you know about them:\n${recent
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
