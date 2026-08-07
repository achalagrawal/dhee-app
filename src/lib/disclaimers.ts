import type { StringKey } from "./i18n";

// What Dhee tells people about itself, in one place. Onboarding's second step,
// the gate that catches accounts predating it, and /about all render this same
// list — there is no second copy of the copy. Spec:
// docs/build/specs/ai-disclaimers.md, closing #133.
//
// The order is the argument, and it only reads as one in this order: what Dhee
// is made of → so its reading is contingent → so it cannot stand in for a
// person → and it can simply be wrong → and it is early → and so don't confide
// in it. Reordering breaks the reasoning, not just the layout.

export type Disclaimer = {
  title: StringKey;
  body: StringKey;
};

export const DISCLAIMERS: readonly Disclaimer[] = [
  { title: "discModelTitle", body: "discModelBody" },
  { title: "discVariesTitle", body: "discVariesBody" },
  { title: "discHumanTitle", body: "discHumanBody" },
  { title: "discWrongTitle", body: "discWrongBody" },
  { title: "discTrialTitle", body: "discTrialBody" },
  { title: "discPrivateTitle", body: "discPrivateBody" },
] as const;

// The model named in the first point, in the form a person would recognise it
// rather than as a routing slug. **Keep this in step with CHAT_MODEL in
// `convex/config.ts`** — naming the wrong model is the one way this particular
// disclaimer can itself mislead. It is a client-side constant on purpose: it is
// chrome, and no screen should wait on a round trip to render its own caveats.
export const CHAT_MODEL_NAME = "Claude Sonnet 5";
