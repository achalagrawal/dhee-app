// What a person's plan entitles them to.
//
// Two values, deliberately: `unlimited` is granted by hand (`users.setPlan`)
// while upgrades are fulfilled manually. Named pricing tiers land with
// payments, not now.

import { type Infer, v } from "convex/values";
import { isCorpusLensName } from "./lens";

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

/**
 * The lenses that survive on `plan` — the ones chosen earliest, cut to what it
 * allows. The whole rule, in one place: `users.setTraditions` refuses by it,
 * `users.setPlan` trims a downgrade by it, and the settings screen explains it.
 *
 * Madhyasth Darshan is not counted. The quota exists because each framing lens
 * is more text in the system prompt, but the corpus lens is a capability rather
 * than a framing — it is what opens the books Dhee actually holds. Counting it
 * meant someone who had already named Stoicism could not reach study mode at
 * all without giving up the lens they came with, which made the one tradition
 * that answers "replies feel thin" the hardest one to switch on.
 */
export function keepWithinTraditionLimit(
  traditions: string[],
  plan: Plan | undefined,
): string[] {
  const limit = traditionLimit(plan);
  let counted = 0;
  return traditions.filter(
    (t) => isCorpusLensName(t) || (counted += 1) <= limit,
  );
}

/** Whether the plan would drop any of these — i.e. refuse the change. */
export const tooManyTraditions = (
  next: string[],
  plan: Plan | undefined,
): boolean => keepWithinTraditionLimit(next, plan).length < next.length;
