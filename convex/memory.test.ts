import { describe, expect, test } from "vitest";
import { buildTranscript, windowSinceWatermark } from "./memory";

// The extraction prompt's own rule is "record only what this person actually
// said about themselves". Feeding it tool output undermines that rule at the
// input, where no amount of prompt wording can recover it — so the filter is
// worth pinning.
//
// Every `page` fixture here is written newest-first, because that is what
// `listMessages` hands back (`order: "desc"`). Reading these top-down feels
// backwards on purpose: it is the shape the production caller sees.

const toolMessage = {
  message: { role: "tool" },
  text: "जीवन नित्य है, जीवन के लिए शरीर एक साधन है और माध्यम है।",
};

describe("memory — transcript assembly", () => {
  test("keeps what the person and Dhee said, oldest first", () => {
    expect(
      buildTranscript([
        {
          message: { role: "assistant" },
          text: "What does the restlessness ask of you?",
        },
        { message: { role: "user" }, text: "I've been restless lately." },
      ]),
    ).toBe(
      "user: I've been restless lately.\n\nassistant: What does the restlessness ask of you?",
    );
  });

  test("reverses the page rather than handing the model a backwards conversation", () => {
    // The regression this guards: a conversation read last-turn-first still
    // produces well-formed observations, so nothing downstream complains — the
    // record is just quietly worse. Only an ordering assertion catches it.
    const transcript = buildTranscript([
      { message: { role: "user" }, text: "third" },
      { message: { role: "user" }, text: "second" },
      { message: { role: "user" }, text: "first" },
    ]);
    expect(transcript).toBe("user: first\n\nuser: second\n\nuser: third");
  });

  test("drops corpus passages that arrived as tool results", () => {
    const transcript = buildTranscript([
      {
        message: { role: "assistant" },
        text: "Something in you that isn't the body.",
      },
      toolMessage,
      { message: { role: "user" }, text: "What is jeevan?" },
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
        { message: { role: "user" }, text: "real" },
        { message: { role: "assistant" }, text: "" },
        { message: { role: "user" }, text: "   " },
      ]),
    ).toBe("user: real");
  });

  test("a thread of nothing but tool traffic yields no transcript", () => {
    // extractFromThread bails on an empty transcript, so this is the path that
    // stops a retrieval-heavy turn from triggering a pointless model call.
    expect(buildTranscript([toolMessage, toolMessage])).toBe("");
  });
});

// Newest-first, matching listMessages.
const page = (...orders: number[]) =>
  orders.map((order) => ({
    order,
    message: { role: "user" },
    text: `m${order}`,
  }));

describe("memory — watermark windowing", () => {
  test("a thread never extracted takes the whole page", () => {
    const { window, fresh, highestOrder } = windowSinceWatermark(
      page(3, 2, 1),
      undefined,
    );
    expect(window).toHaveLength(3);
    expect(fresh).toBe(true);
    expect(highestOrder).toBe(3);
  });

  test("nothing new since the watermark is not fresh", () => {
    // The case that makes a short interval affordable: the idle flush landing
    // on a thread the turn counter already extracted must not call the model.
    const { fresh } = windowSinceWatermark(page(3, 2, 1), 3);
    expect(fresh).toBe(false);
  });

  test("new messages carry a few already-extracted ones along as context", () => {
    const { window, fresh, highestOrder } = windowSinceWatermark(
      page(9, 8, 7, 6, 5, 4, 3, 2, 1),
      7,
      2,
    );
    // Two new (9, 8) plus two for context (7, 6).
    expect(window.map((m) => m.order)).toEqual([9, 8, 7, 6]);
    expect(fresh).toBe(true);
    expect(highestOrder).toBe(9);
  });

  test("a watermark older than the whole page falls back to the whole page", () => {
    // Happens when the lookback window slides past a stale watermark. Re-reading
    // what is visible is the safe direction to be wrong in — the alternative is
    // silently extracting nothing.
    const { window, fresh } = windowSinceWatermark(page(9, 8), 2);
    expect(window).toHaveLength(2);
    expect(fresh).toBe(true);
  });

  test("an empty page is never fresh", () => {
    expect(windowSinceWatermark([], undefined).fresh).toBe(false);
    expect(windowSinceWatermark([], 4).fresh).toBe(false);
  });
});
