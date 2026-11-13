/*
  Exam answers kept on this device (localStorage) until the exam is submitted.

  One entry per signed-in user and exam, so a reload, leaving the page or switching chats
  never loses an answer. Nothing here is sent to the server.

  Key:    lectra:exam:v1:<user key>:<exam id>
  Value:  { answers: { <question id>: ["a", "c"] (multiple choice) | "text" (short answer) },
            current: index of the question on screen,
            settings: { lectureIds, questionCount, types } | null  (how it was started, for Retry),
            savedAt: ISO string }

  Storage can be unavailable (private mode, blocked site data) or full: reading then gives
  an empty entry and saving reports false, and the exam works on without it.
*/
const KEY_PREFIX = "lectra:exam:v1:";

export const EMPTY_PROGRESS = Object.freeze({ answers: {}, current: 0, settings: null });

function storageKey(userKey, examId) {
  return `${KEY_PREFIX}${userKey}:${examId}`;
}

function store() {
  try {
    return typeof window !== "undefined" ? window.localStorage : null;
  } catch {
    return null;
  }
}

export function loadExamProgress(userKey, examId) {
  try {
    const raw = store()?.getItem(storageKey(userKey, examId));
    if (!raw) return { ...EMPTY_PROGRESS };
    const saved = JSON.parse(raw);
    return {
      answers: saved && typeof saved.answers === "object" && saved.answers !== null ? saved.answers : {},
      current: Number.isInteger(saved?.current) && saved.current >= 0 ? saved.current : 0,
      settings: saved?.settings ?? null,
    };
  } catch {
    return { ...EMPTY_PROGRESS };
  }
}

/* Saves the entry; false when the browser refused (storage unavailable or full). */
export function saveExamProgress(userKey, examId, progress) {
  try {
    const target = store();
    if (!target) return false;
    const { answers = {}, current = 0, settings = null } = progress;
    target.setItem(storageKey(userKey, examId), JSON.stringify({ answers, current, settings, savedAt: new Date().toISOString() }));
    return true;
  } catch {
    return false;
  }
}

/* Merges `changes` into the saved entry (e.g. only the settings). */
export function updateExamProgress(userKey, examId, changes) {
  return saveExamProgress(userKey, examId, { ...loadExamProgress(userKey, examId), ...changes });
}

export function clearExamProgress(userKey, examId) {
  try {
    store()?.removeItem(storageKey(userKey, examId));
  } catch {
    // Nothing to clean up when storage can't be used.
  }
}

/* Whether an answer counts as given: at least one choice, or text that isn't only spaces. */
export function isAnswered(answer) {
  if (Array.isArray(answer)) return answer.length > 0;
  return typeof answer === "string" && answer.trim() !== "";
}

/* How many of `questions` have an answer in `answers` (all saved answers without questions). */
export function countAnswered(answers, questions = null) {
  if (questions) return questions.filter((question) => isAnswered(answers[question.id])).length;
  return Object.values(answers).filter(isAnswered).length;
}
