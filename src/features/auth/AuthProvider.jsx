import { useCallback, useEffect, useMemo, useState } from "react";

import { AUTH_EXPIRED_EVENT, AUTH_TOKEN_KEY, getAuthToken, getTokenExpiry, isTokenExpired } from "../../api/client.js";
import * as authApi from "../../api/services/auth.js";
import { AuthContext } from "./authContext.js";

/* Starting state, read once from the saved token. An expired token is dropped right away. */
function initialSession() {
  const token = getAuthToken();
  if (!token) return { status: "guest", signOutReason: null };
  if (isTokenExpired(token)) {
    authApi.logout();
    return { status: "guest", signOutReason: "expired" };
  }
  return { status: "loading", signOutReason: null };
}

// setTimeout can't wait longer than ~24.8 days.
const MAX_TIMEOUT_MS = 2 ** 31 - 1;

/*
  Owns the signed-in session:
  - on start, turns a saved token into a user via GET /api/auth/user
  - signs the user out when the token expires, when the backend rejects it,
    or when they sign out in another tab
*/
export default function AuthProvider({ children }) {
  const [session, setSession] = useState(initialSession);
  const [user, setUser] = useState(null);

  const endSession = useCallback((signOutReason = null) => {
    authApi.logout();
    setUser(null);
    setSession({ status: "guest", signOutReason });
  }, []);

  // Restore the session from a saved token.
  useEffect(() => {
    if (!getAuthToken()) return undefined;
    const controller = new AbortController();
    authApi.getCurrentUser({ signal: controller.signal }).then(
      (currentUser) => {
        setUser(currentUser);
        setSession({ status: "authenticated", signOutReason: null });
      },
      (error) => {
        if (controller.signal.aborted) return;
        endSession(error.status === 401 ? "expired" : null);
      }
    );
    return () => controller.abort();
  }, [endSession]);

  // The API client fires this when a request comes back 401 with our token.
  useEffect(() => {
    const onExpired = () => endSession("expired");
    window.addEventListener(AUTH_EXPIRED_EVENT, onExpired);
    return () => window.removeEventListener(AUTH_EXPIRED_EVENT, onExpired);
  }, [endSession]);

  // Signing out in another tab removes the token there; follow it here.
  useEffect(() => {
    const onStorage = (event) => {
      if (event.key === AUTH_TOKEN_KEY && !event.newValue) endSession(null);
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [endSession]);

  // Sign out the moment the token's `exp` time is reached.
  useEffect(() => {
    if (session.status !== "authenticated") return undefined;
    const expiry = getTokenExpiry(getAuthToken());
    if (expiry === null) return undefined;
    const timer = setTimeout(() => endSession("expired"), Math.min(expiry - Date.now(), MAX_TIMEOUT_MS));
    return () => clearTimeout(timer);
  }, [session.status, endSession]);

  const login = useCallback(async ({ email, password }) => {
    await authApi.login({ email, password });
    try {
      const currentUser = await authApi.getCurrentUser();
      setUser(currentUser);
      setSession({ status: "authenticated", signOutReason: null });
      return currentUser;
    } catch (error) {
      authApi.logout();
      throw error;
    }
  }, []);

  const logout = useCallback(() => endSession(null), [endSession]);

  const value = useMemo(
    () => ({ ...session, user, login, register: authApi.register, logout }),
    [session, user, login, logout]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
