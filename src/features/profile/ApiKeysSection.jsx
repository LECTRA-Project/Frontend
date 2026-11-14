import { useCallback, useEffect, useId, useRef, useState } from "react";
import { Link, useLocation } from "react-router-dom";

import Button from "../../components/ui/Button.jsx";
import ConfirmDialog from "../../components/ui/ConfirmDialog.jsx";
import Icon from "../../components/ui/Icon.jsx";
import IconButton from "../../components/ui/IconButton.jsx";
import { deleteApiKey, listApiKeys, listModels, saveApiKey } from "../../api/services/apiKeys.js";
import { dateLocale, useI18n } from "../../i18n/i18n.js";
import { useAuth } from "../auth/authContext.js";
import { readChoice as readChatModel, writeChoice as writeChatModel } from "../workspace/useChatModel.js";
import { preferenceUserKey, readPreferredModels, writePreferredModel } from "./preferredModels.js";
import { PROVIDERS } from "./providers.js";

/*
  "AI provider API keys" in Account settings: the student's own Claude, Gemini and GPT keys.

  - The key is typed into a password field (it can be shown while typing), sent once to
    PUT /users/me/api-keys/{provider} and then dropped from the page. The backend checks it
    with the provider before saving it encrypted, so "saved" means the provider accepted it.
  - A saved key is never shown again: only its last 4 characters (key_last4).
  - "Test key" asks GET /users/me/models whether the provider lists models with the saved
    key (the backend keeps a provider's list for a few minutes).
  - Each row has a model dropdown. Its options are the models GET /users/me/models lists
    for that provider: the backend asks the provider with the saved key and keeps only the
    chat models LECTRA can call, so nothing here is invented. Without a key the dropdown is
    disabled; while loading, on failure, with a rejected key or with no models it says so
    and offers "Try again". The choice is the provider's preferred model (preferredModels.js,
    per user in this browser); the chat lists it first and, when the chat is set to that
    provider, uses it. A preferred model the key can't use (any more) is shown as not
    available, never as usable. Removing a key clears its preferred model.
  - Nothing here stores the key in the browser, logs it or puts it in a URL or a message.
  - Opened from the chat's model dialog (/settings#api-key-<provider>): that provider's row
    is scrolled into view with its Add / Replace button focused, and "Back to the chat"
    returns to the chat with the model dialog open again.
*/
export default function ApiKeysSection() {
  const { t } = useI18n();
  const { user } = useAuth();
  const userKey = preferenceUserKey(user);
  const location = useLocation();
  const returnTo = typeof location.state?.returnTo === "string" ? location.state.returnTo : null;
  const target = location.hash.startsWith("#api-key-") ? location.hash.slice("#api-key-".length) : null;
  const [keys, setKeys] = useState(null); // [{ provider, key_last4, updated_at }] once loaded
  const [loadError, setLoadError] = useState(null);
  const [removing, setRemoving] = useState(null); // provider asked about
  const [status, setStatus] = useState({}); // provider → { kind: "success" | "error" | "info", text }
  // The models the saved keys unlock: { state: "idle" | "loading" | "ready" | "error", models, unavailable, error }
  const [catalog, setCatalog] = useState({ state: "idle", models: [], unavailable: [], error: null });
  const [preferred, setPreferred] = useState(() => readPreferredModels(userKey));
  const modelsRequest = useRef(null);

  // Asks the server (which asks each provider with the saved key). Resolves with the
  // result, or null when it failed or was replaced by a newer request.
  const fetchModels = useCallback(() => {
    modelsRequest.current?.abort();
    const controller = new AbortController();
    modelsRequest.current = controller;
    return listModels({ signal: controller.signal }).then(
      (result) => {
        if (modelsRequest.current !== controller) return null;
        setCatalog({ state: "ready", models: result.models, unavailable: result.unavailable, error: null });
        return result;
      },
      (err) => {
        if (controller.signal.aborted || err?.name === "CanceledError" || modelsRequest.current !== controller) return null;
        setCatalog((current) => ({ ...current, state: "error", error: err.message }));
        return null;
      }
    );
  }, []);

  // From an event (save, Test key, Try again): show the loading state, then ask.
  const loadModels = useCallback(() => {
    setCatalog((current) => ({ ...current, state: "loading", error: null }));
    return fetchModels();
  }, [fetchModels]);

  useEffect(() => () => modelsRequest.current?.abort(), []);

  // Another user signed in on this device: their own preferences.
  const [preferredFor, setPreferredFor] = useState(userKey);
  if (preferredFor !== userKey) {
    setPreferredFor(userKey);
    setPreferred(readPreferredModels(userKey));
  }

  // Load the models once the saved keys are known (only when there is a key to ask with).
  const hasKeys = Boolean(keys?.length);
  // (The catalog starts "idle", which already reads as loading.)
  useEffect(() => {
    if (hasKeys) fetchModels();
  }, [hasKeys, fetchModels]);

  // State is only set once the server answers.
  const load = useCallback(
    (signal) =>
      listApiKeys({ signal }).then(
        (list) => {
          setKeys(list);
          setLoadError(null);
        },
        (err) => {
          if (signal?.aborted || err?.name === "CanceledError") return;
          setLoadError(err.message);
        }
      ),
    []
  );

  useEffect(() => {
    const controller = new AbortController();
    load(controller.signal);
    return () => controller.abort();
  }, [load]);

  const report = (provider, kind, text) => setStatus((current) => ({ ...current, [provider]: kind ? { kind, text } : null }));

  function saved(provider, data) {
    setKeys((list) => [...(list ?? []).filter((item) => item.provider !== provider), data]);
    // A new or replaced key may unlock other models: ask again.
    loadModels();
  }

  function choosePreferred(provider, model) {
    setPreferred(writePreferredModel(userKey, provider.id, model.id));
    // The chat is set to this provider: it now asks with the chosen model.
    const chat = readChatModel(userKey);
    if (chat.provider === provider.id && chat.id !== model.id) {
      writeChatModel(userKey, { id: model.id, name: model.name || model.id, provider: provider.id });
    }
    report(provider.id, "success", t("{model} is your preferred {provider} model in the chat.", { model: model.name, provider: provider.name }));
  }

  async function confirmRemove() {
    const provider = removing;
    setRemoving(null);
    report(provider, "info", t("Removing the key…"));
    try {
      await deleteApiKey(provider);
      setKeys((list) => (list ?? []).filter((item) => item.provider !== provider));
      setPreferred(writePreferredModel(userKey, provider, null));
      setCatalog((current) => ({ ...current, models: current.models.filter((item) => item.provider !== provider) }));
      report(provider, "success", t("The key was removed. Its models are no longer offered in the chat."));
    } catch (err) {
      report(provider, "error", err.message);
    }
  }

  return (
    <>
      <h2 className="settings__group" id="api-keys" tabIndex={-1}>
        {t("AI provider API keys")}
      </h2>
      <p className="settings__help settings__intro">
        {t(
          "Use your own Claude, Gemini or GPT account in the chat. Each key is checked with its provider, stored encrypted on the LECTRA server for your account only, and never shown again in full."
        )}
      </p>
      {returnTo && (
        <Link className="settings__key-return" to={returnTo} state={{ openModelPicker: true }}>
          <Icon name="arrowLeft" size={15} />
          {t("Back to the chat to choose a model")}
        </Link>
      )}

      {loadError && (
        <div className="notice notice--error settings__keys-error" role="alert">
          <p>{loadError}</p>
          <Button
            size="sm"
            onClick={() => {
              setLoadError(null);
              load();
            }}
          >
            {t("Try again")}
          </Button>
        </div>
      )}
      {!keys && !loadError && (
        <p className="settings__help" role="status">
          {t("Loading your API keys…")}
        </p>
      )}

      {keys &&
        PROVIDERS.map((provider) => (
          <ProviderKeyRow
            key={provider.id}
            provider={provider}
            saved={keys.find((item) => item.provider === provider.id) ?? null}
            status={status[provider.id] ?? null}
            onStatus={(kind, text) => report(provider.id, kind, text)}
            onSaved={(data) => saved(provider.id, data)}
            onRemove={() => setRemoving(provider.id)}
            catalog={catalog}
            preferredId={preferred[provider.id] ?? null}
            onChooseModel={(model) => choosePreferred(provider, model)}
            onLoadModels={loadModels}
            focusOnOpen={target === provider.id}
          />
        ))}

      {removing && (
        <ConfirmDialog
          title={t("Remove the {provider} API key?", { provider: PROVIDERS.find((item) => item.id === removing)?.name })}
          confirmLabel={t("Remove key")}
          danger
          onConfirm={confirmRemove}
          onCancel={() => setRemoving(null)}
        >
          <p>{t("Its models are no longer offered in the chat. You can add a key again at any time.")}</p>
        </ConfirmDialog>
      )}
    </>
  );
}

