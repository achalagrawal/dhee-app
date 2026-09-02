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
import { planForProfile, traditionLimit } from "./lib/plan";
import { isCorpusLensName } from "./agents/dhee";

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
    await ctx.db.patch("profiles", profile._id, patch);
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
    const userId = await getUserId(ctx);
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
    await ctx.db.patch("profiles", profile._id, { avatarId: storageId });
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
    await ctx.db.patch("profiles", profile._id, { avatarId: storageId });
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
    //
    // Madhyasth Darshan is not counted. The quota exists because each framing
    // lens is more text in the system prompt, but the corpus lens is a
    // capability rather than a framing — it is what opens the books Dhee
    // actually holds. Counting it meant someone who had already named Stoicism
    // could not reach study mode at all without giving up the lens they came
    // with, which made the one tradition that answers "replies feel thin"
    // the hardest one to switch on.
    const limit = traditionLimit(planForProfile(profile));
    const counted = cleaned.filter((t) => !isCorpusLensName(t));
    if (counted.length > limit) {
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

// Where the counts stop being exact. High enough that no real account is
// near it; the UI shows the bound itself for anyone who somehow is.
const COUNT_BOUND = 1000;

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
    // `.take(COUNT_BOUND)` rather than `.collect()`: these reads exist only to
    // put numbers on the settings screen, and an unbounded read makes that
    // screen cost whatever the person's whole history costs. Past the bound
    // the exact figure stops informing the "delete everything" choice anyway.
    const [user, profile, observations, inquiries, concepts] =
      await Promise.all([
        ctx.db.get("users", userId),
        getProfile(ctx, userId),
        ctx.db
          .query("observations")
          .withIndex("by_user", (q) => q.eq("userId", userId))
          .take(COUNT_BOUND),
        ctx.db
          .query("inquiries")
          .withIndex("by_user", (q) => q.eq("userId", userId))
          .take(COUNT_BOUND),
        ctx.db
          .query("conceptsTouched")
          .withIndex("by_user_concept", (q) => q.eq("userId", userId))
          .take(COUNT_BOUND),
      ]);

    return {
      email: user?.email,
      name: profile?.name,
      preferredLanguage: profile?.preferredLanguage ?? ("en" as const),
      // 0, not Date.now(): the clock inside a query is pinned and never
      // re-fires the subscription, and this branch is unreachable anyway —
      // requireUserId just resolved the row `user` was read from.
      memberSince: profile?.createdAt ?? user?._creationTime ?? 0,
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
