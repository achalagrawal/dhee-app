import { describe, expect, test } from "vitest";
import {
  explainPageError,
  fromAnusvara,
  isEmpty,
  parseEnvelope,
  phraseWords,
  spellingVariants,
  toAnusvara,
} from "./corpusRecovery";

describe("spellingVariants", () => {
  // The misses the 2026-11-28 audit found, each an entry under another
  // spelling.
  test.each([
    ["सह-अस्तित्व", "सहअस्तित्व"],
    ["सम्बन्ध", "संबंध"],
    ["अखंड", "अखण्ड"],
    ["सत्य बोध", "सत्यबोध"],
    ["नियम-त्रय", "नियम त्रय"],
    ["दुःख", "दुख"],
    ["आँख", "आंख"],
  ])("%s → includes %s", (word, entry) => {
    expect(spellingVariants(word)).toContain(entry);
  });

  test("never returns the word itself, and stays small", () => {
    const variants = spellingVariants("सह-अस्तित्व");
    expect(variants).not.toContain("सह-अस्तित्व");
    expect(variants.length).toBeLessThanOrEqual(8);
    expect(spellingVariants("जीवन")).toEqual([]);
  });
});

describe("nasals", () => {
  test("half nasal to anusvara and back, by consonant class", () => {
    expect(toAnusvara("सम्बन्ध")).toBe("संबंध");
    expect(toAnusvara("अखण्ड")).toBe("अखंड");
    expect(toAnusvara("पङ्क्ति")).toBe("पंक्ति");
    expect(fromAnusvara("संबंध")).toBe("सम्बन्ध");
    expect(fromAnusvara("अखंड")).toBe("अखण्ड");
  });
  test("leaves an anusvara alone where no class nasal fits", () => {
    expect(fromAnusvara("संसार")).toBe("संसार");
  });
});

describe("phraseWords", () => {
  test("longest words of a phrase, at most three", () => {
    expect(phraseWords("जीवन क्रिया")).toEqual(["क्रिया", "जीवन"]);
    expect(phraseWords("पति-पत्नी")).toEqual(["पत्नी", "पति"]);
    expect(phraseWords("a b c d e").length).toBe(0);
  });
});

describe("envelopes", () => {
  test("empty means no results and no related names", () => {
    expect(
      isEmpty(parseEnvelope('{"count":0,"results":[],"related":[]}')),
    ).toBe(true);
    expect(
      isEmpty(parseEnvelope('{"count":0,"results":[],"related":["x"]}')),
    ).toBe(false);
    expect(isEmpty(parseEnvelope('{"count":1,"results":[{}]}'))).toBe(false);
    expect(isEmpty(parseEnvelope('{"error":"404"}'))).toBe(false);
    expect(parseEnvelope("No results found.")).toBeNull();
  });
});

describe("explainPageError", () => {
  const books = [
    { id: 142, title: "व्यवहारात्मक जनवाद", total_pages: 141 },
    { id: 139, title: "मानव कर्म दर्शन", total_pages: 260 },
  ];
  test("an id that doesn't exist lists the ones that do", () => {
    const text = explainPageError(books, 1, 10)!;
    expect(text).toContain("no book with id 1");
    expect(text).toContain("142 (व्यवहारात्मक जनवाद)");
  });
  test("a page past the end gives the range", () => {
    expect(explainPageError(books, 142, 193)).toContain("pages 1–141");
  });
  test("a valid id and page leaves the server's error standing", () => {
    expect(explainPageError(books, 139, 12)).toBeNull();
  });
});
