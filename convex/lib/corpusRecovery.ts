// What a corpus tool does when its first answer is empty, so the model gets
// something usable in the same round instead of spending another one.
//
// On the 2026-11-28 prod export a tool round cost 4–7 seconds of model time
// and the tools themselves about one. Many of those rounds existed only
// because a tool came back empty:
//
//   - lookupDefinition missed 16% of the time. A tenth of the misses were the
//     right word in another spelling — सह-अस्तित्व for सहअस्तित्व, सम्बन्ध for
//     संबंध, अखंड for अखण्ड — and 41% of multi-word lookups missed outright.
//   - searchExactPhrase came back empty 44% of the time on Sonnet 5, because
//     models use it as a keyword search: 19% empty at one word, 92% at six.
//   - readPage failed on book ids that don't exist, and on the page numbers
//     lookupDefinition returns, which belong to the lexicon, not to a book.
//
// Each of those cost a round. Pure functions here; convex/md.ts does the I/O.

/** A corpus tool's JSON envelope, parsed, or null when it isn't JSON. */
export type Envelope = {
  count?: number;
  results?: unknown[];
  related?: unknown[];
  error?: string;
  [key: string]: unknown;
};

export function parseEnvelope(text: string): Envelope | null {
  try {
    const parsed = JSON.parse(text) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Envelope)
      : null;
  } catch {
    return null;
  }
}

/** True when an envelope holds no results and no related names. */
export function isEmpty(envelope: Envelope | null): boolean {
  if (!envelope || envelope.error) return false;
  const results = envelope.results?.length ?? envelope.count ?? 0;
  return results === 0 && (envelope.related?.length ?? 0) === 0;
}

// A nasal consonant with a virama before a consonant of its own class is
// written either way in these books: सम्बन्ध / संबंध, अखण्ड / अखंड.
const NASAL_BY_CLASS: Array<[string, string]> = [
  ["ङ", "कखगघ"],
  ["ञ", "चछजझ"],
  ["ण", "टठडढ"],
  ["न", "तथदध"],
  ["म", "पफबभ"],
];
const VIRAMA = "्";
const ANUSVARA = "ं";

/** Every half-nasal conjunct written as an anusvara: संबंध, अखंड. */
export function toAnusvara(word: string): string {
  let out = word;
  for (const [nasal, consonants] of NASAL_BY_CLASS) {
    out = out.replace(
      new RegExp(`${nasal}${VIRAMA}(?=[${consonants}])`, "g"),
      ANUSVARA,
    );
  }
  return out;
}

/** Every anusvara before a class consonant written as its half nasal. */
export function fromAnusvara(word: string): string {
  return word.replace(
    new RegExp(`${ANUSVARA}(?=([क-ह]))`, "g"),
    (_m, next: string) => {
      const match = NASAL_BY_CLASS.find(([, cs]) => cs.includes(next));
      return match ? `${match[0]}${VIRAMA}` : ANUSVARA;
    },
  );
}

/**
 * Other spellings of a term to try when the one asked for has no entry,
 * most likely first, without the original. Hyphens dropped or made spaces,
 * spaces dropped, nasals either way, chandrabindu as anusvara, visarga and
 * nukta dropped.
 */
export function spellingVariants(word: string): string[] {
  const base = word.trim().replace(/\s+/g, " ");
  const shapes = new Set<string>([
    base.replace(/-/g, ""),
    base.replace(/-/g, " "),
    base.replace(/[\s-]/g, ""),
  ]);
  shapes.add(base);
  const out = new Set<string>();
  for (const shape of shapes) {
    for (const form of [
      shape,
      toAnusvara(shape),
      fromAnusvara(shape),
      shape.replace(/ँ/g, ANUSVARA),
      shape.replace(/ः/g, ""),
      shape.replace(/़/g, ""),
    ]) {
      out.add(form);
    }
  }
  out.delete(base);
  out.delete(word);
  return [...out].filter((v) => v.trim().length > 0).slice(0, 8);
}

/** The words of a phrase worth looking up on their own, longest first. */
export function phraseWords(phrase: string): string[] {
  const words = phrase
    .split(/[\s\-–—,;:/]+/)
    .map((w) => w.replace(/[^\p{L}\p{M}]/gu, ""))
    .filter((w) => [...w].length >= 2);
  return [...new Set(words)]
    .sort((a, b) => [...b].length - [...a].length)
    .slice(0, 3);
}

/** What the model is told about a lookup's `pageno`. */
export const LEXICON_PAGE_NOTE =
  "pageno is a page of Paribhasha Sanhita (परिभाषा संहिता), the darshan's book of definitions, not of any book in listBooks. Cite it as परिभाषा संहिता with this page, never as a page of another book, and don't pass it to readPage.";

/** Adds fields to an envelope and serialises it again. */
export function annotate(
  envelope: Envelope,
  fields: Record<string, unknown>,
): string {
  return JSON.stringify({ ...envelope, ...fields });
}

/** Words in an exact-phrase query, for the hint about keeping it short. */
export function wordCount(query: string): number {
  return query.trim().split(/\s+/).filter(Boolean).length;
}

export type Book = { id: number; title: string; total_pages?: number };

/**
 * Why a readPage failed, in terms the model can act on: which ids exist, or
 * which pages a real book has. Null when the book and page look valid, so the
 * server's own error stands.
 */
export function explainPageError(
  books: Book[],
  bookId: number,
  pageNo: number,
): string | null {
  const book = books.find((b) => b.id === bookId);
  if (!book) {
    const ids = books.map((b) => `${b.id} (${b.title})`).join(", ");
    return `There is no book with id ${bookId}. Book ids come from listBooks or a search result; the books are: ${ids}. If this page number came from lookupDefinition, it is a page of Paribhasha Sanhita and can't be read here.`;
  }
  if (book.total_pages !== undefined && pageNo > book.total_pages) {
    return `Book ${bookId} (${book.title}) has pages 1–${book.total_pages}; there is no page ${pageNo}. If this page number came from lookupDefinition, it is a page of Paribhasha Sanhita, not of this book.`;
  }
  return null;
}
