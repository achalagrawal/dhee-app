import { TERMS_OF_ART } from "../agents/dhee";
import {
  BRIEF_MAX_PARAGRAPHS,
  BRIEF_MAX_QUESTIONS,
  BRIEF_MAX_WORDS,
  type Expectations,
} from "./scenarios";

// Deciding whether one reply obeyed the rules, without asking a model.
//
// Everything here is pure and synchronous, so it runs inside the eval action
// and again in `pnpm test` against hand-written strings. That second half is
// what makes the harness trustworthy: a checker nobody tests will happily
// report green forever, and a green suite is exactly the thing you stop
// looking at.
//
// These checks are deliberately blunt. They catch a rule being broken outright
// — a term of art appearing, a page cited, a corpus passage pasted in, the
// script switching underfoot. They say nothing about whether a reply is any
// good; that is what reading it side by side is for.

export type Check = { id: string; ok: boolean; detail?: string };

export type ReplyUnderTest = {
  /** The question as asked, which is also the echo allowance (see below). */
  probe: string;
  reply: string;
  traditions: string[];
  contextBlock: string;
  toolNames: string[];
  /** Full text of every tool result, in memory only — never persisted. */
  toolOutputs: string[];
};

// ---------------------------------------------------------------------------
// Script
// ---------------------------------------------------------------------------

const DEVANAGARI = /\p{Script=Devanagari}/u;
const LATIN = /\p{Script=Latin}/u;

/** How much of a text is written in each script, by letter count. */
export function scriptShare(text: string): {
  devanagari: number;
  latin: number;
} {
  let deva = 0;
  let latin = 0;
  for (const ch of text) {
    if (DEVANAGARI.test(ch)) deva++;
    else if (LATIN.test(ch)) latin++;
  }
  const total = deva + latin;
  if (total === 0) return { devanagari: 0, latin: 0 };
  return { devanagari: deva / total, latin: latin / total };
}

/**
 * Which script a reply is actually written in.
 *
 * 70% rather than a bare majority, because a stray book title or a loanword is
 * not a script switch — but a study answer that quotes a full Devanagari line
 * inside English prose genuinely is mixed, and saying so is more useful than
 * pretending otherwise. `runChecks` decides what to do about that; see the
 * script check there.
 */
export function scriptOf(
  text: string,
): "devanagari" | "latin" | "mixed" | "none" {
  const share = scriptShare(text);
  if (share.devanagari === 0 && share.latin === 0) return "none";
  if (share.devanagari >= 0.7) return "devanagari";
  if (share.latin >= 0.7) return "latin";
  return "mixed";
}

// ---------------------------------------------------------------------------
// Register
// ---------------------------------------------------------------------------

// Second-person forms that mark the familiar register in Hindi. Dhee addresses
// everyone as आप, so any of these in a reply is a failure.
//
// The list is oblique and possessive forms plus a few unambiguous imperatives,
// rather than the bare pronouns. `तुम` and `तू` on their own turn up inside
// quoted source text and in sentences *about* the words; these forms only occur
// when the reply is actually addressing the reader that way.
//
// Deliberately absent: भाई. It is the clearest tell in a greeting — "नहीं भाई"
// — but it is also half of भाई-बहन, one of the relationships the prompt names,
// so matching it would fail any honest answer about siblings. The forms below
// carry the same signal without that cost.
const FAMILIAR_FORMS = [
  "तुम्हें",
  "तुम्हारा",
  "तुम्हारी",
  "तुम्हारे",
  "तुमको",
  "तुमने",
  "तुमसे",
  "तुझे",
  "तुझको",
  "तुझसे",
  "तेरा",
  "तेरी",
  "तेरे",
  "तूने",
  "देखो",
  "सुनो",
  "समझो",
  "करो",
  "बताओ",
  "सोचो",
  "जानो",
  "कहो",
  "रखो",
];

// Devanagari has no word boundary `\b` can see, so the guards are explicit.
const FAMILIAR_RE = new RegExp(
  `(?<![\\u0900-\\u097F])(?:${FAMILIAR_FORMS.join("|")})(?![\\u0900-\\u097F])`,
  "u",
);

/**
 * The familiar-register forms a reply used, if any.
 *
 * Dhee speaks to everyone as आप — respectful and सौम्य, which is not the same
 * as formal. Someone bringing a question about grief or a failing relationship
 * is not owed familiarity they did not offer, and much of the readership is
 * older than the voice a model reaches for by default.
 */
