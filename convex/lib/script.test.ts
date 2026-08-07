import { describe, expect, it } from "vitest";
import {
  detectReplyScript,
  replyScriptInstruction,
  type ReplyScript,
} from "./script";

describe("detectReplyScript", () => {
  it("reads plain English as Roman", () => {
    expect(detectReplyScript("How do I know if my work matters to me?")).toBe(
      "latin",
    );
  });

  it("reads romanised Hindi as Roman — the case this exists for", () => {
    expect(detectReplyScript("manav ki upyogita kisme hai")).toBe("latin");
    expect(detectReplyScript("putri ke sath sambandh kaise theek karien")).toBe(
      "latin",
    );
  });

  it("reads Devanagari as Devanagari", () => {
    expect(detectReplyScript("मानव का लक्ष्य क्या है?")).toBe("devanagari");
  });

  it("recognises the other Indian scripts people write in", () => {
    const cases: [string, ReplyScript][] = [
      ["નવું શું છે આ દર્શન માં?", "gujarati"],
      ["আমি কে?", "bengali"],
      ["ਮੈਂ ਕੌਣ ਹਾਂ?", "gurmukhi"],
      ["நான் யார்?", "tamil"],
      ["నేను ఎవరు?", "telugu"],
      ["ನಾನು ಯಾರು?", "kannada"],
      ["ഞാൻ ആരാണ്?", "malayalam"],
      ["ମୁଁ କିଏ?", "odia"],
    ];
    for (const [text, script] of cases) {
      expect(detectReplyScript(text), text).toBe(script);
    }
  });

  it("keeps a mostly-Roman message Roman when a term is quoted in Devanagari", () => {
    // Asking what a term means is a Roman-script question about a Devanagari
    // word, and deserves a Roman-script answer.
    expect(detectReplyScript("what does समाधान actually mean here?")).toBe(
      "latin",
    );
  });

  it("switches once the other script carries the message rather than a word", () => {
    expect(detectReplyScript("मैं समझना चाहता हूँ ok")).toBe("devanagari");
  });

  it("says nothing when there is nothing to go on", () => {
    expect(detectReplyScript("")).toBeUndefined();
    expect(detectReplyScript("   ")).toBeUndefined();
    expect(detectReplyScript("12345")).toBeUndefined();
    expect(detectReplyScript("?!…")).toBeUndefined();
  });

  it("never guesses Roman for a message with no letters at all", () => {
    // A photo sent with no caption must leave the base instruction in charge,
    // not be told to answer in English.
    expect(detectReplyScript("🙏")).toBeUndefined();
  });
});

describe("replyScriptInstruction", () => {
  it("names the Hinglish failure explicitly for Roman script", () => {
    const line = replyScriptInstruction("latin");
    expect(line).toContain("Roman letters");
    expect(line).toContain("Do not answer in Devanagari");
  });

  it("tells other scripts not to be romanised", () => {
    expect(replyScriptInstruction("devanagari")).toContain("Devanagari");
    expect(replyScriptInstruction("gujarati")).toContain("Gujarati");
    for (const script of ["devanagari", "gujarati", "tamil"] as const) {
      expect(replyScriptInstruction(script)).toContain("romanising");
    }
  });
});
