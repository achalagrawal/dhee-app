import { describe, expect, test } from "vitest";
import { shouldSkipSend } from "./email";
import { isLoopback } from "./lib/backend";

// The SES call itself needs the network and real credentials, so it's covered
// by `npx convex run devEmail:sesCheck` against a live deployment. What's
// testable here is the decision *not* to make that call — the guard that lets
// a new developer sign in on a local backend without AWS keys.

describe("shouldSkipSend", () => {
  const key = "AKIAEXAMPLE";
  const local = "http://127.0.0.1:3210";
  const cloud = "https://acoustic-mastiff-516.convex.cloud";

  test("skips on a local backend with no credentials", () => {
    expect(
      shouldSkipSend({ convexCloudUrl: local, awsAccessKeyId: undefined }),
    ).toBe(true);
  });

  test("still sends on a local backend that has credentials", () => {
    // Otherwise the real send path would be untestable outside production.
    expect(shouldSkipSend({ convexCloudUrl: local, awsAccessKeyId: key })).toBe(
      false,
    );
  });

  test("never skips on a cloud deployment, even with no credentials", () => {
    // The caller must go on to throw. Silently dropping sign-in mail in
    // production would look exactly like a working deploy.
    expect(
      shouldSkipSend({ convexCloudUrl: cloud, awsAccessKeyId: undefined }),
    ).toBe(false);
  });

  test("never skips on a cloud deployment with credentials", () => {
    expect(shouldSkipSend({ convexCloudUrl: cloud, awsAccessKeyId: key })).toBe(
      false,
    );
  });

  test("does not skip when the backend URL is missing entirely", () => {
    // Unknown backend is treated as production: fail loudly, don't drop mail.
    expect(
      shouldSkipSend({ convexCloudUrl: undefined, awsAccessKeyId: undefined }),
    ).toBe(false);
  });
});

describe("isLoopback", () => {
  test.each([
    "http://127.0.0.1:3210",
    "http://localhost:3211",
    "http://[::1]:3210",
  ])("recognises %s", (url) => {
    expect(isLoopback(url)).toBe(true);
  });

  test("rejects a cloud deployment", () => {
    expect(isLoopback("https://acoustic-mastiff-516.convex.cloud")).toBe(false);
  });

  test("rejects a host that merely contains a loopback address", () => {
    // The substring test this replaces returned true here, which would have
    // handed Expo Go's open redirect and the OTP log to a hostile origin.
    expect(isLoopback("https://127.0.0.1.evil.example")).toBe(false);
  });

  test("rejects undefined and unparseable input", () => {
    expect(isLoopback(undefined)).toBe(false);
    expect(isLoopback("not a url")).toBe(false);
  });
});
