// The models a person can choose between, and which one they get by default.
//
// Tiers are named for how Dhee is thinking rather than for what is behind it —
// the mockup's convention, and the right one for a companion: someone is
// picking a mode of attention, not routing to a vendor. Display names and
// descriptions live in `src/lib/models.ts` with the rest of the user-facing
// strings; only the wiring is here.
//
// The third tier the design reserves, `deep`, is deliberately unclaimed. It is
// `pro`-gated in the mockup, and spending that name on a free tier now would
// leave nowhere to go when there is genuinely more-thorough work to sell —
// a longer step budget, more corpus reading.
//
// Direction, decided 2026-11-24: Dhee moves toward open-weight models. That
// day OpenRouter cut the account off from closed-weight models (Anthropic,
// Google, OpenAI) with no warning, and Dhee stopped answering. A product
// cannot rest on a provider that can do that, so the default and everything
// that remembers people (titles, extraction) run on open weights, and the one
// closed model left, Reflective, is reached through Anthropic's own API with a
// fallback to the default when it fails.

export type ModelTier = "quick" | "reflective";

export const MODEL_TIERS: readonly ModelTier[] = [
  "quick",
  "reflective",
] as const;

/**
 * The model behind each tier, as `provider/model`. Changing a slug here is the
 * whole of switching a tier's model — nothing else in the app names one.
 *
 * Quick goes through OpenRouter, so its slug is an OpenRouter slug. Reflective
 * goes to Anthropic's API directly (see `convex/agents/config.ts`), which takes
 * the part after `anthropic/`; the prefix stays so the usage ledger keeps one
 * name for the model across the move.
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
  // overnight. The eval in PR #164 put 1017 at 17/54 on the current prompt,
  // with brevity the main failure, against 6/18 for 0731 on the August prompt:
  // no fair baseline, but no sign it is worse, and it is the newer,
  // cheaper-on-input build.
  quick: "deepseek/deepseek-v4.1-flash-1017",
  // Sonnet 5.5, moved from Sonnet 5 on 2026-11-24 at Achal's call. PR #164's
  // eval had 5.5 at 17/54 against 5's 35/54, nearly all of it the brevity
  // rule, so expect longer replies here until the prompt is tuned for it. The
  // id after `anthropic/` is Anthropic's (`claude-sonnet-5-5`), not
  // OpenRouter's (`claude-sonnet-5.5`), since this tier calls Anthropic
  // directly. Sonnet 5.5 rejects forced `tool_choice` (`any`, `tool`); the
  // final-step guard sends `none`, which it accepts. It also checks replayed
  // thinking against the conversation, which convex/agents/config.ts handles.
  reflective: "anthropic/claude-sonnet-5-5",
};

/**
 * What someone gets before they choose, and what a signed-out or
 * not-yet-migrated profile falls back to — and what answers when the tier they
 * chose cannot.
 *
 * Quick, since 2026-11-24. It began as an emergency move when Reflective was
 * cut off, and stayed as a decision: the default is an open-weight model, so
 * no single provider can take Dhee down for people who never chose otherwise.
 * It must always be available; `availableModelTiers` in config.ts never drops
 * it.
 */
export const DEFAULT_MODEL_TIER: ModelTier = "quick";

/** Narrow an unvalidated string — a stored preference, a client argument. */
export function isModelTier(value: unknown): value is ModelTier {
  return value === "quick" || value === "reflective";
}

/**
 * The tier to answer with, given the tiers that can answer right now.
 *
 * Anything unrecognised falls back to the default rather than throwing: a
 * preference written by an older build, or a tier that has since been removed,
 * must not be able to stop someone getting a reply. The same goes for a tier
 * that is unavailable right now — and the stored choice is left alone, so
 * people get exactly what they picked back when the tier returns.
 *
 * `available` is required rather than defaulted, so no call site can quietly
 * assume every tier is up. On the server it comes from `availableModelTiers`;
 * on the client, from the server.
 */
export function resolveModelTier(
  stored: string | undefined,
  available: readonly ModelTier[],
): ModelTier {
  return isModelTier(stored) && available.includes(stored)
    ? stored
    : DEFAULT_MODEL_TIER;
}

/** The slug for a stored preference, given the tiers available right now. */
export function modelSlugFor(
  stored: string | undefined,
  available: readonly ModelTier[],
): string {
  return MODEL_SLUGS[resolveModelTier(stored, available)];
}
