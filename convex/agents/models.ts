// The models a person can choose between, and which one they get by default.
//
// Two tiers, named for how Dhee is thinking rather than for what is behind it —
// the mockup's convention, and the right one for a companion: someone is
// picking a mode of attention, not routing to a vendor. Display names and
// descriptions live in `src/lib/models.ts` with the rest of the user-facing
// strings; only the wiring is here.
//
// The third tier the design reserves, `deep`, is deliberately unclaimed. It is
// `pro`-gated in the mockup, and spending that name on a free tier now would
// leave nowhere to go when there is genuinely more-thorough work to sell —
// a longer step budget, more corpus reading. Two now, three when billing lands.

export type ModelTier = "quick" | "reflective";

export const MODEL_TIERS: readonly ModelTier[] = [
  "quick",
  "reflective",
] as const;

/**
 * OpenRouter slugs, one per tier. Changing a slug here is the whole of
 * switching a tier's model — nothing else in the app names one.
 *
 * A wrong slug fails at request time rather than at build or deploy, because
 * this is only ever a string to us. `pnpm smoke` runs a full turn against the
 * default and is the cheapest way to catch one.
 */
export const MODEL_SLUGS: Record<ModelTier, string> = {
  quick: "deepseek/deepseek-v4-flash",
  reflective: "anthropic/claude-sonnet-5",
};

/**
 * What someone gets before they choose, and what a signed-out or
 * not-yet-migrated profile falls back to.
 *
 * Quick, deliberately. Most of what people bring is answerable without the
 * slower path, and a reply that arrives while someone is still thinking about
 * the question is worth more to them than a marginally better one that arrives
 * after they have moved on. Reflective is one tap away in the composer for the
 * questions that deserve it.
 */
export const DEFAULT_MODEL_TIER: ModelTier = "quick";

/** Narrow an unvalidated string — a stored preference, a client argument. */
export function isModelTier(value: unknown): value is ModelTier {
  return value === "quick" || value === "reflective";
}

/**
 * The tier to answer with. Anything unrecognised falls back to the default
 * rather than throwing: a preference written by an older build, or a tier that
 * has since been removed, must not be able to stop someone getting a reply.
 */
export function resolveModelTier(stored: string | undefined): ModelTier {
  return isModelTier(stored) ? stored : DEFAULT_MODEL_TIER;
}

/** The OpenRouter slug for a stored preference. */
export function modelSlugFor(stored: string | undefined): string {
  return MODEL_SLUGS[resolveModelTier(stored)];
}