export function familiarAddressIn(text: string): string[] {
  return FAMILIAR_FORMS.filter((form) =>
    new RegExp(`(?<![\\u0900-\\u097F])${form}(?![\\u0900-\\u097F])`, "u").test(
      text,
    ),
  );
}

export function usesFamiliarAddress(text: string): boolean {
  return FAMILIAR_RE.test(text);
}

// Hinglish function words. Content words vary endlessly; these do not, and
// they almost never appear in English prose.
const HINGLISH_MARKERS = [
  "hai",
  "hain",
  "nahi",
  "nahin",
  "kya",
  "kyun",
  "kyon",
  "mujhe",
  "tumhe",
  "aap",
  "apne",
  "apna",
  "raha",
  "rahi",
  "rahe",
  "karna",
  "karo",
  "karta",
  "karte",
  "karti",
  "aur",
  "lekin",
  "magar",
  "bhi",
  "koi",
  "kuch",
  "phir",
  "abhi",
  "jaata",
  "jata",
  "hota",
  "hoti",
  "wala",
  "wali",
  "mera",
  "meri",
  "tera",
  "hum",
  "unka",
  "iska",
];

/**
 * Whether a Latin-script text reads as Hinglish rather than English.
 *
 * A heuristic, and labelled as one everywhere it surfaces. Devanagari can be
 * detected exactly; Hinglish cannot, because it shares an alphabet with the
 * language it has to be told apart from. A failure here means go read the
 * reply, not that the reply is wrong.
 */
export function looksHinglish(text: string): boolean {
  const words = text.toLowerCase().match(/[a-z]+/g) ?? [];
  if (words.length === 0) return false;
  const hits = words.filter((w) => HINGLISH_MARKERS.includes(w)).length;
  return hits >= 3 || hits / words.length > 0.05;
}

// ---------------------------------------------------------------------------
// Terms of art
// ---------------------------------------------------------------------------

// The vocabulary Rule 1 keeps out, in the script it leaks in.
//
// Split by script on purpose, and the reason is easy to miss: the Devanagari
// list has to be far narrower than the roman one. "vyavastha" written in a
// English reply is unambiguously the corpus vocabulary bleeding through —
// nobody reaches for it by accident. But जीवन is just the Hindi word for life,
// मानव is just "human", and व्यवस्था is what you call the seating arrangement at
// a wedding. Putting those in the deny list would fail every Devanagari reply
// on its first sentence, and the check would be switched off within a week.
//
// So the Devanagari entries are only the compounds that carry no ordinary
// reading, and Hindi replies are held to a looser standard than English ones.
// That is a real limitation, not an oversight: the reply itself gets read.
// The six the prompt names come from `TERMS_OF_ART` rather than being copied,
// so adding one there arms this checker in the same edit. The rest are the
// "or any other domain term" half — spellings and neighbours the prompt does
// not enumerate but plainly means.
const ROMAN_TERMS = [
  ...TERMS_OF_ART,
  "sahastitva",
  "sah astitva",
  "sahaastitva",
  "astitva",
  "madhyastha darshan",
  "madhyasth",
  "madhyastha",
  "manviya",
  "samadhan",
  "samruddhi",
  "akhand samaj",
  "jeevan vidya",
  "jivan vidya",
  "nagraj",
  "vyavaharvad",
  "bhautikvad",
];

const DEVANAGARI_TERMS = [
  "सह-अस्तित्व",
  "सहअस्तित्व",
  "मध्यस्थ दर्शन",
  "मध्यस्थ",
  "जीवन विद्या",
  "अखण्ड समाज",
  "अखंड समाज",
  "सार्वभौम व्यवस्था",
  "मानवीय आचरण",
  "नागराज",
];

const TERMS = [...ROMAN_TERMS, ...DEVANAGARI_TERMS];

/**
 * How many distinct terms of art an ordinary reply may carry before it counts
 * as leaning on vocabulary.
 *
 * The prompt used to ban these outright and this check used to be `=== 0`. It
 * no longer is: Dhee is an assistant *for* Madhyasth Darshan, and a term that
 * genuinely is the most honest word is allowed to land — the instruction is to
 * lean plain, not to dodge. Two is the line because the failure mode the prompt
 * names is stacking ("don't stack terms, don't teach a glossary nobody asked
 * for"), and one or two glossed terms in a reply is not stacking.
 *
 * A reply at the limit is still worth reading. This catches the glossary, not
 * the word.
 */
export const MAX_LIGHT_TERMS = 2;

