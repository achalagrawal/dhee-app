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

  it("reads romanised Hindi as Roman script, which is all this decides", () => {
    // Detection is of script, not language. What a Roman-script message gets
    // back — English for English, Devanagari for Hinglish — is settled by the
    // instruction, because telling those two apart from two words of romanised
    // Hindi is not something a marker list can do reliably.
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
  it("splits Roman script into its two languages rather than treating it as one", () => {
    // The bug this exists for: English and Hinglish are the same script, so an
    // instruction about *script* alone says the same thing for both. It has to
    // name each language and what each gets back.
    const line = replyScriptInstruction("latin");
    expect(line).toContain("English");
    expect(line).toContain("Hinglish");
    expect(line).toContain("Devanagari");
  });

  it("sends romanised Hindi back as Devanagari, not as Hinglish", () => {
    const line = replyScriptInstruction("latin");
    expect(line).toMatch(/Hindi in \*\*Devanagari\*\*|Hindi in Devanagari/);
    expect(line).toContain("Do not answer in romanised Hindi");
  });

  it("tells it to judge from this message, not from its own last reply", () => {
    // Without this, one Hinglish turn pins the rest of the thread: the model
    // matches its own previous answer and a later English question still comes
    // back in Hindi. This is the sentence that breaks that loop.
    const line = replyScriptInstruction("latin");
    expect(line).toContain("not from what you said last turn");
    expect(line).toContain("answer in English");
  });

  it("tells other scripts not to be romanised", () => {
    expect(replyScriptInstruction("devanagari")).toContain("Devanagari");
    expect(replyScriptInstruction("gujarati")).toContain("Gujarati");
    for (const script of ["devanagari", "gujarati", "tamil"] as const) {
      expect(replyScriptInstruction(script)).toContain("romanising");
    }
  });

  it("gives an English turn and a Hinglish turn the same instruction", () => {
    // Both are Latin script, so they must be — which is exactly why the
    // instruction has to carry the language rule rather than a script rule.
    // A detector that tried to tell them apart would fail on "manav lakshya":
    // two romanised Hindi words with no function words to match on.
    expect(detectReplyScript("what is the human goal")).toBe("latin");
    expect(detectReplyScript("manav lakshya")).toBe("latin");
    expect(replyScriptInstruction("latin")).toBe(
      replyScriptInstruction(detectReplyScript("manav lakshya")!),
    );
  });
});
