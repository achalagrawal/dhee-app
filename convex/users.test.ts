import { describe, expect, test } from "vitest";
import {
  CORPUS_LENS_ALIASES,
  buildSystemPrompt,
  isCorpusLens,
} from "./agents/dhee";
import { api } from "./_generated/api";
import { DISCLAIMER_VERSION } from "./config";
import { PAID_TRADITION_LIMIT, traditionLimit } from "./lib/plan";
import { DEFAULT_TRADITION } from "../src/lib/traditions";
import { asUser, createUser, initTest } from "./test.setup";

// Personalization: the fields, and the prompt they assemble into. See
// docs/build/specs/personalization.md. Nothing here touches the model —
// buildSystemPrompt is a pure function, which is the point of its shape.

describe("users — personalization fields", () => {
  test("each field round-trips through currentProfile", async () => {
    const t = initTest();
    const as = asUser(t, await createUser(t));

    await as.mutation(api.users.setPersonalization, {
      nickname: "Kabir",
      occupation: "Teacher",
      aboutYou: "New father, thinking about moving cities.",
    });

    const profile = await as.query(api.users.currentProfile, {});
    expect(profile).toMatchObject({
      nickname: "Kabir",
      occupation: "Teacher",
      aboutYou: "New father, thinking about moving cities.",
    });
  });

  test("a field left out is untouched", async () => {
    const t = initTest();
    const as = asUser(t, await createUser(t));

    await as.mutation(api.users.setPersonalization, { nickname: "Kabir" });
    await as.mutation(api.users.setPersonalization, { occupation: "Teacher" });

    const profile = await as.query(api.users.currentProfile, {});
    expect(profile?.nickname).toBe("Kabir");
    expect(profile?.occupation).toBe("Teacher");
  });

  test("whitespace-only clears the field rather than storing spaces", async () => {
    const t = initTest();
    const as = asUser(t, await createUser(t));

    await as.mutation(api.users.setPersonalization, { nickname: "Kabir" });
    await as.mutation(api.users.setPersonalization, { nickname: "   " });

    // Clearing has to actually stop the model being told it.
    expect((await as.query(api.users.currentProfile, {}))?.nickname).toBe(
      undefined,
    );
  });

  test("over-long input is capped, not rejected", async () => {
    const t = initTest();
    const as = asUser(t, await createUser(t));

    await as.mutation(api.users.setPersonalization, {
      aboutYou: "x".repeat(5000),
    });
    expect(
      (await as.query(api.users.currentProfile, {}))?.aboutYou?.length,
    ).toBe(600);
  });

  test("values are trimmed", async () => {
    const t = initTest();
    const as = asUser(t, await createUser(t));

    await as.mutation(api.users.setPersonalization, { nickname: "  Kabir  " });
    expect((await as.query(api.users.currentProfile, {}))?.nickname).toBe(
      "Kabir",
    );
  });
});

