import { describe, expect, test } from "vitest";
import {
  citationsIn,
  fingerprint,
  looksHinglish,
  recitesMemory,
  referencesThePast,
  runChecks,
  scriptOf,
  sharedSpan,
  shapeOf,
  termsOfArtIn,
} from "./checks";
import type { Expectations } from "./scenarios";

// The eval harness is only worth as much as these predicates. A checker nobody
// tests reports green forever, and a suite that is always green is one you stop
// reading — so every rule the harness claims to decide gets pinned here, in
// both scripts, against the false positives that would otherwise get the check
// switched off.
//
// Nothing here touches a model, a database or a network. This file runs in CI.

describe("scriptOf", () => {
  test.each([
    ["मुझे समझ नहीं आ रहा कि क्या करूँ।", "devanagari"],
    ["I don't know what to do about it.", "latin"],
    ["123 — !!! …", "none"],
  ] as const)("reads %j as %s", (text, expected) => {
    expect(scriptOf(text)).toBe(expected);
  });

  test("a stray book title does not make an English reply mixed", () => {
    expect(
      scriptOf(
        "That line is about how people actually behave with one another, and the book it sits in is मानव व्यवहार दर्शन.",
      ),
    ).toBe("latin");
  });

  test("a genuine half-and-half reply is mixed", () => {
    expect(
      scriptOf("यह एक अच्छा सवाल है and here is the answer in English"),
    ).toBe("mixed");
  });
});

describe("looksHinglish", () => {
  test("catches roman-script Hindi", () => {
    expect(
      looksHinglish(
        "Mujhe apne kaam mein koi meaning nahi mil raha. Har din bas nikal jaata hai.",
      ),
    ).toBe(true);
  });

  test("leaves ordinary English alone", () => {
    expect(
      looksHinglish(
        "Nothing is wrong with you. What you are describing happens to almost everyone who reaches something they have been running toward.",
      ),
    ).toBe(false);
  });
});

describe("termsOfArtIn", () => {
  test.each([
    "The idea of sah-astitva is that everything already coexists.",
    "There is an underlying vyavastha to how things hold together.",
    "This comes out of madhyasth darshan.",
    "यह मध्यस्थ दर्शन की बात है।",
  ])("catches a leak in %j", (text) => {
    expect(termsOfArtIn(text).length).toBeGreaterThan(0);
  });

  // The single most important negative in this file. जीवन is the ordinary Hindi
  // word for life and मानव is the ordinary word for human — a Devanagari reply
  // uses them in its first sentence. If these were on the deny list, every
  // Hindi case would fail forever and the check would be deleted rather than
  // fixed. See the comment above DEVANAGARI_TERMS in checks.ts.
  test.each([
    "आपका जीवन आपका अपना है, और यह सवाल पूछना ही एक अच्छी शुरुआत है।",
    "हर मानव को कभी न कभी ऐसा लगता है।",
    "अपने पिता से बात करते समय थोड़ा रुककर सुनना मदद कर सकता है।",
  ])("does not flag ordinary Hindi in %j", (text) => {
    expect(termsOfArtIn(text)).toEqual([]);
  });

  test("does not flag ordinary English", () => {
    expect(
      termsOfArtIn(
        "Wanting something and wanting who you would be if you had it are two different wants.",
      ),
    ).toEqual([]);
  });

  test("the echo allowance lets a reply use the word the person brought", () => {
    const probe = "A friend keeps saying sah-astitva. What does that mean?";
    const reply =
      "The word your friend uses, sah-astitva, points at something simple.";
    expect(termsOfArtIn(reply)).toContain("sah-astitva");
    expect(termsOfArtIn(reply, { echoAllowance: probe })).toEqual([]);
  });

  test("the echo allowance does not excuse a second, unasked term", () => {
    const probe = "A friend keeps saying sah-astitva. What does that mean?";
    const reply = "Your friend's sah-astitva is really about vyavastha.";
    expect(termsOfArtIn(reply, { echoAllowance: probe })).toEqual([
      "vyavastha",
    ]);
  });

  test("reports the longest match rather than every substring of it", () => {
    expect(termsOfArtIn("This is madhyasth darshan.")).toEqual([
      "madhyasth darshan",
    ]);
  });
});

describe("citationsIn", () => {
  test.each([
    "You'll find it on page 14.",
    "That's chapter 3 of the book.",
    "According to the tradition, it works differently.",
    "Nagraj wrote about exactly this.",
  ])("catches %j", (text) => {
    expect(citationsIn(text).length).toBeGreaterThan(0);
  });

  test("leaves an uncited plain answer alone", () => {
    expect(
      citationsIn(
        "The tiredness might be the most honest thing you're feeling right now.",
      ),
    ).toEqual([]);
  });

  test("repeating a page the person named is not a citation", () => {
    const probe =
      "What does this line on page 3 of Manav Vyavhar Darshan mean?";
    const reply =
      "I can't look inside page 3 of Manav Vyavhar Darshan for you, but tell me what the line says.";
    expect(citationsIn(reply).length).toBeGreaterThan(0);
    expect(citationsIn(reply, { echoAllowance: probe })).toEqual([]);
  });
});

