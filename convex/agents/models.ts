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
  // The dated build, not `~deepseek/deepseek-v4-flash-latest`. The rolling
  // alias re-points when DeepSeek ships a new build — a model change with no
  // deploy, no diff, and no eval run. Upgrading the pin is deliberate: bump
  // the date here and put an eval run in the PR that does it. (Bare slugs are
  // pins in disguise: OpenRouter resolves `deepseek/deepseek-v4.1-flash` to
  // the first v4.1 build, 0910, the way `deepseek/deepseek-v4-flash` stayed
  // on 0423.) Moved from v4-flash-0731 on 2026-11-22.
  quick: "deepseek/deepseek-v4.1-flash-1017",
  // Held on Sonnet 5 when the other two moved on 2026-11-22. Sonnet 5.5 is
  // cheaper and faster, and the judge rated it the same or higher, but on the
  // same prompt it passed 17/54 rule checks against Sonnet 5's 35/54. Nearly
  // all of the gap is the brevity rule: it writes the same number of words
  // but splits them into more paragraphs and asks more questions back. Move
  // only once the prompt holds it to the rule. Use the undated id when you
  // do: an Anthropic version name is already a fixed snapshot (the dated
  // `anthropic/claude-sonnet-5.5-20260928` resolves back to it), and the
  // name that moves is `~anthropic/claude-sonnet-latest`.
  reflective: "anthropic/claude-sonnet-5",
};

/**
 * What someone gets before they choose, and what a signed-out or
 * not-yet-migrated profile falls back to.
 *
 * Reflective — what everyone was getting before tiers existed — until Quick
 * has earned the spot. Two gates, in order: an eval run showing Quick holds up
 * inside this prompt (corpus grounding, paribhasha precision, the script
 * rule), and a stretch of `llmUsage` and feedback from people who opted into
 * Quick themselves. Shipping the picker without moving the default means
 * nothing changes for anyone who does nothing, and the opt-ins are the canary.
 * The flip itself is this one line, in its own PR, with the evidence attached.
 */
export const DEFAULT_MODEL_TIER: ModelTier = "reflective";

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
