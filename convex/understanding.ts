import { v } from "convex/values";
import { internal } from "./_generated/api";
import { mutation, query } from "./_generated/server";
import { inquiryStatus } from "./schema";
import { requireUserId } from "./users";

// Backing functions for "Dhee's understanding of you".
//
// Every row the extraction writes is reachable and destroyable from here.
// Each edit or delete rebuilds the derived context block, so the change is
// reflected in the very next reply rather than at the next extraction.

export const overview = query({
  args: {},
  handler: async (ctx) => {
    const userId = await requireUserId(ctx);
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
        .withIndex("by_user_concept", (q) => q.eq("userId", userId))
        .collect(),
    ]);
    return {
      inquiries: inquiries.sort((a, b) => b.firstAskedAt - a.firstAskedAt),
      observations: observations.sort((a, b) => b.createdAt - a.createdAt),
      concepts: concepts.sort((a, b) => b.lastTouchedAt - a.lastTouchedAt),
    };
  },
});

export const editObservation = mutation({
  args: { id: v.id("observations"), text: v.string() },
  returns: v.null(),
  handler: async (ctx, { id, text }) => {
    const userId = await requireUserId(ctx);
    const row = await ctx.db.get("observations", id);
    if (!row || row.userId !== userId) throw new Error("Not found.");
    await ctx.db.patch("observations", id, { text, userEdited: true });
    await ctx.scheduler.runAfter(0, internal.memory.buildContextBlock, {
      userId,
    });
    return null;
  },
});

export const deleteObservation = mutation({
  args: { id: v.id("observations") },
  returns: v.null(),
  handler: async (ctx, { id }) => {
    const userId = await requireUserId(ctx);
    const row = await ctx.db.get("observations", id);
    if (!row || row.userId !== userId) throw new Error("Not found.");
    await ctx.db.delete("observations", id);
    await ctx.scheduler.runAfter(0, internal.memory.buildContextBlock, {
      userId,
    });
    return null;
  },
});

export const editInquiry = mutation({
  args: {
    id: v.id("inquiries"),
    question: v.optional(v.string()),
    status: v.optional(inquiryStatus),
  },
  returns: v.null(),
  handler: async (ctx, { id, question, status }) => {
    const userId = await requireUserId(ctx);
    const row = await ctx.db.get("inquiries", id);
    if (!row || row.userId !== userId) throw new Error("Not found.");
    await ctx.db.patch("inquiries", id, {
      ...(question === undefined ? {} : { question }),
      ...(status === undefined ? {} : { status }),
      userEdited: true,
    });
    await ctx.scheduler.runAfter(0, internal.memory.buildContextBlock, {
      userId,
    });
    return null;
  },
});

export const deleteInquiry = mutation({
  args: { id: v.id("inquiries") },
  returns: v.null(),
  handler: async (ctx, { id }) => {
    const userId = await requireUserId(ctx);
    const row = await ctx.db.get("inquiries", id);
    if (!row || row.userId !== userId) throw new Error("Not found.");
    await ctx.db.delete("inquiries", id);
    await ctx.scheduler.runAfter(0, internal.memory.buildContextBlock, {
      userId,
    });
    return null;
  },
});

export const deleteConcept = mutation({
  args: { id: v.id("conceptsTouched") },
  returns: v.null(),
  handler: async (ctx, { id }) => {
    const userId = await requireUserId(ctx);
    const row = await ctx.db.get("conceptsTouched", id);
    if (!row || row.userId !== userId) throw new Error("Not found.");
    await ctx.db.delete("conceptsTouched", id);
    await ctx.scheduler.runAfter(0, internal.memory.buildContextBlock, {
      userId,
    });
    return null;
  },
});

export const forgetEverything = mutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    const userId = await requireUserId(ctx);
    const [inquiries, observations, concepts, blocks] = await Promise.all([
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
        .withIndex("by_user_concept", (q) => q.eq("userId", userId))
        .collect(),
      ctx.db
        .query("contextBlocks")
        .withIndex("by_user", (q) => q.eq("userId", userId))
        .collect(),
    ]);
    for (const row of inquiries) await ctx.db.delete("inquiries", row._id);
    for (const row of observations) {
      await ctx.db.delete("observations", row._id);
    }
    for (const row of concepts) {
      await ctx.db.delete("conceptsTouched", row._id);
    }
    for (const row of blocks) await ctx.db.delete("contextBlocks", row._id);
    return null;
  },
});
