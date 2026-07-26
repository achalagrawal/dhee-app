import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import {
  type ActionCtx,
  type MutationCtx,
  type QueryCtx,
  internalAction,
  internalMutation,
  internalQuery,
  mutation,
  query,
} from "./_generated/server";

/** The signed-in person's app-side user id, or null if there is no valid
 *  identity on the request.
 *
 *  Deliberately a plain index read: `identity.subject` is the Better Auth
 *  user's id, and our `users` row is created by the `user.onCreate` trigger in
 *  auth.ts. Resolving it here rather than calling into the auth component
 *  keeps every caller on one database read, and keeps the test harness free of
 *  component registration. */
export async function getUserId(
  ctx: QueryCtx | MutationCtx,
): Promise<Id<"users"> | null> {
  const identity = await ctx.auth.getUserIdentity();
  if (identity === null) return null;
  const user = await ctx.db
    .query("users")
    .withIndex("by_auth_id", (q) => q.eq("authId", identity.subject))
    .unique();
  return user?._id ?? null;
}

/** The query form of `getUserId`, so actions can resolve the same id. Convex
 *  carries the caller's identity through `ctx.runQuery`, so this sees the same
 *  person the action was called by. */
export const resolveUserId = internalQuery({
  args: {},
  handler: async (ctx) => await getUserId(ctx),
});

export async function requireUserId(
  ctx: QueryCtx | MutationCtx | ActionCtx,
): Promise<Id<"users">> {
  // Actions have no `ctx.db`, so they take the extra hop through a query
  // rather than reading the index directly. Callers don't have to care which
  // kind of context they're in.
  const userId =
    "db" in ctx
      ? await getUserId(ctx)
      : await ctx.runQuery(internal.users.resolveUserId, {});
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
    const userId = await getUserId(ctx);
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
      avatarUrl: profile.avatarId
        ? await ctx.storage.getUrl(profile.avatarId)
        : null,
    };
  },
});

// A short-lived URL the client POSTs the raw image bytes to. The upload
// returns a storageId, which the client hands back to `setAvatar`.
export const generateAvatarUploadUrl = mutation({
  args: {},
  returns: v.string(),
  handler: async (ctx) => {
    await requireUserId(ctx);
    return await ctx.storage.generateUploadUrl();
  },
});

export const setAvatar = mutation({
  args: { storageId: v.id("_storage") },
  returns: v.null(),
  handler: async (ctx, { storageId }) => {
    const userId = await requireUserId(ctx);
    const profile = await getProfile(ctx, userId);
    if (!profile) throw new Error("No profile.");
    // Drop the previous photo so storage doesn't accumulate orphans.
    if (profile.avatarId) await ctx.storage.delete(profile.avatarId);
    await ctx.db.patch(profile._id, { avatarId: storageId });
    return null;
  },
});

// The scheduled sibling of `setAvatar`: same behaviour, but takes the user id
// explicitly because a scheduled action has no `ctx.auth` identity to read.
export const setAvatarForUser = internalMutation({
  args: { userId: v.id("users"), storageId: v.id("_storage") },
  returns: v.null(),
  handler: async (ctx, { userId, storageId }) => {
    const profile = await getProfile(ctx, userId);
    if (!profile) {
      // The profile is created before this is scheduled, so this only happens
      // if the account was deleted mid-import. Drop the orphan and move on.
      await ctx.storage.delete(storageId);
      return null;
    }
    if (profile.avatarId) await ctx.storage.delete(profile.avatarId);
    await ctx.db.patch(profile._id, { avatarId: storageId });
    return null;
  },
});

// Pulls the OAuth provider's profile photo into Convex storage, so the avatar
// keeps working after the provider's URL expires. Runs off the sign-in path:
// a photo that won't download is not a reason to fail someone's sign-in.
export const importOAuthAvatar = internalAction({
  args: { userId: v.id("users"), url: v.string() },
  returns: v.null(),
  handler: async (ctx, { userId, url }) => {
    try {
      const response = await fetch(url);
      if (!response.ok) {
        console.warn(`Avatar fetch failed: ${response.status} for ${url}`);
        return null;
      }
      const storageId = await ctx.storage.store(await response.blob());
      await ctx.runMutation(internal.users.setAvatarForUser, {
        userId,
        storageId,
      });
    } catch (error) {
      console.warn(`Avatar import failed: ${String(error)}`);
    }
    return null;
  },
});

/** Trim a provider-supplied display name down to something a profile field can
 *  hold. Exported so the `user.onCreate` trigger in auth.ts and the tests agree
 *  on the rule. */
export function normalizeProviderName(
  name?: string | null,
): string | undefined {
  const trimmed = (name ?? "").trim().slice(0, 60);
  return trimmed.length > 0 ? trimmed : undefined;
}

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
    avatarUrl: v.union(v.string(), v.null()),
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
      avatarUrl: profile?.avatarId
        ? await ctx.storage.getUrl(profile.avatarId)
        : null,
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
