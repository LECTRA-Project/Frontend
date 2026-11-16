import { dateLocale, t } from "../../i18n/i18n.js";
import { QUESTION_TYPES } from "../../api/services/exams.js";
import { numberText } from "./overviewText.js";

/*
  Texts and small helpers for Statistics → Exam performance (ExamPerformance.jsx and
  PerformanceChart.jsx), from GET /api/stats/exams.
*/

const DAY_MS = 86400000;

/* "2026-11-09" → the UTC midnight of that day (or null). */
export function parseDay(day) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day ?? "");
  return match ? Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])) : null;
}

/* "2026-11-09" → "9 Nov" (German "9. Nov."), with the year when it isn't this year. */
export function weekLabel(day, now = new Date()) {
  const time = parseDay(day);
  if (time === null) return day ?? "";
  const date = new Date(time);
  const options = { day: "numeric", month: "short", timeZone: "UTC" };
  if (date.getUTCFullYear() !== now.getUTCFullYear()) options.year = "numeric";
  return date.toLocaleDateString(dateLocale("en-GB"), options);
}

/* The first day of "Last 4 weeks": today and the 27 days before it, as a UTC day like the backend's. */
export function lastWeeksFrom(weeks = 4, now = new Date()) {
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  return new Date(today - (weeks * 7 - 1) * DAY_MS).toISOString().slice(0, 10);
}

export const percentText = (value) => t("{percent}%", { percent: value });

/* "multiple_choice" → "Multiple choice"; an unknown type is shown as it comes. */
export function questionTypeLabel(type) {
  return QUESTION_TYPES.find((item) => item.value === type)?.label ?? type;
}

/* "2 of 6 correct". */
export function correctOfText(correct, questions) {
  return t("{correct} of {questions} correct", { correct: numberText(correct), questions: numberText(questions) });
}

export function examsText(count) {
  return count === 1 ? t("1 exam") : t("{count} exams", { count: numberText(count) });
}

/*
  The lectures "Practice this" can start an exam on: the concept's lecture_ids that still
  exist. A lecture that still exists has its id in the response (a deleted one has
  lecture_id null in the history and per lecture), so ids not seen there are left out.
*/
export function practiceLectureIds(concept, stats) {
  const existing = new Set();
  for (const exam of stats?.history ?? []) {
    for (const lecture of exam.lectures ?? []) if (lecture.lecture_id) existing.add(lecture.lecture_id);
  }
  for (const lecture of stats?.by_lecture ?? []) if (lecture.lecture_id) existing.add(lecture.lecture_id);
  return [...new Set(concept?.lecture_ids ?? [])].filter((id) => existing.has(id));
}
