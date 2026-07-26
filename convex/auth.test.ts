import { describe, expect, test } from "vitest";
import { api } from "./_generated/api";
import { resolveRedirect } from "./lib/redirect";
import { asUser, createUser, initTest } from "./test.setup";
import { normalizeProviderName } from "./users";

// The OAuth round trip and the component's HTTP surface can't run under
// convex-test, so these cover our own logic: the redirect allowlist, the
// identity → user mapping every function depends on, and the name rule the
// user.onCreate trigger applies. The live-deployment checks that these
// deliberately don't cover are listed in
// docs/build/specs/auth-foundation.md.

describe("resolveRedirect", () => {
  const siteUrl = "http://localhost:8081";
  const cloud = "https://acoustic-mastiff-516.convex.site";
  const loopback = "http://127.0.0.1:3211";

  test("allows a relative path", () => {
    expect(
      resolveRedirect("/onboarding", { siteUrl, convexSiteUrl: cloud }),
    ).toBe("/onboarding");
  });

  test("allows a SITE_URL-prefixed absolute URL", () => {
    expect(
      resolveRedirect(`${siteUrl}/onboarding`, {
        siteUrl,
        convexSiteUrl: cloud,
      }),
    ).toBe(`${siteUrl}/onboarding`);
  });

  test("allows the app's own deep link", () => {
    expect(
      resolveRedirect("dhee://auth", { siteUrl, convexSiteUrl: cloud }),
    ).toBe("dhee://auth");
  });

  test("rejects an off-site absolute URL", () => {
    // The open-redirect case: a permissive check here leaks the OAuth code.
    expect(() =>
      resolveRedirect("https://evil.example", {
        siteUrl,
        convexSiteUrl: cloud,
      }),
    ).toThrow();
  });

  test("rejects exp:// against a non-loopback backend", () => {
    expect(() =>
      resolveRedirect("exp://10.0.0.2:8081/--/auth", {
        siteUrl,
        convexSiteUrl: cloud,
      }),
    ).toThrow();
  });

  test("allows exp:// only when the backend is loopback", () => {
    expect(
      resolveRedirect("exp://127.0.0.1:8081/--/auth", {
        siteUrl,
        convexSiteUrl: loopback,
      }),
    ).toBe("exp://127.0.0.1:8081/--/auth");
  });
});

describe("normalizeProviderName", () => {
  test("trims and caps at 60 characters", () => {
    expect(normalizeProviderName("  Achal  ")).toBe("Achal");
    expect(normalizeProviderName("a".repeat(80))).toHaveLength(60);
  });

  test("treats blank and missing as absent", () => {
    expect(normalizeProviderName("   ")).toBeUndefined();
    expect(normalizeProviderName(null)).toBeUndefined();
    expect(normalizeProviderName(undefined)).toBeUndefined();
  });
});

describe("identity resolution", () => {
  test("an unauthenticated caller gets no profile", async () => {
    const t = initTest();
    expect(await t.query(api.users.currentProfile, {})).toBeNull();
  });

  test("an identity with no user row is not signed in", async () => {
    const t = initTest();
    // A well-formed JWT whose subject we've never seen — a deleted account, or
    // a token minted against a different deployment.
    const stranger = t.withIdentity({ subject: "auth:nobody" });
    expect(await stranger.query(api.users.currentProfile, {})).toBeNull();
  });

  test("a known identity resolves to its own user", async () => {
    const t = initTest();
    const userId = await createUser(t, { name: "Achal" });
    const profile = await asUser(t, userId).query(api.users.currentProfile, {});
    expect(profile?.userId).toBe(userId);
  });

  test("one person's identity never resolves to another's row", async () => {
    const t = initTest();
    const mine = await createUser(t);
    const theirs = await createUser(t);
    const profile = await asUser(t, mine).query(api.users.currentProfile, {});
    expect(profile?.userId).toBe(mine);
    expect(profile?.userId).not.toBe(theirs);
  });
});
