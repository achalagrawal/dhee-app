import { describe, expect, test } from "vitest";
import { convexSiteUrl } from "./convex-urls";

describe("convexSiteUrl", () => {
  test("swaps .convex.cloud for .convex.site", () => {
    expect(convexSiteUrl("https://festive-otter-123.convex.cloud")).toBe(
      "https://festive-otter-123.convex.site",
    );
  });

  test("returns an origin, dropping any path", () => {
    expect(convexSiteUrl("https://festive-otter-123.convex.cloud/api")).toBe(
      "https://festive-otter-123.convex.site",
    );
  });

  test("gives up on a local backend rather than guessing", () => {
    // Local splits the two across ports, not hostnames — there is nothing here
    // to derive from, and .env.local carries the real value.
    expect(convexSiteUrl("http://127.0.0.1:3210")).toBeUndefined();
  });

  test("gives up on anything unset or unparseable", () => {
    expect(convexSiteUrl(undefined)).toBeUndefined();
    expect(convexSiteUrl("")).toBeUndefined();
    expect(convexSiteUrl("not a url")).toBeUndefined();
  });

  test("does not match a host that merely ends in the same characters", () => {
    expect(convexSiteUrl("https://notconvex.cloud")).toBeUndefined();
  });
});
