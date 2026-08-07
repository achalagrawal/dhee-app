import type { PromptInputs } from "../agents/dhee";

// What the eval harness actually asks, and who it pretends to be while asking.
//
// This file is the whole argument for the harness: every case exists to pin one
// sentence that is already written down somewhere else — a rule in
// DHEE_INSTRUCTIONS, or a line on the verification checklist in
// docs/build/specs/personalization.md that says it "needs a signed-in session
// against a live deployment, so it is a human step, not something a test suite
// reaches". Each case carries a `why` naming that sentence. A case that cannot
// name one gets deleted rather than kept "just in case" — every case costs money
// on every run, and a suite nobody trusts is worse than no suite.
//
// Personas carry their memory as a hand-written `contextBlock` string rather
// than reading a real account. That keeps a run reproducible, and it makes the
// memory block itself something you can A/B — which is most of the point.

// ---------------------------------------------------------------------------
// Personas
// ---------------------------------------------------------------------------

export type PersonaId =
  | "bare"
  | "stoic"
  | "advaita"
  | "corpus"
  | "personalized"
  | "remembered"
  | "full";

export type Persona = {
  id: PersonaId;
  /** What varying this persona is supposed to reveal. */
  why: string;
  inputs: PromptInputs;
};

// Shaped exactly like `buildContextBlock` writes it (convex/memory.ts:313-346):
// the same three headings, the same `- (kind) text` observation lines. A block
// that doesn't match the real generator would be testing a prompt nobody gets.
const REMEMBERED_BLOCK = `Questions they are sitting with:
- Why does reaching something they wanted leave them flat?
- How do they know when to stay in a job and when to leave?

What you know about them:
- (pattern) Measures themselves against what they have not done yet rather than what they have.
- (relationship) Talks about their father rarely, and carefully.
- (value) Wants work that is useful to someone, not only well paid.
- (context) Moved cities last year and has not made close friends there.

Ideas that have landed with them before:
- Wanting something and wanting who you would be if you had it are different wants`;

export const PERSONAS: Record<PersonaId, Persona> = {
  bare: {
    id: "bare",
    why: "The floor. No personalization, no lens, no memory — buildSystemPrompt returns DHEE_INSTRUCTIONS byte for byte, so anything that fails here is the base prompt failing.",
    inputs: {},
  },
  stoic: {
    id: "stoic",
    why: "A framing lens with no corpus behind it. Should change how a reply is framed without unlocking anything.",
    inputs: { traditions: ["Stoicism"] },
  },
  advaita: {
    id: "advaita",
    why: "A second framing lens, so 'the lens did something' can be told apart from 'the lens section did something'.",
    inputs: { traditions: ["Advaita Vedanta"] },
  },
  corpus: {
    id: "corpus",
    why: "The one tradition whose books are held. Opens study mode: the citation ban lifts and the step budget goes to STUDY_STEPS.",
    inputs: { traditions: ["Madhyasth Darshan"] },
  },
  personalized: {
    id: "personalized",
    why: "Only the three self-described fields. Isolates their effect from the lens and from memory.",
    inputs: {
      nickname: "Ravi",
      occupation: "Runs a two-person design studio",
      aboutYou:
        "New father, sleeping badly, trying to decide whether to take on a partner",
    },
  },
  remembered: {
    id: "remembered",
    why: "Only the memory block. Isolates what memory does, which is the layer with no UI showing its effect today.",
    inputs: { contextBlock: REMEMBERED_BLOCK },
  },
  full: {
    id: "full",
    why: "Everything at once, corpus lens included. Catches layers that are individually fine and jointly wrong.",
    inputs: {
      nickname: "Ravi",
      occupation: "Runs a two-person design studio",
      aboutYou:
        "New father, sleeping badly, trying to decide whether to take on a partner",
      traditions: ["Madhyasth Darshan"],
      contextBlock: REMEMBERED_BLOCK,
    },
  },
};

// ---------------------------------------------------------------------------
// Probes
// ---------------------------------------------------------------------------

export type ProbeId =
  | "life"
  | "page-lookup"
  | "term-bait"
  | "practical"
  | "mundane"
  | "devanagari"
  | "hinglish"
  | "memory-aware"
  | "provenance";

