import { describe, expect, test } from "vitest";
import { hasHandoffToken } from "./oauth-return";

// The detector decides whether someone is mid-sign-in or genuinely signed out,
// and it gets one look at the URL before the provider rewrites it away.
describe("hasHandoffToken", () => {
  test("recognises the return from Google", () => {
    expect(hasHandoffToken("https://dhee.app/?ott=abc123")).toBe(true);
  });

  test("recognises it alongside other query params", () => {
    expect(hasHandoffToken("https://dhee.app/?foo=1&ott=abc123#top")).toBe(
      true,
    );
  });

  test("an empty token still counts as a handoff", () => {
    // Whatever went wrong, the person did just come back from Google — the
    // exchange failing is what the timeout is for, not a reason to show them
    // the sign-in screen mid-flight.
    expect(hasHandoffToken("https://dhee.app/?ott=")).toBe(true);
  });

  test("an ordinary visit is not a handoff", () => {
    expect(hasHandoffToken("https://dhee.app/")).toBe(false);
    expect(hasHandoffToken("https://dhee.app/sign-in?next=/home")).toBe(false);
  });

  test("`ott` has to be a parameter, not just text in the URL", () => {
    expect(hasHandoffToken("https://dhee.app/ott")).toBe(false);
    expect(hasHandoffToken("https://dhee.app/?nott=1")).toBe(false);
  });

  test("gives up quietly on anything unparseable", () => {
    // Native has no URL at all; this must never throw into a render.
    expect(hasHandoffToken("")).toBe(false);
    expect(hasHandoffToken("not a url")).toBe(false);
  });
});
