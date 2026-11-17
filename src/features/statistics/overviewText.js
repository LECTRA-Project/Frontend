import { dateLocale, t } from "../../i18n/i18n.js";
import { parseDay, weekLabel } from "./examStatsText.js";

/*
  The texts of the overview cards (OverviewCards.jsx), from GET /api/stats/overview.

  Days are UTC days here, like the backend's study streak: "today" and "yesterday" are the
  same days the streak is counted in, so "Last activity yesterday" never shows next to a
  streak the backend has already ended (or the other way round).
*/

const DAY_MS = 86400000;

const utcDay = (date) => Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());

/* 1234 → "1,234" (German "1.234"). */
export function numberText(value) {
  return new Intl.NumberFormat(dateLocale("en-GB")).format(value ?? 0);
}

/* "5 days", "1 day", "0 days". */
export function streakText(days) {
  const count = days ?? 0;
  return count === 1 ? t("1 day") : t("{count} days", { count: numberText(count) });
}

/* "Last activity today" | "… yesterday" | "… on 12 Nov" (with the year when it isn't this year). */
export function lastActivityText(iso, now = new Date()) {
  const date = iso ? new Date(iso) : null;
  if (!date || Number.isNaN(date.getTime())) return t("No activity yet");
  const days = Math.round((utcDay(now) - utcDay(date)) / DAY_MS);
  if (days <= 0) return t("Last activity today");
  if (days === 1) return t("Last activity yesterday");
  const options = { day: "numeric", month: "short", timeZone: "UTC" };
  if (date.getUTCFullYear() !== now.getUTCFullYear()) options.year = "numeric";
  return t("Last activity on {date}", { date: date.toLocaleDateString(dateLocale("en-GB"), options) });
}

export function questionsAnsweredText(answered) {
  return answered === 1 ? t("1 question answered") : t("{count} questions answered", { count: numberText(answered) });
}

export function pagesTotalText(total) {
  if (!total) return t("No pages to read yet");
  return total === 1 ? t("of 1 page in your materials") : t("of {total} pages in your materials", { total: numberText(total) });
}

export function chatsText(chats) {
  if (!chats) return t("No chats yet");
  return chats === 1 ? t("in 1 chat") : t("in {count} chats", { count: numberText(chats) });
}

/* A student who hasn't started: no lectures and nothing done yet (not even a deleted lecture's reading). */
export function isNewStudent(overview) {
  if (!overview) return false;
  const counts = ["lectures", "pages_read", "chats", "questions_asked", "exams_taken", "study_days"];
  return counts.every((name) => !overview[name]) && !overview.last_activity_at;
}

/* How a weekly count moved, { direction: "up" | "down" | "same", text }, or null when
   nothing happened in either week (nothing to compare).
   { this_week: 5, last_week: 2 } → "3 more than last week". */
export function weekChangeText(change) {
  if (!change) return null;
  const now = change.this_week ?? 0;
  const before = change.last_week ?? 0;
  if (now === 0 && before === 0) return null;
  const difference = Math.abs(now - before);
  if (now > before) return { direction: "up", text: t("{count} more than last week", { count: numberText(difference) }) };
  if (now < before) return { direction: "down", text: t("{count} fewer than last week", { count: numberText(difference) }) };
  return { direction: "same", text: t("Same as last week") };
}

/* How the average score moved over the last weeks, or null without a score to compare.
   { points: 9, weeks: 4 } → "9 points higher in 4 weeks". */
export function scoreChangeText(change) {
  if (!change || typeof change.points !== "number") return null;
  const weeks = change.weeks ?? 4;
  const points = Math.abs(change.points);
  if (change.points === 0) return { direction: "same", text: t("No change in {weeks} weeks", { weeks }) };
  const vars = { points: numberText(points), weeks };
  if (change.points > 0) {
    return { direction: "up", text: points === 1 ? t("1 point higher in {weeks} weeks", vars) : t("{points} points higher in {weeks} weeks", vars) };
  }
  return { direction: "down", text: points === 1 ? t("1 point lower in {weeks} weeks", vars) : t("{points} points lower in {weeks} weeks", vars) };
}

/* 42 → "42 min", 95 → "1 h 35 min", 120 → "2 h" (German "42 Min.", "1 Std. 35 Min."). */
export function minutesText(minutes) {
  const total = Math.max(0, Math.round(minutes ?? 0));
  const hours = Math.floor(total / 60);
  const rest = total % 60;
  if (hours === 0) return t("{minutes} min", { minutes: rest });
  if (rest === 0) return t("{hours} h", { hours: numberText(hours) });
  return t("{hours} h {minutes} min", { hours: numberText(hours), minutes: rest });
}

/* How this week's study time compares with last week's, or null without reading in either. */
export function studyChangeText(studyTime) {
  if (!studyTime) return null;
  const now = studyTime.this_week_minutes ?? 0;
  const before = studyTime.last_week_minutes ?? 0;
  if (now === 0 && before === 0) return null;
  const difference = minutesText(Math.abs(now - before));
  if (now > before) return { direction: "up", text: t("{time} more than last week", { time: difference }) };
  if (now < before) return { direction: "down", text: t("{time} less than last week", { time: difference }) };
  return { direction: "same", text: t("Same as last week") };
}

/* "2026-11-11" → "11 Nov" on the chart's axis. */
export function dayLabel(day) {
  return weekLabel(day);
}

/* "2026-11-11" → "Wed 11 Nov" (German "Mi., 11. Nov."), for the tooltip and the table. */
export function weekdayDateLabel(day) {
  const time = parseDay(day);
  if (time === null) return day ?? "";
  return new Date(time).toLocaleDateString(dateLocale("en-GB"), { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
}

