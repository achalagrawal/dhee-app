import { afterEach, describe, expect, it, vi } from "vitest";
import {
  ANSWERING_TIERS,
  BASE_TIER,
  DEFAULT_MODEL_TIER,
  answeringTierFor,
  isAnsweringTier,
  isModelTier,
  isOpenModelSlug,
  MODEL_SLUGS,
  MODEL_TIERS,
  modelSlugFor,
  resolveModelTier,
} from "./models";
import { availableModelTiers } from "./availability";
import { BACKGROUND_MODEL, CHAT_MODEL } from "../config";

const ALL = MODEL_TIERS;

describe("the tier registry", () => {
  it("gives every answering tier a slug", () => {
    for (const tier of ANSWERING_TIERS) {
      expect(MODEL_SLUGS[tier], tier).toMatch(/^[a-z0-9-]+\/[a-z0-9.-]+$/);
    }
  });

  it("points every tier at a different model", () => {
    // Two tiers on the same model is a picker that does nothing.
    const slugs = ANSWERING_TIERS.map((tier) => MODEL_SLUGS[tier]);
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it("defaults to auto, and falls back to quick", () => {
    // Auto since 2026-11-28: most people never open the picker. Quick is
    // what answers when nothing else can.
    expect(DEFAULT_MODEL_TIER).toBe("auto");
    expect(BASE_TIER).toBe("quick");
  });

  it("lists every answering tier in the picker, after Auto", () => {
    expect(MODEL_TIERS).toEqual(["auto", ...ANSWERING_TIERS]);
  });

  it("keeps the default and everything that remembers people on open weights", () => {
    // Decided 2026-11-24, when OpenRouter cut the account off from Anthropic,
    // Google and OpenAI overnight: no closed-weight provider can take down
    // the default reply, titles, or memory extraction. Reflective is the one
    // closed model, and it falls back to the default.
    const closed = /^(anthropic|google|openai)\//;
    expect(MODEL_SLUGS[BASE_TIER]).not.toMatch(closed);
    expect(MODEL_SLUGS.thoughtful).not.toMatch(closed);
    expect(BACKGROUND_MODEL).not.toMatch(closed);
  });

  it("keeps CHAT_MODEL and the base tier the same model", () => {
    // CHAT_MODEL is what the eval harness and the smoke test measure: the
    // model an unrouted turn and Auto's light turns answer on.
    expect(CHAT_MODEL).toBe(MODEL_SLUGS[BASE_TIER]);
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
    expect(isModelTier("auto")).toBe(true);
    expect(isAnsweringTier("auto")).toBe(false);
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
    expect(modelSlugFor("nonsense", ALL)).toBe(MODEL_SLUGS[BASE_TIER]);
  });
});

describe("answeringTierFor", () => {
  it("answers an unrouted Auto preference on the base tier", () => {
    expect(answeringTierFor(undefined, ALL)).toBe(BASE_TIER);
    expect(answeringTierFor("auto", ALL)).toBe(BASE_TIER);
  });

  it("keeps a chosen tier, and a routed one passed in its place", () => {
    for (const tier of ANSWERING_TIERS) {
      expect(answeringTierFor(tier, ALL)).toBe(tier);
    }
  });
});

describe("availableModelTiers", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("offers Reflective only while the Anthropic key is set", () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "");
    expect(availableModelTiers()).toEqual(["auto", "quick", "thoughtful"]);
    vi.stubEnv("ANTHROPIC_API_KEY", "set");
    expect(availableModelTiers()).toEqual([
      "auto",
      "quick",
      "thoughtful",
      "reflective",
    ]);
  });

  it("always offers the open-weight tiers", () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "");
    expect(availableModelTiers()).toContain(DEFAULT_MODEL_TIER);
    expect(availableModelTiers()).toContain(BASE_TIER);
    expect(availableModelTiers()).toContain("thoughtful");
  });
});

describe("isOpenModelSlug", () => {
  it("is false for Claude and true for everything else", () => {
    expect(isOpenModelSlug(MODEL_SLUGS.reflective)).toBe(false);
    expect(isOpenModelSlug(MODEL_SLUGS.quick)).toBe(true);
    expect(isOpenModelSlug("deepseek/deepseek-v4.1")).toBe(true);
  });
});
