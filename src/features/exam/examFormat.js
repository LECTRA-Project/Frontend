import { renderMarkdown } from "../../services/notebook/markdown.js";

/* Small text helpers for the exam screens. */

const UNITS = { page: ["page", "pages"], slide: ["slide", "slides"], cell: ["cell", "cells"] };

/* "13 Nov, 14:05" (the year only when it isn't this year). */
export function formatExamDate(iso, now = new Date()) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const options = { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" };
  if (date.getFullYear() !== now.getFullYear()) options.year = "numeric";
  return date.toLocaleString("en-GB", options);
}

export function pointsLabel(points) {
  return points === 1 ? "1 point" : `${points ?? 0} points`;
}

/* "page 4", "pages 3–7", "slides 2, 5" for the numbers a question was written from. */
export function pagesLabel(numbers, sourceType = "page") {
  const list = [...new Set((numbers ?? []).filter((value) => Number.isInteger(value)))].sort((a, b) => a - b);
  if (list.length === 0) return "";
  const [one, many] = UNITS[sourceType] ?? UNITS.page;
  if (list.length === 1) return `${one} ${list[0]}`;
  const contiguous = list.every((value, index) => index === 0 || value === list[index - 1] + 1);
  return `${many} ${contiguous ? `${list[0]}–${list.at(-1)}` : list.join(", ")}`;
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
