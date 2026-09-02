import { describe, expect, it } from "vitest";
import { t, type Language } from "./i18n";
import { MODE_KEYS, modeLabelKey, startersFor, type ModeKey } from "./starters";

const LANGUAGES: Language[] = ["en", "hi"];

describe("modes", () => {
  it("offers the six the design names", () => {
    expect([...MODE_KEYS]).toEqual([
      "decisions",
      "relationships",
      "purpose",
      "grief",
      "work",
      "everyday",
    ]);
  });

  it("has a chip label in every language", () => {
    // A missing label renders as a crash or an empty chip, and this is the only
    // place the key is built by string concatenation rather than written out.
    for (const lang of LANGUAGES) {
      for (const mode of MODE_KEYS) {
        const label = t(lang, modeLabelKey(mode));
        expect(label, `${lang}/${mode}`).toBeTruthy();
      }
    }
  });
});

describe("startersFor", () => {
  // How many questions a mode offers is an editorial call and moves as the
  // writing is revised, so these assert a floor rather than a target. The
  // floor is what `docs/build/FEATURES.md` promises — three per mode — so a
  // mode that loses a question has to update the row rather than quietly
  // shipping two. The count that actually has to hold is the cross-language
  // one below.
  const FLOOR = 3;

  it("gives the default set when no mode is chosen", () => {
    for (const lang of LANGUAGES) {
      expect(startersFor(lang, undefined).length).toBeGreaterThanOrEqual(FLOOR);
    }
  });

  it("gives questions for every mode in every language", () => {
    for (const lang of LANGUAGES) {
      for (const mode of MODE_KEYS) {
        const set = startersFor(lang, mode);
        expect(set.length, `${lang}/${mode}`).toBeGreaterThanOrEqual(FLOOR);
        for (const question of set) expect(question.trim()).not.toBe("");
      }
    }
  });

  it("matches question counts across languages", () => {
    // Someone adding an English question and forgetting the Hindi one makes the
    // screen quietly shorter for half the users rather than failing.
    const modes: (ModeKey | undefined)[] = [undefined, ...MODE_KEYS];
    for (const mode of modes) {
      expect(startersFor("hi", mode).length, String(mode)).toBe(
        startersFor("en", mode).length,
      );
    }
  });

  it("keeps every mode's questions distinct from every other's", () => {
    // Two modes offering the same question means one of them is not earning
    // its place on screen.
    for (const lang of LANGUAGES) {
      const all = MODE_KEYS.flatMap((mode) => [...startersFor(lang, mode)]);
      expect(new Set(all).size, lang).toBe(all.length);
    }
  });

  it("writes the Hindi set in Devanagari rather than leaving English in place", () => {
    // An untranslated starter is invisible in review — it reads as a real
    // string — so it gets asserted instead.
    const devanagari = /[ऀ-ॿ]/;
    for (const mode of [undefined, ...MODE_KEYS]) {
      for (const question of startersFor("hi", mode)) {
        expect(devanagari.test(question), question).toBe(true);
      }
    }
  });

  it("asks real questions rather than offering topics", () => {
    // The point of a starter is to hand someone words for a thing they have not
    // yet put into words. "Purpose" does not do that; a sentence does.
    for (const lang of LANGUAGES) {
      for (const mode of [undefined, ...MODE_KEYS]) {
        for (const question of startersFor(lang, mode)) {
          expect(question.length, question).toBeGreaterThan(20);
        }
      }
    }
  });
});
