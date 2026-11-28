import { ApiError } from "../client.js";
import { post } from "../http.js";
import { t } from "../../i18n/i18n.js";

/*
  Feedback from students about the app (backend: feedback/, LECTRA-Project/TaskGeneration#190).

    POST /feedback   sendFeedback   { tag, description, rating? } → 201 with the saved feedback

  The user comes from the token, never from the body. Admins read the feedback in the
  separate admin panel; the web app only sends it.

  Rules (the backend checks them too and answers 422 with { data: { errors: { field: message } } }):
    tag          one of FEEDBACK_TAGS
    description  trimmed, 1 to MAX_FEEDBACK_LENGTH characters
    rating       whole number 1 to 5, only with the tag "feedback" (optional)
*/
export const FEEDBACK_TAGS = ["bug", "idea", "feedback", "other"];
export const MAX_FEEDBACK_LENGTH = 5000;

export async function sendFeedback({ tag, description, rating = null }) {
  const body = { tag, description: description.trim() };
  // A rating only belongs to the tag "feedback" (the backend refuses it with any other).
  if (tag === "feedback" && rating) body.rating = rating;
  try {
    const response = await post("/feedback", body);
    if (response?.status !== true) {
      throw new ApiError({ message: response?.message || t("Your feedback could not be sent."), data: response });
    }
    return response.data;
  } catch (err) {
    // The backend's 422 lists each field's problem in data.errors: show them at the fields.
    const errors = err?.data?.data?.errors;
    if (err instanceof ApiError && errors && typeof errors === "object") {
      err.fieldErrors = { ...err.fieldErrors, ...errors };
    }
    throw err;
  }
}
