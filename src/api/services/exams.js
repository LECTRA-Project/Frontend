import { ApiError } from "../client.js";
import { t } from "../../i18n/i18n.js";
import { del, get, post } from "../http.js";

/*
  EXAMS SERVICE — exams generated from the student's own materials.

    POST   /exams          startExam     202, the exam with status "generating"
    GET    /exams/{id}     getExam       the exam and its questions (poll while generating)
    GET    /exams          listExams / listAllExams   the history, newest first
    DELETE /exams/{id}     deleteExam    discards an exam that wasn't submitted
    POST   /exams/{id}/submit   submitExam    hands in the answers and grades them
    POST   /exams/{id}/regrade  regradeExam   grades the answers that couldn't be graded yet

  Shapes (data of the { status, message, data } envelope):
    exam      { id, title, status: "generating" | "ready" | "failed" | "submitted",
                question_count, questions_ready, lectures: [{ lecture_id | null, title }],
                error, total_points, max_points, score_percent, questions_ungraded,
                created_at, updated_at, submitted_at }
    question  { id, position, type: "multiple_choice" | "short_answer", question,
                choices: [{ id, text }] | null, points, lecture_id, source_pages }
              No question carries its answer before the exam is submitted.
    result    (every question of a submitted exam)
              { answer_text, selected_choice_ids, answered, graded,
                verdict: "correct" | "partially_correct" | "incorrect" | null, points, max_points,
                feedback, scores: [{ criterion_id, description, points, max_points, justification }],
                corrected, correction_comment, correct_choice_ids, reference_solution,
                sources: [{ lecture_id | null, lecture_title, page_number,
                            source_type: "page" | "slide" | "cell", location: "Page 44" }] }
              graded false (verdict and points null): waiting to be graded again (regrade).
              lecture_id null: the lecture was deleted since.

  Errors when starting: 404 a lecture isn't the student's, 409 another exam is still being
  generated, 422 an invalid body or a lecture without readable text (the message names it).
  Errors when submitting: 409 the exam isn't ready or was already submitted, 422 an answer
  that doesn't fit its question. Regrading: 409 when nothing is left to grade.
*/
const BASE = "/exams";

export const QUESTION_COUNTS = [3, 5, 7, 10];
// `label` is a getter so it is read in the current interface language.
export const QUESTION_TYPES = [
  {
    value: "multiple_choice",
    get label() {
      return t("Multiple choice");
    },
  },
  {
    value: "short_answer",
    get label() {
      return t("Short answer");
    },
  },
];
// The longest short answer the backend accepts.
export const MAX_ANSWER_LENGTH = 4000;
// How often a generating exam is read again.
export const POLL_INTERVAL_MS = 2000;
// Starting saves the exam and returns at once, but a sleeping server takes a while to wake.
const START_TIMEOUT_MS = 60000;
const MAX_PAGE_SIZE = 100;
/*
  Submitting grades every answer before it responds: multiple choice at once, short answers
  by the LLM one after the other (a few seconds each, longer when a provider is slow).
*/
const GRADE_TIMEOUT_MS = 600000;

/* `fallback`: the message when the server gives none (translated by the caller). */
function unwrap(response, fallback) {
  if (response?.status !== true) {
    throw new ApiError({ message: response?.message || fallback, data: response });
  }
  return response.data;
}

/* Starts generating an exam; the questions are written afterwards (poll getExam). */
export async function startExam({ lectureIds, questionCount, types }, { signal } = {}) {
  const body = { lecture_ids: lectureIds, question_count: questionCount, types };
  return unwrap(await post(BASE, body, { timeout: START_TIMEOUT_MS, signal }), t("Unable to start the exam."));
}

export async function getExam(id, { signal } = {}) {
  return unwrap(await get(`${BASE}/${id}`, { signal }), t("Unable to load the exam."));
}

/* One page of the history: { exams, page, page_size, total, total_pages }. */
export async function listExams({ page = 1, pageSize = 20, signal } = {}) {
  return unwrap(await get(BASE, { params: { page, page_size: pageSize }, signal }), t("Unable to load your exams."));
}

export async function listAllExams({ signal } = {}) {
  const first = await listExams({ page: 1, pageSize: MAX_PAGE_SIZE, signal });
  const exams = [...first.exams];
  for (let page = 2; page <= first.total_pages; page += 1) {
    exams.push(...(await listExams({ page, pageSize: MAX_PAGE_SIZE, signal })).exams);
  }
  return exams;
}

/* Exams that can still be continued: being generated or ready to answer, newest first. */
export function isUnfinished(exam) {
  return exam.status === "generating" || exam.status === "ready";
}

export async function deleteExam(id) {
  return unwrap(await del(`${BASE}/${id}`), t("Unable to discard the exam."));
}

/*
  Hands in the answers and grades them: `answers` maps question ids to the chosen choice ids
  (multiple choice) or the text (short answer). Questions without an answer are left out
  and get 0 points. Returns the exam (without questions) with its points; read it again
  for the results.
*/
export async function submitExam(id, questions, answers) {
  const body = {
    answers: questions.flatMap((question) => {
      const answer = answers[question.id];
      if (question.type === "multiple_choice") {
        return Array.isArray(answer) && answer.length > 0 ? [{ task_id: question.id, selected_choice_ids: answer }] : [];
      }
      return typeof answer === "string" && answer.trim() !== "" ? [{ task_id: question.id, answer_text: answer }] : [];
    }),
  };
  return unwrap(await post(`${BASE}/${id}/submit`, body, { timeout: GRADE_TIMEOUT_MS }), t("Unable to submit the exam."));
}

/* Grades the answers of a submitted exam that couldn't be graded yet. */
export async function regradeExam(id) {
  return unwrap(await post(`${BASE}/${id}/regrade`, {}, { timeout: GRADE_TIMEOUT_MS }), t("Unable to grade the exam again."));
}
