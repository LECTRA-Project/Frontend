import { useCallback, useEffect, useId, useRef, useState } from "react";
import { Link, useLocation } from "react-router-dom";

import Button from "../../components/ui/Button.jsx";
import ConfirmDialog from "../../components/ui/ConfirmDialog.jsx";
import Icon from "../../components/ui/Icon.jsx";
import IconButton from "../../components/ui/IconButton.jsx";
import { DEFAULT_MODEL_ID, deleteApiKey, listApiKeys, listModels, saveApiKey } from "../../api/services/apiKeys.js";
import { useI18n } from "../../i18n/i18n.js";
import { useAuth } from "../auth/authContext.js";
import { readChoice as readChatModel, writeChoice as writeChatModel } from "../workspace/useChatModel.js";
import { PROVIDERS } from "./providers.js";

/*
  "AI provider API keys" in Account settings: the student's own Claude, Gemini and GPT keys,
  and the chat model — two separate controls.

  - API key: a provider dropdown (Claude, Gemini, GPT, each saying whether a key is saved)
    with Add key, or Replace key and Remove key, for the chosen provider. Adding or
    replacing opens the key form under it, named for its provider. Removing asks first.
  - Chat model: Lectra and the models the saved keys unlock — models only, no key actions.
    A provider without a key is not listed; a key that doesn't work says so.
  - The key is typed into a password field (it can be shown while typing), sent once to
    PUT /users/me/api-keys/{provider} and then dropped from the page. The backend checks it
    with the provider before saving it encrypted, so "saved" means the provider accepted it.
    A saved key is never shown again: only its last 4 characters (key_last4). Nothing here
    stores the key in the browser, logs it or puts it in a URL or a message.
  - The models are the ones GET /users/me/models lists: the backend asks each provider with
    the saved key and keeps only the chat models LECTRA can call, so nothing is invented.
    The list is reloaded when a key is saved, replaced or removed; loading, failures and
    rejected keys are shown, with "Try again". After a key is saved its models are loaded
    and the Chat model dropdown gets the focus to choose one.
  - The choice is the chat's model (useChatModel: per user in this browser), so Account
    settings and the model button in the chat always show the same model, and the chat
    sends it with the next question. A chosen model whose key was removed or stopped
    working is shown as not available and the student is asked to choose another one: it
    is never switched behind their back.
  - Opened from the chat's model dialog (/settings#api-key-<provider>): that provider's key
    form opens, and "Back to the chat" returns to the chat with the model dialog open again.
*/
export default function ApiKeysSection() {
  const { t } = useI18n();
  const { user } = useAuth();
  const userKey = user?.id ?? user?.email ?? "signed-in-user"; // as in the workspace
  const location = useLocation();
  const returnTo = typeof location.state?.returnTo === "string" ? location.state.returnTo : null;
  // The provider the chat linked to, read once when the page opens.
  const [linkedProvider] = useState(() => {
    const id = location.hash.startsWith("#api-key-") ? location.hash.slice("#api-key-".length) : null;
    return PROVIDERS.some((item) => item.id === id) ? id : null;
  });
  const [keys, setKeys] = useState(null); // [{ provider, key_last4, updated_at }] once loaded
  const [loadError, setLoadError] = useState(null);
  const [form, setForm] = useState(null); // provider id whose key form is open
  const [removing, setRemoving] = useState(null); // provider asked about
  const [pickedProvider, setKeyProvider] = useState(linkedProvider); // chosen in the API key dropdown (null: not yet)
  const [notice, setNotice] = useState(null); // { kind: "success" | "error" | "info", text }
  // The models the saved keys unlock: { state: "idle" | "loading" | "ready" | "error", models, unavailable, error }
  const [catalog, setCatalog] = useState({ state: "idle", models: [], unavailable: [], error: null });
  const [chatChoice, setChatChoice] = useState(() => readChatModel(userKey)); // { id, name, provider }
  const modelsRequest = useRef(null);
  const keySelectRef = useRef(null);
  const modelSelectRef = useRef(null);

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

  // From an event (save, remove, Try again): show the loading state, then ask.
  const loadModels = useCallback(() => {
    setCatalog((current) => ({ ...current, state: "loading", error: null }));
    return fetchModels();
  }, [fetchModels]);

  useEffect(() => () => modelsRequest.current?.abort(), []);

  // Another user signed in on this device: their own choice.
  const [choiceFor, setChoiceFor] = useState(userKey);
  if (choiceFor !== userKey) {
    setChoiceFor(userKey);
    setChatChoice(readChatModel(userKey));
  }

  // State is only set once the server answers.
  const load = useCallback(
    (signal) =>
      listApiKeys({ signal }).then(
        (list) => {
          setKeys(list);
          setLoadError(null);
          // The models of the saved keys (later changes reload from their own events).
          // The catalog starts "idle", which already reads as loading.
          if (list.length > 0) fetchModels();
          if (linkedProvider) setForm(linkedProvider);
        },
        (err) => {
          if (signal?.aborted || err?.name === "CanceledError") return;
          setLoadError(err.message);
        }
      ),
    [fetchModels, linkedProvider]
  );

  useEffect(() => {
    const controller = new AbortController();
    load(controller.signal);
    return () => controller.abort();
  }, [load]);

  // Focus a dropdown once the key form or the dialog is gone (after that render).
  const refocus = useRef(null); // the ref to focus next
  function focusLater(ref) {
    refocus.current = ref;
  }
  useEffect(() => {
    if (!refocus.current || removing) return;
    const ref = refocus.current;
    refocus.current = null;
    ref.current?.focus();
  });

  function saved(provider, data) {
    setKeys((list) => [...(list ?? []).filter((item) => item.provider !== provider.id), data]);
    setForm(null);
    setNotice({ kind: "success", text: t("Key saved. {provider} accepted it.", { provider: provider.name }) });
    // Its models are loaded next: choose one in Chat model.
    focusLater(modelSelectRef);
    // A new or replaced key may unlock other models: ask again.
    loadModels();
  }

  function cancelForm() {
    setForm(null);
    focusLater(keySelectRef);
  }

  function chooseKeyProvider(id) {
    setKeyProvider(id);
    setForm(null);
    setNotice(null);
  }

  function chooseChatModel(model) {
    const choice = { id: model.id, name: model.name || model.id, provider: model.provider || "" };
    writeChatModel(userKey, choice);
    setChatChoice(choice);
  }

  function act(action, providerId) {
    setNotice(null);
    if (action === "remove") setRemoving(providerId);
    else setForm(providerId);
  }

  async function confirmRemove() {
    const provider = PROVIDERS.find((item) => item.id === removing);
    setRemoving(null);
    setForm(null);
    setNotice({ kind: "info", text: t("Removing the key…") });
    try {
      await deleteApiKey(provider.id);
      setKeys((list) => (list ?? []).filter((item) => item.provider !== provider.id));
      setCatalog((current) => ({
        ...current,
        models: current.models.filter((item) => item.provider !== provider.id),
        unavailable: current.unavailable.filter((item) => item.provider !== provider.id),
      }));
      setNotice({ kind: "success", text: t("The {provider} key was removed. Its models are no longer offered in the chat.", { provider: provider.name }) });
    } catch (err) {
      setNotice({ kind: "error", text: err.message });
    }
    focusLater(keySelectRef);
  }

  // The key the chat uses now: its model's provider (none while the chat uses Lectra).
  const inUseProvider = PROVIDERS.some((item) => item.id === chatChoice.provider) ? chatChoice.provider : null;
  // Until the student picks one, the API key dropdown shows the key in use, else the
  // first saved key, else the first provider.
  const keyProvider =
    pickedProvider ??
    (inUseProvider && keys?.some((item) => item.provider === inUseProvider) ? inUseProvider : null) ??
    PROVIDERS.find((item) => keys?.some((key) => key.provider === item.id))?.id ??
    PROVIDERS[0].id;

  const formProvider = PROVIDERS.find((item) => item.id === form) ?? null;
  const removingProvider = PROVIDERS.find((item) => item.id === removing) ?? null;

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

      {keys && (
        <>
          <KeyRow
            keys={keys}
            catalog={catalog}
            provider={keyProvider}
            inUse={inUseProvider}
            notice={notice}
            onProvider={chooseKeyProvider}
            onAction={act}
            selectRef={keySelectRef}
          >
            {formProvider && (
              <KeyForm
                key={formProvider.id}
                provider={formProvider}
                saved={keys.find((item) => item.provider === formProvider.id) ?? null}
                onSaved={(data) => saved(formProvider, data)}
                onCancel={cancelForm}
              />
            )}
          </KeyRow>
          <ModelDropdown
            keys={keys}
            catalog={catalog}
            selected={chatChoice}
            onChoose={chooseChatModel}
            onRetry={loadModels}
            selectRef={modelSelectRef}
          />
        </>
      )}

      {removingProvider && (
        <ConfirmDialog
          title={t("Remove the {provider} API key?", { provider: removingProvider.name })}
          confirmLabel={t("Remove key")}
          danger
          onConfirm={confirmRemove}
          onCancel={() => {
            setRemoving(null);
            focusLater(keySelectRef);
          }}
        >
          <p>{t("Its models are no longer offered in the chat. You can add a key again at any time.")}</p>
        </ConfirmDialog>
      )}
    </>
  );
}