// `\b` is defined on ASCII word characters, so /\bजीवन\b/ does not mean what it
// looks like it means. Unicode letter lookarounds work in both scripts.
function wordish(term: string): RegExp {
  const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(String.raw`(?<!\p{L})${escaped}(?!\p{L})`, "giu");
}

/**
 * Domain vocabulary present in a reply.
 *
 * `echoAllowance` is normally the question itself. If the person wrote
 * "sah-astitva" and the reply says "the word your friend uses", the term is in
 * the conversation because they put it there — counting that as a leak makes
 * the check unfalsifiable on exactly the case it matters most (`bare/term-bait`),
 * and an unfalsifiable check gets deleted rather than fixed.
 */
export function termsOfArtIn(
  text: string,
  opts: { echoAllowance?: string } = {},
): string[] {
  const allowed = new Set(
    opts.echoAllowance
      ? TERMS.filter((t) => wordish(t).test(opts.echoAllowance as string))
      : [],
  );
  const found = TERMS.filter(
    (term) => !allowed.has(term) && wordish(term).test(text),
  );
  // "madhyasth" also matches inside "madhyasth darshan"; report the longest
  // match only, so the detail line names what a reader would name.
  return found.filter(
    (t) => !found.some((other) => other !== t && other.includes(t)),
  );
}

// ---------------------------------------------------------------------------
// Citations
// ---------------------------------------------------------------------------

const CITATION_PATTERNS: Array<[label: string, re: RegExp]> = [
  ["page number", /\bpages?\s+\d+/gi],
  ["page number", /\bp{1,2}\.\s*\d+/gi],
  ["page number", /पृष्ठ\s*\d+/gu],
  ["chapter", /\bchapters?\s+\d+/gi],
  ["chapter", /अध्याय/gu],
  ["author", /\bnagraj/gi],
  ["author", /नागराज/gu],
  ["book title", /\b[A-Z][a-z]+\s+(?:Vyavhar|Vyavahar|Abhyas|Karm)\s+Darshan/g],
  ["attribution", /\baccording to\b/gi],
];

/**
 * Source references in a reply — the thing Rule 1 bars "unless the person
 * explicitly asks where an idea comes from".
 *
 * Same echo allowance as the terms check: in `bare/page-lookup` the person
 * names the book and the page themselves, and a reply that repeats the name
 * while declining to look it up has cited nothing.
 */
export function citationsIn(
  text: string,
  opts: { echoAllowance?: string } = {},
): string[] {
  const found = new Set<string>();
  for (const [label, re] of CITATION_PATTERNS) {
    for (const match of text.matchAll(re)) {
      const hit = match[0];
      if (opts.echoAllowance?.toLowerCase().includes(hit.toLowerCase())) {
        continue;
      }
      found.add(`${label}: ${hit.trim()}`);
    }
  }
  return [...found];
}

// ---------------------------------------------------------------------------
// Shape
// ---------------------------------------------------------------------------

export function shapeOf(text: string): {
  paragraphs: number;
  words: number;
  questions: number;
} {
  const paragraphs = text
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean).length;
  // Word-ish tokens rather than `\S+`, so an em dash or a bullet is not a word
  // against Rule 2's budget. Shares WORD with the span checks so Devanagari is
  // counted in words rather than in consonants.
  const words = (text.match(WORD) ?? []).length;
  const questions = (text.match(/\?/g) ?? []).length;
  return { paragraphs, words, questions };
}

// ---------------------------------------------------------------------------
// Shared spans — quoting, and reciting
// ---------------------------------------------------------------------------

// Letters, digits and combining marks. `\p{M}` is load-bearing and easy to
// leave out: Devanagari vowel signs are combining marks, not letters, so
// `[\p{L}\p{N}]+` splits होता into "ह" and "त" and turns every Hindi text into
// a stream of bare consonants. Eight of those in a row recur constantly, which
// made `sharedSpan` report a quoted passage on a reply that shared nothing —
// caught on the first live run, on `bare/devanagari`.
const WORD = /[\p{L}\p{N}\p{M}]+/gu;

function tokens(text: string): string[] {
  return text.toLowerCase().match(WORD) ?? [];
}

/**
 * The longest run of words a reply shares with any source, if it reaches
 * `minTokens`.
 *
 * The honest form of "never quote or paraphrase a tool result directly": a
 * reply that has understood a passage and said it plainly shares almost no
 * runs with it, while one that pasted it shares long ones. The same function
 * inverts under the corpus lens, where a study answer is *supposed* to quote
 * the page — there, a missing span means the answer came from the model's
 * memory rather than from the book it claims to be reading.
 */
