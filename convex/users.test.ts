import { describe, expect, test } from "vitest";
import { buildSystemPrompt } from "./agents/dhee";
import { api } from "./_generated/api";
import { PAID_TRADITION_LIMIT, traditionLimit } from "./lib/plan";
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

describe("buildSystemPrompt — the Rule 1 narrowing", () => {
  // docs/build/specs/personalization.md decides that naming a tradition
  // unlocks that tradition's vocabulary for the person who named it. Rule 1
  // is described in the code as load-bearing, so these tests pin the decision
  // where a refactor would otherwise only break it in a real conversation.

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

  test("the base plain-language rule is still there underneath", () => {
    const prompt = buildSystemPrompt({ traditions: ["Madhyasth Darshan"] });
    expect(prompt).toContain("PLAIN, EVERYDAY LANGUAGE ONLY");
    expect(prompt).toContain("PERSPECTIVE, NOT LECTURE");
  });
});
