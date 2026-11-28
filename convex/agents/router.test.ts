import { describe, expect, test, vi } from "vitest";
import {
  CLASSIFIER_SYSTEM,
  LONG_MIN_CHARS,
  ROUTE_KINDS,
  SHORT_MAX_CHARS,
  type RouteInput,
  type RouteKind,
  classifierPrompt,
  classifyWithDecisions,
  routeByRules,
  routeTurn,
  tierForKind,
} from "./router";

// No model is called here: the classifier is a stub that returns whatever
// kind the test names, or throws.

const base: RouteInput = {
  text: "",
  hasImage: false,
  deepTier: "reflective",
};

const says = (kind: RouteKind) => vi.fn(async () => kind);

describe("routeByRules", () => {
  test("a bare acknowledgement stays light, in any of the usual forms", () => {
    for (const text of ["ok", "Thanks!", "धन्यवाद", "ठीक है", "🙏", "ji 🙏"]) {
      expect(routeByRules({ ...base, text }), text).toMatchObject({
        tier: "quick",
        kind: "acknowledgement",
      });
    }
  });

  test("an acknowledgement with a question in it is not one", () => {
    expect(routeByRules({ ...base, text: "ok, but why?" })).toBeNull();
    expect(
      routeByRules({ ...base, text: "thanks, and what is jeevan?" }),
    ).toBeNull();
  });

  test("a photo goes deep, since Quick reads no images", () => {
    expect(
      routeByRules({ ...base, text: "what is this?", hasImage: true }),
    ).toMatchObject({
      tier: "reflective",
      kind: "attachment",
    });
  });

  test("a message in crisis never takes the cheap path", () => {
    expect(
      routeByRules({ ...base, text: "I want to kill myself" }),
    ).toMatchObject({
      tier: "reflective",
      kind: "crisis",
    });
  });

  test("anything else is left to the classifier", () => {
    expect(
      routeByRules({ ...base, text: "What does vyavastha mean?" }),
    ).toBeNull();
  });
});

describe("tierForKind", () => {
  test("lookups, drafting and practical questions go light", () => {
    for (const kind of [
      "term-lookup",
      "find-text",
      "translation",
      "drafting",
      "practical",
    ] as const) {
      expect(tierForKind(kind, base), kind).toBe("quick");
    }
  });

  test("explaining, comparing, someone's life and long study go deep", () => {
    for (const kind of [
      "concept",
      "comparison",
      "personal",
      "multi-part-study",
      "refine-message",
    ] as const) {
      expect(tierForKind(kind, base), kind).toBe("reflective");
    }
  });

  test("deep goes to whatever the deployment can offer", () => {
    expect(tierForKind("concept", { ...base, deepTier: "thoughtful" })).toBe(
      "thoughtful",
    );
  });

  test("a short follow-up stays where the turn before it went", () => {
    expect(
      tierForKind("short-follow-up", { ...base, previousTier: "reflective" }),
    ).toBe("reflective");
    expect(
      tierForKind("short-follow-up", { ...base, previousTier: "quick" }),
    ).toBe("quick");
    expect(tierForKind("short-follow-up", base)).toBe("quick");
  });

  test("a long message is not a short follow-up or a bare thanks, whatever the label", () => {
    // Most of the classifier's risky misses on the labelled set: a page of
    // someone's own analysis that ends "I agree", called a follow-up.
    const long = "x".repeat(SHORT_MAX_CHARS + 1);
    for (const kind of ["short-follow-up", "acknowledgement"] as const) {
      expect(
        tierForKind(kind, { ...base, text: long, previousTier: "quick" }),
        kind,
      ).toBe("reflective");
    }
  });

  test("a very long message goes deep, except a translation", () => {
    const veryLong = "x".repeat(LONG_MIN_CHARS + 1);
    expect(tierForKind("drafting", { ...base, text: veryLong })).toBe(
      "reflective",
    );
    expect(tierForKind("translation", { ...base, text: veryLong })).toBe(
      "quick",
    );
  });

  test("every kind the classifier can return has a tier", () => {
    for (const kind of ROUTE_KINDS) {
      expect(["quick", "reflective"]).toContain(tierForKind(kind, base));
    }
  });
});

