import { ApiError } from "../client.js";
import { del, get, post } from "../http.js";

/*
  EXAMS SERVICE — exams generated from the student's own materials.

    POST   /exams          startExam     202, the exam with status "generating"
    GET    /exams/{id}     getExam       the exam and its questions (poll while generating)
    GET    /exams          listExams / listAllExams   the history, newest first
    DELETE /exams/{id}     deleteExam    discards an exam that wasn't submitted

  Shapes (data of the { status, message, data } envelope):
    exam      { id, title, status: "generating" | "ready" | "failed" | "submitted",
                question_count, questions_ready, lectures: [{ lecture_id | null, title }],
                error, total_points, max_points, score_percent, questions_ungraded,
                created_at, updated_at, submitted_at }
    question  { id, position, type: "multiple_choice" | "short_answer", question,
                choices: [{ id, text }] | null, points, lecture_id, source_pages }
              No question carries its answer before the exam is submitted.

  Errors when starting: 404 a lecture isn't the student's, 409 another exam is still being
  generated, 422 an invalid body or a lecture without readable text (the message names it).
*/
const BASE = "/exams";

export const QUESTION_COUNTS = [3, 5, 7, 10];
export const QUESTION_TYPES = [
  { value: "multiple_choice", label: "Multiple choice" },
  { value: "short_answer", label: "Short answer" },
];
// The longest short answer the backend accepts.
export const MAX_ANSWER_LENGTH = 4000;
// How often a generating exam is read again.
export const POLL_INTERVAL_MS = 2000;
// Starting saves the exam and returns at once, but a sleeping server takes a while to wake.
const START_TIMEOUT_MS = 60000;
const MAX_PAGE_SIZE = 100;

function unwrap(response, action) {
  if (response?.status !== true) {
    throw new ApiError({ message: response?.message || `Unable to ${action}.`, data: response });
  }
  return response.data;
}

/* Starts generating an exam; the questions are written afterwards (poll getExam). */
export async function startExam({ lectureIds, questionCount, types }, { signal } = {}) {
  const body = { lecture_ids: lectureIds, question_count: questionCount, types };
  return unwrap(await post(BASE, body, { timeout: START_TIMEOUT_MS, signal }), "start the exam");
}

export async function getExam(id, { signal } = {}) {
  return unwrap(await get(`${BASE}/${id}`, { signal }), "load the exam");
}

/* One page of the history: { exams, page, page_size, total, total_pages }. */
export async function listExams({ page = 1, pageSize = 20, signal } = {}) {
  return unwrap(await get(BASE, { params: { page, page_size: pageSize }, signal }), "load your exams");
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
  return unwrap(await del(`${BASE}/${id}`), "discard the exam");
}
