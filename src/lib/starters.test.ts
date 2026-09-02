import { describe, expect, it } from "vitest";
import { t, type Language } from "./i18n";
import {
  MODE_KEYS,
  modeLabelKey,
  sampleStarters,
  SAMPLE_SIZE,
  starterPool,
  type ModeKey,
} from "./starters";

const LANGUAGES: Language[] = ["en", "hi"];
const POOLS: (ModeKey | undefined)[] = [undefined, ...MODE_KEYS];

describe("modes", () => {
  it("offers the eight in the order the chips appear", () => {
    // Relationships and parenting first — what most people arrive carrying —
    // and adhyayan last, where a newcomer can pass it by and a student finds it.
    expect([...MODE_KEYS]).toEqual([
      "relationships",
      "parenting",
      "decisions",
      "mind",
      "work",
      "change-loss",
      "big-questions",
      "adhyayan",
    ]);
  });

  it("has a chip label in every language", () => {
    for (const lang of LANGUAGES) {
      for (const mode of MODE_KEYS) {
        const label = t(lang, modeLabelKey(mode));
        expect(label, `${lang}/${mode}`).toBeTruthy();
      }
    }
  });

  it("leaves अध्ययन untranslated on the English UI", () => {
    // The word itself is the signal; translating it would defeat the point.
    expect(t("en", modeLabelKey("adhyayan"))).toBe("अध्ययन");
    expect(t("hi", modeLabelKey("adhyayan"))).toBe("अध्ययन");
  });
});

