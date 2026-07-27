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
 * Whether a change to someone's lenses should be refused — the whole rule, in
 * one place, because the settings screen has to explain exactly what
 * `users.setTraditions` will enforce.
 *
 * Madhyasth Darshan is not counted. The quota exists because each framing lens
 * is more text in the system prompt, but the corpus lens is a capability rather
 * than a framing — it is what opens the books Dhee actually holds. Counting it
 * meant someone who had already named Stoicism could not reach study mode at
 * all without giving up the lens they came with, which made the one tradition
 * that answers "replies feel thin" the hardest one to switch on.
 *
 * Taking a lens off is always allowed, even from a list that is already over
 * the cap. A plan can be revoked, so being over it is not necessarily anyone's
 * doing — and refusing every edit would leave "clear them all" as the only way
 * back under.
 */
export function tooManyTraditions(
  next: string[],
  previous: string[],
  plan: Plan | undefined,
): boolean {
  const counted = (list: string[]) =>
    list.filter((t) => !isCorpusLensName(t)).length;
  return (
    counted(next) > traditionLimit(plan) && counted(next) >= counted(previous)
  );
}