export type Turn = { role: "user" | "assistant"; text: string };

export type Probe = {
  id: ProbeId;
  /** What this question is trying to make the model get wrong. */
  why: string;
  text: string;
  /**
   * Scripted history, sent as a `messages` array the way incognitoReply does.
   * Only for probes whose whole point is that something was said earlier.
   */
  priorTurns?: Turn[];
};

// The assistant turn `provenance` follows up on. Lifted from SEEDED_EXCHANGE in
// convex/seed.ts so the eval and the demo data put the same words in Dhee's
// mouth — if that reply ever changes, this one should change with it.
const SEEDED_REPLY = `Nothing's wrong with you. What you're describing happens to almost everyone who reaches something they've been running toward for a long time — and it's worth looking at closely, because it's telling you something.

When we want something for two years, we're not really wanting the thing. We're wanting who we imagine we'll be once we have it. The title was standing in for something — being seen as capable, maybe, or finally being allowed to rest. Now the title is here and whatever it was standing in for hasn't arrived, because a title can't deliver it.`;

export const PROBES: Record<ProbeId, Probe> = {
  life: {
    id: "life",
    why: "The ordinary case. Same question as dev:smokeTest and seed:demo, so all three agree on what a good reply looks like.",
    text: "I got the promotion I wanted and felt nothing. What's wrong with me?",
  },
  "page-lookup": {
    id: "page-lookup",
    why: "The capability study mode exists for, and the one the unlock must gate.",
    // personalization.md:354 words this as "What does *this* line on page 3 of
    // Manav Vyavhar Darshan mean?" — and run as written, it does not test what
    // the checklist wants. "This line" refers to nothing, so the correct reply
    // is to ask which line, which is what the model does. Asking for the
    // opening lines keeps every part of the capability under test (resolve the
    // book, read the page, quote it, translate it, say where it is from) and
    // removes the ambiguity that made it unanswerable.
    text: "Read me the opening lines of page 3 of Manav Vyavhar Darshan, and tell me what they mean.",
  },
  "term-bait": {
    id: "term-bait",
    why: "Rule 1 under direct pressure — the person hands over the vocabulary and asks for more of it.",
    text: "A friend keeps saying sah-astitva when we talk. What does that actually mean?",
  },
  practical: {
    id: "practical",
    why: '"When the question is purely practical ... just answer briefly without searching." Retrieval restraint, which nothing else in the suite tests.',
    text: "How long should I boil eggs for a soft yolk?",
  },
  mundane: {
    id: "mundane",
    why: "The launch ask: a throwaway question should still land somewhere worth landing. It is the hardest case for that, because Dhee cannot know where the bus is — so the reply has to come from a wider view rather than from an apology, without inventing anything, without turning into a sermon.",
    text: "Where's my bus? It's late again.",
  },
  devanagari: {
    id: "devanagari",
    why: '"Hindi (in Devanagari or Roman script) stays in that same script." Devanagari in, Devanagari out.',
    text: "मेरे पिता से बात करते हुए हमेशा झगड़ा हो जाता है। मैं क्या करूँ?",
  },
  hinglish: {
    id: "hinglish",
    why: '"Hinglish stays Hinglish." The one script rule a Unicode range cannot check, so the reply gets read by hand too.',
    text: "Mujhe apne kaam mein koi meaning nahi mil raha. Har din bas nikal jaata hai. Kya karun?",
  },
  "memory-aware": {
    id: "memory-aware",
    why: "\"Do not recite it back, do not reference 'what you told me before'.\" Memory must shape the reply while staying invisible.",
    text: "I'm thinking about leaving my job. Talk it through with me.",
  },
  provenance: {
    id: "provenance",
    why: 'Rule 1\'s own exception: citations are barred "unless the person explicitly asks where an idea comes from". Here they ask.',
    text: "Where does that idea come from? Is it from somewhere in particular?",
    priorTurns: [
      {
        role: "user",
        text: "I got the promotion I wanted and felt nothing. What's wrong with me?",
      },
      { role: "assistant", text: SEEDED_REPLY },
    ],
  },
};

