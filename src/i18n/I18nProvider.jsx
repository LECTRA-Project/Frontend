import { useCallback, useEffect, useMemo, useState } from "react";

import { useAuth } from "../features/auth/authContext.js";
import { I18nContext, isLanguage, setCurrentLanguage, translate } from "./i18n.js";

/*
  Provides the interface language. It is a per-user preference kept in this browser
  (like the notebook: localStorage keyed by the user's id), restored on the next visit,
  and English while nobody is signed in.
*/
const KEY_PREFIX = "lectra:language:v1:";

function storageKey(userKey) {
  return `${KEY_PREFIX}${userKey}`;
}

function readLanguage(userKey) {
  if (!userKey) return "en";
  try {
    const saved = localStorage.getItem(storageKey(userKey));
    return isLanguage(saved) ? saved : "en";
  } catch {
    return "en";
  }
}

function writeLanguage(userKey, language) {
  if (!userKey) return;
  try {
    localStorage.setItem(storageKey(userKey), language);
  } catch {
    // Storage blocked or full: the choice still applies until the page is reloaded.
  }
}

export default function I18nProvider({ children }) {
  const { user } = useAuth();
  const userKey = user?.id ?? null;
  const [choice, setChoice] = useState(() => ({ userKey, language: readLanguage(userKey) }));

  // Another user signed in (or out): use their saved language.
  let language = choice.language;
  if (choice.userKey !== userKey) {
    language = readLanguage(userKey);
    setChoice({ userKey, language });
  }
  // Plain modules translate with this, so it is set before the children render.
  setCurrentLanguage(language);

  const setLanguage = useCallback(
    (code) => {
      if (!isLanguage(code)) return;
      writeLanguage(userKey, code);
      setChoice({ userKey, language: code });
    },
    [userKey]
  );

  // Changed in another tab: follow it.
  useEffect(() => {
    if (!userKey) return undefined;
    const onStorage = (event) => {
      if (event.key === storageKey(userKey)) setChoice({ userKey, language: readLanguage(userKey) });
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [userKey]);

  const value = useMemo(
    () => ({ language, setLanguage, t: (text, vars) => translate(text, vars, language) }),
    [language, setLanguage]
  );
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}
