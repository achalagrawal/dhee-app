// What a person's plan entitles them to.
//
// Two values, deliberately: `unlimited` is granted by hand (`users.setPlan`)
// while upgrades are fulfilled manually. Named pricing tiers land with
// payments, not now.

import { type Infer, v } from "convex/values";

export const planValidator = v.union(v.literal("free"), v.literal("unlimited"));

export type Plan = Infer<typeof planValidator>;

/**
 * The plan on a user row. Fail closed: a row written before plans existed, or
 * a backfill that didn't finish, reads as free rather than as unlimited.
 */
export function planFor(user: { plan?: Plan } | null | undefined): Plan {
  return user?.plan === "unlimited" ? "unlimited" : "free";
}

/** Free gets one tradition lens; paid gets several (design `PRICING`). */
export const FREE_TRADITION_LIMIT = 1;

/**
 * A ceiling rather than "unlimited": every lens is more text in the system
 * prompt, and a hundred of them would crowd out the conversation. Well above
 * any real use.
 */
export const PAID_TRADITION_LIMIT = 10;

export function traditionLimit(plan: Plan | undefined): number {
  return plan === "unlimited" ? PAID_TRADITION_LIMIT : FREE_TRADITION_LIMIT;
}
