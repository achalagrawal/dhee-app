import { useEffect, useState } from "react";
import { Platform } from "react-native";

// Whether Enter should send. ChatGPT, Claude and Gemini all draw the line the
// same way, and it is a property of the device rather than a setting: with a
// physical keyboard Enter sends and Shift+Enter breaks the line; on a phone,
// where the return key is the only way to break a line and the send button is
// under your thumb anyway, Enter stays a newline.
//
// `(pointer: fine)` is the closest thing the platform gives us to "there is a
// keyboard": a mouse or trackpad is the primary pointer. It re-evaluates when
// that changes — plugging a trackpad into a tablet flips the behaviour live.
const FINE_POINTER = "(pointer: fine)";

function mediaQuery(): MediaQueryList | null {
  if (Platform.OS !== "web") return null;
  if (typeof window === "undefined" || !window.matchMedia) return null;
  return window.matchMedia(FINE_POINTER);
}

export function useEnterToSend(): boolean {
  // Static web export renders once without a `window`; the effect corrects it
  // on the client before anyone can type.
  const [enabled, setEnabled] = useState(() => mediaQuery()?.matches ?? false);

  useEffect(() => {
    const mq = mediaQuery();
    if (!mq || typeof mq.addEventListener !== "function") return;
    const sync = () => setEnabled(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  return enabled;
}
