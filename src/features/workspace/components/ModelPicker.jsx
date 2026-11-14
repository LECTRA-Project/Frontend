import { useEffect, useId, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";

import Button from "../../../components/ui/Button.jsx";
import Icon from "../../../components/ui/Icon.jsx";
import Modal from "../../../components/ui/Modal.jsx";
import { useI18n } from "../../../i18n/i18n.js";
import { PROVIDERS, providerName } from "../../profile/providers.js";

/*
  The model button beside the message box (it only shows the current model), and the
  dialog it opens.

  The dialog lists Lectra (always) and, per provider with a saved key, the models the
  backend says it can call with that key (GET /users/me/models). Choosing applies to the
  next question. A provider without a usable key is not selectable: it is listed as locked
  (no key yet) or unavailable (its key failed, with the backend's message), and opening it
  goes straight to that provider's row in Account settings (/settings#api-key-<provider>).
  From there "Back to the chat" returns to this chat with the dialog open again.

  Props:
    model     what useChatModel() returns
    disabled  true while the chat can't be used
*/
function apiKeyHref(provider) {
  return `/settings#api-key-${provider}`;
}

export default function ModelPicker({ model, disabled = false }) {
  const { t } = useI18n();
  const location = useLocation();
  const navigate = useNavigate();
  // Back from Account settings ("Back to the chat"): open the dialog again.
  const [open, setOpen] = useState(() => Boolean(location.state?.openModelPicker));
  const { selected, missing } = model;

  // Forget that request, so a reload or Back doesn't open the dialog again.
  useEffect(() => {
    if (location.state?.openModelPicker) navigate(`${location.pathname}${location.search}`, { replace: true, state: null });
  }, [location, navigate]);

  function openPicker() {
    setOpen(true);
    model.refresh(); // a key may have been added or removed since the list was loaded
  }

  return (
    <>
      <button
        type="button"
        className={`composer__model ${missing ? "composer__model--missing" : ""}`}
        onClick={openPicker}
        disabled={disabled}
        aria-haspopup="dialog"
        aria-label={t("Model: {name}. Choose a model", { name: selected.name })}
        title={missing ? t("{name} isn't available right now", { name: selected.name }) : t("Choose a model")}
      >
        {missing && <Icon name="alert" size={15} />}
        <span>{selected.name}</span>
        <Icon name="chevronDown" size={15} />
      </button>
      {open && <ModelDialog model={model} returnTo={`${location.pathname}${location.search}`} onClose={() => setOpen(false)} />}
    </>
  );
}

function ModelDialog({ model, returnTo, onClose }) {
  const { t } = useI18n();
  const groupName = useId();
  const { selected, models, unavailable, loading, error, missing } = model;
  const lectra = models?.find((item) => item.provider === "lectra") ?? { id: "lectra", provider: "lectra", name: "Lectra" };
  const own = (models ?? []).filter((item) => item.provider !== "lectra");
  const providers = [...new Set(own.map((item) => item.provider))];
  // Once the list is loaded: providers without a usable key (none saved, or the saved one failed).
  const failed = new Map(unavailable.map((item) => [item.provider, item.message]));
  const locked = Array.isArray(models)
    ? PROVIDERS.filter((provider) => !providers.includes(provider.id)).map((provider) => ({
        ...provider,
        message: failed.get(provider.id) ?? null,
      }))
    : [];

  function choose(option) {
    model.select(option);
  }

  return (
    <Modal title={t("Choose a model")} onClose={onClose} width={480} className="model-picker">
      <div className="model-picker__body">
        <p className="model-picker__intro">{t("Your next question is answered by the model you choose here.")}</p>

        {missing && (
          <p className="model-picker__alert" role="alert">
            {t("{name} isn't available right now. Choose another model, or check your API key in Account settings.", {
              name: selected.name,
            })}
          </p>
        )}

        <fieldset className="model-picker__group">
          <legend className="model-picker__legend">LECTRA</legend>
          <ModelOption
            option={lectra}
            name={groupName}
            checked={selected.id === lectra.id}
            onChoose={choose}
            help={t("LECTRA's own models. Used unless you choose another one.")}
          />
        </fieldset>

        {providers.map((provider) => (
          <fieldset key={provider} className="model-picker__group">
            <legend className="model-picker__legend">{providerName(provider)}</legend>
            <div className="model-picker__list">
              {own
                .filter((item) => item.provider === provider)
                .map((option) => (
                  <ModelOption
                    key={option.id}
                    option={option}
                    name={groupName}
                    checked={selected.id === option.id}
                    onChoose={choose}
                  />
                ))}
            </div>
          </fieldset>
        ))}

        {loading && !models && (
          <p className="model-picker__note" role="status">
            {t("Loading your models…")}
          </p>
        )}
        {error && (
          <div className="model-picker__note" role="alert">
            <p>{error}</p>
            <button type="button" className="cf-link-button" onClick={model.refresh}>
              {t("Try again")}
            </button>
          </div>
        )}

        {locked.length > 0 && (
          <div className="model-picker__group">
            <p className="model-picker__legend">{t("Needs an API key")}</p>
            <ul className="model-picker__list model-picker__locked-list">
              {locked.map((provider) => (
                <li key={provider.id}>
                  <Link
                    className="model-picker__locked"
                    to={apiKeyHref(provider.id)}
                    state={{ returnTo }}
                    aria-label={
                      provider.message
                        ? t("{provider} is unavailable: {message}. Check its API key in Account settings", {
                            provider: provider.name,
                            message: provider.message,
                          })
                        : t("Add a {provider} API key in Account settings", { provider: provider.name })
                    }
                  >
                    <Icon name={provider.message ? "alert" : "lock"} size={15} />
                    <span className="model-picker__option-text">
                      <span className="model-picker__option-name">{provider.name}</span>
                      <span className="model-picker__option-help">
                        {provider.message ?? t("Add an API key in Account settings")}
                      </span>
                    </span>
                    <Icon name="chevronRight" size={16} />
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
      <div className="model-picker__actions">
        <Button variant="primary" onClick={onClose}>
          {t("Done")}
        </Button>
      </div>
    </Modal>
  );
}

function ModelOption({ option, name, checked, onChoose, help }) {
  return (
    <label className={`model-picker__option ${checked ? "model-picker__option--checked" : ""}`}>
      <input type="radio" name={name} checked={checked} onChange={() => onChoose(option)} />
      <span className="model-picker__option-text">
        <span className="model-picker__option-name">{option.name}</span>
        {help && <span className="model-picker__option-help">{help}</span>}
      </span>
      {checked && <Icon name="check" size={16} />}
    </label>
  );
}
