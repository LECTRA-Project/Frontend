/*
  The student's preferred model per AI provider (Account settings → AI provider API keys).

  Kept like the other per-user preferences (interface language, chat model): in this
  browser's localStorage, keyed by the signed-in user's id, so another user on the same
  device never sees it. Only model ids are stored ("<provider>:<model>"), never a key.

    { anthropic: "anthropic:claude-…", gemini: "gemini:…", openai: "openai:…" }

  A preference is only a choice: whether the model can be used is always decided by the
  live list from GET /users/me/models.
*/
const KEY_PREFIX = "lectra:preferred-models:v1:";

/* The same per-user key the workspace uses for its preferences. */
export function preferenceUserKey(user) {
  return user?.id ?? user?.email ?? "signed-in-user";
}

export function readPreferredModels(userKey) {
  try {
    const saved = JSON.parse(localStorage.getItem(`${KEY_PREFIX}${userKey}`) ?? "null");
    if (!saved || typeof saved !== "object" || Array.isArray(saved)) return {};
    // Keep only "<provider>:<model>" ids that belong to their provider.
    return Object.fromEntries(
      Object.entries(saved).filter(
        ([provider, id]) => typeof id === "string" && id.startsWith(`${provider}:`) && id.length > provider.length + 1
      )
    );
  } catch {
    return {};
  }
}

/* Sets (modelId) or clears (null) the provider's preferred model; returns the new map. */
export function writePreferredModel(userKey, provider, modelId) {
  const next = { ...readPreferredModels(userKey) };
  if (modelId) next[provider] = modelId;
  else delete next[provider];
  try {
    if (Object.keys(next).length === 0) localStorage.removeItem(`${KEY_PREFIX}${userKey}`);
    else localStorage.setItem(`${KEY_PREFIX}${userKey}`, JSON.stringify(next));
  } catch {
    // Blocked storage: the choice still applies on this page.
  }
  return next;
}