// ---------------------------------------------------------------------------
// Expectations
// ---------------------------------------------------------------------------

/**
 * What a correct reply to one case looks like, in the terms `checks.ts` can
 * actually decide. Every field maps to a sentence in the system prompt — if a
 * field cannot be traced to one, it does not belong here.
 */
export type Expectations = {
  /** Whether the corpus should have been searched at all. */
  retrieval: "required" | "forbidden" | "either";
  /** Tools that must appear among the calls, when a specific path is expected. */
  expectTools?: string[];
  /** Book / chapter / page / author references in the reply text. */
  citations: "allowed" | "forbidden";
  /**
   * Domain vocabulary. `discouraged` is the plain-language *preference* — a
   * term or two is fine, a glossary is not (see MAX_LIGHT_TERMS). There is no
   * `forbidden` any more: the prompt stopped banning these outright when Dhee
   * became an assistant for Madhyasth Darshan rather than a companion hiding
   * that it had read any.
   */
  termsOfArt: "allowed" | "discouraged";
  /**
   * Whether the reply may repeat a tool result word for word. `forbidden` is
   * "never quote a tool result directly"; `required` inverts the same check
   * into proof that a study answer came from the page rather than from memory.
   */
  verbatimQuote: "required" | "allowed" | "forbidden";
  script: "latin" | "devanagari" | "hinglish";
  /** `brief` is Rule 2's shape; study mode lifts the ceiling to `unbounded`. */
  shape: "brief" | "unbounded";
  memory: "must-inform" | "must-not-recite" | "n/a";
};

// Rule 2's shape, in numbers. Deliberately loose: "one or two short paragraphs
// is usually enough" is guidance, and a check that fires on the third paragraph
// would fail constantly and get switched off. This catches the wall of text,
// not the slightly long answer.
//
// Paragraphs and questions do the real work here, because the prompt states
// both in so many words. The word cap is only a backstop.
//
// Measured across the first full run: every reply the suite considers brief
// landed between 102 and 242 words, in two to four paragraphs. 320 sits well
// clear of that, and still catches the one reply that turned into a lecture.
//
// Worth knowing if you retune these: Devanagari counts looked 40% higher until
// the word tokenizer was fixed to include combining marks (see WORD in
// checks.ts). A cap raised to accommodate that inflation would have been
// hiding the bug rather than allowing for Hindi.
export const BRIEF_MAX_PARAGRAPHS = 4;
export const BRIEF_MAX_WORDS = 320;
/** "Ask at most one gentle question back." */
export const BRIEF_MAX_QUESTIONS = 2;

// ---------------------------------------------------------------------------
// Cases
// ---------------------------------------------------------------------------

export type EvalCase = {
  /** `<persona>/<probe>`, which is also what `--only` matches on. */
  id: string;
  persona: PersonaId;
  probe: ProbeId;
  tags: string[];
  why: string;
  expect: Expectations;
};

// Defaults for a plain-language, no-lens reply. Cases override only what their
// own rule changes, so a diff of this list reads as "what is different here".
const ORDINARY: Expectations = {
  retrieval: "either",
  citations: "forbidden",
  termsOfArt: "discouraged",
  verbatimQuote: "forbidden",
  script: "latin",
  shape: "brief",
  memory: "n/a",
};