describe("shapeOf", () => {
  test("counts paragraphs, words and questions", () => {
    const text =
      "First paragraph here.\n\nSecond one — and a question?\n\nThird?";
    expect(shapeOf(text)).toEqual({ paragraphs: 3, words: 9, questions: 2 });
  });

  test("a single block of prose is one paragraph", () => {
    expect(shapeOf("one\nline\nbreak but no blank line").paragraphs).toBe(1);
  });
});

describe("sharedSpan", () => {
  const source =
    "मानव का आचरण मूल्य वस्तु और व्यवस्था के संयोग से ही प्रकट होता है और यही सहअस्तित्व है";

  test("finds a passage pasted straight out of a tool result", () => {
    const reply = `Here is the line: ${source}`;
    expect(sharedSpan(reply, [source])).not.toBeNull();
  });

  test("does not fire on a reply that understood the idea and said it plainly", () => {
    const reply =
      "What it's pointing at is that how a person behaves and what they hold valuable are not two separate things.";
    expect(sharedSpan(reply, [source])).toBeNull();
  });

  test("a short coincidental overlap is below the threshold", () => {
    expect(
      sharedSpan(
        "It is really about how a person behaves and nothing more than that",
        [
          "about how a person behaves is the whole question here, not what they say",
        ],
        8,
      ),
    ).toBeNull();
  });

  // Devanagari vowel signs are combining marks, not letters. A tokenizer that
  // keeps only `\p{L}` splits होता into "ह" + "त", so any two Hindi texts share
  // long runs of bare consonants and every Devanagari reply gets reported as a
  // quote. This fired on the first live run; these two pin the fix.
  test("two unrelated Hindi texts do not share a span", () => {
    expect(
      sharedSpan(
        "मुझे लगता है कि यह सवाल पूछना ही एक अच्छी शुरुआत है और इसमें कोई जल्दी नहीं है",
        [
          "जब दोनों पक्ष अपनी बात कहने में लगे रहते हैं तब सुनना बहुत मुश्किल हो जाता है",
        ],
      ),
    ).toBeNull();
  });

  test("but a genuinely pasted Hindi passage is still caught", () => {
    const passage =
      "जब दोनों पक्ष अपनी बात कहने में लगे रहते हैं तब सुनना बहुत मुश्किल हो जाता है";
    expect(
      sharedSpan(`उस पन्ने पर लिखा है: ${passage}`, [passage]),
    ).not.toBeNull();
  });

  test("no sources means nothing to have quoted", () => {
    expect(
      sharedSpan("any reply at all, of reasonable length here", []),
    ).toBeNull();
  });
});

describe("recitesMemory", () => {
  const block = `What you know about them:
- (pattern) Measures themselves against what they have not done yet rather than what they have.
- (context) Moved cities last year and has not made close friends there.`;

  test("catches an observation read back to the person", () => {
    const reply =
      "You measures themselves against what they have not done yet rather than what they have, and that's worth noticing.";
    expect(recitesMemory(reply, block)).not.toBeNull();
  });

  test("leaves a reply that was merely informed by memory alone", () => {
    const reply =
      "It sounds like the yardstick you're using is everything still ahead of you, never what's behind.";
    expect(recitesMemory(reply, block)).toBeNull();
  });

  test("an empty block cannot be recited", () => {
    expect(
      recitesMemory("some reply of a reasonable length goes here", ""),
    ).toBeNull();
  });
});

describe("referencesThePast", () => {
  // Every one of these appeals to a conversation that, from the person's side,
  // never happened — the memory block came from other threads.
  test.each([
    "You've noticed before that wanting a thing and wanting who you'd be are different.",
    "You mentioned the move last year.",
    "Last time we talked about your father.",
    "From what you've told me, the job was never really the point.",
    "As you put it, the proving never ends.",
  ])("catches %j", (reply) => {
    expect(referencesThePast(reply)).not.toBeNull();
  });

  test.each([
    "It sounds like the yardstick you're using is everything still ahead of you.",
    "You've been carrying this for a while, haven't you?",
    "What is it about this job that makes you want to leave?",
  ])("leaves %j alone", (reply) => {
    expect(referencesThePast(reply)).toBeNull();
  });
});

describe("fingerprint", () => {
  test("is stable across calls", () => {
    expect(fingerprint("the same prompt")).toBe(fingerprint("the same prompt"));
  });

  test("changes when a single character changes", () => {
    expect(fingerprint("a lens, not a doctrine")).not.toBe(
      fingerprint("a lens, not a doctrine."),
    );
  });

  test("changes when two words are swapped, not only when length changes", () => {
    expect(fingerprint("perspective not lecture")).not.toBe(
      fingerprint("lecture not perspective"),
    );
  });
});

