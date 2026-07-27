import { describe, expect, test } from "vitest";
import { shareUrl } from "./share-url";

describe("shareUrl", () => {
  test("uses the origin it is given", () => {
    expect(shareUrl("abc123", "https://dhee-git-share.vercel.app")).toBe(
      "https://dhee-git-share.vercel.app/s/abc123",
    );
  });

  test("falls back to the canonical site with no origin", () => {
    expect(shareUrl("abc123")).toBe("https://dhee.app/s/abc123");
    expect(shareUrl("abc123", null)).toBe("https://dhee.app/s/abc123");
  });

  test("does not double the slash on a trailing-slash origin", () => {
    expect(shareUrl("abc123", "https://dhee.app/")).toBe(
      "https://dhee.app/s/abc123",
    );
  });
});
