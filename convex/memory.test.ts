import { describe, expect, test } from "vitest";
import { buildTranscript } from "./memory";

// The extraction prompt's own rule is "record only what this person actually
// said about themselves". Feeding it tool output undermines that rule at the
// input, where no amount of prompt wording can recover it — so the filter is
// worth pinning.

const toolMessage = {
  message: { role: "tool" },
  text: "जीवन नित्य है, जीवन के लिए शरीर एक साधन है और माध्यम है।",
};

describe("memory — transcript assembly", () => {
  test("keeps what the person and Dhee said", () => {
    expect(
      buildTranscript([
        { message: { role: "user" }, text: "I've been restless lately." },
        {
          message: { role: "assistant" },
          text: "What does the restlessness ask of you?",
        },
      ]),
    ).toBe(
      "user: I've been restless lately.\n\nassistant: What does the restlessness ask of you?",
    );
  });

  test("drops corpus passages that arrived as tool results", () => {
    const transcript = buildTranscript([
      { message: { role: "user" }, text: "What is jeevan?" },
      toolMessage,
      {
        message: { role: "assistant" },
        text: "Something in you that isn't the body.",
      },
    ]);
    expect(transcript).not.toContain("जीवन नित्य है");
    expect(transcript).toContain("What is jeevan?");
    expect(transcript).toContain("Something in you that isn't the body.");
  });

  test("drops messages with an unknown or missing role", () => {
    // Previously these were labelled "unknown:" and passed through.
    expect(
      buildTranscript([
        { text: "orphaned" },
        { message: null, text: "also orphaned" },
      ]),
    ).toBe("");
  });

  test("skips blank and whitespace-only turns", () => {
    expect(
      buildTranscript([
        { message: { role: "user" }, text: "   " },
        { message: { role: "assistant" }, text: "" },
        { message: { role: "user" }, text: "real" },
      ]),
    ).toBe("user: real");
  });

  test("a thread of nothing but tool traffic yields no transcript", () => {
    // extractFromThread bails on an empty transcript, so this is the path that
    // stops a retrieval-heavy turn from triggering a pointless model call.
    expect(buildTranscript([toolMessage, toolMessage])).toBe("");
  });
});
