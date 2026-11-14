/* Public entry point of the API layer: import from "src/api/index.js". */
export {
  apiClient,
  ApiError,
  API_BASE_URL,
  AUTH_EXPIRED_EVENT,
  AUTH_REFRESHED_EVENT,
  getAuthToken,
  setAuthToken,
  getRefreshToken,
  refreshSession,
  getTokenExpiry,
  isTokenExpired,
} from "./client.js";
export { get, post, put, patch, del } from "./http.js";
export { useApi } from "./useApi.js";
export * as authApi from "./services/auth.js";
export * as lecturesApi from "./services/lectures.js";
