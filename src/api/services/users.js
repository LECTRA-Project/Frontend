import { get, patch, put } from "../http.js";
import { ApiError } from "../client.js";
import { t } from "../../i18n/i18n.js";

/* `fallback`: the message when the server gives none (translated by the caller). */
function requireUser(response, fallback) {
  if (response?.status !== true || !response.data) {
    throw new ApiError({
      message: response?.message || fallback,
      data: response,
    });
  }
  return response.data;
}

/* GET /users/me → the signed-in user */
export async function getCurrentUser({ signal } = {}) {
  const response = await get("/users/me", { signal });
  return requireUser(response, t("Unable to load your profile."));
}

/* PATCH /users/me → the updated signed-in user */
export async function updateCurrentUser({ fullName, email }) {
  const body = {};
  if (fullName !== undefined) body.full_name = fullName;
  if (email !== undefined) body.email = email;

  const response = await patch("/users/me", body);
  return requireUser(response, t("Unable to update your profile."));
}

/* PUT /users/me/password → changes the signed-in user's password */
export async function changeCurrentPassword({ currentPassword, newPassword }) {
  const response = await put("/users/me/password", {
    current_password: currentPassword,
    new_password: newPassword,
  });
  if (response?.status !== true) {
    throw new ApiError({
      message: response?.message || t("Unable to change your password."),
      data: response,
    });
  }
  return response;
}
