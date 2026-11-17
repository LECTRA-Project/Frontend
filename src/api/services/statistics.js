import { ApiError } from "../client.js";
import { t } from "../../i18n/i18n.js";
import { get } from "../http.js";

/*
  STATISTICS SERVICE — the signed-in student's own numbers for the Statistics page.
  Every route needs the bearer token and only counts the student's own data.

    GET /stats/completion    getCompletion    course completion per lecture
    GET /stats/overview      getOverview      the overall numbers (the cards at the top)
    GET /stats/exams         getExamStats     exam performance and history (from / to optional)

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
    overview    { lectures, pages_read, pages_total, chats, questions_asked,
                  exams_taken, questions_answered,
                  average_score_percent: number | null, correct_percent: number | null,
                  study_days, current_streak, last_activity_at: ISO string | null,
                  changes: { exams, pages_read, questions_asked: { this_week, last_week },
                             average_score: { points, weeks } | null } }
                this_week is the last 7 UTC days (today included), last_week the 7 before;
                average_score.points is the average now minus before the last 4 weeks.
                Exams count once submitted; average_score_percent leaves out exams still
                waiting for a grade, correct_percent is the share of graded answers that
                are correct (both null without a graded answer). Activity is uploading,
                reading, asking in a chat or submitting an exam; days are UTC days, and
                current_streak ends today, or yesterday when nothing happened today yet.
                A new student gets zeros and nulls.
    exams       { exams_submitted, exams_scored, average_percent: number | null, best_percent: number | null,
                  history: [{ exam_id, title, submitted_at, lectures: [{ lecture_id | null, title }],
                              question_count, score_percent: number | null }],
                  by_week: [{ week_start: "YYYY-MM-DD", exams, average_percent }],
                  by_lecture: [{ lecture_id | null, title, exams, average_percent, best_percent }],
                  by_type: [{ type, questions, correct, correct_percent, points_percent: number | null }],
                  weakest_concepts: [{ concept, questions, correct, correct_percent, lecture_ids: [] }] }
                Only submitted exams count. history is newest first, by_week oldest first
                (weeks start on Monday, UTC), by_lecture lowest average first. score_percent
                is null while an answer waits to be graded (such exams are left out of the
                averages). A deleted lecture has lecture_id null and keeps its title.
                weakest_concepts: up to 5, each asked in at least 2 questions.
                from / to: inclusive UTC days ("YYYY-MM-DD"); from after to is a 422.

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

export async function getOverview({ signal } = {}) {
  return unwrap(await get(`${BASE}/overview`, { signal }), t("Unable to load your overall numbers."));
}

/* `from` / `to`: "YYYY-MM-DD" (inclusive UTC days), both optional. */
export async function getExamStats({ from, to, signal } = {}) {
  const params = {};
  if (from) params.from = from;
  if (to) params.to = to;
  return unwrap(await get(`${BASE}/exams`, { params, signal }), t("Unable to load your exam performance."));
}
