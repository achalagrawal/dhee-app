// What a key press in a message box means. Pure — no React, no react-native —
// so it can be unit-tested directly, and so it reads the same on web (where
// react-native-web hands `onKeyPress` the raw DOM keydown event) and on native
// (where the event carries `nativeEvent.key` and nothing else).

/** The overlap between a DOM keydown event and RN's `TextInputKeyPressEvent`. */
export type KeyEventLike = {
  key?: string;
  shiftKey?: boolean;
  altKey?: boolean;
  ctrlKey?: boolean;
  metaKey?: boolean;
  nativeEvent?: {
    key?: string;
    /** Set while an IME (Devanagari, CJK, …) is assembling a character. */
    isComposing?: boolean;
    /** How pre-`isComposing` browsers report the same thing. */
    keyCode?: number;
  };
};

export type KeyAction =
  /** Submit the message. The caller should also `preventDefault()`. */
  | "send"
  /** Not ours — let the key do whatever it normally does (usually a newline). */
  | "default";

/**
 * `sendOnEnter` is the device answer, not a preference: see `useEnterToSend`.
 * Cmd/Ctrl+Enter sends either way, which is the escape hatch on touch devices
 * that happen to have a keyboard attached.
 */
export function composerKeyAction(
  e: KeyEventLike,
  { sendOnEnter }: { sendOnEnter: boolean },
): KeyAction {
  const key = e.key ?? e.nativeEvent?.key;
  if (key !== "Enter") return "default";

  // Enter is how an IME accepts the candidate it is showing. Sending there
  // would post half a word — so composition always wins.
  if (e.nativeEvent?.isComposing || e.nativeEvent?.keyCode === 229) {
    return "default";
  }

  if (e.metaKey || e.ctrlKey) return "send";
  if (e.shiftKey || e.altKey) return "default";
  return sendOnEnter ? "send" : "default";
}
