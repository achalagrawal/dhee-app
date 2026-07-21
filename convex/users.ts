import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import {
  type MutationCtx,
  type QueryCtx,
  mutation,
  query,
} from "./_generated/server";

export async function requireUserId(
  ctx: QueryCtx | MutationCtx,
): Promise<Id<"users">> {
  const userId = await getAuthUserId(ctx);
  if (userId === null) {
    throw new Error("Not signed in.");
  }
  return userId;
}

export async function getProfile(
  ctx: QueryCtx | MutationCtx,
  userId: Id<"users">,
): Promise<Doc<"profiles"> | null> {
  return await ctx.db
    .query("profiles")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .unique();
}

export const currentProfile = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) return null;
    const profile = await getProfile(ctx, userId);
    if (!profile) {
      return { userId, onboarded: false, preferredLanguage: "en" as const };
    }
    return {
      userId,
      onboarded: profile.onboarded,
      preferredLanguage: profile.preferredLanguage,
      name: profile.name,
    };
  },
});

export const completeOnboarding = mutation({
  args: {
    name: v.optional(v.string()),
    preferredLanguage: v.union(v.literal("en"), v.literal("hi")),
  },
  returns: v.null(),
  handler: async (ctx, { name, preferredLanguage }) => {
    const userId = await requireUserId(ctx);
    const existing = await getProfile(ctx, userId);
    if (existing) {
      await ctx.db.patch(existing._id, {
        name,
        preferredLanguage,
        onboarded: true,
      });
    } else {
      await ctx.db.insert("profiles", {
        userId,
        name,
        preferredLanguage,
        onboarded: true,
        createdAt: Date.now(),
      });
    }
    return null;
  },
});

export const setName = mutation({
  args: { name: v.string() },
  returns: v.null(),
  handler: async (ctx, { name }) => {
    const userId = await requireUserId(ctx);
    const profile = await getProfile(ctx, userId);
    // An empty name is meaningful: it means "don't call me anything".
    const trimmed = name.trim().slice(0, 60);
    const next = trimmed.length > 0 ? trimmed : undefined;
    if (profile) {
      await ctx.db.patch(profile._id, { name: next });
    } else {
      await ctx.db.insert("profiles", {
        userId,
        name: next,
        preferredLanguage: "en",
        onboarded: false,
        createdAt: Date.now(),
      });
    }
    return null;
  },
});

// Everything the settings screen needs to describe the account, including
// the counts behind "delete everything" so the choice is informed.
export const accountSummary = query({
  args: {},
  returns: v.object({
    email: v.optional(v.string()),
    name: v.optional(v.string()),
    preferredLanguage: v.union(v.literal("en"), v.literal("hi")),
    memberSince: v.number(),
    observationCount: v.number(),
    inquiryCount: v.number(),
    conceptCount: v.number(),
  }),
  handler: async (ctx) => {
    const userId = await requireUserId(ctx);
    const [user, profile, observations, inquiries, concepts] =
      await Promise.all([
        ctx.db.get(userId),
        getProfile(ctx, userId),
        ctx.db
          .query("observations")
          .withIndex("by_user", (q) => q.eq("userId", userId))
          .collect(),
        ctx.db
          .query("inquiries")
          .withIndex("by_user", (q) => q.eq("userId", userId))
          .collect(),
        ctx.db
          .query("conceptsTouched")
          .withIndex("by_user", (q) => q.eq("userId", userId))
          .collect(),
      ]);

    return {
      email: user?.email,
      name: profile?.name,
      preferredLanguage: profile?.preferredLanguage ?? ("en" as const),
      memberSince: profile?.createdAt ?? user?._creationTime ?? Date.now(),
      observationCount: observations.length,
      inquiryCount: inquiries.length,
      conceptCount: concepts.length,
    };
  },
});

export const setLanguage = mutation({
  args: { preferredLanguage: v.union(v.literal("en"), v.literal("hi")) },
  returns: v.null(),
  handler: async (ctx, { preferredLanguage }) => {
    const userId = await requireUserId(ctx);
    const profile = await getProfile(ctx, userId);
    if (profile) {
      await ctx.db.patch(profile._id, { preferredLanguage });
    } else {
      await ctx.db.insert("profiles", {
        userId,
        preferredLanguage,
        onboarded: false,
        createdAt: Date.now(),
      });
    }
    return null;
  },
});
