import { describe, expect, it } from "vitest";
import {
  DEFAULT_MODEL_TIER,
  isModelTier,
  MODEL_SLUGS,
  MODEL_TIERS,
  modelSlugFor,
  resolveModelTier,
} from "./models";
import { CHAT_MODEL } from "../config";

describe("the tier registry", () => {
  it("gives every tier a slug", () => {
    for (const tier of MODEL_TIERS) {
      expect(MODEL_SLUGS[tier], tier).toMatch(/^[a-z0-9-]+\/[a-z0-9.-]+$/);
    }
  });

  it("points the two tiers at different models", () => {
    // Two tiers on the same model is a picker that does nothing.
    const slugs = MODEL_TIERS.map((tier) => MODEL_SLUGS[tier]);
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it("defaults to quick", () => {
    expect(DEFAULT_MODEL_TIER).toBe("quick");
  });

  it("keeps CHAT_MODEL and the default tier the same model", () => {
    // CHAT_MODEL is what the eval harness and the smoke test measure. If it
    // drifted from the tier people actually get, both would be reporting on a
    // model nobody is using.
    expect(CHAT_MODEL).toBe(MODEL_SLUGS[DEFAULT_MODEL_TIER]);
  });
});

describe("resolveModelTier", () => {
  it("keeps a tier that exists", () => {
    expect(resolveModelTier("quick")).toBe("quick");
    expect(resolveModelTier("reflective")).toBe("reflective");
  });

  it("falls back to the default for anything else", () => {
    // A preference written by an older build, or a tier since retired, must
    // cost the preference and nothing more — never someone's reply.
    for (const stored of [undefined, "", "deep", "sonnet", "QUICK", "null"]) {
      expect(resolveModelTier(stored), String(stored)).toBe(DEFAULT_MODEL_TIER);
    }
  });
});

describe("isModelTier", () => {
  it("accepts only the tiers that exist", () => {
    expect(isModelTier("quick")).toBe(true);
    expect(isModelTier("reflective")).toBe(true);
    for (const value of ["deep", "", 0, null, undefined, {}, ["quick"]]) {
      expect(isModelTier(value), JSON.stringify(value)).toBe(false);
    }
  });
});

describe("modelSlugFor", () => {
  it("resolves a stored preference to a slug", () => {
    expect(modelSlugFor("reflective")).toBe(MODEL_SLUGS.reflective);
  });

  it("never returns undefined for junk", () => {
    expect(modelSlugFor("nonsense")).toBe(MODEL_SLUGS[DEFAULT_MODEL_TIER]);
  });
});