function ProviderKeyRow({
  provider,
  saved,
  status,
  onStatus,
  onSaved,
  onRemove,
  catalog,
  preferredId,
  onChooseModel,
  onLoadModels,
  focusOnOpen = false,
}) {
  const { t } = useI18n();
  const inputId = useId();
  const helpId = useId();
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState("");
  const [visible, setVisible] = useState(false);
  const [busy, setBusy] = useState(null); // "saving" | "testing"
  const inputRef = useRef(null);
  const editButtonRef = useRef(null);

  useEffect(() => {
    if (editing) inputRef.current?.focus();
  }, [editing]);

  // Linked to this provider (from the chat): show the row and focus Add key / Replace.
  const rowRef = useRef(null);
  useEffect(() => {
    if (!focusOnOpen) return;
    rowRef.current?.scrollIntoView?.({ block: "center" });
    editButtonRef.current?.focus({ preventScroll: true });
  }, [focusOnOpen]);

  function stopEditing() {
    setEditing(false);
    setValue("");
    setVisible(false);
    requestAnimationFrame(() => editButtonRef.current?.focus());
  }

  async function save(event) {
    event.preventDefault();
    const key = value.trim();
    if (!key) {
      onStatus("error", t("Enter your API key first."));
      return;
    }
    if (/\s/.test(key)) {
      onStatus("error", t("An API key has no spaces. Check that you copied the whole key and nothing else."));
      return;
    }
    setBusy("saving");
    onStatus("info", t("Checking the key with {provider}…", { provider: provider.name }));
    try {
      const data = await saveApiKey(provider.id, key);
      onSaved(data);
      stopEditing();
      onStatus("success", t("Key saved. {provider} accepted it.", { provider: provider.name }));
    } catch (err) {
      // The server's message never contains the key.
      onStatus("error", err.message);
    } finally {
      setBusy(null);
    }
  }

  async function test() {
    setBusy("testing");
    onStatus("info", t("Testing the key with {provider}…", { provider: provider.name }));
    try {
      const result = await onLoadModels();
      if (!result) {
        onStatus(null);
        return;
      }
      const problem = result.unavailable.find((item) => item.provider === provider.id);
      const count = result.models.filter((item) => item.provider === provider.id).length;
      if (problem) onStatus("error", problem.message);
      else if (count === 0) onStatus("error", t("{provider} accepted the key but offers no chat models for it.", { provider: provider.name }));
      else
        onStatus(
          "success",
          count === 1
            ? t("The key works: {provider} offers 1 chat model with it.", { provider: provider.name })
            : t("The key works: {provider} offers {count} chat models with it.", { provider: provider.name, count })
        );
    } catch (err) {
      onStatus("error", err.message);
    } finally {
      setBusy(null);
    }
  }

  const updated = saved?.updated_at ? new Date(saved.updated_at) : null;
  const updatedText =
    updated && !Number.isNaN(updated.getTime())
      ? updated.toLocaleDateString(dateLocale(undefined), { year: "numeric", month: "short", day: "numeric" })
      : null;

  return (
    <div className="settings__row settings__row--key" id={`api-key-${provider.id}`} ref={rowRef}>
      <div className="settings__key-head">
        <div>
          <p className="settings__label">{provider.name}</p>
          <p className="settings__help" id={helpId}>
            {saved ? (
              <>
                <span className="settings__key-badge">
                  <Icon name="check" size={13} />
                  {t("Key saved")}
                </span>{" "}
                {updatedText
                  ? t("Ends in {last4} · updated {date}", { last4: saved.key_last4, date: updatedText })
                  : t("Ends in {last4}", { last4: saved.key_last4 })}
              </>
            ) : (
              t("No key saved")
            )}
          </p>
        </div>
        {!editing && (
          <div className="settings__key-actions">
            {saved ? (
              <>
                <Button size="sm" onClick={test} disabled={Boolean(busy)}>
                  {busy === "testing" ? t("Testing…") : t("Test key")}
                </Button>
                <Button
                  size="sm"
                  ref={editButtonRef}
                  onClick={() => setEditing(true)}
                  disabled={Boolean(busy)}
                  aria-label={t("Replace the {provider} API key", { provider: provider.name })}
                >
                  {t("Replace")}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={onRemove}
                  disabled={Boolean(busy)}
                  aria-label={t("Remove the {provider} API key", { provider: provider.name })}
                >
                  {t("Remove")}
                </Button>
              </>
            ) : (
              <Button
                size="sm"
                ref={editButtonRef}
                onClick={() => setEditing(true)}
                aria-label={t("Add a {provider} API key", { provider: provider.name })}
              >
                {t("Add key")}
              </Button>
            )}
          </div>
        )}
      </div>

      <ModelSelect
        provider={provider}
        hasKey={Boolean(saved)}
        catalog={catalog}
        preferredId={preferredId}
        onChoose={onChooseModel}
        onRetry={onLoadModels}
      />

      {editing && (
        <form className="settings__key-form" onSubmit={save} autoComplete="off">
          <label className="visually-hidden" htmlFor={inputId}>
            {t("{provider} API key", { provider: provider.name })}
          </label>
          <div className="settings__key-field">
            <input
              ref={inputRef}
              id={inputId}
              className="settings__key-input"
              type={visible ? "text" : "password"}
              value={value}
              onChange={(event) => setValue(event.target.value)}
              placeholder={provider.placeholder}
              autoComplete="off"
              autoCapitalize="off"
              autoCorrect="off"
              spellCheck={false}
              data-1p-ignore=""
              data-lpignore="true"
              maxLength={512}
              disabled={busy === "saving"}
              aria-describedby={helpId}
              onKeyDown={(event) => {
                if (event.key === "Escape" && busy !== "saving") {
                  event.stopPropagation();
                  stopEditing();
                }
              }}
            />
            <IconButton
              icon={visible ? "eyeOff" : "eye"}
              label={visible ? t("Hide the key") : t("Show the key")}
              onClick={() => setVisible((shown) => !shown)}
              aria-pressed={visible}
            />
          </div>
          <div className="settings__key-actions">
            <Button type="submit" variant="primary" size="sm" disabled={busy === "saving"}>
              {busy === "saving" ? t("Checking…") : t("Save key")}
            </Button>
            <Button size="sm" variant="ghost" onClick={stopEditing} disabled={busy === "saving"}>
              {t("Cancel")}
            </Button>
          </div>
          <p className="settings__help">
            {t("Create a key in your {provider} account:", { provider: provider.name })}{" "}
            <a href={provider.consoleUrl} target="_blank" rel="noreferrer noopener">
              {provider.consoleUrl.replace(/^https:\/\//, "")}
            </a>
          </p>
        </form>
      )}

      {status && (
        <p
          className={`settings__key-status settings__key-status--${status.kind}`}
          role={status.kind === "error" ? "alert" : "status"}
        >
          {status.text}
        </p>
      )}
    </div>
  );
}

/*
  The provider's model dropdown. Only lists what GET /users/me/models returned for the
  provider; every other state (no key, loading, failed, key rejected, no models) keeps the
  dropdown disabled and says why. The messages come from the server and never contain a key.
*/
function ModelSelect({ provider, hasKey, catalog, preferredId, onChoose, onRetry }) {
  const { t } = useI18n();
  const selectId = useId();
  const noteId = useId();
  const options = catalog.models.filter((item) => item.provider === provider.id);
  const problem = catalog.unavailable.find((item) => item.provider === provider.id) ?? null;

  let placeholder = null; // the only (disabled) option when nothing can be chosen
  let note = null; // { kind, text, retry }
  if (!hasKey) {
    placeholder = t("Add a key first");
    note = { kind: "info", text: t("Add your {provider} API key to see the models it offers.", { provider: provider.name }) };
  } else if (catalog.state === "loading" || catalog.state === "idle") {
    placeholder = t("Loading models…");
    note = { kind: "info", text: t("Loading the models available with your key…") };
  } else if (problem) {
    placeholder = t("Not available");
    note = { kind: "error", text: problem.message, retry: true };
  } else if (catalog.state === "error" && options.length === 0) {
    placeholder = t("Models not loaded");
    note = { kind: "error", text: catalog.error, retry: true };
  } else if (options.length === 0) {
    placeholder = t("No chat models available");
    note = { kind: "error", text: t("{provider} offers no chat models LECTRA can use with this key.", { provider: provider.name }), retry: true };
  }

  const usable = !placeholder;
  const preferredListed = usable && options.some((item) => item.id === preferredId);
  // A preferred model the key can't use: shown as not available, never as usable.
  const preferredMissing = usable && preferredId && !preferredListed;
  if (preferredMissing) {
    note = {
      kind: "error",
      text: t("Your preferred model {model} isn't available with this key. Choose another model.", {
        model: preferredId.slice(provider.id.length + 1),
      }),
      retry: true,
    };
  } else if (usable && catalog.state === "error") {
    // A refresh failed: the last list is still shown, with the error.
    note = { kind: "error", text: catalog.error, retry: true };
  }

  return (
    <div className="settings__key-model">
      <label className="settings__key-model-label" htmlFor={selectId}>
        {t("Model")}
      </label>
      <select
        id={selectId}
        className="settings__select settings__key-model-select"
        value={usable ? preferredId ?? "" : ""}
        disabled={!usable}
        aria-describedby={note ? noteId : undefined}
        aria-label={t("{provider} model", { provider: provider.name })}
        onChange={(event) => {
          const model = options.find((item) => item.id === event.target.value);
          if (model) onChoose(model);
        }}
      >
        {placeholder ? (
          <option value="">{placeholder}</option>
        ) : (
          <>
            {!preferredId && (
              <option value="" disabled>
                {t("Choose a model")}
              </option>
            )}
            {preferredMissing && (
              <option value={preferredId} disabled>
                {t("{model} (not available)", { model: preferredId.slice(provider.id.length + 1) })}
              </option>
            )}
            {options.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </>
        )}
      </select>
      {note && (
        <p
          id={noteId}
          className={`settings__key-model-note settings__key-status--${note.kind}`}
          // Read with the dropdown (aria-describedby); the row's status line does the announcing.
        >
          {note.text}
          {note.retry && (
            <>
              {" "}
              <button type="button" className="settings__key-retry" onClick={onRetry} disabled={catalog.state === "loading"}>
                {t("Try again")}
              </button>
            </>
          )}
        </p>
      )}
    </div>
  );
}
