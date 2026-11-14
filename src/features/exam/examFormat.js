import { dateLocale, t } from "../../i18n/i18n.js";
import { renderMarkdown } from "../../services/notebook/markdown.js";

/* Small text helpers for the exam screens. */

/* "13 Nov, 14:05" (the year only when it isn't this year). */
export function formatExamDate(iso, now = new Date()) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const options = { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" };
  if (date.getFullYear() !== now.getFullYear()) options.year = "numeric";
  return date.toLocaleString(dateLocale("en-GB"), options);
}

export function pointsLabel(points) {
  return points === 1 ? t("1 point") : t("{points} points", { points: points ?? 0 });
}

/* "page 4", "pages 3–7", "slides 2, 5" for the numbers a question was written from. */
export function pagesLabel(numbers, sourceType = "page") {
  const list = [...new Set((numbers ?? []).filter((value) => Number.isInteger(value)))].sort((a, b) => a - b);
  if (list.length === 0) return "";
  const unit = sourceType === "slide" || sourceType === "cell" ? sourceType : "page";
  if (list.length === 1) {
    const number = list[0];
    return { page: t("page {number}", { number }), slide: t("slide {number}", { number }), cell: t("cell {number}", { number }) }[unit];
  }
  const contiguous = list.every((value, index) => index === 0 || value === list[index - 1] + 1);
  const range = contiguous ? `${list[0]}–${list.at(-1)}` : list.join(", ");
  return { page: t("pages {numbers}", { numbers: range }), slide: t("slides {numbers}", { numbers: range }), cell: t("cells {numbers}", { numbers: range }) }[unit];
}

/* A, B, C … for the choices, in the order they are shown. */
export function choiceLetter(index) {
  return String.fromCharCode(65 + (index % 26));
}

/* A question's Markdown as one line of plain text (for the review list). */
export function plainText(markdown) {
  const html = renderMarkdown(markdown ?? "");
  const text = typeof DOMParser === "undefined" ? html.replace(/<[^>]*>/g, " ") : new DOMParser().parseFromString(html, "text/html").body.textContent;
  return text.replace(/\s+/g, " ").trim();
}

/* Points as the backend gives them (partial credit can be a fraction): 2, 1.5, 0.67. */
export function formatPoints(points) {
  if (typeof points !== "number" || Number.isNaN(points)) return "–";
  return String(Math.round(points * 100) / 100);
}

/* "2 / 3 points", "1 / 1 point"; "– / 3 points" while the answer waits to be graded. */
export function pointsOutOf(points, max) {
  const vars = { points: formatPoints(points), max: formatPoints(max) };
  return max === 1 ? t("{points} / {max} point", vars) : t("{points} / {max} points", vars);
}

/* "Question 2", "Questions 2 and 4", "Questions 1, 2 and 4". */
export function questionNumbers(numbers) {
  if (numbers.length === 1) return t("Question {number}", { number: numbers[0] });
  return t("Questions {list} and {last}", { list: numbers.slice(0, -1).join(", "), last: numbers.at(-1) });
}

/* The verdict of a checked answer, as a label and a tone for its badge. */
export function verdictOf(result) {
  if (!result?.answered) return { label: t("Not answered"), tone: "bad" };
  if (!result?.graded) return { label: t("Waiting to be graded"), tone: "wait" };
  if (result.verdict === "correct") return { label: t("Correct"), tone: "ok" };
  if (result.verdict === "partially_correct") return { label: t("Partly correct"), tone: "part" };
  return { label: t("Wrong"), tone: "bad" };
}
