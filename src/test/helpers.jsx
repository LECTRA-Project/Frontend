import { render } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import MockAdapter from "axios-mock-adapter";

import { apiClient, AUTH_TOKEN_KEY } from "../api/client.js";
import { routes } from "../app/router.jsx";
import AuthProvider from "../features/auth/AuthProvider.jsx";

/* Intercepts every request made through apiClient. Call .restore() after each test. */
export function mockApi() {
  return new MockAdapter(apiClient);
}

/* An unsigned JWT whose `exp` is `secondsFromNow` away (negative = already expired). */
export function makeToken(secondsFromNow = 1800) {
  const encode = (value) => btoa(JSON.stringify(value)).replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_");
  const exp = Math.floor(Date.now() / 1000) + secondsFromNow;
  return `${encode({ alg: "HS256", typ: "JWT" })}.${encode({ sub: "user-1", exp })}.signature`;
}

export function saveToken(token) {
  localStorage.setItem(AUTH_TOKEN_KEY, token);
}

export function savedToken() {
  return localStorage.getItem(AUTH_TOKEN_KEY);
}

export const TEST_USER = {
  id: "user-1",
  email: "ada@university.edu",
  full_name: "Ada Lovelace",
  created_at: "2026-10-25T16:29:23Z",
  updated_at: "2026-10-25T16:29:23Z",
};

/* Wraps a payload the way the backend does: { status, message, data }. */
export function ok(data, message = "OK") {
  return { status: true, message, data };
}

/* Renders the real app routes at `path`, inside the real AuthProvider. */
export function renderApp(path = "/") {
  const router = createMemoryRouter(routes, { initialEntries: [path] });
  const utils = render(
    <AuthProvider>
      <RouterProvider router={router} />
    </AuthProvider>
  );
  return { router, ...utils };
}
