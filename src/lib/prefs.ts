import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";

// Small key/value store for non-secret UI preferences — theme, accent, whether
// the desktop sidebar is collapsed. SecureStore has no web build, so the web
// falls back to localStorage; none of this is sensitive, so plain storage is
// fine. Reads are async because SecureStore's are; writes are fire-and-forget.

export async function loadPref(key: string): Promise<string | null> {
  if (Platform.OS === "web") {
    try {
      return globalThis.localStorage?.getItem(key) ?? null;
    } catch {
      return null;
    }
  }
  return SecureStore.getItemAsync(key);
}

export function savePref(key: string, value: string): void {
  if (Platform.OS === "web") {
    try {
      globalThis.localStorage?.setItem(key, value);
    } catch {
      // ignore quota / privacy-mode failures
    }
    return;
  }
  void SecureStore.setItemAsync(key, value);
}
