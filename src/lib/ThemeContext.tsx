import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { Platform, useColorScheme } from "react-native";
import { loadPref, savePref } from "./prefs";
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

  // The shell's theme-color tags (scripts/build-shell.mjs) can only go by the
  // system setting, so with a theme chosen in Settings the status bar of an
  // installed web app stayed the system's paper above a page in the other —
  // a band of the wrong colour across the top. Once React is running it knows
  // the theme actually on screen, so it takes the bar (and the page behind
  // any overscroll) over: one tag, no media query, the app's own paper.
  const paper = getColors(mode, accent).bg;
  useEffect(() => {
    if (Platform.OS !== "web" || typeof document === "undefined") return;
    const tags = document.querySelectorAll('meta[name="theme-color"]');
    tags.forEach((tag, i) => {
      if (i > 0) tag.remove();
    });
    let tag = tags[0] as HTMLMetaElement | undefined;
    if (!tag) {
      tag = document.createElement("meta");
      tag.name = "theme-color";
      document.head.appendChild(tag);
    }
    tag.removeAttribute("media");
    tag.content = paper;
    document.documentElement.style.backgroundColor = paper;
    document.body.style.backgroundColor = paper;
    document.documentElement.style.colorScheme = mode;
  }, [paper, mode]);

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
