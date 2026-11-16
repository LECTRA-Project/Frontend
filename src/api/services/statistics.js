import { ApiError } from "../client.js";
import { t } from "../../i18n/i18n.js";
import { get } from "../http.js";

/*
  STATISTICS SERVICE — the signed-in student's own numbers for the Statistics page.
  Every route needs the bearer token and only counts the student's own data.

    GET /stats/completion    getCompletion    course completion per lecture

  Shapes (data of the { status, message, data } envelope):
    completion  { lectures: [{ lecture_id, title, source_type: "page" | "slide" | "cell" | null,
                               viewed, total, reading_percent,
                               best_exam_percent: number | null, completion_percent }],
                  overall_percent,
                  weights: { reading, exam } }
                Completion = weights.reading % of the pages read + weights.exam % of the
                best exam score. Lectures come least complete first; source_type null is an
                image (total 1: opened or not). best_exam_percent is null without a graded
                exam. overall_percent weighs every lecture by its pages.

  To add a route: one function below, built like getCompletion, and a line in the list above.
*/
const BASE = "/stats";

/* `fallback`: the message when the server gives none (translated by the caller). */
function unwrap(response, fallback) {
  if (response?.status !== true) {
    throw new ApiError({ message: response?.message || fallback, data: response });
  }
  return response.data;
}

export async function getCompletion({ signal } = {}) {
  return unwrap(await get(`${BASE}/completion`, { signal }), t("Unable to load your course completion."));
}
