// Suggestions for the tradition lens, from the design's `TRADITIONS` array
// (mockup/project/Dhee.dc.html, line 1970).
//
// Only suggestions. A tradition typed by hand is first-class — the picker
// offers to add whatever someone writes, because this list can't anticipate
// what a person thinks within, and being told "not on the list" about your own
// frame of reference is a bad way to meet a product.
//
// Madhyasth Darshan is moved to the front of the design's order on purpose: it
// is the lens onboarding preselects, and the one whose books Dhee actually
// holds. A preselected chip sitting second in the row reads as an accident.

/**
 * The lens onboarding starts with, and the one settings nudges toward.
 *
 * Spelled exactly as `isCorpusLens` expects (convex/agents/dhee.ts), so the
 * default reaches study mode rather than landing as a framing lens with no
 * books behind it. Anyone who'd rather not have it taps the chip off.
 */
export const DEFAULT_TRADITION = "Madhyasth Darshan";

export const TRADITIONS = [
  DEFAULT_TRADITION,
  "Stoicism",
  "Advaita Vedanta",
  "Buddhist psychology",
  "Zen",
  "Taoism",
  "Confucianism",
  "Existentialism",
  "Absurdism",
  "Epicureanism",
  "Cognitive behavioral",
  "Acceptance & commitment",
  "Jungian",
  "Psychoanalysis",
  "Humanistic psychology",
  "Ikigai",
  "Bhagavad Gita",
  "Sufism",
  "Christian contemplative",
  "Jewish Mussar",
  "Aristotelian virtue ethics",
  "Ubuntu",
  "Indigenous wisdom",
  "Nonviolent Communication",
  "Internal Family Systems",
] as const;
