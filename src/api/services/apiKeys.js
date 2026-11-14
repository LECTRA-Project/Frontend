import { ApiError } from "../client.js";
import { del, get, put } from "../http.js";
import { t } from "../../i18n/i18n.js";

/*
  The student's own AI provider keys and the models they unlock (backend: users/routes.py).

    GET    /users/me/api-keys              listApiKeys
    PUT    /users/me/api-keys/{provider}   saveApiKey    (the backend checks the key with the provider first)
    DELETE /users/me/api-keys/{provider}   deleteApiKey
    GET    /users/me/models                listModels

  The key is only ever sent once, in the PUT body, over the API. The backend stores it
  encrypted and never returns it: a saved key is described by `key_last4` only. Nothing
  here keeps the key, logs it or puts it in a URL or an error message.

  Shapes:
    key     { provider: "anthropic" | "openai" | "gemini", name, key_last4, created_at, updated_at }
    models  { default: "lectra",
              models: [{ id: "lectra" | "<provider>:<model>", provider, model, name }],
              unavailable: [{ provider, name, message }] }
*/
const BASE = "/users/me";

// The provider is asked to check a key (or to list its models): allow a slow answer.
const PROVIDER_TIMEOUT_MS = 60000;

/* The providers a student can add a key for, in the backend's order. */
export const KEY_PROVIDERS = ["anthropic", "gemini", "openai"];

// The model the backend uses when none is chosen (our own providers).
export const DEFAULT_MODEL_ID = "lectra";

function unwrap(response, fallback) {
  if (response?.status !== true) {
    throw new ApiError({ message: response?.message || fallback, data: response });
  }
  return response.data;
}

export async function listApiKeys({ signal } = {}) {
  const data = unwrap(await get(`${BASE}/api-keys`, { signal }), t("Unable to load your API keys."));
  return data?.api_keys ?? [];
}

/* Saves (or replaces) the provider's key. Rejects when the provider refuses the key. */
export async function saveApiKey(provider, apiKey) {
  const response = await put(
    `${BASE}/api-keys/${encodeURIComponent(provider)}`,
    { api_key: apiKey.trim() },
    { timeout: PROVIDER_TIMEOUT_MS }
  );
  return unwrap(response, t("Unable to save the API key."));
}

export async function deleteApiKey(provider) {
  return unwrap(await del(`${BASE}/api-keys/${encodeURIComponent(provider)}`), t("Unable to remove the API key."));
}

export async function listModels({ signal } = {}) {
  const data = unwrap(await get(`${BASE}/models`, { signal, timeout: PROVIDER_TIMEOUT_MS }), t("Unable to load the models."));
  return {
    defaultId: data?.default || DEFAULT_MODEL_ID,
    models: Array.isArray(data?.models) ? data.models : [],
    unavailable: Array.isArray(data?.unavailable) ? data.unavailable : [],
  };
}