/*
  "API key": choose a provider, then add its key, or replace or remove the saved one.
  The key form (children) opens under it. Server messages never contain a key.
*/
function KeyRow({ keys, catalog, provider, inUse, notice, onProvider, onAction, selectRef, children }) {
  const { t } = useI18n();
  const selectId = useId();
  const statusId = useId();
  const current = PROVIDERS.find((item) => item.id === provider) ?? PROVIDERS[0];
  const key = keys.find((item) => item.provider === current.id) ?? null;
  const problem = catalog.unavailable.find((item) => item.provider === current.id) ?? null;

  return (
    <div className="settings__row settings__row--model">
      <div className="settings__model-head">
        <div>
          <label className="settings__label" htmlFor={selectId}>
            {t("API key")}
          </label>
          <p className="settings__help">{t("Add, replace or remove the key for each provider.")}</p>
        </div>
        <select
          ref={selectRef}
          id={selectId}
          className="settings__select settings__model-select"
          value={current.id}
          aria-describedby={statusId}
          onChange={(event) => onProvider(event.target.value)}
        >
          {PROVIDERS.map((item) => {
            const saved = keys.find((entry) => entry.provider === item.id);
            const label = saved
              ? t("{provider} · key ends in {last4}", { provider: item.name, last4: saved.key_last4 })
              : t("{provider} · no key", { provider: item.name });
            return (
              <option key={item.id} value={item.id}>
                {saved && item.id === inUse ? t("{key} · in use", { key: label }) : label}
              </option>
            );
          })}
        </select>
      </div>

      <div id={statusId} className="settings__model-notes">
        {key ? (
          <p className={`settings__key-status settings__key-status--${problem ? "error" : "success"}`}>
            {problem
              ? t("Saved key ending in {last4} isn't working.", { last4: key.key_last4 })
              : t("Key saved, ending in {last4}.", { last4: key.key_last4 })}
            {current.id === inUse && ` ${t("The chat uses this key now.")}`}
          </p>
        ) : (
          <p className="settings__help">{t("No {provider} key saved.", { provider: current.name })}</p>
        )}
        <div className="settings__key-actions">
          {key ? (
            <>
              <Button size="sm" onClick={() => onAction("replace", current.id)}>
                {t("Replace key")}
              </Button>
              <Button size="sm" variant="ghost" onClick={() => onAction("remove", current.id)}>
                {t("Remove key")}
              </Button>
            </>
          ) : (
            <Button size="sm" variant="primary" icon="plus" onClick={() => onAction("add", current.id)}>
              {t("Add key")}
            </Button>
          )}
        </div>
        {notice && (
          <p className={`settings__key-status settings__key-status--${notice.kind}`} role={notice.kind === "error" ? "alert" : "status"}>
            {notice.text}
          </p>
        )}
      </div>

      {children}
    </div>
  );
}

