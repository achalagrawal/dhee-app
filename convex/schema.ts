import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

// The Convex Agent component owns thread and message tables. Anything here
// is Dhee's own layer-2 (user model) or layer-3 (derived context) state.
// Tables added incrementally per milestone.

export default defineSchema({
  // Users. Populated on first sign-in (M3). For M1 threads are anonymous.
  users: defineTable({
    name: v.optional(v.string()),
    preferredLanguage: v.union(v.literal("en"), v.literal("hi")),
    onboarded: v.boolean(),
    createdAt: v.number(),
  }),
});