describe("users — tradition lens", () => {
  test("one lens is allowed on the free plan", async () => {
    const t = initTest();
    const as = asUser(t, await createUser(t));

    await as.mutation(api.users.setTraditions, { traditions: ["Stoicism"] });
    expect((await as.query(api.users.currentProfile, {}))?.traditions).toEqual([
      "Stoicism",
    ]);
  });

  test("a second lens on the free plan is refused server-side", async () => {
    const t = initTest();
    const as = asUser(t, await createUser(t));

    // A client that sends two gets an error, not two.
    await expect(
      as.mutation(api.users.setTraditions, {
        traditions: ["Stoicism", "Advaita Vedanta"],
      }),
    ).rejects.toThrow("free plan includes one");
  });

  test("the corpus lens does not spend the free plan's one lens", async () => {
    const t = initTest();
    const as = asUser(t, await createUser(t));

    // The quota is about how much framing text lands in the prompt. Madhyasth
    // Darshan is a capability, not a framing, so someone who came with Stoicism
    // can still open the books.
    await as.mutation(api.users.setTraditions, {
      traditions: ["Stoicism", "Madhyasth Darshan"],
    });
    expect((await as.query(api.users.currentProfile, {}))?.traditions).toEqual([
      "Stoicism",
      "Madhyasth Darshan",
    ]);
  });

  test("the corpus lens is exempt under its other spellings too", async () => {
    const t = initTest();
    const as = asUser(t, await createUser(t));

    await as.mutation(api.users.setTraditions, {
      traditions: ["Stoicism", "जीवन विद्या"],
    });
    expect(
      (await as.query(api.users.currentProfile, {}))?.traditions,
    ).toHaveLength(2);
  });

  test("the exemption does not become a second free framing lens", async () => {
    const t = initTest();
    const as = asUser(t, await createUser(t));

    // A near miss must fail safe: "Madhyamaka" is a different tradition and
    // still counts against the quota.
    await expect(
      as.mutation(api.users.setTraditions, {
        traditions: ["Stoicism", "Madhyamaka"],
      }),
    ).rejects.toThrow("free plan includes one");
  });

  test("duplicates collapse case-insensitively rather than counting twice", async () => {
    const t = initTest();
    const as = asUser(t, await createUser(t));

    await as.mutation(api.users.setTraditions, {
      traditions: ["Stoicism", "stoicism", "  "],
    });
    expect((await as.query(api.users.currentProfile, {}))?.traditions).toEqual([
      "Stoicism",
    ]);
  });

  test("the list can be cleared", async () => {
    const t = initTest();
    const as = asUser(t, await createUser(t));

    await as.mutation(api.users.setTraditions, { traditions: ["Stoicism"] });
    await as.mutation(api.users.setTraditions, { traditions: [] });
    expect((await as.query(api.users.currentProfile, {}))?.traditions).toEqual(
      [],
    );
  });

  test("onboarding writes the same field the settings picker edits", async () => {
    const t = initTest();
    const as = asUser(t, await createUser(t));

    await as.mutation(api.users.completeOnboarding, {
      name: "Kabir",
      preferredLanguage: "en",
      tradition: "  Stoicism  ",
    });

    // Two sources of truth for one setting is how they drift apart.
    expect((await as.query(api.users.currentProfile, {}))?.traditions).toEqual([
      "Stoicism",
    ]);

    // And settings can then edit what onboarding wrote.
    await as.mutation(api.users.setTraditions, { traditions: ["Zen"] });
    expect((await as.query(api.users.currentProfile, {}))?.traditions).toEqual([
      "Zen",
    ]);
  });

  test("onboarding without a tradition leaves the lens unset", async () => {
    const t = initTest();
    const as = asUser(t, await createUser(t));

    await as.mutation(api.users.completeOnboarding, {
      name: "Kabir",
      preferredLanguage: "en",
    });
    expect((await as.query(api.users.currentProfile, {}))?.traditions).toEqual(
      [],
    );
  });

  test("a missing plan is treated as free, not as unlimited", async () => {
    // Fail closed: the plan field arrives with #7, and until then nobody
    // should be silently upgraded.
    expect(traditionLimit(undefined)).toBe(1);
    expect(traditionLimit("free")).toBe(1);
    expect(traditionLimit("reflective")).toBe(PAID_TRADITION_LIMIT);
    expect(traditionLimit("patron")).toBe(PAID_TRADITION_LIMIT);
  });
});

