import { afterEach, describe, expect, test, vi } from "vitest";
import { greetingFontSize, greetingText } from "./greeting";

// The home hero. `greetingText` is the wording; `greetingFontSize` is the fix
// for a long name wrapping onto a second line on a phone (issue #105).

/** Roughly a phone in portrait: 390pt wide, less padding and the Dhee mark. */
const PHONE = 390 - 40 - 40 - 14;
/** The reading column on a laptop: 720pt wide, less the same. */
const DESKTOP = 720 - 40 - 40 - 14;

afterEach(() => {
  vi.useRealTimers();
});

const atHour = (hour: number) => {
  vi.useFakeTimers();
  const when = new Date();
  when.setHours(hour, 0, 0, 0);
  vi.setSystemTime(when);
};

describe("greetingText", () => {
  test("follows the clock", () => {
    atHour(8);
    expect(greetingText("en")).toBe("Good morning");
    atHour(14);
    expect(greetingText("en")).toBe("Good afternoon");
    atHour(20);
    expect(greetingText("en")).toBe("Good evening");
  });

  test("adds the name when there is one", () => {
    atHour(20);
    expect(greetingText("en", "Subhash Trivedi")).toBe(
      "Good evening, Subhash Trivedi",
    );
    expect(greetingText("hi", "सुभाष")).toBe("शुभ संध्या, सुभाष");
  });

  test("blank or missing names leave the greeting alone", () => {
    atHour(20);
    expect(greetingText("en", "   ")).toBe("Good evening");
    expect(greetingText("en", undefined)).toBe("Good evening");
  });
});

describe("greetingFontSize", () => {
  test("a roomy screen keeps the full size, however long the name", () => {
    expect(greetingFontSize("Good evening", DESKTOP)).toBe(30);
    expect(greetingFontSize("Good evening, Subhash Trivedi", DESKTOP)).toBe(30);
    expect(greetingFontSize("Good afternoon, Priya Raghunathan", DESKTOP)).toBe(
      30,
    );
  });

  test("a phone shrinks the line rather than wrapping it", () => {
    const size = greetingFontSize("Good evening, Subhash Trivedi", PHONE);
    expect(size).toBeLessThan(30);
    expect(size).toBeGreaterThanOrEqual(18);
    // The point of the exercise: at that size the line really does fit. 13.88em
    // is what that greeting measures in HankenGrotesk_500Medium, read off the
    // font's own metrics rather than the estimate the sizing uses.
    expect(size * 13.88).toBeLessThan(PHONE);
  });

  test("a short greeting on a phone is untouched", () => {
    expect(greetingFontSize("Good evening", PHONE)).toBe(30);
  });

  test("longer names get smaller, down to a readable floor", () => {
    const short = greetingFontSize("Good evening, Achal", PHONE);
    const long = greetingFontSize("Good evening, Subhash Trivedi", PHONE);
    expect(long).toBeLessThan(short);
    // Past the floor it stops shrinking and the line is left to wrap.
    expect(
      greetingFontSize("Good afternoon, Wilhelmina Wollstonecraft", PHONE),
    ).toBe(18);
  });

  test("wide letters count for more than narrow ones", () => {
    expect(greetingFontSize("Good evening, Wammawam", PHONE)).toBeLessThan(
      greetingFontSize("Good evening, Illitilli", PHONE),
    );
  });

  test("Devanagari matras ride on their letter instead of widening the line", () => {
    // Same eight letters, one carrying matras: the line is no wider for them.
    expect(greetingFontSize("शुभ संध्या", PHONE)).toBe(
      greetingFontSize("शभ सधया", PHONE),
    );
  });

  test("an unmeasurable line falls back to the full size", () => {
    expect(greetingFontSize("", PHONE)).toBe(30);
    expect(greetingFontSize("Good evening", 0)).toBe(30);
  });
});
