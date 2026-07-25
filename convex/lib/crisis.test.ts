import { describe, expect, test } from "vitest";
import { detectsCrisis } from "./crisis";

// The phrase list is deliberately high-recall (see crisis.ts). These tests
// pin the languages it must cover, not its precision — a false positive costs
// someone a card they didn't need, a false negative costs something else.

describe("crisis detection — English", () => {
  test.each([
    "i want to die",
    "I've been thinking about killing myself",
    "sometimes I feel suicidal",
    "there's no reason to live any more",
    "everyone would be better off without me",
    "I keep wanting to hurt myself",
  ])("catches %j", (text) => {
    expect(detectsCrisis(text)).toBe(true);
  });
});

describe("crisis detection — Hindi and Hinglish", () => {
  // An English-only list is worse than none for a Hindi-speaking person in
  // trouble: it looks like coverage while catching nothing.
  test.each([
    "मैं आत्महत्या के बारे में सोच रहा हूँ",
    "मुझे अब जीना नहीं चाहिए",
    "मन करता है मर जाऊँ",
    "मैं खुद को मार देना चाहता हूँ",
    "main atmahatya karna chahta hoon",
    "ab jeena nahi chahta",
    "mann karta hai mar jaun",
    "khud ko maarne ka mann karta hai",
  ])("catches %j", (text) => {
    expect(detectsCrisis(text)).toBe(true);
  });
});

describe("crisis detection — ordinary messages", () => {
  test.each([
    "I'm trying to decide whether to change jobs",
    "my mother and I argued again",
    "what does it mean to live well?",
    "मैं अपने काम को लेकर उलझन में हूँ",
    "aaj bahut thak gaya hoon",
  ])("leaves %j alone", (text) => {
    expect(detectsCrisis(text)).toBe(false);
  });

  test("is case-insensitive", () => {
    expect(detectsCrisis("I WANT TO DIE")).toBe(true);
  });

  test("accepts the known false positive rather than tuning toward silence", () => {
    // "killing me" as exasperation. Offering someone a phone number they
    // didn't need is the cheaper mistake, and this documents that it is a
    // choice rather than an oversight.
    expect(detectsCrisis("this job is killing me")).toBe(false);
    expect(detectsCrisis("I feel like killing myself over this deadline")).toBe(
      true,
    );
  });
});
