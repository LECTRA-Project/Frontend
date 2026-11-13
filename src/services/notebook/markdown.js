import DOMPurify from "dompurify";
import { Marked } from "marked";
import markedKatex from "marked-katex-extension";

/*
  Markdown → safe HTML for Markdown cells, and sanitising of HTML outputs (e.g. pandas tables).
  Everything goes through DOMPurify, so notebook files cannot run scripts in the page.
  Math: $inline$ and $$display$$ are rendered with KaTeX.
*/
const marked = new Marked({ gfm: true });
marked.use(markedKatex({ throwOnError: false, nonStandard: true }));

/*
  Chat answers use KaTeX's standard rule: a $ only closes a formula when a space or
  punctuation follows it. Answers often contain prices ("$1 per month … $121, $484"),
  which the loose rule above would turn into one long formula that can't wrap.
*/
const answerMarked = new Marked({ gfm: true });
answerMarked.use(markedKatex({ throwOnError: false }));

// <style> would restyle the whole app (pandas emits one); forms and inputs have no use in notes.
const PURIFY_OPTIONS = { FORBID_TAGS: ["style", "form", "input", "button", "textarea", "select"] };

// Links in notes open in a new tab and cannot reach back into the app.
DOMPurify.addHook("afterSanitizeAttributes", (node) => {
  if (node.tagName === "A" && node.getAttribute("href")) {
    node.setAttribute("target", "_blank");
    node.setAttribute("rel", "noopener noreferrer");
  }
});

export function renderMarkdown(source) {
  return DOMPurify.sanitize(marked.parse(source), PURIFY_OPTIONS);
}

/* Markdown of a study assistant answer → safe HTML (dollar amounts stay text). */
export function renderAnswerMarkdown(source) {
  return DOMPurify.sanitize(answerMarked.parse(source), PURIFY_OPTIONS);
}

export function sanitizeHtml(html) {
  return DOMPurify.sanitize(html, PURIFY_OPTIONS);
}
