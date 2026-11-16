import { useCallback, useEffect, useMemo, useState } from "react";

import {
  applyTheme,
  isTheme,
  onSystemThemeChange,
  readTheme,
  systemPrefersDark,
  THEME_STORAGE_KEY,
  ThemeContext,
  writeTheme,
} from "./theme.js";

/*
  Provides the colour theme (see theme.js): the choice ("system" | "light" | "dark"),
  what it resolves to now ("light" | "dark"), and setTheme. Follows the operating system
  while the choice is "system", and a change made in another tab.
*/
export default function ThemeProvider({ children }) {
  const [theme, setChoice] = useState(readTheme);
  const [systemDark, setSystemDark] = useState(systemPrefersDark);
  const resolvedTheme = theme === "system" ? (systemDark ? "dark" : "light") : theme;

  // Put the theme on <html>.
  useEffect(() => {
    applyTheme(resolvedTheme);
  }, [resolvedTheme]);

  // The operating system switched between light and dark.
  useEffect(() => onSystemThemeChange(() => setSystemDark(systemPrefersDark())), []);

  // Changed in another tab: follow it.
  useEffect(() => {
    const onStorage = (event) => {
      if (event.key === THEME_STORAGE_KEY) setChoice(readTheme());
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const setTheme = useCallback((value) => {
    if (!isTheme(value)) return;
    writeTheme(value);
    setChoice(value);
  }, []);

  const value = useMemo(() => ({ theme, resolvedTheme, setTheme }), [theme, resolvedTheme, setTheme]);
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}
