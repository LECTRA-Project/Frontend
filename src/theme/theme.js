import { createContext, useContext } from "react";

/*
  Colour theme: "light", "dark" or "system" (follows the operating system).
  The choice is kept in this browser (not per user), so the sign-in page uses it too.
  It is applied as <html data-theme="light|dark">; the dark colours are in styles/tokens.css.
*/
export const THEMES = ["system", "light", "dark"];
export const THEME_STORAGE_KEY = "lectra:theme:v1";
const STORAGE_KEY = THEME_STORAGE_KEY;
const DARK_QUERY = "(prefers-color-scheme: dark)";

export function isTheme(value) {
  return THEMES.includes(value);
}

export function readTheme() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    return isTheme(saved) ? saved : "system";
  } catch {
    return "system";
  }
}

export function writeTheme(theme) {
  try {
    localStorage.setItem(STORAGE_KEY, theme);
  } catch {
    // Storage blocked or full: the choice still applies until the page is reloaded.
  }
}

export function systemPrefersDark() {
  return typeof window !== "undefined" && Boolean(window.matchMedia?.(DARK_QUERY)?.matches);
}

/* "light" or "dark": what a theme choice looks like right now. */
export function resolveTheme(theme) {
  if (theme === "dark" || theme === "light") return theme;
  return systemPrefersDark() ? "dark" : "light";
}

/* Sets <html data-theme> (and the native controls' colour scheme). */
export function applyTheme(theme) {
  const resolved = resolveTheme(theme);
  const root = document.documentElement;
  root.dataset.theme = resolved;
  root.style.colorScheme = resolved;
  return resolved;
}

/* The theme in use on the page right now ("light" or "dark"). */
export function currentTheme() {
  return typeof document !== "undefined" && document.documentElement.dataset.theme === "dark" ? "dark" : "light";
}

/* Calls `listener` when the operating system switches between light and dark. */
export function onSystemThemeChange(listener) {
  const list = typeof window !== "undefined" ? window.matchMedia?.(DARK_QUERY) : null;
  if (!list?.addEventListener) return () => {};
  list.addEventListener("change", listener);
  return () => list.removeEventListener("change", listener);
}

export const ThemeContext = createContext({ theme: "system", resolvedTheme: "light", setTheme: () => {} });

export function useTheme() {
  return useContext(ThemeContext);
}