describe("routeTurn", () => {
  test("a rule decides without calling the classifier", async () => {
    const classify = says("concept");
    const out = await routeTurn({ ...base, text: "thanks" }, classify);
    expect(out).toEqual({ tier: "quick", kind: "acknowledgement", by: "rule" });
    expect(classify).not.toHaveBeenCalled();
  });

  test("otherwise the classifier's kind decides", async () => {
    const out = await routeTurn(
      { ...base, text: "स्वत्व, स्वतंत्रता, स्वराज्य को पूरी तरह से समझाएं" },
      says("multi-part-study"),
    );
    expect(out).toEqual({
      tier: "reflective",
      kind: "multi-part-study",
      by: "classifier",
    });
  });

  test("a classifier failure costs the routing, never the reply", async () => {
    const failing = vi.fn(async (): Promise<RouteKind> => {
      throw new Error("timeout");
    });
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      expect(await routeTurn({ ...base, text: "why?" }, failing)).toEqual({
        tier: "quick",
        kind: "fallback",
        by: "fallback",
      });
      expect(
        await routeTurn(
          { ...base, text: "why?", previousTier: "reflective" },
          failing,
        ),
      ).toMatchObject({ tier: "reflective", by: "fallback" });
    } finally {
      warn.mockRestore();
    }
  });
});

describe("classifyWithDecisions", () => {
  // A stubbed fetch stands in for OpenRouter's Decisions API.
  const reply = (choice: string, probabilities: Record<string, number>) =>
    vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            answers: { kind: { type: "choice", choice, probabilities } },
            usage: { input_tokens: 300, output_tokens: 10, cost: 0.00001 },
          }),
        ),
    ) as unknown as typeof fetch;

  test("asks one choice question whose options are the kinds", async () => {
    const fetchImpl = reply("term-lookup", { "term-lookup": 1 });
    await classifyWithDecisions({
      model: "typesafe/jev-1.14",
      apiKey: "k",
      fetchImpl,
    })({
      ...base,
      text: "What is samadhan?",
    });
    const body = JSON.parse(
      (fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls[0]![1].body,
    );
    expect(body.model).toBe("typesafe/jev-1.14");
    expect(Object.keys(body.questions.kind.criteria)).toEqual([...ROUTE_KINDS]);
  });

  test("a light pick it is unsure of goes to the likeliest deep kind", async () => {
    const classify = classifyWithDecisions({
      model: "typesafe/jev-1.14",
      apiKey: "k",
      minLightProbability: 0.7,
      fetchImpl: reply("term-lookup", {
        "term-lookup": 0.55,
        concept: 0.3,
        personal: 0.15,
      }),
    });
    expect(await classify({ ...base, text: "x" })).toBe("concept");
  });

  test("an error response throws, so routing falls back", async () => {
    const classify = classifyWithDecisions({
      model: "typesafe/jev-1.14",
      apiKey: "k",
      fetchImpl: vi.fn(
        async () => new Response("nope", { status: 500 }),
      ) as unknown as typeof fetch,
    });
    await expect(classify({ ...base, text: "x" })).rejects.toThrow(
      "decisions 500",
    );
  });
});

describe("the classifier prompt", () => {
  test("names every kind it may answer with", () => {
    for (const kind of ROUTE_KINDS)
      expect(CLASSIFIER_SYSTEM).toContain(`- ${kind}:`);
  });

  test("carries the previous message only when there is one", () => {
    expect(
      classifierPrompt({ ...base, text: "and the second?" }),
    ).not.toContain("previous");
    expect(
      classifierPrompt({
        ...base,
        text: "and the second?",
        previousText: "Name the two kinds of order.",
      }),
    ).toContain("Name the two kinds of order.");
  });

  test("clips a very long message", () => {
    const prompt = classifierPrompt({ ...base, text: "x".repeat(10000) });
    expect(prompt.length).toBeLessThan(2000);
  });
});