describe("runChecks", () => {
  const ordinary: Expectations = {
    retrieval: "required",
    citations: "forbidden",
    termsOfArt: "discouraged",
    verbatimQuote: "forbidden",
    script: "latin",
    shape: "brief",
    memory: "n/a",
  };

  const clean = {
    probe: "I got the promotion I wanted and felt nothing.",
    reply:
      "Nothing's wrong with you. Wanting something for two years usually means wanting who you'd be once you had it — and a title can't deliver that.\n\nWhat were you hoping would change?",
    traditions: [],
    contextBlock: "",
    toolNames: ["searchWisdom"],
    toolOutputs: [
      "कुछ लंबा पाठ जो उपकरण से वापस आया है और उत्तर में नहीं आना चाहिए",
    ],
  };

  test("a good reply passes every check it earned", () => {
    const checks = runChecks(clean, ordinary);
    expect(checks.every((c) => c.ok)).toBe(true);
    expect(checks.map((c) => c.id)).toEqual([
      "plain-language (light)",
      "no-citations",
      "searched-corpus",
      "no-raw-corpus",
      "script-mirrored",
      "brief",
    ]);
  });

  test("a term or two is allowed to land; a glossary is not", () => {
    // The prompt asks Dhee to lean plain, not to dodge — so this check has to
    // pass a reply that reaches for the honest word and fail the one that
    // reaches for five. If it ever goes back to `=== 0`, it has stopped
    // agreeing with the prompt it is meant to measure.
    const oneTerm = {
      ...clean,
      reply:
        "What you are describing has a name in this tradition — vyavastha, the order a thing is already part of. You are not outside it because a title did not land.",
    };
    expect(
      runChecks(oneTerm, ordinary).find(
        (c) => c.id === "plain-language (light)",
      )?.ok,
    ).toBe(true);

    const glossary = {
      ...clean,
      reply:
        "This is about sah-astitva, and about vyavastha, and about jeevan, and about manaviya conduct, which madhyasth darshan sets out in its paribhasha.",
    };
    const check = runChecks(glossary, ordinary).find(
      (c) => c.id === "plain-language (light)",
    );
    expect(check?.ok).toBe(false);
    expect(check?.detail).toContain("terms");
  });

  test("checks an expectation switches off are omitted, not silently passed", () => {
    // A run reporting "12 passed" should mean twelve things were decided.
    const ids = runChecks(clean, {
      ...ordinary,
      termsOfArt: "allowed",
      citations: "allowed",
      retrieval: "either",
      verbatimQuote: "allowed",
      shape: "unbounded",
    }).map((c) => c.id);
    expect(ids).toEqual(["script-mirrored (quoting allowed)"]);
  });

  test("a study answer may carry a Devanagari quote inside English prose", () => {
    // The study prompt asks for exactly this shape: "give the original line and
    // then say what it means in English". The strict script check would call
    // it mixed and fail it.
    const studyReply = `The line on that page reads:

> ${clean.toolOutputs[0]}

What it is saying is that how a person behaves and what they hold valuable are not two separate things — behaviour is where the value becomes visible.`;
    const check = runChecks(
      { ...clean, reply: studyReply },
      { ...ordinary, verbatimQuote: "required", shape: "unbounded" },
    ).find((c) => c.id.startsWith("script-mirrored"));
    expect(check?.ok).toBe(true);
  });

  test("but answering wholly in the script they did not use still fails", () => {
    const check = runChecks(
      { ...clean, reply: clean.toolOutputs[0] as string },
      { ...ordinary, verbatimQuote: "required", shape: "unbounded" },
    ).find((c) => c.id.startsWith("script-mirrored"));
    expect(check?.ok).toBe(false);
  });

  test("an empty reply fails outright rather than passing every check vacuously", () => {
    const checks = runChecks({ ...clean, reply: "   " }, ordinary);
    expect(checks).toEqual([
      { id: "non-empty", ok: false, detail: "the reply was empty" },
    ]);
  });

  test("a search that should not have happened is caught", () => {
    const checks = runChecks(clean, { ...ordinary, retrieval: "forbidden" });
    const search = checks.find((c) => c.id === "no-corpus-search");
    expect(search?.ok).toBe(false);
    expect(search?.detail).toContain("searchWisdom");
  });

  test("under the corpus lens the quote check inverts into proof of retrieval", () => {
    const noQuote = runChecks(clean, {
      ...ordinary,
      verbatimQuote: "required",
    }).find((c) => c.id === "quotes-the-source");
    expect(noQuote?.ok).toBe(false);

    const quoted = runChecks(
      { ...clean, reply: `The line reads: ${clean.toolOutputs[0]}` },
      { ...ordinary, verbatimQuote: "required" },
    ).find((c) => c.id === "quotes-the-source");
    expect(quoted?.ok).toBe(true);
  });
});
