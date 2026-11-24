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
  // the date here and put an eval run in the PR that does it. (The bare
  // `deepseek/deepseek-v4-flash` slug is itself a pin in disguise — OpenRouter
  // resolves it to the older 0423 build at a higher price. The same holds for
  // `deepseek/deepseek-v4.1-flash`, which resolves to the first v4.1 build,
  // 0910.)
  //
  // Moved from v4-flash-0731 on 2026-11-24, when Quick became everyone's tier
  // overnight (see UNAVAILABLE_MODEL_TIERS). The eval in PR #164 put 1017 at
  // 17/54 on the current prompt, with brevity the main failure, against 6/18
  // for 0731 on the August prompt: no fair baseline, but no sign it is worse,
  // and it is the newer, cheaper-on-input build.
  quick: "deepseek/deepseek-v4.1-flash-1017",
  reflective: "anthropic/claude-sonnet-5",
};

/**
 * Tiers that cannot answer right now. The picker shows them greyed out, and a
 * stored preference for one resolves to the default instead, so nobody is left
 * sending messages to a model that will refuse them.
 *
 * Reflective is here because on 2026-11-24 OpenRouter restricted the account
 * from closed-weight models (Anthropic, Google and OpenAI): every Sonnet call
 * came back 403. The stored preference is left alone rather than rewritten, so
 * taking a tier out of this set gives people back exactly what they had chosen.
 * When it comes out, put DEFAULT_MODEL_TIER back too if Quick still has not
 * earned the default on its own evidence.
 */
export const UNAVAILABLE_MODEL_TIERS: ReadonlySet<ModelTier> = new Set([
  "reflective",
]);

/** Whether a tier can answer right now. */
export function isTierAvailable(tier: ModelTier): boolean {
  return !UNAVAILABLE_MODEL_TIERS.has(tier);
}

/**
 * What someone gets before they choose, and what a signed-out or
 * not-yet-migrated profile falls back to.
 *
 * Quick, since 2026-11-24, as an emergency move rather than the planned flip:
 * Reflective is unavailable (see UNAVAILABLE_MODEL_TIERS), and the default has
 * to be a tier that can answer. The planned flip had two gates, in order: an
 * eval run showing Quick holds up inside this prompt (corpus grounding,
 * paribhasha precision, the script rule), and a stretch of `llmUsage` and
 * feedback from people who opted into Quick themselves. Neither has been
 * cleared, so once Reflective is back this returns to it unless they have.
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
 * The same goes for a tier that is unavailable right now.
 */
export function resolveModelTier(stored: string | undefined): ModelTier {
  return isModelTier(stored) && isTierAvailable(stored)
    ? stored
    : DEFAULT_MODEL_TIER;
}

/** The OpenRouter slug for a stored preference. */
export function modelSlugFor(stored: string | undefined): string {
  return MODEL_SLUGS[resolveModelTier(stored)];
}
