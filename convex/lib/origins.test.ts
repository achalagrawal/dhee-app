import { describe, expect, test } from "vitest";
import { parseOrigins } from "./origins";

// What lands in this list becomes an allowed `Access-Control-Allow-Origin` on
// the sign-in handler, so these pin the two halves that matter: the parsing is
// forgiving about whitespace, and strict about everything else.

describe("parseOrigins", () => {
  test("returns nothing for an unset or empty value", () => {
    expect(parseOrigins(undefined)).toEqual([]);
    expect(parseOrigins("")).toEqual([]);
    expect(parseOrigins("  ,  ,")).toEqual([]);
  });

  test("splits a comma-separated list and trims each entry", () => {
    expect(parseOrigins("https://a.vercel.app, https://b.vercel.app")).toEqual([
      "https://a.vercel.app",
      "https://b.vercel.app",
    ]);
  });

  test("reduces each entry to its origin", () => {
    // A path or trailing slash reflected verbatim is not a valid CORS origin.
    expect(parseOrigins("https://a.vercel.app/onboarding?x=1")).toEqual([
      "https://a.vercel.app",
    ]);
    expect(parseOrigins("https://a.vercel.app/")).toEqual([
      "https://a.vercel.app",
    ]);
  });

  test("drops entries that are not absolute URLs", () => {
    // Widening the allowlist by accident is the failure that costs something,
    // so anything unparseable is discarded rather than passed through.
    expect(
      parseOrigins("a.vercel.app,https://b.vercel.app,/onboarding"),
    ).toEqual(["https://b.vercel.app"]);
  });
});
