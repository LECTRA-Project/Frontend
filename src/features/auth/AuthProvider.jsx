import { useCallback, useEffect, useMemo, useState } from "react";

import {
  AUTH_EXPIRED_EVENT,
  AUTH_REFRESHED_EVENT,
  AUTH_TOKEN_KEY,
  getAuthToken,
  getRefreshToken,
  getTokenExpiry,
  isTokenExpired,
  refreshSession,
} from "../../api/client.js";
import * as authApi from "../../api/services/auth.js";
import * as usersApi from "../../api/services/users.js";
import { AuthContext } from "./authContext.js";

/*
  Starting state, read once from the saved tokens. An expired access token is fine as long
  as there is a refresh token to renew it; without one the session is over.
*/
function initialSession() {
  const token = getAuthToken();
  const refreshToken = getRefreshToken();
  if (!token && !refreshToken) return { status: "guest", signOutReason: null };
  if ((!token || isTokenExpired(token)) && !refreshToken) {
    authApi.logout();
    return { status: "guest", signOutReason: "expired" };
  }
  return { status: "loading", signOutReason: null };
}

/* Gets a usable access token, renewing it first when it is missing or already expired. */
async function ensureFreshToken() {
  const token = getAuthToken();
  if (token && !isTokenExpired(token)) return token;
  return refreshSession();
}

// setTimeout can't wait longer than ~24.8 days.
const MAX_TIMEOUT_MS = 2 ** 31 - 1;
// Renew the access token this long before it expires, so requests never hit a dead token.
const REFRESH_AHEAD_MS = 60 * 1000;

/*
  Owns the signed-in session:
  - on start, turns a saved token into a user via GET /api/users/me
  - renews the access token with the refresh token shortly before it expires
    (and the API client renews it on any 401), so the user is not thrown out mid-work
  - signs the user out only when the session can't be renewed any more (refresh token
    expired or revoked), or when they sign out in another tab
*/
export default function AuthProvider({ children }) {
  const [session, setSession] = useState(initialSession);
  const [user, setUser] = useState(null);
  // Bumped whenever a new access token is saved (here or in another tab) to re-arm the timer.
  const [tokenVersion, setTokenVersion] = useState(0);

  const endSession = useCallback((signOutReason = null) => {
    authApi.logout();
    setUser(null);
    setSession({ status: "guest", signOutReason });
  }, []);

  // Restore the session from the saved tokens.
  useEffect(() => {
    if (!getAuthToken() && !getRefreshToken()) return undefined;
    const controller = new AbortController();
    ensureFreshToken()
      .then(() => usersApi.getCurrentUser({ signal: controller.signal }))
      .then(
        (currentUser) => {
          setUser(currentUser);
          setSession({ status: "authenticated", signOutReason: null });
        },
        (error) => {
          if (controller.signal.aborted) return;
          endSession(error.status === 401 ? "expired" : null);
        },
      );
    return () => controller.abort();
  }, [endSession]);

  // The API client fires these: the session could not be renewed / a new token was saved.
  useEffect(() => {
    const onExpired = () => endSession("expired");
    const onRefreshed = () => setTokenVersion((version) => version + 1);
    window.addEventListener(AUTH_EXPIRED_EVENT, onExpired);
    window.addEventListener(AUTH_REFRESHED_EVENT, onRefreshed);
    return () => {
      window.removeEventListener(AUTH_EXPIRED_EVENT, onExpired);
      window.removeEventListener(AUTH_REFRESHED_EVENT, onRefreshed);
    };
  }, [endSession]);

  // Signing out in another tab removes the token there; follow it here.
  // A token renewed in another tab is picked up too.
  useEffect(() => {
    const onStorage = (event) => {
      if (event.key !== AUTH_TOKEN_KEY) return;
      if (event.newValue) setTokenVersion((version) => version + 1);
      else endSession(null);
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [endSession]);

  // Renew the access token shortly before its `exp` time. If renewing fails for a
  // temporary reason (offline, server down), stay signed in: the next request retries it.
  useEffect(() => {
    if (session.status !== "authenticated") return undefined;
    const expiry = getTokenExpiry(getAuthToken());
    if (expiry === null) return undefined;
    const delay = Math.max(0, Math.min(expiry - REFRESH_AHEAD_MS - Date.now(), MAX_TIMEOUT_MS));
    const timer = setTimeout(() => refreshSession().catch(() => {}), delay);
    return () => clearTimeout(timer);
  }, [session.status, tokenVersion]);

  // Timers don't run while the laptop sleeps; check the token again when the tab comes back.
  useEffect(() => {
    if (session.status !== "authenticated") return undefined;
    const onVisible = () => {
      if (document.visibilityState !== "visible") return;
      const expiry = getTokenExpiry(getAuthToken());
      if (expiry !== null && expiry - REFRESH_AHEAD_MS <= Date.now()) refreshSession().catch(() => {});
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [session.status]);

  const login = useCallback(async ({ email, password }) => {
    await authApi.login({ email, password });
    try {
      const currentUser = await usersApi.getCurrentUser();
      setUser(currentUser);
      setSession({ status: "authenticated", signOutReason: null });
      return currentUser;
    } catch (error) {
      authApi.logout();
      throw error;
    }
  }, []);

  const logout = useCallback((signOutReason = null) => endSession(signOutReason), [endSession]);
  const updateUser = useCallback((updatedUser) => setUser(updatedUser), []);

  const value = useMemo(
    () => ({
      ...session,
      user,
      login,
      register: authApi.register,
      logout,
      updateUser,
    }),
    [session, user, login, logout, updateUser],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
