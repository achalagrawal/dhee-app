import { describe, expect, it } from "vitest";
import { composerKeyAction, type KeyEventLike } from "./keyboard";

// A web key event as react-native-web forwards it to `onKeyPress`: the raw
// React keydown event, modifiers and all.
const web = (key: string, mods: Partial<KeyEventLike> = {}): KeyEventLike => ({
  key,
  shiftKey: false,
  altKey: false,
  ctrlKey: false,
  metaKey: false,
  nativeEvent: { key, isComposing: false },
  ...mods,
});

// A native (iOS/Android) key event: `nativeEvent.key` only — no modifiers.
const native = (key: string): KeyEventLike => ({ nativeEvent: { key } });

describe("composerKeyAction", () => {
  it("sends on a bare Enter where Enter sends", () => {
    expect(composerKeyAction(web("Enter"), { sendOnEnter: true })).toBe("send");
  });

  it("leaves a bare Enter alone where Enter is a newline", () => {
    expect(composerKeyAction(web("Enter"), { sendOnEnter: false })).toBe(
      "default",
    );
  });

  it("never sends on Shift+Enter — that is the newline", () => {
    for (const sendOnEnter of [true, false]) {
      expect(
        composerKeyAction(web("Enter", { shiftKey: true }), { sendOnEnter }),
      ).toBe("default");
    }
  });

  it("treats Alt+Enter as a newline too", () => {
    expect(
      composerKeyAction(web("Enter", { altKey: true }), { sendOnEnter: true }),
    ).toBe("default");
  });

  it("sends on Cmd/Ctrl+Enter even where Enter is a newline", () => {
    expect(
      composerKeyAction(web("Enter", { metaKey: true }), {
        sendOnEnter: false,
      }),
    ).toBe("send");
    expect(
      composerKeyAction(web("Enter", { ctrlKey: true }), {
        sendOnEnter: false,
      }),
    ).toBe("send");
  });

  it("ignores Enter while an IME is composing", () => {
    // Devanagari and CJK input methods take Enter to accept a candidate; a
    // send there would cut the word in half.
    expect(
      composerKeyAction(web("Enter", { nativeEvent: { isComposing: true } }), {
        sendOnEnter: true,
      }),
    ).toBe("default");
    // Older browsers report composition as keyCode 229 instead.
    expect(
      composerKeyAction(web("Enter", { nativeEvent: { keyCode: 229 } }), {
        sendOnEnter: true,
      }),
    ).toBe("default");
  });

  it("ignores every other key", () => {
    for (const key of ["a", "Escape", "Tab", "Backspace", " "]) {
      expect(composerKeyAction(web(key), { sendOnEnter: true })).toBe(
        "default",
      );
    }
  });

  it("reads the key off nativeEvent when the top level has none (native)", () => {
    expect(composerKeyAction(native("Enter"), { sendOnEnter: true })).toBe(
      "send",
    );
    expect(composerKeyAction(native("Enter"), { sendOnEnter: false })).toBe(
      "default",
    );
    expect(composerKeyAction(native("a"), { sendOnEnter: true })).toBe(
      "default",
    );
  });

  it("survives an event with nothing on it", () => {
    expect(composerKeyAction({}, { sendOnEnter: true })).toBe("default");
  });
});
