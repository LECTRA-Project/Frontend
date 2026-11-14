import { useCallback, useEffect, useRef, useState } from "react";

import { DEFAULT_MODEL_ID, listModels } from "../../api/services/apiKeys.js";
import { readPreferredModels } from "../profile/preferredModels.js";

/*
  The model the chat asks with: "lectra" (our own models, the default) or one of the
  student's own models ("<provider>:<model>", unlocked by a key saved in Account settings).

  The choice is a per-user preference kept in this browser, like the interface language
  and the notebook (localStorage keyed by the user's id): only { id, name, provider }, never
  a key. It is restored on the next visit and sent with each question as `model`.

  The list comes from GET /users/me/models, which only lists models the backend can call
  with the saved keys. A saved choice that is no longer listed (its key was removed or the
  provider is unavailable) is kept and reported as `missing`; it is never swapped for
  another model behind the student's back, and the backend answers with the real reason.

  Returns {
    selected   { id, name, provider }
    models     [{ id, provider, model, name }] | null (not loaded yet)
    unavailable [{ provider, name, message }]
    loading, error (message or null)
    missing    true when the list is loaded and doesn't contain the selected model
    preferred  { provider: modelId }, the preferred model per provider (Account settings)
    select(model), refresh()
  }
*/
const KEY_PREFIX = "lectra:chat-model:v1:";
const LECTRA = { id: DEFAULT_MODEL_ID, name: "Lectra", provider: "lectra" };

export function readChoice(userKey) {
  try {
    const saved = JSON.parse(localStorage.getItem(`${KEY_PREFIX}${userKey}`) ?? "null");
    if (saved && typeof saved.id === "string" && saved.id) {
      return { id: saved.id, name: String(saved.name || saved.id), provider: String(saved.provider || "") };
    }
  } catch {
    // Unreadable or blocked storage: use the default.
  }
  return LECTRA;
}

export function writeChoice(userKey, choice) {
  try {
    if (choice.id === DEFAULT_MODEL_ID) localStorage.removeItem(`${KEY_PREFIX}${userKey}`);
    else localStorage.setItem(`${KEY_PREFIX}${userKey}`, JSON.stringify(choice));
  } catch {
    // The choice still applies until the page is reloaded.
  }
}

export function useChatModel(userKey, { enabled = true } = {}) {
  const [selected, setSelected] = useState(() => readChoice(userKey));
  const [list, setList] = useState({ models: null, unavailable: [], loading: enabled, error: null });
  const request = useRef(null);
  // Re-read with each list request: it may have changed in Account settings.
  const [preferred, setPreferred] = useState(() => readPreferredModels(userKey));

  // Another user on this device: their own choice.
  const [shownFor, setShownFor] = useState(userKey);
  if (shownFor !== userKey) {
    setShownFor(userKey);
    setSelected(readChoice(userKey));
    setPreferred(readPreferredModels(userKey));
  }

  // Asks the server for the list; state is only set once it answers.
  const load = useCallback(() => {
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    return listModels({ signal: controller.signal }).then(
      (result) => {
        if (request.current !== controller) return;
        // Account settings may have changed the preferred models (and the chat's choice with them).
        setPreferred(readPreferredModels(userKey));
        setSelected(readChoice(userKey));
        setList({ models: result.models, unavailable: result.unavailable, loading: false, error: null });
      },
      (err) => {
        if (controller.signal.aborted || err?.name === "CanceledError" || request.current !== controller) return;
        setList((current) => ({ ...current, loading: false, error: err.message }));
      }
    );
  }, [userKey]);

  const refresh = useCallback(() => {
    setList((current) => ({ ...current, loading: true, error: null }));
    return load();
  }, [load]);

  useEffect(() => {
    if (!enabled) return undefined;
    load();
    return () => request.current?.abort();
  }, [enabled, userKey, load]);

  const select = useCallback(
    (model) => {
      const choice = { id: model.id, name: model.name || model.id, provider: model.provider || "" };
      writeChoice(userKey, choice);
      setSelected(choice);
    },
    [userKey]
  );

  const missing =
    selected.id !== DEFAULT_MODEL_ID && Array.isArray(list.models) && !list.models.some((item) => item.id === selected.id);

  return { selected, ...list, missing, preferred, select, refresh };
}
