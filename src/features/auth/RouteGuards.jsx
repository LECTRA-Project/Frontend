import { Navigate, Outlet, useLocation } from "react-router-dom";

import { useAuth } from "./authContext.js";
import "./auth.css";

/*
  Route guards, used as layout routes in router.jsx.

  RequireAuth  pages for signed-in users only; guests go to sign-in, which sends them
               back to the page they asked for afterwards (or after their session
               expired). After a deliberate sign-out (signing out, changing the password)
               that page is not remembered, so signing in again opens a new chat.
  GuestOnly    sign-in / create-account; signed-in users go on to a new chat in the
               workspace (or the page they were sent away from).
*/
export function RequireAuth() {
  const { status, signOutReason } = useAuth();
  const location = useLocation();

  if (status === "loading") return <SessionLoading />;
  if (status !== "authenticated") {
    const remember = !signOutReason || signOutReason === "expired";
    return <Navigate to="/" replace state={remember ? { from: location } : null} />;
  }
  return <Outlet />;
}

export function GuestOnly() {
  const { status } = useAuth();
  const location = useLocation();

  if (status === "loading") return <SessionLoading />;
  if (status === "authenticated") {
    const from = location.state?.from;
    const target = from ? `${from.pathname}${from.search ?? ""}${from.hash ?? ""}` : "/workspace";
    return <Navigate to={target} replace />;
  }
  return <Outlet />;
}

function SessionLoading() {
  return (
    <main className="auth-page" aria-busy="true">
      <p className="auth-loading" role="status">
        Loading your workspace…
      </p>
    </main>
  );
}
