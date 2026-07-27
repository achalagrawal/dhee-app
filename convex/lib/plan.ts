// What a person's plan entitles them to.
//
// The plan field itself belongs to the free-tier/limits work (#7), which has
// not landed. Until it does, `planForProfile` returns undefined and everyone
// is on the free tier — which is the fail-closed direction, and the same rule
// #7 applies: an unrecognized or missing plan is treated as free rather than
// as unlimited.
//
// When #7 lands, it replaces the body of `planForProfile` and nothing else
// here has to change.

export type Plan = "free" | "reflective" | "patron";

/** Free gets one tradition lens; paid gets several (design `PRICING`). */
export const FREE_TRADITION_LIMIT = 1;

/**
 * A ceiling rather than "unlimited": every lens is more text in the system
 * prompt, and a hundred of them would crowd out the conversation. Well above
 * any real use.
 */
export const PAID_TRADITION_LIMIT = 10;

export function traditionLimit(plan: Plan | undefined): number {
  return plan === "reflective" || plan === "patron"
    ? PAID_TRADITION_LIMIT
    : FREE_TRADITION_LIMIT;
}

/**
 * The plan on a profile. A placeholder until #7 adds the field — see the note
 * at the top of this file.
 */
export function planForProfile(_profile: unknown): Plan | undefined {
  return undefined;
}
