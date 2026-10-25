import axios from "axios";

/*
  API CLIENT — the one axios instance every request in the app goes through.

  Base URL comes from VITE_API_BASE_URL (see .env.example) and defaults to "/api".
  In development Vite proxies /api to the FastAPI backend (vite.config.js), so the
  browser never makes a cross-origin request and the backend needs no CORS setup.
*/
const env = import.meta.env ?? {};

export const API_BASE_URL = env.VITE_API_BASE_URL || "/api";

export const AUTH_TOKEN_KEY = "lectra.authToken";

// Fired on `window` when the backend rejects our token; AuthProvider signs the user out.
export const AUTH_EXPIRED_EVENT = "lectra:auth-expired";

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
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

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
  (error) => {
    if (axios.isCancel(error)) return Promise.reject(error);

    const status = error.response?.status ?? null;
    const data = error.response?.data ?? null;

    // Our token was rejected (expired / invalid): drop it and tell the app to sign out.
    // A 401 from a request without a token (e.g. wrong password on login) is just an error.
    if (status === 401 && error.config?.headers?.Authorization) {
      setAuthToken(null);
      if (typeof window !== "undefined") window.dispatchEvent(new Event(AUTH_EXPIRED_EVENT));
    }

    const server = readServerError(data);
    const message =
      server.message ||
      (error.code === "ECONNABORTED" && "The request timed out.") ||
      (!error.response && "Can't reach the server. Check your connection.") ||
      error.message ||
      "Something went wrong.";

    return Promise.reject(
      new ApiError({ message, status, data, code: error.code ?? null, fieldErrors: server.fieldErrors })
    );
  }
);
