import { createThread, saveMessage } from "@convex-dev/agent";
import { v } from "convex/values";
import { components, internal } from "./_generated/api";
import { internalMutation } from "./_generated/server";

// Makes the app reviewable without waiting on a real conversation:
//   npx convex run seed:demo
//
// Creates a demo person, a short seeded thread, and the user-model rows that
// conversation would have produced — so the understanding screen has content
// on first open. Re-running replaces the previous demo data.

const DEMO_EMAIL = "demo@dhee.app";

const SEEDED_EXCHANGE: Array<{ role: "user" | "assistant"; text: string }> = [
  {
    role: "user",
    text: "I got the promotion I've been chasing for two years and I felt nothing. Just tired. What's wrong with me?",
  },
  {
    role: "assistant",
    text: "Nothing's wrong with you. What you're describing happens to almost everyone who reaches something they've been running toward for a long time — and it's worth looking at closely, because it's telling you something.\n\nWhen we want something for two years, we're not really wanting the thing. We're wanting who we imagine we'll be once we have it. The title was standing in for something — being seen as capable, maybe, or finally being allowed to rest. Now the title is here and whatever it was standing in for hasn't arrived, because a title can't deliver it.\n\nThe tiredness might be the most honest thing you're feeling right now. What were you hoping would change on the other side of this?",
  },
  {
    role: "user",
    text: "I guess I thought I'd stop feeling like I had to prove something.",
  },
  {
    role: "assistant",
    text: "That's a big thing to notice, and you got to it quickly.\n\nHere's what's worth sitting with: proving is a loop that doesn't have an exit built into it. Each thing you achieve becomes the new floor — the proof expires almost immediately, and you need the next one. That's why the promotion couldn't do what you needed it to. It was never going to be enough, not because it was too small, but because the wanting wasn't really about size.\n\nThe question underneath might not be how to prove it more convincingly. It might be who you're still trying to convince, and whether that person is even still watching.",
  },
];

export const demo = internalMutation({
  args: {},
  returns: v.string(),
  handler: async (ctx) => {
    const existing = await ctx.db
      .query("users")
      .filter((q) => q.eq(q.field("email"), DEMO_EMAIL))
      .first();

    const userId =
      existing?._id ??
      (await ctx.db.insert("users", {
        email: DEMO_EMAIL,
        name: "Demo",
      }));

    // Clear any prior demo data so re-seeding is idempotent.
    for (const table of [
      "inquiries",
      "observations",
      "conceptsTouched",
      "contextBlocks",
    ] as const) {
      const rows = await ctx.db
        .query(table)
        .withIndex("by_user", (q) => q.eq("userId", userId))
        .collect();
      for (const row of rows) await ctx.db.delete(row._id);
    }

    const profile = await ctx.db
      .query("profiles")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .unique();
    if (profile) {
      await ctx.db.patch(profile._id, { onboarded: true });
    } else {
      await ctx.db.insert("profiles", {
        userId,
        name: "Demo",
        preferredLanguage: "en",
        onboarded: true,
        createdAt: Date.now(),
      });
    }

    const threadId = await createThread(ctx, components.agent, {
      userId,
      title: "The promotion that felt like nothing",
    });

    for (const turn of SEEDED_EXCHANGE) {
      await saveMessage(ctx, components.agent, {
        threadId,
        userId,
        message: { role: turn.role, content: turn.text },
      });
    }

    const now = Date.now();

    await ctx.db.insert("inquiries", {
      userId,
      question:
        "Who am I still trying to prove myself to, and does it still matter?",
      status: "living",
      firstAskedAt: now,
      threadIds: [threadId],
      userEdited: false,
    });

    for (const observation of [
      {
        kind: "pattern" as const,
        text: "Tends to pursue goals hard, then feel flat once they arrive.",
        confidence: "stated" as const,
      },
      {
        kind: "value" as const,
        text: "Wants to feel capable without having to keep demonstrating it.",
        confidence: "inferred" as const,
      },
      {
        kind: "context" as const,
        text: "Works somewhere with a visible promotion ladder.",
        confidence: "stated" as const,
      },
    ]) {
      await ctx.db.insert("observations", {
        userId,
        ...observation,
        sourceThreadId: threadId,
        createdAt: now,
        userEdited: false,
      });
    }

    await ctx.db.insert("conceptsTouched", {
      userId,
      conceptSlug: "achievement-does-not-settle-wanting",
      plainLanguageLabel:
        "Reaching the thing you wanted rarely quiets the wanting itself",
      familiarity: "resonating",
      lastTouchedAt: now,
    });

    await ctx.scheduler.runAfter(0, internal.memory.buildContextBlock, {
      userId,
    });

    return threadId;
  },
});
