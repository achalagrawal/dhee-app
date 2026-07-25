import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import {
  type MutationCtx,
  type QueryCtx,
  internalQuery,
  mutation,
  query,
} from "./_generated/server";
import { planForProfile, traditionLimit } from "./lib/plan";

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

// Patch the profile, creating it if this is the first thing ever set on it.
// A row can be missing here because profiles are written lazily — someone can
// change a setting before finishing onboarding.
async function patchProfile(
  ctx: MutationCtx,
  userId: Id<"users">,
  patch: Partial<Omit<Doc<"profiles">, "_id" | "_creationTime" | "userId">>,
): Promise<void> {
  const profile = await getProfile(ctx, userId);
  if (profile) {
    await ctx.db.patch(profile._id, patch);
  } else {
    await ctx.db.insert("profiles", {
      userId,
      preferredLanguage: "en",
      onboarded: false,
      createdAt: Date.now(),
      ...patch,
    });
  }
}

// ---- Personalization ------------------------------------------------------
//
// These three fields go verbatim into the system prompt. They are the most
// direct control a person has over how Dhee sees them, so the rules are the
// same ones `setName` already follows: trim, cap, and treat empty as "unset"
// rather than as an empty string. Clearing a field has to actually stop the
// model being told it. See docs/build/specs/personalization.md.

const NICKNAME_MAX = 60;
const OCCUPATION_MAX = 120;
const ABOUT_YOU_MAX = 600;
const TRADITION_MAX = 60;

/** Trimmed and capped, or undefined when there's nothing left. */
function normalize(value: string | undefined, max: number): string | undefined {
  if (value === undefined) return undefined;
  const trimmed = value.trim().slice(0, max);
  return trimmed.length > 0 ? trimmed : undefined;
}

export const currentProfile = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) return null;
    const profile = await getProfile(ctx, userId);
    if (!profile) {
      return {
        userId,
        onboarded: false,
        preferredLanguage: "en" as const,
        traditions: [],
      };
    }
    return {
      userId,
      onboarded: profile.onboarded,
      preferredLanguage: profile.preferredLanguage,
      name: profile.name,
      avatarUrl: profile.avatarId
        ? await ctx.storage.getUrl(profile.avatarId)
        : null,
      nickname: profile.nickname,
      occupation: profile.occupation,
      aboutYou: profile.aboutYou,
      traditions: profile.traditions ?? [],
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

export const completeOnboarding = mutation({
  args: {
    name: v.optional(v.string()),
    preferredLanguage: v.union(v.literal("en"), v.literal("hi")),
    // Optional. Writes the same field the settings picker edits — two sources
    // of truth for one setting is how they drift apart.
    tradition: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, { name, preferredLanguage, tradition }) => {
    const userId = await requireUserId(ctx);
    const lens = normalize(tradition, TRADITION_MAX);
    await patchProfile(ctx, userId, {
      name: normalize(name, NICKNAME_MAX),
      preferredLanguage,
      onboarded: true,
      // One lens, which every plan allows — no cap check needed here.
      ...(lens ? { traditions: [lens] } : {}),
    });
    return null;
  },
});

export const setName = mutation({
  args: { name: v.string() },
  returns: v.null(),
  handler: async (ctx, { name }) => {
    const userId = await requireUserId(ctx);
    // An empty name is meaningful: it means "don't call me anything".
    await patchProfile(ctx, userId, { name: normalize(name, NICKNAME_MAX) });
    return null;
  },
});

export const setPersonalization = mutation({
  // Any subset. A field left out is untouched; a field sent empty is cleared.
  args: {
    nickname: v.optional(v.string()),
    occupation: v.optional(v.string()),
    aboutYou: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, { nickname, occupation, aboutYou }) => {
    const userId = await requireUserId(ctx);
    const patch = {
      ...(nickname !== undefined
        ? { nickname: normalize(nickname, NICKNAME_MAX) }
        : {}),
      ...(occupation !== undefined
        ? { occupation: normalize(occupation, OCCUPATION_MAX) }
        : {}),
      ...(aboutYou !== undefined
        ? { aboutYou: normalize(aboutYou, ABOUT_YOU_MAX) }
        : {}),
    };
    await patchProfile(ctx, userId, patch);
    return null;
  },
});

export const setTraditions = mutation({
  // Replaces the list rather than adding to it — the client owns the set and
  // sends what it should now be.
  args: { traditions: v.array(v.string()) },
  returns: v.null(),
  handler: async (ctx, { traditions }) => {
    const userId = await requireUserId(ctx);
    const profile = await getProfile(ctx, userId);

    const cleaned: string[] = [];
    for (const raw of traditions) {
      const name = normalize(raw, TRADITION_MAX);
      // Case-insensitive, because "stoicism" and "Stoicism" are one lens.
      if (
        name &&
        !cleaned.some((t) => t.toLowerCase() === name.toLowerCase())
      ) {
        cleaned.push(name);
      }
    }

    // Enforced here, not only in the UI: a client that sends three lenses on a
    // free plan gets an error rather than three lenses.
    const limit = traditionLimit(planForProfile(profile));
    if (cleaned.length > limit) {
      throw new Error(
        limit === 1
          ? "The free plan includes one tradition lens."
          : `You can keep up to ${limit} tradition lenses.`,
      );
    }

    await patchProfile(ctx, userId, { traditions: cleaned });
    return null;
  },
});

// What the prompt builder needs, for the actions that generate a reply.
// Internal because it is read on someone's behalf during generation rather
// than by them.
export const personalizationForUser = internalQuery({
  args: { userId: v.id("users") },
  returns: v.object({
    nickname: v.optional(v.string()),
    occupation: v.optional(v.string()),
    aboutYou: v.optional(v.string()),
    traditions: v.array(v.string()),
  }),
  handler: async (ctx, { userId }) => {
    const profile = await getProfile(ctx, userId);
    return {
      nickname: profile?.nickname,
      occupation: profile?.occupation,
      aboutYou: profile?.aboutYou,
      traditions: profile?.traditions ?? [],
    };
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
    await patchProfile(ctx, userId, { preferredLanguage });
    return null;
  },
});
