import { DHEE_INSTRUCTIONS } from "../agents/dhee";

// Prompt variants: the harness's instrument for attributing behaviour to prompt
// sections. A variant swaps the *base* instructions while every personalization
// layer stays identical, so when a run with a variant moves a check or a judge
// score, the moved section is the only candidate cause.
//
// Two disciplines keep this honest:
//
// Transforms anchor on exact substrings of DHEE_INSTRUCTIONS and THROW when an
// anchor is missing. A prompt edit that renames a heading must break the
// variant loudly at run time, not quietly turn an ablation into a no-op that
// "proves" the section never mattered.
//
// Additions are written from the corpus, not from the model's recollection of
// it — the same rule the base prompt holds itself to. Every claim in
// MORE_GROUND carries its source in the comment above it.

export type PromptVariant = {
  id: string;
  /** What running this variant is supposed to reveal. */
  why: string;
  transform: (base: string) => string;
};

/** Remove [start, end), keeping the end anchor. Throws when either is missing. */
function cut(base: string, start: string, end: string): string {
  const from = base.indexOf(start);
  const to = base.indexOf(end);
  if (from === -1 || to === -1 || to <= from) {
    throw new Error(
      `variant anchor missing: ${JSON.stringify((from === -1 ? start : end).slice(0, 60))} — DHEE_INSTRUCTIONS changed; update convex/evals/variants.ts`,
    );
  }
  return base.slice(0, from) + base.slice(to);
}

/** Insert before an anchor. Throws when the anchor is missing. */
function insertBefore(base: string, anchor: string, text: string): string {
  const at = base.indexOf(anchor);
  if (at === -1) {
    throw new Error(
      `variant anchor missing: ${JSON.stringify(anchor.slice(0, 60))} — DHEE_INSTRUCTIONS changed; update convex/evals/variants.ts`,
    );
  }
  return base.slice(0, at) + text + base.slice(at);
}

// Additional ground, written from the corpus on 2026-08-07. Sources:
// - स्वभाव paribhasha, p213: "मानवीयतापूर्ण स्वभाव धीरता, वीरता, उदारता, दया, कृपा, करुणा".
// - नियम-त्रय (बौद्धिक, सामाजिक, प्राकृतिक): मानव कर्म दर्शन p16, p18.
// - न्याय as संबंध, मूल्य, मूल्यांकन, उभय तृप्ति: मानव कर्म दर्शन p88.
// - मूल्य, चरित्र, नैतिकता — चरित्र as स्वधन-स्वनारी/स्वपुरुष-दयापूर्ण कार्य व्यवहार, नैतिकता as
//   तन-मन-धन का सदुपयोग-सुरक्षा: समाधानात्मक भौतिकवाद p78.
const MORE_GROUND = `\
- **The human स्वभाव is already known.** Living in मानव चेतना, a person's nature expresses as धीरता (patience that comes from resolution), वीरता (the courage to live what one has understood), उदारता (generosity with one's means), and toward those still confused, दया, कृपा, करुणा. When someone asks "what should I be like?", this is the answer's shape — not a virtue list to perform, but what remains when भ्रम thins.

- **Three orders of law, one conduct.** Every workable decision squares with all three नियम at once — बौद्धिक (the order of understanding itself), सामाजिक (what holds between people), प्राकृतिक (what the body and the earth require). A choice that satisfies one while violating another feels unresolved because it is; the felt incompleteness after a "successful" but unjust move is this, reporting in.

- **न्याय is concrete, not abstract.** Justice in this darshan is four things in sequence: the relationship recognised (संबंध), the values in it recognised (मूल्य), their fulfilment evaluated honestly (मूल्यांकन), and both sides reaching tripti (उभय तृप्ति). Most "was I wronged?" questions become answerable when walked through these four rather than argued at the level of grievance.

- **Conduct has three strands.** मूल्य (the values lived in relationship), चरित्र (character: contentment with one's own earning — स्वधन, one's own partner — स्वनारी/स्वपुरुष, and kindness in work and dealing — दयापूर्ण कार्य-व्यवहार), and नैतिकता (ethics: the right use and protection of तन, मन, धन — body, mind, means). When a question is really "am I living rightly?", these three strands are where to look, in that order.

`;

export const VARIANTS: Record<string, PromptVariant> = {
  "no-ground": {
    id: "no-ground",
    why: "Ablation: remove the entire FUNDAMENTALS block ('The ground you think from', the three अनुसन्धान included). If replies hold up, the block is decoration; if depth and grounding collapse, the block is load-bearing and its token cost is earned. Read against the base run.",
    transform: (base) =>
      cut(
        base,
        "## The ground you think from",
        "## How to see, and how to answer",
      ),
  },
  "no-altitude": {
    id: "no-altitude",
    why: "Ablation: remove the 'answer from a higher dimension' passage — the product's core move. Expected to gut widenedTheFrame while leaving the checks green; if it doesn't, the judge isn't measuring what we think it measures.",
    transform: (base) =>
      cut(base, "**Answer from a higher dimension", "**Depth, not length.**"),
  },
  "more-ground": {
    id: "more-ground",
    why: "The expansion question: does adding more corpus-grounded fundamentals (स्वभाव, नियम-त्रय, न्याय as four steps, मूल्य-चरित्र-नैतिकता) make replies deeper and more precise, or just longer and more jargon-laden? The added prefix is stable, so in production it would ride the system-prompt cache at ~10% of base input price.",
    transform: (base) =>
      insertBefore(base, "### The three अनुसन्धान", MORE_GROUND),
  },
};

export function variantFor(id: string | undefined): PromptVariant | null {
  if (!id) return null;
  const variant = VARIANTS[id];
  if (!variant) {
    throw new Error(
      `Unknown prompt variant "${id}". Known: ${Object.keys(VARIANTS).join(", ")}.`,
    );
  }
  return variant;
}

/** The base instructions a run should use. */
export function baseInstructionsFor(variantId: string | undefined): string {
  const variant = variantFor(variantId);
  return variant ? variant.transform(DHEE_INSTRUCTIONS) : DHEE_INSTRUCTIONS;
}