describe("buildSystemPrompt", () => {
  const base = buildSystemPrompt();

  test("no personalization is byte-identical to the bare instructions", () => {
    // This is what makes the refactor safe to land ahead of any UI: the
    // overwhelming majority of people get exactly today's prompt.
    expect(buildSystemPrompt({})).toBe(base);
    expect(buildSystemPrompt({ contextBlock: "" })).toBe(base);
    expect(buildSystemPrompt({ nickname: "   ", traditions: [] })).toBe(base);
  });

  test("each field contributes its sentence exactly once", () => {
    const prompt = buildSystemPrompt({
      nickname: "Kabir",
      occupation: "Teacher",
      aboutYou: "New father.",
    });
    expect(prompt.match(/Call them Kabir/g)).toHaveLength(1);
    expect(prompt.match(/What they do: Teacher\./g)).toHaveLength(1);
    expect(prompt.match(/About them: New father\./g)).toHaveLength(1);
  });

  test("a value the person already punctuated doesn't get a second full stop", () => {
    const prompt = buildSystemPrompt({
      occupation: "Teacher",
      aboutYou: "New father, weighing a move.",
    });
    expect(prompt).toContain("About them: New father, weighing a move.");
    expect(prompt).not.toContain("move..");
    // And one that isn't punctuated still gets closed.
    expect(prompt).toContain("What they do: Teacher.");
  });

  test("a cleared field leaves nothing behind", () => {
    const prompt = buildSystemPrompt({ nickname: "Kabir", occupation: "" });
    expect(prompt).toContain("Call them Kabir");
    expect(prompt).not.toContain("What they do");
  });

  test("sections are ordered base, personalization, tradition, memory", () => {
    const prompt = buildSystemPrompt({
      nickname: "Kabir",
      traditions: ["Stoicism"],
      contextBlock: "They are weighing a move.",
    });
    // Memory last so it never outranks what the person stated in settings.
    expect(prompt.indexOf("Call them Kabir")).toBeLessThan(
      prompt.indexOf("thinks within Stoicism"),
    );
    expect(prompt.indexOf("thinks within Stoicism")).toBeLessThan(
      prompt.indexOf("They are weighing a move."),
    );
  });

  test("several lenses read as a list", () => {
    const prompt = buildSystemPrompt({
      traditions: ["Stoicism", "Zen", "Ikigai"],
    });
    expect(prompt).toContain("thinks within Stoicism, Zen and Ikigai");
  });

  test("the memory section still matches what it was before this refactor", () => {
    const prompt = buildSystemPrompt({ contextBlock: "They are grieving." });
    expect(prompt).toBe(
      `${base}\n\n---\n\nSome things you already know about the person you're talking with. Let this quietly inform your sense of them — do not recite it back, do not reference "what you told me before" unless they raise it first, and hold it loosely: people change, and any of this may be stale.\n\nThey are grieving.`,
    );
  });
});

describe("buildSystemPrompt — the base prompt's own commitments", () => {
  // The launch rewrite turned Dhee into an assistant for Madhyasth Darshan
  // rather than a companion concealing that it had read any. These pin the
  // parts of that rewrite a later edit could undo without noticing: the
  // grounding block, the depth mandate, and — the easiest to lose — that the
  // plain-language rule is now a preference and no longer a prohibition.
  const base = buildSystemPrompt();

  test("the fundamentals travel in the prompt, so an unretrieved turn is still grounded", () => {
    // Most turns retrieve nothing, and every practical one does not. If this
    // block goes, those turns fall back to the model's general recollection of
    // the darshan, which is exactly what the corpus is here to replace.
    expect(base).toContain("Existence is co-existence");
    expect(base).toContain("समाधान, समृद्धि, अभय, सह-अस्तित्व");
    expect(base).toContain("जीवन");
    expect(base).toContain("भ्रम");
  });

  test("it asks for depth, and says depth is not length", () => {
    expect(base).toContain("higher dimension");
    expect(base).toContain("Depth, not length");
  });

  test("a small question never comes back empty, and never comes back invented", () => {
    // Two failure modes, opposite directions, one passage. Leading with "I
    // don't have that" reads as a tool that failed and costs the trust the
    // depth is meant to build; inventing the bus time costs more. The prompt
    // has to hold both, so both are pinned.
    expect(base).toContain("do not open with what you lack");
    expect(base).toContain("never come back empty");
    expect(base).toContain("Never invent the fact");
    // And the guardrail against the other excess: depth reached for to sound
    // deep. If this goes, "always answer from higher up" turns insufferable.
    expect(base).toContain("real seeing, not decoration");
  });

  test("plain language is a preference, not a prohibition", () => {
    // The old prompt said "Never use terms of art". It does not any more, and
    // convex/evals/checks.ts was relaxed to match — if this reverts to a ban,
    // the eval stops agreeing with the prompt.
    expect(base).toContain("This is a preference, not a prohibition");
    expect(base).not.toContain("Never use terms of art");
  });
});

