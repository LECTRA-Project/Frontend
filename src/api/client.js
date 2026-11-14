import axios from "axios";

import { t } from "../i18n/i18n.js";

/*
  API CLIENT — the one axios instance every request in the app goes through.

  Requests go straight to the backend named by VITE_API_PROXY_TARGET (see .env), e.g.
  https://taskgeneration.onrender.com + VITE_API_BASE_URL ("/api" by default). The
  backend must allow this site's origin in its CORS settings.
  An absolute VITE_API_BASE_URL is used as is; with no target set, requests stay
  relative ("/api") and the Vite dev proxy forwards them (vite.config.js).
*/
const env = import.meta.env ?? {};

export function resolveApiBaseUrl({ VITE_API_BASE_URL: base, VITE_API_PROXY_TARGET: target } = {}) {
  const path = base || "/api";
  if (/^https?:\/\//i.test(path)) return path.replace(/\/+$/, "");
  const origin = (target || "").trim().replace(/\/+$/, "");
  return origin ? `${origin}/${path.replace(/^\/+/, "")}` : path;
}

export const API_BASE_URL = env.MODE === "test" ? "/api" : resolveApiBaseUrl(env);

export const AUTH_TOKEN_KEY = "lectra.authToken";
export const REFRESH_TOKEN_KEY = "lectra.refreshToken";

// Fired on `window` when the session can't be renewed any more; AuthProvider signs the user out.
export const AUTH_EXPIRED_EVENT = "lectra:auth-expired";
// Fired on `window` after a new access token was saved; AuthProvider re-arms its refresh timer.
export const AUTH_REFRESHED_EVENT = "lectra:auth-refreshed";

export const apiClient = axios.create({
  baseURL: API_BASE_URL,
  timeout: Number(env.VITE_API_TIMEOUT_MS) || 15000,
  headers: {
    "Content-Type": "application/json",
    Accept: "application/json",
  },
});

/* ---- Auth token storage (localStorage in the browser, no-op in Node) ---- */

function storage() {
  try {
    return typeof window !== "undefined" ? window.localStorage : null;
  } catch {
    return null;
  }
}

export function getAuthToken() {
  return storage()?.getItem(AUTH_TOKEN_KEY) ?? null;
}

export function setAuthToken(token) {
  const store = storage();
  if (!store) return;
  if (token) store.setItem(AUTH_TOKEN_KEY, token);
  else store.removeItem(AUTH_TOKEN_KEY);
}

export function getRefreshToken() {
  return storage()?.getItem(REFRESH_TOKEN_KEY) ?? null;
}

export function setRefreshToken(token) {
  const store = storage();
  if (!store) return;
  if (token) store.setItem(REFRESH_TOKEN_KEY, token);
  else store.removeItem(REFRESH_TOKEN_KEY);
}

/* Saves both tokens from a { token, refresh_token } response; clearSession() drops both. */
export function saveSession({ token, refresh_token: refreshToken } = {}) {
  setAuthToken(token);
  if (refreshToken) setRefreshToken(refreshToken);
}

export function clearSession() {
  setAuthToken(null);
  setRefreshToken(null);
}

/* Expiry time of a JWT in milliseconds (from its `exp` claim), or null if unreadable. */
export function getTokenExpiry(token) {
  try {
    const payload = token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
    const { exp } = JSON.parse(atob(payload));
    return typeof exp === "number" ? exp * 1000 : null;
  } catch {
    return null;
  }
}

export function isTokenExpired(token, now = Date.now()) {
  const expiry = getTokenExpiry(token);
  return expiry !== null && expiry <= now;
}

/* ---- Request interceptor: attach the bearer token if we have one ---- */

apiClient.interceptors.request.use((config) => {
  const token = getAuthToken();
  if (token && !config.skipAuth) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

/* ---- Session refresh ---- */

/*
  Swaps the saved refresh token for a new token pair (POST /auth/refresh).
  Concurrent callers share one request, so a burst of 401s triggers a single refresh.

  Resolves with the new access token. Rejects with the ApiError; a 401 there means the
  session is really over (refresh token expired or revoked), anything else (network,
  timeout, 5xx) is temporary and the session is kept.
*/
let refreshing = null;

export function refreshSession() {
  if (refreshing) return refreshing;
  const refreshToken = getRefreshToken();
  if (!refreshToken) {
    expireSession();
    return Promise.reject(
      new ApiError({
        message: t("Your session has expired. Please sign in again."),
        status: 401,
      }),
    );
  }
  refreshing = apiClient
    .post("/auth/refresh", { refresh_token: refreshToken }, { skipAuth: true, skipAuthRefresh: true })
    .then((response) => {
      saveSession(response.data.data);
      if (typeof window !== "undefined") window.dispatchEvent(new Event(AUTH_REFRESHED_EVENT));
      return response.data.data.token;
    })
    .catch((error) => {
      if (error?.status === 401) expireSession();
      throw error;
    })
    .finally(() => {
      refreshing = null;
    });
  return refreshing;
}

function expireSession() {
  clearSession();
  if (typeof window !== "undefined") window.dispatchEvent(new Event(AUTH_EXPIRED_EVENT));
}

/* ---- Response interceptor: normalise every failure into an ApiError ---- */

export class ApiError extends Error {
  constructor({ message, status = null, data = null, code = null, fieldErrors = {} }) {
    super(message);
    this.name = "ApiError";
    this.status = status; // HTTP status, or null for network / timeout errors
    this.data = data; // response body from the server, if any
    this.code = code; // axios error code, e.g. "ECONNABORTED", "ERR_NETWORK"
    this.fieldErrors = fieldErrors; // { email: "…", password: "…" } from FastAPI 422 responses
  }
}

/*
  The backend answers with either { status: false, message } or FastAPI's { detail },
  where detail is a string or a list of { loc: ["body", "<field>"], msg }.
*/
function readServerError(data) {
  const fieldErrors = {};
  let message = data?.message;

  if (typeof data?.detail === "string") {
    message ||= data.detail;
  } else if (Array.isArray(data?.detail)) {
    for (const item of data.detail) {
      const field = item.loc?.[item.loc.length - 1];
      if (typeof field === "string" && field !== "body" && !fieldErrors[field]) fieldErrors[field] = item.msg;
    }
    message ||= data.detail[0]?.msg;
  }

  return { message, fieldErrors };
}

apiClient.interceptors.response.use(
  (response) => response,
  async (error) => {
    if (axios.isCancel(error)) return Promise.reject(error);

    const status = error.response?.status ?? null;
    const config = error.config;

    // Our access token was rejected (usually: it expired). Renew the session with the
    // refresh token and replay the request once, so the user just carries on.
    // A 401 from a request without a token (e.g. wrong password on login) is just an error.
    const sentAuth = config?.headers?.Authorization;
    if (status === 401 && sentAuth && !config.skipAuthRefresh && !config.authRetried) {
      const current = getAuthToken();
      try {
        // Another request may already have renewed the token while this one was in flight.
        if (!current || sentAuth === `Bearer ${current}`) await refreshSession();
      } catch (refreshError) {
        // Refresh failed: a 401 has already ended the session (see refreshSession);
        // for a temporary failure, report the original request's error and stay signed in.
        if (refreshError?.status !== 401) return Promise.reject(refreshError);
        return Promise.reject(toApiError(error));
      }
      return apiClient({ ...config, authRetried: true });
    }

    // Retried and still rejected: the account is gone or the token is unusable.
    if (status === 401 && sentAuth && config.authRetried) expireSession();

    return Promise.reject(toApiError(error));
  },
);

function toApiError(error) {
  const status = error.response?.status ?? null;
  const data = error.response?.data ?? null;

  const server = readServerError(data);
  const message =
    server.message ||
    (error.code === "ECONNABORTED" && t("The request timed out.")) ||
    (!error.response && t("Can't reach the server. Check your connection.")) ||
    error.message ||
    t("Something went wrong.");

  return new ApiError({
    message,
    status,
    data,
    code: error.code ?? null,
    fieldErrors: server.fieldErrors,
  });
}
