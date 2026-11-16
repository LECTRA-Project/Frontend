import { post } from "../http.js";
import { ApiError, clearSession, saveSession } from "../client.js";
import { t } from "../../i18n/i18n.js";

/*
  AUTH SERVICE — /api/auth endpoints of the FastAPI backend.

  Every response is wrapped as { status, message, data }; these functions return `data`.
  A user looks like { id, email, full_name, created_at, updated_at }.
*/

/* POST /auth/register → the new user (no token — sign in afterwards) */
export async function register({ email, password, fullName }) {
  const response = await post("/auth/register", {
    email,
    password,
    full_name: fullName,
  });
  return response.data;
}

/*
  POST /auth/login → { token, refresh_token }. Both are saved: the access token is sent on
  every request, the refresh token renews it when it expires (see refreshSession in client.js).
*/
export async function login({ email, password }) {
  const response = await post("/auth/login", { email, password });
  saveSession(response.data);
  return response.data;
}

/* POST /auth/forgot-password → a generic message, regardless of account existence */
export async function requestPasswordReset({ email }) {
  const response = await post("/auth/forgot-password", { email });
  if (response?.status !== true) {
    throw new ApiError({
      message: response?.message || t("Unable to send the password reset email."),
      data: response,
    });
  }
  return response;
}

/* POST /auth/reset-password → changes the password using a reset token */
export async function resetPassword({ token, newPassword }) {
  const response = await post("/auth/reset-password", {
    token,
    new_password: newPassword,
  });
  if (response?.status !== true) {
    throw new ApiError({
      message: response?.message || t("Unable to reset the password."),
      data: response,
    });
  }
  return response;
}

export function logout() {
  clearSession();
}