/*
  "Chat model": Lectra, then the models of each provider with a saved key. A provider
  without a key is not listed (its key is added under API key).
*/
function ModelDropdown({ keys, catalog, selected, onChoose, onRetry, selectRef }) {
  const { t } = useI18n();
  const selectId = useId();
  const noteId = useId();
  const own = catalog.models.filter((item) => item.provider !== DEFAULT_MODEL_ID);
  const lectra = catalog.models.find((item) => item.id === DEFAULT_MODEL_ID) ?? { id: DEFAULT_MODEL_ID, provider: DEFAULT_MODEL_ID, name: "Lectra" };
  const hasKeys = keys.length > 0;
  const loading = hasKeys && (catalog.state === "idle" || catalog.state === "loading");

  const groups = PROVIDERS.map((provider) => {
    const key = keys.find((item) => item.provider === provider.id) ?? null;
    const models = own.filter((item) => item.provider === provider.id);
    const problem = catalog.unavailable.find((item) => item.provider === provider.id) ?? null;
    let state = "models";
    if (!key) state = "add";
    else if (models.length > 0) state = "models";
    else if (loading) state = "loading";
    else if (problem) state = "broken";
    else if (catalog.state === "error") state = "error";
    else state = "empty";
    return { ...provider, key, models, problem, state };
  });

  const isOwn = selected.id !== DEFAULT_MODEL_ID;
  const listed = !isOwn || own.some((item) => item.id === selected.id);
  // A chosen model the keys can't use (any more): shown, but not as usable.
  const selectedMissing = isOwn && !listed && !loading;
  const selectedProvider = PROVIDERS.find((item) => item.id === selected.provider)?.name ?? selected.provider;
  const problems = groups.filter((group) => group.state === "broken");
  const canRetry = hasKeys && !loading && (catalog.state === "error" || problems.length > 0 || groups.some((group) => group.state === "empty"));

  function change(event) {
    const model = [lectra, ...own].find((item) => item.id === event.target.value);
    if (model) onChoose(model);
  }

  return (
    <div className="settings__row settings__row--model">
      <div className="settings__model-head">
        <div>
          <label className="settings__label" htmlFor={selectId}>
            {t("Chat model")}
          </label>
          <p className="settings__help">
            {hasKeys
              ? t("The model that answers in the chat.")
              : t("The model that answers in the chat. Add an API key above to use Claude, Gemini or GPT models.")}
          </p>
        </div>
        <select
          ref={selectRef}
          id={selectId}
          className="settings__select settings__model-select"
          value={selected.id}
          aria-describedby={noteId}
          onChange={change}
        >
          {selectedMissing && (
            <option value={selected.id} disabled>
              {t("{model} (not available)", { model: selected.name })}
            </option>
          )}
          <optgroup label="LECTRA">
            <option value={lectra.id}>{t("Lectra (default)")}</option>
          </optgroup>
          {groups
            .filter((group) => group.key)
            .map((group) => (
              <optgroup key={group.id} label={group.name}>
                {group.state === "models" &&
                  group.models.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name}
                    </option>
                  ))}
                {group.state === "broken" && <option disabled>{t("Key not working")}</option>}
                {group.state === "loading" && <option disabled>{t("Loading models…")}</option>}
                {group.state === "error" && <option disabled>{t("Models not loaded")}</option>}
                {group.state === "empty" && <option disabled>{t("No models available")}</option>}
              </optgroup>
            ))}
        </select>
      </div>

      <div id={noteId} className="settings__model-notes">
        {selectedMissing ? (
          <p className="settings__key-status settings__key-status--error" role="alert">
            {t("{model} can't be used any more. Choose another model.", { model: selected.name })}
          </p>
        ) : (
          <p className="settings__help">
            {isOwn
              ? t("Chat model: {model} · {provider}", { model: selected.name, provider: selectedProvider })
              : t("Chat model: Lectra · LECTRA's own models")}
          </p>
        )}
        {loading && <p className="settings__help">{t("Loading the models available with your keys…")}</p>}
        {problems.map((group) => (
          <p key={group.id} className="settings__key-status settings__key-status--error">
            {`${group.name}: ${group.problem.message}`}
          </p>
        ))}
        {hasKeys && catalog.state === "error" && <p className="settings__key-status settings__key-status--error">{catalog.error}</p>}
        {groups
          .filter((group) => group.state === "empty")
          .map((group) => (
            <p key={group.id} className="settings__key-status settings__key-status--error">
              {t("{provider} offers no chat models LECTRA can use with this key.", { provider: group.name })}
            </p>
          ))}
        {canRetry && (
          <p>
            <button type="button" className="settings__key-retry" onClick={onRetry}>
              {t("Try again")}
            </button>
          </p>
        )}
      </div>
    </div>
  );
}

