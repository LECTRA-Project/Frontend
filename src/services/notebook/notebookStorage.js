import { t } from "../../i18n/i18n.js";
import { notebookToIpynb, parseIpynb } from "./ipynb.js";

/*
  Browser-only notebook storage (localStorage).

  The notebook is kept per signed-in user in THIS browser only. It is not sent to
  the LECTRA server, so it is not available on other devices and is lost if the
  browser's site data is cleared. Downloading the .ipynb is the way to keep a copy.

  Stored value: { savedAt: ISO string, title, notebook: nbformat 4 JSON }
*/
const KEY_PREFIX = "lectra:notebook:v1:";

function storageKey(userKey) {
  return `${KEY_PREFIX}${userKey}`;
}

/* The saved notebook, or null if there is none. Throws if the saved data cannot be read. */
export function loadNotebook(userKey) {
  const raw = localStorage.getItem(storageKey(userKey));
  if (raw === null) return null;

  const saved = JSON.parse(raw);
  const notebook = parseIpynb(JSON.stringify(saved.notebook), { title: saved.title });
  return { notebook, savedAt: saved.savedAt ?? null };
}

/* Saves the notebook and returns the save time. Throws an Error with a readable message on failure. */
export function saveNotebook(userKey, notebook) {
  const savedAt = new Date().toISOString();
  const value = JSON.stringify({ savedAt, title: notebook.title, notebook: notebookToIpynb(notebook) });
  try {
    localStorage.setItem(storageKey(userKey), value);
  } catch (error) {
    const full = error?.name === "QuotaExceededError" || error?.code === 22;
    throw new Error(
      full
        ? t(
            "Browser storage is full (large outputs such as images take a lot of space). Clear some outputs or download the notebook as .ipynb."
          )
        : t("The browser refused to save the notebook ({error}).", { error: error?.message ?? error }),
      { cause: error }
    );
  }
  return savedAt;
}