describe("buildSystemPrompt — the lens narrowing", () => {
  // docs/build/specs/personalization.md decides that naming a tradition
  // unlocks that tradition's vocabulary for the person who named it. These
  // tests pin the decision where a refactor would otherwise only break it in a
  // real conversation.

  test("a Madhyasth Darshan lens permits its vocabulary", () => {
    const prompt = buildSystemPrompt({ traditions: ["Madhyasth Darshan"] });
    expect(prompt).toContain("Madhyasth Darshan");
    expect(prompt).toContain("you may use that tradition's own vocabulary");
  });

  test("the guardrail is never separated from the permission", () => {
    const prompt = buildSystemPrompt({ traditions: ["Madhyasth Darshan"] });
    // A lens hardening into doctrine is the specific failure this guards.
    expect(prompt).toContain("lens, not a doctrine");
    expect(prompt).toContain("never force it");
    expect(prompt).toContain("only to the tradition they named");
  });

  test("the unlock does not leak to people who named no lens", () => {
    expect(buildSystemPrompt({ nickname: "Kabir" })).not.toContain(
      "you may use that tradition's own vocabulary",
    );
  });

  test("the base plain-language preference is still there underneath", () => {
    const prompt = buildSystemPrompt({ traditions: ["Madhyasth Darshan"] });
    expect(prompt).toContain("PLAIN LANGUAGE, held lightly");
    expect(prompt).toContain("say the thing rather than name it");
  });
});

describe("buildSystemPrompt — the corpus lens (study mode)", () => {
  // Decision 2 in docs/build/specs/personalization.md. This is the one place
  // the base rules are lifted rather than narrowed, so it is also the one most
  // likely to be quietly undone — a reader of DHEE_INSTRUCTIONS alone would
  // conclude the opposite of every assertion here.

  const study = buildSystemPrompt({ traditions: ["Madhyasth Darshan"] });

  test("it lifts the reticence about sources the base rules impose", () => {
    expect(study).toContain("book, chapter and page");
    expect(study).toContain("quote the source verbatim");
    expect(study).toContain("does not apply to this person");
  });

  test("length stops being capped", () => {
    expect(study).toContain("as long as the question needs");
    // And the base rule it overrides is still present to be overridden. If the
    // base wording changes, change the quotation in the study block with it —
    // an override that names a sentence nobody wrote overrides nothing.
    expect(study).toContain("**Depth, not length.**");
    expect(study).toContain('"depth, not length" is not a ceiling here');
  });

  test("the non-conversion guardrail travels with the permission", () => {
    // Brevity is no longer the protection, so this is the only one left.
    expect(study).toContain("don't preach");
    expect(study).toContain("at the depth they asked it");
    expect(study).toContain("not a chapter");
    expect(study).toContain(
      "don't treat their having named this lens as agreement",
    );
  });

  test("it keeps them in the script they wrote in", () => {
    expect(study).toContain("a script they didn't use");
  });

  test("a framing lens unlocks vocabulary and nothing else", () => {
    // The other 24 traditions have no books behind them; study mode must not
    // leak to any of them.
    const stoic = buildSystemPrompt({ traditions: ["Stoicism"] });
    expect(stoic).toContain("you may use that tradition's own vocabulary");
    expect(stoic).not.toContain("quote the source verbatim");
    expect(stoic).not.toContain("book, chapter and page");
    expect(stoic).not.toContain("as long as the question needs");
  });

  test("no lens at all gets neither", () => {
    const plain = buildSystemPrompt({ nickname: "Kabir" });
    expect(plain).not.toContain("quote the source verbatim");
    expect(plain).not.toContain("you may use that tradition's own vocabulary");
  });

  test("the don't-paste instruction lives in the base prompt, so it can be lifted", () => {
    // It used to sit in the tool descriptions, where nothing per-person could
    // reach it. If it moves back, study mode silently stops working.
    expect(buildSystemPrompt()).toContain(
      "Don't paste or closely paraphrase a passage unasked",
    );
  });
});

describe("isCorpusLens", () => {
  test("every listed spelling matches, in any case", () => {
    for (const alias of CORPUS_LENS_ALIASES) {
      expect(isCorpusLens([alias])).toBe(true);
      expect(isCorpusLens([alias.toUpperCase()])).toBe(true);
      expect(isCorpusLens([`  ${alias}  `])).toBe(true);
    }
  });

  test("it matches the Devanagari the picker never offers", () => {
    // People type their own; the suggestion list is not the whole world.
    expect(isCorpusLens(["मध्यस्थ दर्शन"])).toBe(true);
  });

  test("it finds the lens alongside others", () => {
    expect(isCorpusLens(["Stoicism", "Madhyasth Darshan"])).toBe(true);
  });

  test("the lens onboarding preselects actually opens study mode", () => {
    // DEFAULT_TRADITION is free text by the time it reaches here — onboarding
    // writes it into the same string field someone can type into. A typo would
    // fail safe, which is the problem: every new user would quietly get a
    // framing lens with no books behind it and nobody would see an error.
    expect(isCorpusLens([DEFAULT_TRADITION])).toBe(true);
  });

  test("a near miss fails safe rather than opening the corpus", () => {
    // Wrong here means someone gets study mode who never asked for it, so the
    // miss has to land on "framing lens only".
    expect(isCorpusLens(["Madhyamaka"])).toBe(false);
    expect(isCorpusLens(["darshan"])).toBe(false);
    expect(isCorpusLens(["Advaita Vedanta"])).toBe(false);
    expect(isCorpusLens([])).toBe(false);
    expect(isCorpusLens(undefined)).toBe(false);
  });
});

