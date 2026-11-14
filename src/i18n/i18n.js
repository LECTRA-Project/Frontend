import { createContext, useContext } from "react";

import de from "./de/index.js";

/*
  Interface translations (English and German).

  The English text is the key: t("New chat") is "New chat" in English and the entry in
  ./de/*.js in German. A text without a German entry falls back to English, so nothing
  ever shows a key. Placeholders are written {name}: t("{count} materials", { count: 3 }).
  Plurals are separate texts: count === 1 ? t("1 page") : t("{count} pages", { count }).

  - Components: const { t, language } = useI18n(); (re-renders when the language changes).
  - Plain modules (services, helpers): import { t } from "../i18n/i18n.js"; it reads the
    current language when called, so call it when the text is shown, not at import time.

  Only the interface is translated: user content, chat messages, file contents, provider
  and model names, and messages written by the server stay as they are.
*/

export const LANGUAGES = [
  { code: "en", name: "English" },
  { code: "de", name: "Deutsch" },
];

const DICTIONARIES = { de };

let current = "en";

export function isLanguage(code) {
  return LANGUAGES.some((item) => item.code === code);
}

export function getLanguage() {
  return current;
}

/* Called by I18nProvider; plain modules then translate into this language. */
export function setCurrentLanguage(code) {
  current = isLanguage(code) ? code : "en";
  if (typeof document !== "undefined") document.documentElement.lang = current;
}

export function translate(text, vars, language = current) {
  const dictionary = DICTIONARIES[language];
  let out = (dictionary && Object.hasOwn(dictionary, text) && dictionary[text]) || text;
  if (vars) out = out.replace(/\{(\w+)\}/g, (match, name) => (name in vars ? String(vars[name]) : match));
  return out;
}

export function t(text, vars) {
  return translate(text, vars, current);
}

/* The BCP 47 locale for dates and numbers: German formats in German, else `fallback`. */
export function dateLocale(fallback) {
  return current === "de" ? "de-DE" : fallback;
}

export const I18nContext = createContext({
  language: "en",
  setLanguage: () => {},
  t: (text, vars) => translate(text, vars, "en"),
});

export function useI18n() {
  return useContext(I18nContext);
}

/* German texts, for the test that checks every t("…") has one. */
export function germanDictionary() {
  return de;
}
