"use client";

import { createContext, useCallback, useContext, useEffect, useSyncExternalStore } from "react";

export type Theme = "light" | "dark" | "system";
type Resolved = "light" | "dark";

const STORAGE_KEY = "lexi-theme";

/**
 * Runs before first paint (injected in <head>) so the page never flashes the
 * wrong theme. Must stay dependency-free and synchronous.
 */
export const themeInitScript = `
(function () {
  try {
    var t = localStorage.getItem("${STORAGE_KEY}");
    if (t === "light" || t === "dark") {
      document.documentElement.setAttribute("data-theme", t);
    }
  } catch (e) {}
})();
`;

/* --- The user's choice, as an external store ---------------------------------
 * Kept outside React so useSyncExternalStore can read it during hydration
 * without a setState-in-effect round trip.
 */

let chosenTheme: Theme = "system";
const listeners = new Set<() => void>();

if (typeof window !== "undefined") {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === "light" || stored === "dark") chosenTheme = stored;
  } catch {
    // Storage unavailable (private mode) — fall back to following the OS.
  }
}

function subscribeTheme(onChange: () => void): () => void {
  listeners.add(onChange);
  return () => listeners.delete(onChange);
}

const getTheme = (): Theme => chosenTheme;
// The server has no idea what the user picked; the init script fixes the paint.
const getThemeOnServer = (): Theme => "system";

function writeTheme(next: Theme): void {
  chosenTheme = next;
  try {
    if (next === "system") localStorage.removeItem(STORAGE_KEY);
    else localStorage.setItem(STORAGE_KEY, next);
  } catch {
    // Non-fatal: the theme still applies for this session.
  }
  listeners.forEach((l) => l());
}

/* --- The OS preference, also an external store --- */

const DARK_QUERY = "(prefers-color-scheme: dark)";

function subscribeSystem(onChange: () => void): () => void {
  const mq = window.matchMedia(DARK_QUERY);
  mq.addEventListener("change", onChange);
  return () => mq.removeEventListener("change", onChange);
}

const getSystem = (): Resolved => (window.matchMedia(DARK_QUERY).matches ? "dark" : "light");
const getSystemOnServer = (): Resolved => "light";

/* --- Context --- */

type ThemeState = {
  /** What the user picked. "system" means follow the OS. */
  theme: Theme;
  /** What is actually on screen right now. */
  resolved: Resolved;
  setTheme: (t: Theme) => void;
  toggle: () => void;
};

const ThemeContext = createContext<ThemeState | null>(null);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const theme = useSyncExternalStore(subscribeTheme, getTheme, getThemeOnServer);
  const system = useSyncExternalStore(subscribeSystem, getSystem, getSystemOnServer);
  const resolved: Resolved = theme === "system" ? system : theme;

  // Mirror the choice onto <html> so the CSS custom properties switch over.
  useEffect(() => {
    const root = document.documentElement;
    if (theme === "system") root.removeAttribute("data-theme");
    else root.setAttribute("data-theme", theme);
  }, [theme]);

  const setTheme = useCallback((next: Theme) => writeTheme(next), []);

  // A one-click control should flip what you can currently see.
  const toggle = useCallback(
    () => writeTheme(resolved === "dark" ? "light" : "dark"),
    [resolved]
  );

  return (
    <ThemeContext.Provider value={{ theme, resolved, setTheme, toggle }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme(): ThemeState {
  const ctx = useContext(ThemeContext);
  if (ctx === null) throw new Error("useTheme must be used inside <ThemeProvider>");
  return ctx;
}