/* The key form for one provider (add, or replace the saved key). */
function KeyForm({ provider, saved, onSaved, onCancel }) {
  const { t } = useI18n();
  const inputId = useId();
  const helpId = useId();
  const [value, setValue] = useState("");
  const [visible, setVisible] = useState(false);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState(null); // { kind, text }
  const inputRef = useRef(null);

  useEffect(() => {
    inputRef.current?.scrollIntoView?.({ block: "center" });
    inputRef.current?.focus({ preventScroll: true });
  }, []);

  async function save(event) {
    event.preventDefault();
    const key = value.trim();
    if (!key) {
      setStatus({ kind: "error", text: t("Enter your API key first.") });
      return;
    }
    if (/\s/.test(key)) {
      setStatus({ kind: "error", text: t("An API key has no spaces. Check that you copied the whole key and nothing else.") });
      return;
    }
    setBusy(true);
    setStatus({ kind: "info", text: t("Checking the key with {provider}…", { provider: provider.name }) });
    try {
      const data = await saveApiKey(provider.id, key);
      setValue("");
      onSaved(data);
    } catch (err) {
      // The server's message never contains the key.
      setStatus({ kind: "error", text: err.message });
      setBusy(false);
    }
  }

  return (
    <form className="settings__key-form" onSubmit={save} autoComplete="off">
      <label className="settings__label" htmlFor={inputId}>
        {t("{provider} API key", { provider: provider.name })}
      </label>
      <p className="settings__help" id={helpId}>
        {saved
          ? t("Replaces the saved key ending in {last4}.", { last4: saved.key_last4 })
          : t("Create a key in your {provider} account:", { provider: provider.name })}{" "}
        {!saved && (
          <a href={provider.consoleUrl} target="_blank" rel="noreferrer noopener">
            {provider.consoleUrl.replace(/^https:\/\//, "")}
          </a>
        )}
      </p>
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
          disabled={busy}
          aria-describedby={helpId}
          onKeyDown={(event) => {
            if (event.key === "Escape" && !busy) {
              event.stopPropagation();
              onCancel();
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
        <Button type="submit" variant="primary" size="sm" disabled={busy}>
          {busy ? t("Checking…") : t("Save key")}
        </Button>
        <Button size="sm" variant="ghost" onClick={onCancel} disabled={busy}>
          {t("Cancel")}
        </Button>
      </div>
      {status && (
        <p className={`settings__key-status settings__key-status--${status.kind}`} role={status.kind === "error" ? "alert" : "status"}>
          {status.text}
        </p>
      )}
    </form>
  );
}
