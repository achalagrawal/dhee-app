import * as SecureStore from "expo-secure-store";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { Platform, useColorScheme } from "react-native";
import {
  type AccentName,
  type Colors,
  type ThemeMode,
  getColors,
} from "./theme";

export type ThemePref = "system" | "light" | "dark";

type ThemeContextValue = {
  /** The resolved light/dark mode actually in effect. */
  mode: ThemeMode;
  /** The stored preference (may be "system"). */
  pref: ThemePref;
  accent: AccentName;
  colors: Colors;
  setPref: (pref: ThemePref) => void;
  setAccent: (accent: AccentName) => void;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

const PREF_KEY = "dhee.themePref";
const ACCENT_KEY = "dhee.accent";

// SecureStore has no web build; fall back to localStorage there. These are
// non-secret UI preferences, so plain storage is fine.
async function loadPref(key: string): Promise<string | null> {
  if (Platform.OS === "web") {
    try {
      return globalThis.localStorage?.getItem(key) ?? null;
    } catch {
      return null;
    }
  }
  return SecureStore.getItemAsync(key);
}

function savePref(key: string, value: string): void {
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

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const system = useColorScheme();
  const [pref, setPrefState] = useState<ThemePref>("system");
  const [accent, setAccentState] = useState<AccentName>("default");

  // Hydrate stored preferences once on mount.
  useEffect(() => {
    let alive = true;
    void (async () => {
      const [storedPref, storedAccent] = await Promise.all([
        loadPref(PREF_KEY),
        loadPref(ACCENT_KEY),
      ]);
      if (!alive) return;
      if (
        storedPref === "light" ||
        storedPref === "dark" ||
        storedPref === "system"
      ) {
        setPrefState(storedPref);
      }
      if (
        storedAccent === "default" ||
        storedAccent === "clay" ||
        storedAccent === "sage" ||
        storedAccent === "indigo"
      ) {
        setAccentState(storedAccent);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  const setPref = useCallback((next: ThemePref) => {
    setPrefState(next);
    savePref(PREF_KEY, next);
  }, []);

  const setAccent = useCallback((next: AccentName) => {
    setAccentState(next);
    savePref(ACCENT_KEY, next);
  }, []);

  const mode: ThemeMode =
    pref === "system" ? (system === "dark" ? "dark" : "light") : pref;

  const value = useMemo<ThemeContextValue>(
    () => ({
      mode,
      pref,
      accent,
      colors: getColors(mode, accent),
      setPref,
      setAccent,
    }),
    [mode, pref, accent, setPref, setAccent],
  );

  return (
    <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
  );
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used within a ThemeProvider");
  return ctx;
}
