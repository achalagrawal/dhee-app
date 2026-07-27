import { type Language, t } from "./i18n";

// The home screen's hero line: "Good evening, Subhash Trivedi". Time-of-day
// greeting plus the person's name, and the type size that keeps the two of them
// on one line.

/** The greeting for this hour, with the name appended when we know it. */
export function greetingText(lang: Language, name?: string): string {
  const hour = new Date().getHours();
  const base =
    hour < 12
      ? t(lang, "greetingMorning")
      : hour < 17
        ? t(lang, "greetingAfternoon")
        : t(lang, "greetingEvening");
  const trimmed = name?.trim();
  return trimmed ? `${base}, ${trimmed}` : base;
}

/** Full size, as in the mockup — what a roomy screen shows. */
const MAX_SIZE = 30;
/**
 * Small enough for a long name on a narrow phone, still clearly a heading.
 * Past this the line wraps rather than shrinking away.
 */
const MIN_SIZE = 18;

// Advance widths in em, rounded off HankenGrotesk_500Medium (the face this line
// is set in): "i"/"l"/"," ≈ 0.24, "m" ≈ 0.83, "W" ≈ 0.96, capitals ≈ 0.63, the
// rest of lowercase ≈ 0.55. Four buckets land within ~3% of the real width for
// ordinary names, which is all the precision a font size needs.
const NARROW = new Set([..."ijlItfr!|.,:;'\"()[]{}/\\ -"]);
const WIDE = new Set([..."mwMW@%"]);

// Devanagari matras and other combining marks sit on the base letter instead of
// advancing the pen, so they cost no width.
const COMBINING = /\p{M}/u;

function widthInEm(text: string): number {
  let em = 0;
  for (const ch of text) {
    if (COMBINING.test(ch)) continue;
    if (NARROW.has(ch)) em += 0.28;
    else if (WIDE.has(ch)) em += 0.87;
    else if (ch >= "A" && ch <= "Z") em += 0.63;
    // Hindi is set in Noto Sans Devanagari, whose letters run wider than
    // Hanken's; the same bucketing, one notch up.
    else if ((ch.codePointAt(0) ?? 0) > 0x7f) em += 0.65;
    else em += 0.56;
  }
  return em;
}

/**
 * The largest size at which `text` still fits `availableWidth` on one line,
 * clamped to a readable range. A phone gets a smaller greeting than a laptop,
 * and a long name a smaller one than a short — which is the whole point: on a
 * narrow screen "Good evening, Subhash Trivedi" was wrapping to two lines.
 */
export function greetingFontSize(text: string, availableWidth: number): number {
  const em = widthInEm(text);
  if (em <= 0 || availableWidth <= 0) return MAX_SIZE;
  // The estimate lands within ~3% of the rendered width either way, so leave
  // that much of the line spare rather than sizing right up to the edge.
  const fits = (availableWidth * 0.96) / em;
  return Math.round(Math.min(MAX_SIZE, Math.max(MIN_SIZE, fits)));
}
