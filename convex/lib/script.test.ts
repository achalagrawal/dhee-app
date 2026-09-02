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

  it("keeps a Roman-script question Roman when it quotes a whole line", () => {
    // The study case: someone pastes a line of the corpus and asks about it.
    // The quotation is what they are asking about, not what they wrote in.
    expect(
      detectReplyScript(
        'What does this mean? "जीवन ही ज्ञान है, जीवन ही मानव है"',
      ),
    ).toBe("latin");
    expect(
      detectReplyScript(
        "Can you explain this passage in simple English: मानव का लक्ष्य समाधान, समृद्धि, अभय और सह-अस्तित्व है।",
      ),
    ).toBe("latin");
    expect(detectReplyScript("kya ye sahi hai: व्यवस्था")).toBe("latin");
  });

  it("still reads a quotation on its own as the script it is in", () => {
    expect(detectReplyScript('"जीवन ही ज्ञान है"')).toBe("devanagari");
  });

  it("keeps Hindi Hindi when a few English words sit inside it", () => {
    expect(
      detectReplyScript("मुझे अपनी job में कोई satisfaction नहीं मिलता"),
    ).toBe("devanagari");
  });

  it("does not count digits or punctuation as a script", () => {
    // A danda or Devanagari numerals sit in the Devanagari block but say
    // nothing about what the person writes in.
    expect(detectReplyScript("।")).toBeUndefined();
    expect(detectReplyScript("१२३")).toBeUndefined();
    expect(detectReplyScript("page १२ please")).toBe("latin");
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
