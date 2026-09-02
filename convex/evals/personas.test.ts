import { describe, expect, test } from "vitest";
import { buildSystemPrompt, isCorpusLens } from "../agents/dhee";
import { fingerprint } from "./checks";
import { PERSONAS, type PersonaId } from "./scenarios";

// The deterministic half of the eval harness.
//
// Everything the live suite measures is downstream of one string per persona,
// and that string is a pure function of `buildSystemPrompt`. So the question
// "did my edit change what the model is told, and for whom?" can be answered
// exactly, for free, in CI — no model, no key, no variance. The live run is for
// the other question: what the model then did about it.
//
// A changed fingerprint is not a failure. It is the test asking you to confirm
// you meant it.

// One line per persona. If a fingerprint changes, you changed the prompt that
// persona receives — confirm it was intended, then update the constant IN THE
// SAME COMMIT as the change and say so in the message. Never regenerate these
// in bulk: docs/build/specs/personalization.md:334 says a silently re-recorded
// snapshot is how this rule stops meaning anything, and that applies here.
//
// Re-recorded once, wholesale, for the Madhyasth Darshan launch rewrite: the
// base prompt stopped being a companion that concealed the corpus and became an
// assistant for the darshan, carrying its fundamentals inline. Every persona
// moved because every persona shares that base — note the lengths roughly
// tripling, which is the fundamentals block and nothing else. This is the one
// case the file's own rule allows for a bulk update, and it is stated here so
// the next bulk update has to justify itself the same way.
//
// Re-recorded a second time when the language rule was rewritten to say
// "and the same script", to name romanised Hindi and the other Indian scripts
// explicitly, and to tell Dhee to follow the person's latest message rather
// than its own last reply. Every persona moved for the same reason as before —
// they share the base — and the justification a bulk update owes is here: each
// length rose by exactly 994, so the language section is the only thing that
// changed and no persona picked up anything the others didn't.
//
// Note these still describe a prompt with no script line appended: the per-turn
// script assertion is keyed off the message being answered, and a persona has
// no message. `buildSystemPrompt` with no `replyScript` is what these pin.
const PROMPT_FINGERPRINTS: Record<PersonaId, string> = {
  bare: "34633216-13120",
  stoic: "e9a9375d-13789",
  advaita: "8f27d751-13796",
  corpus: "3d2a4c44-15616",
  personalized: "76b8b1ef-13422",
  remembered: "7cc4dfc1-14005",
  full: "029635a4-16803",
};

// The section separator `buildSystemPrompt` joins with.
const RULE = "\n\n---\n\n";

const sectionsFor = (id: PersonaId) =>
  buildSystemPrompt(PERSONAS[id].inputs).split(RULE);

describe("persona prompts — fingerprints", () => {
  test.each(Object.keys(PROMPT_FINGERPRINTS) as PersonaId[])(
    "%s is unchanged",
    (id) => {
      expect(fingerprint(buildSystemPrompt(PERSONAS[id].inputs))).toBe(
        PROMPT_FINGERPRINTS[id],
      );
    },
  );

  test("no two personas produce the same prompt", () => {
    // A persona that has quietly stopped differing from another is a case
    // spending money to measure nothing.
    const values = Object.values(PROMPT_FINGERPRINTS);
    expect(new Set(values).size).toBe(values.length);
  });
});

describe("persona prompts — structure", () => {
  // Section counts a fingerprint cannot explain. A hash tells you something
  // moved; these tell you what.
  test.each([
    ["bare", 1],
    ["stoic", 2],
    ["advaita", 2],
    ["personalized", 2],
    ["remembered", 2],
    ["corpus", 3],
    ["full", 5],
  ] as const)("%s has %i sections", (id, count) => {
    expect(sectionsFor(id)).toHaveLength(count);
  });

  test("the section order is the contract, not an accident", () => {
    // personalization.md: base instructions, then who the person is, then how
    // to frame things for them, then what's remembered — held loosely and last,
    // so it never outranks what they've stated about themselves.
    const [base, facts, lens, study, memory] = sectionsFor("full");
    expect(base).toContain("You are Dhee");
    expect(facts).toContain("A few things this person has told you");
    expect(lens).toContain("This person thinks within");
    expect(study).toContain("you are also a study partner");
    expect(memory).toContain("Some things you already know");
  });

  test("the study block appears exactly when the corpus lens is on", () => {
    for (const persona of Object.values(PERSONAS)) {
      const hasStudy = buildSystemPrompt(persona.inputs).includes(
        "you are also a study partner",
      );
      expect([persona.id, hasStudy]).toEqual([
        persona.id,
        isCorpusLens(persona.inputs.traditions),
      ]);
    }
  });

  test("a framing lens unlocks vocabulary without unlocking citations", () => {
    // The narrowing of Rule 1 that every non-corpus tradition gets, and the
    // line that stops it hardening into doctrine. Someone editing the lens
    // section must not keep the first sentence and drop the last.
    const stoic = sectionsFor("stoic")[1] as string;
    expect(stoic).toContain("you may use that tradition's own vocabulary");
    expect(stoic).toContain("Keep it a lens, not a doctrine");
    expect(stoic).not.toContain("book, chapter and page");
  });

  test("the script rule is appended last, after even the memory block", () => {
    // Last because it has to beat the conversation's own history: once a thread
    // has drifted into the wrong script the model starts matching its previous
    // replies, so the correction has to be the most recent thing it reads.
    const withScript = buildSystemPrompt({
      ...PERSONAS.full.inputs,
      replyScript: "latin",
    }).split(RULE);
    expect(withScript).toHaveLength(sectionsFor("full").length + 1);
    expect(withScript.at(-1)).toContain("Roman");
    expect(withScript.at(-2)).toContain("Some things you already know");
  });

  test("no script input leaves the prompt byte-for-byte unchanged", () => {
    // The fingerprints above pin the no-script prompt, so this is what makes
    // them meaningful rather than accidental.
    expect(buildSystemPrompt(PERSONAS.full.inputs)).toBe(
      buildSystemPrompt({ ...PERSONAS.full.inputs, replyScript: undefined }),
    );
  });

  test("every term Rule 1 names survives interpolation into the prompt", () => {
    // TERMS_OF_ART is interpolated rather than written inline so the eval
    // checker can share it. This is what proves the interpolation still lands.
    const base = sectionsFor("bare")[0] as string;
    for (const term of ["sah-astitva", "vyavastha", "madhyasth darshan"]) {
      expect(base).toContain(`"${term},"`);
    }
  });
});
