import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
} from "react";

// App-shell state shared between the header, the slide-in drawer, and the
// search modal. Kept deliberately small: which overlays are open, and whether
// the incognito mode is engaged.
type ShellContextValue = {
  drawerOpen: boolean;
  openDrawer: () => void;
  closeDrawer: () => void;
  searchOpen: boolean;
  openSearch: () => void;
  closeSearch: () => void;
  incognito: boolean;
  toggleIncognito: () => void;
  setIncognito: (on: boolean) => void;
};

const ShellContext = createContext<ShellContextValue | null>(null);

export function ShellProvider({ children }: { children: React.ReactNode }) {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [incognito, setIncognito] = useState(false);

  const openDrawer = useCallback(() => setDrawerOpen(true), []);
  const closeDrawer = useCallback(() => setDrawerOpen(false), []);
  const openSearch = useCallback(() => {
    setDrawerOpen(false);
    setSearchOpen(true);
  }, []);
  const closeSearch = useCallback(() => setSearchOpen(false), []);
  const toggleIncognito = useCallback(() => setIncognito((v) => !v), []);

  const value = useMemo<ShellContextValue>(
    () => ({
      drawerOpen,
      openDrawer,
      closeDrawer,
      searchOpen,
      openSearch,
      closeSearch,
      incognito,
      toggleIncognito,
      setIncognito,
    }),
    [
      drawerOpen,
      openDrawer,
      closeDrawer,
      searchOpen,
      openSearch,
      closeSearch,
      incognito,
      toggleIncognito,
    ],
  );

  return (
    <ShellContext.Provider value={value}>{children}</ShellContext.Provider>
  );
}

export function useShell(): ShellContextValue {
  const ctx = useContext(ShellContext);
  if (!ctx) throw new Error("useShell must be used within a ShellProvider");
  return ctx;
}
