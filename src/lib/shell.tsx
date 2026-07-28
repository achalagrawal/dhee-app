import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { loadPref, savePref } from "./prefs";

// App-shell state shared between the header, the sidebar (persistent on
// desktop, a slide-in drawer below the breakpoint), and the search modal. Kept
// deliberately small: which overlays are open, whether the desktop sidebar is
// down to its icon rail, and whether incognito mode is engaged.
type ShellContextValue = {
  drawerOpen: boolean;
  openDrawer: () => void;
  closeDrawer: () => void;
  /** Desktop only: the sidebar is showing as a 66px icon rail. */
  sidebarCollapsed: boolean;
  collapseSidebar: () => void;
  expandSidebar: () => void;
  searchOpen: boolean;
  openSearch: () => void;
  closeSearch: () => void;
  incognito: boolean;
  toggleIncognito: () => void;
  setIncognito: (on: boolean) => void;
};

const ShellContext = createContext<ShellContextValue | null>(null);

const COLLAPSED_KEY = "dhee.sidebarCollapsed";

export function ShellProvider({ children }: { children: React.ReactNode }) {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [incognito, setIncognito] = useState(false);

  // Which width the sidebar was left at is a preference, not session state —
  // someone who works in the rail expects the rail on the next visit.
  useEffect(() => {
    let alive = true;
    void loadPref(COLLAPSED_KEY).then((stored) => {
      if (alive && stored === "true") setSidebarCollapsed(true);
    });
    return () => {
      alive = false;
    };
  }, []);

  const openDrawer = useCallback(() => setDrawerOpen(true), []);
  const closeDrawer = useCallback(() => setDrawerOpen(false), []);
  const setCollapsed = useCallback((next: boolean) => {
    setSidebarCollapsed(next);
    savePref(COLLAPSED_KEY, String(next));
  }, []);
  const collapseSidebar = useCallback(() => setCollapsed(true), [setCollapsed]);
  const expandSidebar = useCallback(() => setCollapsed(false), [setCollapsed]);
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
      sidebarCollapsed,
      collapseSidebar,
      expandSidebar,
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
      sidebarCollapsed,
      collapseSidebar,
      expandSidebar,
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