export const CASES: EvalCase[] = [
  {
    id: "bare/life",
    persona: "bare",
    probe: "life",
    tags: ["baseline"],
    why: "Rule 1 and Rule 2 with nothing else switched on. Every other case is read against this one.",
    expect: { ...ORDINARY, retrieval: "required" },
  },
  {
    id: "bare/page-lookup",
    persona: "bare",
    probe: "page-lookup",
    tags: ["study", "lens"],
    // Before the launch rewrite this case expected a refusal: no lens meant no
    // citation and no text. That gate is gone on purpose — someone who names a
    // book and a page has asked for the source, and stonewalling them was the
    // "quite limiting" behaviour the rewrite removed. What the lens still gates
    // is study *length* and free use of the vocabulary, which is what the
    // corpus/page-lookup case measures against this one.
    why: "The source is reachable by anyone who asks for it by name. Read against corpus/page-lookup: same lookup, but this reply stays brief and stays out of the vocabulary.",
    expect: {
      ...ORDINARY,
      retrieval: "required",
      expectTools: ["listBooks", "readPage"],
      citations: "allowed",
      verbatimQuote: "allowed",
    },
  },
  {
    id: "bare/term-bait",
    persona: "bare",
    probe: "term-bait",
    tags: ["rule1"],
    why: "The plain-language preference when the person supplies the term themselves. Their word is theirs to echo, and the idea should come back in living language rather than as four more Sanskrit terms.",
    expect: ORDINARY,
  },
  {
    id: "bare/practical",
    persona: "bare",
    probe: "practical",
    tags: ["retrieval"],
    // This used to expect `retrieval: "forbidden"` and was described as the one
    // case that caught retrieval firing when it shouldn't. The prompt no longer
    // has a "shouldn't" — searching is the default now, and a check that
    // contradicts the prompt fails honest replies. What is still worth pinning
    // is that a cooking question gets cooking advice, briefly, in English.
    why: "A question with no life in it. Whatever Dhee does or doesn't search, the person must get the actual answer, short.",
    expect: { ...ORDINARY, retrieval: "either" },
  },
  {
    id: "corpus/mundane",
    persona: "corpus",
    probe: "mundane",
    tags: ["depth", "lens"],
    // The persona is `corpus` rather than `bare` because that is what onboarding
    // now hands almost everyone (src/lib/traditions.ts, DEFAULT_TRADITION), and
    // this is the shape of question a launch user is most likely to throw at it
    // on day one. The deterministic checks can only prove brevity; whether the
    // depth landed or curdled into a sermon is the judge's
    // `answeredAtDepthAsked` and a human reading the reply.
    why: "A throwaway question under the default lens. Dhee cannot know where the bus is and must neither invent it nor hand back an apology — brief, no sermon, and per the judge still worth having asked.",
    expect: {
      ...ORDINARY,
      retrieval: "either",
      termsOfArt: "allowed",
      citations: "allowed",
    },
  },
  {
    id: "bare/devanagari",
    persona: "bare",
    probe: "devanagari",
    tags: ["script"],
    why: '"Don\'t switch scripts on them." Devanagari in, Devanagari out.',
    expect: { ...ORDINARY, retrieval: "required", script: "devanagari" },
  },
  {
    id: "bare/hinglish",
    persona: "bare",
    probe: "hinglish",
    tags: ["script"],
    why: '"Hinglish stays Hinglish." The weakest check in the suite, which is why the report labels it a heuristic.',
    expect: { ...ORDINARY, retrieval: "required", script: "hinglish" },
  },
  {
    id: "corpus/hinglish",
    persona: "corpus",
    probe: "hinglish",
    tags: ["script"],
    // `bare/hinglish` above tests the rule in isolation. This tests it where it
    // actually has to hold: onboarding preselects the corpus lens, so almost
    // every real person carries it, and it is the lens that opens study mode —
    // which lifts the brevity ceiling, permits verbatim quotation, and fills
    // the context with Devanagari source text before the reply is written.
    // Every one of those pulls the answer toward the script the person did not
    // use, which is exactly the pressure the rule has to survive.
    why: '"Hinglish stays Hinglish" under the lens almost everyone has. Study mode may quote the source in Devanagari, but the reply around it still belongs to the person who wrote in Roman letters.',
    expect: {
      ...ORDINARY,
      retrieval: "required",
      script: "hinglish",
      termsOfArt: "allowed",
      citations: "allowed",
      verbatimQuote: "allowed",
    },
  },
  {
    id: "bare/provenance",
    persona: "bare",
    probe: "provenance",
    tags: ["rule1"],
    why: 'Rule 1\'s exception. Citations are barred "unless the person explicitly asks where an idea comes from" — so here they are allowed, and a refusal is the failure.',
    expect: { ...ORDINARY, citations: "allowed" },
  },
  {
    id: "stoic/life",
    persona: "stoic",
    probe: "life",
    tags: ["lens"],
    why: "personalization.md:344 — framing visibly differs from bare/life while staying plain-spoken and non-dogmatic.",
    expect: { ...ORDINARY, retrieval: "required" },
  },
  {
    id: "advaita/life",
    persona: "advaita",
    probe: "life",
    tags: ["lens"],
    why: "personalization.md:344 — the third of the three replies issue #25 asks for in its PR.",
    expect: { ...ORDINARY, retrieval: "required" },
  },
  {
    id: "corpus/life",
    persona: "corpus",
    probe: "life",
    tags: ["study", "lens"],
    why: "personalization.md:379 — a life question with the corpus lens on must still get a companion's answer. This is the non-conversion failure the design's own writing warns about.",
    expect: {
      ...ORDINARY,
      retrieval: "required",
      termsOfArt: "allowed",
      citations: "allowed",
      verbatimQuote: "allowed",
    },
  },
  {
    id: "corpus/page-lookup",
    persona: "corpus",
    probe: "page-lookup",
    tags: ["study", "lens"],
    why: "personalization.md:354 — the capability #62 was missing. Resolve the book, read the page, quote it, say where it is from. Also where STUDY_STEPS gets measured.",
    expect: {
      retrieval: "required",
      expectTools: ["listBooks", "readPage"],
      citations: "allowed",
      termsOfArt: "allowed",
      verbatimQuote: "required",
      script: "latin",
      shape: "unbounded",
      memory: "n/a",
    },
  },
  {
    id: "corpus/term-bait",
    persona: "corpus",
    probe: "term-bait",
    tags: ["study", "lens"],
    why: "Decision 2 — the vocabulary is unlocked for this person and no one else. Read against bare/term-bait, which must refuse the same question.",
    expect: {
      ...ORDINARY,
      retrieval: "required",
      termsOfArt: "allowed",
      citations: "allowed",
      verbatimQuote: "allowed",
      shape: "unbounded",
    },
  },
  {
    id: "personalized/life",
    persona: "personalized",
    probe: "life",
    tags: ["personalization"],
    why: '"Let it shape how you speak to them — don\'t recite it back at them." The nickname should land; the occupation should not be read aloud.',
    expect: { ...ORDINARY, retrieval: "required" },
  },
  {
    id: "remembered/memory-aware",
    persona: "remembered",
    probe: "memory-aware",
    tags: ["memory"],
    why: "\"Do not recite it back, do not reference 'what you told me before' unless they raise it first.\" Memory has to work without showing.",
    expect: { ...ORDINARY, retrieval: "required", memory: "must-not-recite" },
  },
  {
    id: "full/memory-aware",
    persona: "full",
    probe: "memory-aware",
    tags: ["memory", "study", "lens", "personalization"],
    why: "Every layer at once. Catches the combinations that are individually fine and jointly wrong — a memory block that starts getting recited once study mode lifts the length ceiling.",
    expect: {
      ...ORDINARY,
      retrieval: "required",
      termsOfArt: "allowed",
      citations: "allowed",
      verbatimQuote: "allowed",
      shape: "unbounded",
      memory: "must-not-recite",
    },
  },
];

/**
 * The cases a run should cover. `only` matches a case id or a tag, so
 * `--only lens` runs the five lens cases and `--only corpus/page-lookup` runs
 * the one you are actually iterating on.
 *
 * An unmatched selector throws rather than quietly running nothing: a typo that
 * produces an empty green run is the worst possible failure mode for a harness
 * whose whole job is to be believed.
 */
export function selectCases(only?: string[]): EvalCase[] {
  if (!only || only.length === 0) return CASES;

  const unmatched = only.filter(
    (sel) => !CASES.some((c) => c.id === sel || c.tags.includes(sel)),
  );
  if (unmatched.length > 0) {
    throw new Error(
      `No eval case matches ${unmatched.map((s) => `"${s}"`).join(", ")}. ` +
        `Known ids: ${CASES.map((c) => c.id).join(", ")}. ` +
        `Known tags: ${[...new Set(CASES.flatMap((c) => c.tags))].sort().join(", ")}.`,
    );
  }

  return CASES.filter((c) =>
    only.some((sel) => c.id === sel || c.tags.includes(sel)),
  );
}
