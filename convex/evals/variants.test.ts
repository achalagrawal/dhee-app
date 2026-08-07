import { describe, expect, it } from "vitest";
import { buildSystemPrompt, DHEE_INSTRUCTIONS } from "../agents/dhee";
import { evalModelSlugFor } from "../agents/config";
import { MODEL_SLUGS } from "../agents/models";
import { baseInstructionsFor, VARIANTS } from "./variants";

// A variant that silently no-ops is worse than no variant: it produces a run
// labelled as an ablation that actually measured the unchanged prompt, and
// whatever conclusion gets drawn from it is about nothing. These tests pin
// that every transform really moves the text, and that a stale anchor throws
// instead of passing the base through.

describe("prompt variants", () => {
  it("every variant changes the base prompt", () => {
    for (const variant of Object.values(VARIANTS)) {
      expect(variant.transform(DHEE_INSTRUCTIONS), variant.id).not.toBe(
        DHEE_INSTRUCTIONS,
      );
    }
  });

  it("throws on a base whose anchors are gone, rather than no-opping", () => {
    for (const variant of Object.values(VARIANTS)) {
      expect(() => variant.transform("some other prompt"), variant.id).toThrow(
        /anchor missing/,
      );
    }
  });

  it("no-ground removes the fundamentals and keeps the rest", () => {
    const out = VARIANTS["no-ground"]!.transform(DHEE_INSTRUCTIONS);
    expect(out).not.toContain("## The ground you think from");
    expect(out).not.toContain("अनुसन्धान");
    expect(out).toContain("## How to see, and how to answer");
    expect(out).toContain("## When to search");
  });

  it("no-altitude removes the higher-dimension passage and keeps brevity", () => {
    const out = VARIANTS["no-altitude"]!.transform(DHEE_INSTRUCTIONS);
    expect(out).not.toContain("Answer from a higher dimension");
    expect(out).toContain("**Depth, not length.**");
  });

  it("more-ground adds the corpus-grounded block before the अनुसन्धान", () => {
    const out = VARIANTS["more-ground"]!.transform(DHEE_INSTRUCTIONS);
    for (const marker of [
      "धीरता",
      "उभय तृप्ति",
      "स्वधन",
      "### The three अनुसन्धान",
    ]) {
      expect(out).toContain(marker);
    }
    expect(out.indexOf("धीरता")).toBeLessThan(
      out.indexOf("### The three अनुसन्धान"),
    );
  });

  it("flows through buildSystemPrompt under every personalization layer", () => {
    const base = baseInstructionsFor("no-ground");
    const prompt = buildSystemPrompt(
      { traditions: ["Madhyasth Darshan"], nickname: "Ravi" },
      base,
    );
    expect(prompt).not.toContain("## The ground you think from");
    expect(prompt).toContain("study partner");
    expect(prompt).toContain("Ravi");
  });

  it("resolves to the untouched instructions when no variant is named", () => {
    expect(baseInstructionsFor(undefined)).toBe(DHEE_INSTRUCTIONS);
    expect(buildSystemPrompt()).toBe(DHEE_INSTRUCTIONS);
  });

  it("rejects an unknown variant id before any money is spent", () => {
    expect(() => baseInstructionsFor("no-such-variant")).toThrow(
      /Unknown prompt variant/,
    );
  });
});

describe("eval model specs", () => {
  it("resolves tier names to the tier slugs and passes slugs through", () => {
    expect(evalModelSlugFor("quick")).toBe(MODEL_SLUGS.quick);
    expect(evalModelSlugFor("reflective")).toBe(MODEL_SLUGS.reflective);
    expect(evalModelSlugFor("anthropic/claude-opus-5")).toBe(
      "anthropic/claude-opus-5",
    );
  });
});