// Disclaimers: what Dhee is, what it can't do, and that conversations are read
// internally. See docs/build/specs/ai-disclaimers.md. What matters here is that
// nobody is asked twice and nobody is skipped — the copy itself is UI.

describe("users — disclaimer acknowledgement", () => {
  /** The version stored on the profile, reading past the API on purpose. */
  const storedVersion = async (
    t: ReturnType<typeof initTest>,
    userId: Awaited<ReturnType<typeof createUser>>,
  ) =>
    await t.run(async (ctx) => {
      const profile = await ctx.db
        .query("profiles")
        .withIndex("by_user", (q) => q.eq("userId", userId))
        .unique();
      return profile?.disclaimersAckedVersion;
    });

  test("a fresh account has not acknowledged anything", async () => {
    const t = initTest();
    const as = asUser(t, await createUser(t));

    // No profile row exists yet — the answer still has to be "not acked", not
    // undefined, or the gate would fail open on exactly the people it's for.
    expect(
      (await as.query(api.users.currentProfile, {}))?.disclaimersAcked,
    ).toBe(false);
  });

  test("finishing onboarding is the acknowledgement", async () => {
    const t = initTest();
    const userId = await createUser(t);
    const as = asUser(t, userId);

    await as.mutation(api.users.completeOnboarding, {
      name: "Kabir",
      preferredLanguage: "en",
    });

    // Otherwise the gate shows the same six points again on the first screen
    // after onboarding, which is where people learn to dismiss notices.
    expect(
      (await as.query(api.users.currentProfile, {}))?.disclaimersAcked,
    ).toBe(true);
    expect(await storedVersion(t, userId)).toBe(DISCLAIMER_VERSION);
  });

  test("an account that predates the disclaimers is asked, then isn't", async () => {
    const t = initTest();
    const userId = await createUser(t);
    const as = asUser(t, userId);

    // Onboarded before any of this existed: a profile with no ack on it.
    await as.mutation(api.users.setName, { name: "Kabir" });
    expect(
      (await as.query(api.users.currentProfile, {}))?.disclaimersAcked,
    ).toBe(false);

    await as.mutation(api.users.acknowledgeDisclaimers, {});
    expect(
      (await as.query(api.users.currentProfile, {}))?.disclaimersAcked,
    ).toBe(true);
  });

  test("acknowledging twice is harmless", async () => {
    const t = initTest();
    const userId = await createUser(t);
    const as = asUser(t, userId);

    await as.mutation(api.users.acknowledgeDisclaimers, {});
    await as.mutation(api.users.acknowledgeDisclaimers, {});
    expect(await storedVersion(t, userId)).toBe(DISCLAIMER_VERSION);
  });

  test("a bumped version re-asks someone who acknowledged the old text", async () => {
    const t = initTest();
    const userId = await createUser(t);
    const as = asUser(t, userId);

    await as.mutation(api.users.acknowledgeDisclaimers, {});
    // Stand in for a future DISCLAIMER_VERSION by ageing the stored ack: the
    // point of versioning it is that changing what we say asks again.
    await t.run(async (ctx) => {
      const profile = await ctx.db
        .query("profiles")
        .withIndex("by_user", (q) => q.eq("userId", userId))
        .unique();
      await ctx.db.patch(profile!._id, {
        disclaimersAckedVersion: DISCLAIMER_VERSION - 1,
      });
    });

    expect(
      (await as.query(api.users.currentProfile, {}))?.disclaimersAcked,
    ).toBe(false);

    await as.mutation(api.users.acknowledgeDisclaimers, {});
    expect(
      (await as.query(api.users.currentProfile, {}))?.disclaimersAcked,
    ).toBe(true);
  });
});
