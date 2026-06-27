"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

const STORAGE_KEY = "theme";
const THEMES = ["light", "stratus"] as const;
type ThemeName = (typeof THEMES)[number];

type ThemeContextValue = {
  theme: string;
  setTheme: (theme: string) => void;
  resolvedTheme?: string;
  themes: string[];
};

const ThemeContext = createContext<ThemeContextValue>({
  theme: "stratus",
  setTheme: () => {},
  resolvedTheme: "stratus",
  themes: [...THEMES],
});

function isThemeName(value: string): value is ThemeName {
  return (THEMES as readonly string[]).includes(value);
}

export function applyThemeClass(theme: ThemeName) {
  const root = document.documentElement;
  for (const name of THEMES) root.classList.remove(name);
  root.classList.add(theme);
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<ThemeName>("stratus");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      const next = stored && isThemeName(stored) ? stored : "stratus";
      setThemeState(next);
      applyThemeClass(next);
    } catch {
      applyThemeClass("stratus");
    }
  }, []);

  const setTheme = useCallback((next: string) => {
    const value = isThemeName(next) ? next : "stratus";
    setThemeState(value);
    applyThemeClass(value);
    try {
      localStorage.setItem(STORAGE_KEY, value);
    } catch {
      // ignore private browsing storage errors
    }
  }, []);

  const value = useMemo(
    () => ({
      theme: mounted ? theme : "stratus",
      setTheme,
      resolvedTheme: mounted ? theme : "stratus",
      themes: [...THEMES],
    }),
    [theme, setTheme, mounted],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  return useContext(ThemeContext);
}