export function sharedSpan(
  reply: string,
  sources: string[],
  minTokens = 8,
): string | null {
  const needle = tokens(reply);
  if (needle.length < minTokens) return null;

  const haystacks = sources.map(tokens).filter((t) => t.length >= minTokens);
  if (haystacks.length === 0) return null;

  const grams = new Set<string>();
  for (const hay of haystacks) {
    for (let i = 0; i + minTokens <= hay.length; i++) {
      grams.add(hay.slice(i, i + minTokens).join(" "));
    }
  }

  for (let i = 0; i + minTokens <= needle.length; i++) {
    const gram = needle.slice(i, i + minTokens).join(" ");
    if (grams.has(gram)) return gram;
  }
  return null;
}

// Ways of pointing at a conversation that, from the person's side, never
// happened. The memory block is derived from past threads, and the prompt is
// explicit: "do not reference 'what you told me before' unless they raise it
// first". A reply that opens with "you've noticed before…" has broken the rule
// even though it copied nothing.
//
// Added after the first real run, where the span check passed a reply that
// said "You've noticed before that wanting a thing and wanting who you'd be if
// you had it aren't the same wanting" — a paraphrase of a memory line, wrapped
// in exactly the back-reference the prompt forbids. Verbatim detection alone
// under-reports this rule.
const BACK_REFERENCES = [
  /\byou(?:'ve| have)? (?:told|mentioned|said|noticed|described|been saying)\b/gi,
  /\byou mentioned\b/gi,
  /\blast time\b/gi,
  /\bearlier you\b/gi,
  /\bwe(?:'ve| have)? (?:talked|spoken|discussed)\b/gi,
  /\bas you (?:put it|said)\b/gi,
  /\bfrom what you(?:'ve| have)? (?:told|shared)\b/gi,
];

/** An appeal to a prior conversation the person has not raised themselves. */
export function referencesThePast(reply: string): string | null {
  for (const re of BACK_REFERENCES) {
    const match = reply.match(re);
    if (match) return match[0];
  }
  return null;
}

/**
 * A line of the memory block repeated back to the person.
 *
 * "Do not recite it back, do not reference 'what you told me before'." Six
 * tokens rather than eight, because the block's lines are short and a reply
 * that reproduces most of one has already broken the rule. Each line is a
 * separate source so a match cannot span two unrelated observations.
 */
export function recitesMemory(
  reply: string,
  contextBlock: string,
): string | null {
  const lines = contextBlock
    .split("\n")
    .filter((l) => l.trimStart().startsWith("-"))
    // Strip the `- (kind) ` prefix the generator writes; it is scaffolding, not
    // something the model would ever say aloud.
    .map((l) => l.replace(/^\s*-\s*(\([a-z]+\)\s*)?/i, "").trim())
    .filter(Boolean);
  return sharedSpan(reply, lines, 6);
}

// ---------------------------------------------------------------------------
// Fingerprint
// ---------------------------------------------------------------------------

/**
 * A short stable hash of a system prompt.
 *
 * FNV-1a rather than SHA-256 because `crypto.subtle.digest` is async in both
 * Convex's V8 runtime and vitest's edge-runtime, and this has to be callable
 * from a plain synchronous test. Length is appended so a collision would have
 * to agree on both.
 */
export function fingerprint(text: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return `${hash.toString(16).padStart(8, "0")}-${text.length}`;
}

// ---------------------------------------------------------------------------
// The whole verdict
// ---------------------------------------------------------------------------

/**
 * Every check one case earns, given what it expected.
 *
 * Checks that an expectation switches off are omitted rather than reported as
 * passing — a run that says "12 passed" should mean twelve things were
 * actually decided.
 */
export function runChecks(r: ReplyUnderTest, e: Expectations): Check[] {
  const checks: Check[] = [];
  const shape = shapeOf(r.reply);

  if (r.reply.trim().length === 0) {
    return [{ id: "non-empty", ok: false, detail: "the reply was empty" }];
  }

  if (e.termsOfArt === "discouraged") {
    const terms = termsOfArtIn(r.reply, { echoAllowance: r.probe });
    checks.push({
      id: "plain-language (light)",
      ok: terms.length <= MAX_LIGHT_TERMS,
      detail: terms.length
        ? `${terms.length} term${terms.length === 1 ? "" : "s"}: ${terms.join(", ")}`
        : undefined,
    });
  }

  if (e.citations === "forbidden") {
    const cites = citationsIn(r.reply, { echoAllowance: r.probe });
    checks.push({
      id: "no-citations",
      ok: cites.length === 0,
      detail: cites.length ? cites.join("; ") : undefined,
    });
  }

  if (e.retrieval !== "either") {
    const searched = r.toolNames.length > 0;
    checks.push({
      id: e.retrieval === "required" ? "searched-corpus" : "no-corpus-search",
      ok: e.retrieval === "required" ? searched : !searched,
      detail: searched ? `called ${r.toolNames.join(", ")}` : "no tools called",
    });
  }

  if (e.expectTools?.length) {
    const missing = e.expectTools.filter((t) => !r.toolNames.includes(t));
    checks.push({
      id: "expected-tools",
      ok: missing.length === 0,
      detail: missing.length
        ? `never called ${missing.join(", ")}; called ${r.toolNames.join(", ") || "nothing"}`
        : undefined,
    });
  }

  if (e.verbatimQuote !== "allowed") {
    const span = sharedSpan(r.reply, r.toolOutputs);
    const wanted = e.verbatimQuote === "required";
    checks.push({
      id: wanted ? "quotes-the-source" : "no-raw-corpus",
      ok: wanted ? span !== null : span === null,
      detail: span
        ? `shared span: "${span}"`
        : "no run of 8+ words shared with any tool result",
    });
  }

  const script = scriptOf(r.reply);

  // Hinglish output is never wanted, whatever was asked. Someone writing Hindi
  // in Roman letters gets Hindi in Devanagari back, so a reply that is itself
  // romanised Hindi is a failure on every case rather than a per-case
  // expectation — which is why this sits outside the branch below.
  //
  // Guarded on the reply being predominantly Roman, so a Devanagari answer that
  // happens to contain romanised terms isn't caught by the marker list.
  if (scriptShare(r.reply).latin >= 0.6 && looksHinglish(r.reply)) {
    checks.push({
      id: "not hinglish (heuristic)",
      ok: false,
      detail:
        "reply is romanised Hindi; Hinglish questions are answered in Devanagari",
    });
  }

  // Register, on every case that produced Devanagari. Addressing someone as
  // तुम is not warmth, and it is the kind of thing that reads fine to whoever
  // shipped it and badly to the person receiving it.
  const familiar = familiarAddressIn(r.reply);
  if (familiar.length > 0) {
    checks.push({
      id: "respectful address (आप)",
      ok: false,
      detail: `familiar register: ${familiar.slice(0, 4).join(", ")}`,
    });
  }

  if (e.verbatimQuote === "allowed" || e.verbatimQuote === "required") {
    // Study mode is told to "give the original line and then say what it means"
    // — so a correct answer to an English question is English prose carrying a
    // Devanagari quote, which `scriptOf` rightly calls mixed. Here the rule is
    // only the one the prompt actually states: don't answer in a script they
    // didn't use. A substantial share of the expected script satisfies that; a
    // reply written wholly in the other one does not.
    const share = scriptShare(r.reply)[e.script];
    checks.push({
      id: "script-mirrored (quoting allowed)",
      ok: share >= 0.35,
      detail: `${Math.round(share * 100)}% ${e.script}, overall ${script}`,
    });
  } else {
    checks.push({
      id: "script-mirrored",
      ok: script === e.script,
      detail: script === e.script ? undefined : `replied in ${script}`,
    });
  }

  if (e.shape === "brief") {
    const over = [
      shape.paragraphs > BRIEF_MAX_PARAGRAPHS &&
        `${shape.paragraphs} paragraphs`,
      shape.words > BRIEF_MAX_WORDS && `${shape.words} words`,
      shape.questions > BRIEF_MAX_QUESTIONS &&
        `${shape.questions} questions back`,
    ].filter((x): x is string => Boolean(x));
    checks.push({
      id: "brief",
      ok: over.length === 0,
      detail: over.length
        ? over.join(", ")
        : `${shape.paragraphs} paragraphs, ${shape.words} words`,
    });
  }

  if (e.memory === "must-not-recite") {
    const recited = recitesMemory(r.reply, r.contextBlock);
    checks.push({
      id: "memory-not-recited",
      ok: recited === null,
      detail: recited ? `repeated back: "${recited}"` : undefined,
    });
    // Split from the check above because they fail for different reasons and
    // want different fixes: one is the model copying, the other is the model
    // claiming a shared history the person never had with it.
    const backRef = referencesThePast(r.reply);
    checks.push({
      id: "no-back-reference",
      ok: backRef === null,
      detail: backRef ? `said "${backRef}"` : undefined,
    });
  }

  return checks;
}
