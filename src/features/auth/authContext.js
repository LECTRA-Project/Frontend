import { createContext, useContext } from "react";

/*
  Auth state shared by the whole app (provided by AuthProvider.jsx).

  status          "loading" (checking a saved token) | "authenticated" | "guest"
  user            { id, email, full_name, … } from GET /api/auth/user, or null
  signOutReason   "expired" when the session ended because the token ran out, else null
  login, register, logout
*/
export const AuthContext = createContext(null);

export function useAuth() {
  const auth = useContext(AuthContext);
  if (!auth) throw new Error("useAuth() must be used inside <AuthProvider>.");
  return auth;
}

/* "Ada Lovelace" → "AL", "ada" → "AD". Falls back to the email when there's no name. */
export function getInitials(user) {
  const source = (user?.full_name || user?.email || "").trim();
  const words = source.split(/[\s@._-]+/).filter(Boolean);
  if (words.length === 0) return "?";
  const letters = words.length > 1 ? words[0][0] + words[1][0] : words[0].slice(0, 2);
  return letters.toUpperCase();
}
