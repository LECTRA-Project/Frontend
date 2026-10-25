import { get, post } from "../http.js";
import { setAuthToken } from "../client.js";

/*
  AUTH SERVICE — /api/auth endpoints of the FastAPI backend.

  Every response is wrapped as { status, message, data }; these functions return `data`.
  A user looks like { id, email, full_name, created_at, updated_at }.
*/

/* POST /auth/register → the new user (no token — sign in afterwards) */
export async function register({ email, password, fullName }) {
  const response = await post("/auth/register", { email, password, full_name: fullName });
  return response.data;
}

/* POST /auth/login → { token }. The token is saved and sent on every later request. */
export async function login({ email, password }) {
  const response = await post("/auth/login", { email, password });
  setAuthToken(response.data.token);
  return response.data;
}

/* GET /auth/user → the signed-in user (needs the token) */
export async function getCurrentUser({ signal } = {}) {
  const response = await get("/auth/user", { signal });
  return response.data;
}

export function logout() {
  setAuthToken(null);
}
