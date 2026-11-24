import { DEFAULT_MODEL_TIER, MODEL_TIERS, type ModelTier } from "./models";

/**
 * The tiers that can answer right now, on this deployment.
 *
 * The open-weight tiers (Quick, Thoughtful) always can: they go through
 * OpenRouter with the same key as everything else. Reflective needs the
 * Anthropic key to be set: it is the account's own key, set on production
 * alone (see convex/agents/config.ts), so a preview or dev backend without it
 * shows Reflective greyed out instead of failing on it. Read per call, so setting or removing the key takes effect
 * without a deploy.
 *
 * Server-only: the client learns this from `users.modelChoices`, because the
 * environment it would read is the server's.
 */
export function availableModelTiers(): ModelTier[] {
  return MODEL_TIERS.filter(
    (tier) =>
      tier === DEFAULT_MODEL_TIER ||
      tier === "thoughtful" ||
      (tier === "reflective" && Boolean(process.env.ANTHROPIC_API_KEY)),
  );
}