describe("starterPool", () => {
  // A pool has to be wide enough that three drawn from it read differently
  // from one visit to the next; below eight the draws start repeating.
  const FLOOR = 8;

  it("holds at least eight questions per pool in every language", () => {
    for (const lang of LANGUAGES) {
      for (const mode of POOLS) {
        const pool = starterPool(lang, mode);
        expect(pool.length, `${lang}/${String(mode)}`).toBeGreaterThanOrEqual(
          FLOOR,
        );
        for (const question of pool) expect(question.trim()).not.toBe("");
      }
    }
  });

  it("matches question counts across languages", () => {
    // Someone adding an English question and forgetting the Hindi one makes
    // the pool quietly narrower for half the users rather than failing.
    for (const mode of POOLS) {
      expect(starterPool("hi", mode).length, String(mode)).toBe(
        starterPool("en", mode).length,
      );
    }
  });

  it("keeps every mode's questions distinct from every other mode's", () => {
    // The default pool borrows from the modes on purpose — it is the
    // storefront. Two modes sharing a question is a different thing: one of
    // them is not earning its place.
    for (const lang of LANGUAGES) {
      const all = MODE_KEYS.flatMap((mode) => [...starterPool(lang, mode)]);
      expect(new Set(all).size, lang).toBe(all.length);
    }
  });

  it("has no duplicates inside a pool", () => {
    for (const lang of LANGUAGES) {
      for (const mode of POOLS) {
        const pool = starterPool(lang, mode);
        expect(new Set(pool).size, `${lang}/${String(mode)}`).toBe(pool.length);
      }
    }
  });

  it("writes the Hindi pools in Devanagari rather than leaving English in place", () => {
    const devanagari = /[ऀ-ॿ]/;
    for (const mode of POOLS) {
      for (const question of starterPool("hi", mode)) {
        expect(devanagari.test(question), question).toBe(true);
      }
    }
  });

  it("asks real questions rather than offering topics", () => {
    for (const lang of LANGUAGES) {
      for (const mode of POOLS) {
        for (const question of starterPool(lang, mode)) {
          expect(question.length, question).toBeGreaterThan(20);
        }
      }
    }
  });

  it("carries no markdown, since a starter is sent as typed", () => {
    // A starter becomes the person's own message. Emphasis markers would sit
    // in their bubble as literal asterisks.
    for (const lang of LANGUAGES) {
      for (const mode of POOLS) {
        for (const question of starterPool(lang, mode)) {
          expect(question, question).not.toMatch(/[*_`#]/);
        }
      }
    }
  });

  it("keeps the darshan's vocabulary out of every pool but adhyayan", () => {
    // Plain language at the door. Adhyayan is the one mode where these terms
    // are the point, so it is exempt; everywhere else, as the pools grow, this
    // is what keeps a term from slipping in as a standalone word.
    const hindi = [
      "अध्ययन",
      "जागृति",
      "सहअस्तित्व",
      "सह-अस्तित्व",
      "समाधान",
      "साक्षात्कार",
      "न्याय",
    ];
    const roman = [
      "adhyayan",
      "jagriti",
      "sah-astitva",
      "sahastitva",
      "samadhan",
      "sakshatkar",
      "nyaya",
    ];
    const standalone = (term: string) =>
      new RegExp(`(?<![\\p{L}\\p{M}-])${term}(?![\\p{L}\\p{M}-])`, "iu");
    for (const lang of LANGUAGES) {
      for (const mode of POOLS) {
        if (mode === "adhyayan") continue;
        for (const question of starterPool(lang, mode)) {
          for (const term of [...hindi, ...roman]) {
            expect(question, `${term} in ${question}`).not.toMatch(
              standalone(term),
            );
          }
        }
      }
    }
  });
});

describe("sampleStarters", () => {
  const SEEDS = Array.from({ length: 60 }, (_, i) => i * 7919 + 1);

  it("draws exactly three distinct questions from the requested pool", () => {
    for (const lang of LANGUAGES) {
      for (const mode of POOLS) {
        const pool = new Set(starterPool(lang, mode));
        for (const seed of SEEDS) {
          const drawn = sampleStarters(lang, mode, seed);
          expect(drawn).toHaveLength(SAMPLE_SIZE);
          expect(new Set(drawn).size).toBe(SAMPLE_SIZE);
          for (const question of drawn) expect(pool.has(question)).toBe(true);
        }
      }
    }
  });

  it("gives the same draw for the same seed", () => {
    // This is what keeps the three still while someone looks at them: the
    // screen holds a seed, and everything that re-renders leaves it alone.
    for (const lang of LANGUAGES) {
      for (const mode of POOLS) {
        for (const seed of SEEDS.slice(0, 10)) {
          expect(sampleStarters(lang, mode, seed)).toEqual(
            sampleStarters(lang, mode, seed),
          );
        }
      }
    }
  });

  it("gives different draws for different seeds", () => {
    // Not every pair — two seeds can agree — but across a run of seeds the
    // draws must vary, or a returning person would see the same three forever.
    for (const lang of LANGUAGES) {
      for (const mode of POOLS) {
        const distinct = new Set(
          SEEDS.map((seed) => sampleStarters(lang, mode, seed).join("|")),
        );
        expect(distinct.size, `${lang}/${String(mode)}`).toBeGreaterThan(10);
      }
    }
  });

  it("reaches every question in a pool, given enough draws", () => {
    for (const lang of LANGUAGES) {
      for (const mode of POOLS) {
        const seen = new Set(
          SEEDS.flatMap((seed) => [...sampleStarters(lang, mode, seed)]),
        );
        expect(seen.size, `${lang}/${String(mode)}`).toBe(
          starterPool(lang, mode).length,
        );
      }
    }
  });

  it("always shows one transition question for change & loss", () => {
    // The pool's first four are the transitions; a draw that landed all-grief
    // would make the chip a grimmer door than the pool actually is.
    for (const lang of LANGUAGES) {
      const front = new Set(starterPool(lang, "change-loss").slice(0, 4));
      for (const seed of SEEDS) {
        const drawn = sampleStarters(lang, "change-loss", seed);
        expect(
          drawn.some((question) => front.has(question)),
          `${lang} seed ${seed}: ${drawn.join(" | ")}`,
        ).toBe(true);
        expect(new Set(drawn).size).toBe(SAMPLE_SIZE);
      }
    }
  });
});
