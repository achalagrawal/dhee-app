import { afterEach, describe, expect, it, vi } from "vitest";
import {
  DEFAULT_MODEL_TIER,
  isModelTier,
  MODEL_SLUGS,
  MODEL_TIERS,
  modelSlugFor,
  resolveModelTier,
} from "./models";
import { availableModelTiers } from "./availability";
import { BACKGROUND_MODEL, CHAT_MODEL } from "../config";

const ALL = MODEL_TIERS;

describe("the tier registry", () => {
  it("gives every tier a slug", () => {
    for (const tier of MODEL_TIERS) {
      expect(MODEL_SLUGS[tier], tier).toMatch(/^[a-z0-9-]+\/[a-z0-9.-]+$/);
    }
  });

  it("points every tier at a different model", () => {
    // Two tiers on the same model is a picker that does nothing.
    const slugs = MODEL_TIERS.map((tier) => MODEL_SLUGS[tier]);
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it("defaults to quick", () => {
    expect(DEFAULT_MODEL_TIER).toBe("quick");
  });

  it("keeps the default and everything that remembers people on open weights", () => {
    // Decided 2026-11-24, when OpenRouter cut the account off from Anthropic,
    // Google and OpenAI overnight: no closed-weight provider can take down
    // the default reply, titles, or memory extraction. Reflective is the one
    // closed model, and it falls back to the default.
    const closed = /^(anthropic|google|openai)\//;
    expect(MODEL_SLUGS[DEFAULT_MODEL_TIER]).not.toMatch(closed);
    expect(MODEL_SLUGS.thoughtful).not.toMatch(closed);
    expect(BACKGROUND_MODEL).not.toMatch(closed);
  });

  it("keeps CHAT_MODEL and the default tier the same model", () => {
    // CHAT_MODEL is what the eval harness and the smoke test measure. If it
    // drifted from the tier people actually get, both would be reporting on a
    // model nobody is using.
    expect(CHAT_MODEL).toBe(MODEL_SLUGS[DEFAULT_MODEL_TIER]);
  });
});

describe("resolveModelTier", () => {
  it("keeps an available tier", () => {
    for (const tier of MODEL_TIERS) {
      expect(resolveModelTier(tier, ALL)).toBe(tier);
    }
  });

  it("sends a stored choice of an unavailable tier to the default", () => {
    // People who chose Reflective keep that choice on file; they are answered
    // by the default until the tier is back.
    expect(resolveModelTier("reflective", [DEFAULT_MODEL_TIER])).toBe(
      DEFAULT_MODEL_TIER,
    );
  });

  it("falls back to the default for anything else", () => {
    // A preference written by an older build, or a tier since retired, must
    // cost the preference and nothing more — never someone's reply.
    for (const stored of [undefined, "", "deep", "sonnet", "QUICK", "null"]) {
      expect(resolveModelTier(stored, ALL), String(stored)).toBe(
        DEFAULT_MODEL_TIER,
      );
    }
  });
});

describe("isModelTier", () => {
  it("accepts only the tiers that exist", () => {
    expect(isModelTier("quick")).toBe(true);
    expect(isModelTier("thoughtful")).toBe(true);
    expect(isModelTier("reflective")).toBe(true);
    for (const value of ["deep", "", 0, null, undefined, {}, ["quick"]]) {
      expect(isModelTier(value), JSON.stringify(value)).toBe(false);
    }
  });
});

describe("modelSlugFor", () => {
  it("resolves a stored preference to a slug", () => {
    expect(modelSlugFor("reflective", ALL)).toBe(MODEL_SLUGS.reflective);
  });

  it("never returns undefined for junk", () => {
    expect(modelSlugFor("nonsense", ALL)).toBe(MODEL_SLUGS[DEFAULT_MODEL_TIER]);
  });
});

describe("availableModelTiers", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("offers Reflective only while the Anthropic key is set", () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "");
    expect(availableModelTiers()).toEqual(["quick", "thoughtful"]);
    vi.stubEnv("ANTHROPIC_API_KEY", "set");
    expect(availableModelTiers()).toEqual([
      "quick",
      "thoughtful",
      "reflective",
    ]);
  });

  it("always offers the open-weight tiers", () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "");
    expect(availableModelTiers()).toContain(DEFAULT_MODEL_TIER);
    expect(availableModelTiers()).toContain("thoughtful");
  });
});
