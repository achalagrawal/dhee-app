import type { ModelTier } from "@convex/agents/models";
import type { Language, StringKey } from "./i18n";

// How the two model tiers are named and described to the person choosing.
//
// The wiring — which OpenRouter slug each tier is, which is the default — lives
// in `convex/agents/models.ts`. This file is only what someone reads, and the
// tier keys are imported from there so the two cannot fall out of step.
//
// On the naming: every name is "Dhee " plus a way of thinking, never a speed or
// a vendor. That is the mockup's convention and it is the right one here —
// someone is choosing how much attention to ask for, not routing to a model.
// The names stay abstract; the descriptions carry the trade honestly, because
// that is what a person actually decides on.

// Written out rather than built from the tier key, so a tier without strings is
// a type error here instead of a blank row in the picker.
const NAME_KEYS = {
  quick: "modelQuickName",
  reflective: "modelReflectiveName",
} as const satisfies Record<ModelTier, StringKey>;

const DESC_KEYS = {
  quick: "modelQuickDesc",
  reflective: "modelReflectiveDesc",
} as const satisfies Record<ModelTier, StringKey>;

export const modelNameKey = (tier: ModelTier): StringKey => NAME_KEYS[tier];
export const modelDescKey = (tier: ModelTier): StringKey => DESC_KEYS[tier];

/**
 * The short label on the composer pill.
 *
 * "Dhee Quick" is too wide for a pill that sits beside the attach button on a
 * narrow screen, so the pill drops the "Dhee " and keeps the distinguishing
 * word. The full name is what the open menu shows.
 */
export function modelPillLabel(lang: Language, tier: ModelTier): string {
  return PILL[lang][tier];
}

const PILL: Record<Language, Record<ModelTier, string>> = {
  en: { quick: "Quick", reflective: "Reflective" },
  hi: { quick: "क्विक", reflective: "रिफ्लेक्टिव" },
};
