import { MAX_MESSAGE_LENGTH } from "../../api/services/chat.js";
import { choiceLetter, plainText } from "./examFormat.js";

/*
  "Ask about this" on a checked exam answer: the question sent to the chat assistant.

  The message is plain text (the chat API takes nothing else): a heading line, then the
  parts, separated by blank lines. Longer parts are quoted line by line ("> "), so the
  assistant reads them as quotes and the chat can show them as such:

    I got this exam question wrong. Can you explain it using my lecture materials?

    Question:
    > What is the impurity of a pure node?

    Choices:
    > A. 0
    > B. 1

    I picked: B
    Correct choices: A

    Feedback I got:
    > You selected b, the correct answer is a.

  A short answer has "My answer:" with the student's text (quoted) instead of the choices;
  a question without an answer says "My answer: I didn’t answer.". The feedback is left out
  when the student didn't answer (the results don't show it then either).

  The backend takes at most MAX_MESSAGE_LENGTH characters. The question is never cut: the
  student's text and the feedback are shortened first (at a word, with "…"), and only if
  that isn't enough, the texts of the choices.
*/

const HEADINGS = {
  incorrect: "I got this exam question wrong. Can you explain it using my lecture materials?",
  partially_correct: "I got this exam question partly right. Can you explain what I missed, using my lecture materials?",
  unanswered: "I didn’t answer this exam question. Can you explain it using my lecture materials?",
};
const HEADING_SET = new Set(Object.values(HEADINGS));

export const LABELS = {
  question: "Question",
  choices: "Choices",
  picked: "I picked",
  correct: "Correct choices",
  answer: "My answer",
  feedback: "Feedback I got",
};
const NOT_ANSWERED = "I didn’t answer.";
// Below this a shortened text says too little; it is left out instead.
const MIN_PART = 40;

/* Wrong, partly correct and not answered answers can be asked about; correct ones and answers still waiting to be graded can't. */
export function canAskAbout(result) {
  if (!result) return false;
  if (!result.answered) return true;
  return Boolean(result.graded) && result.verdict !== "correct";
}

/* `text` cut to at most `max` characters, at a word where possible, ending in "…". */
export function shortenText(text, max) {
  if (text.length <= max) return text;
  if (max < MIN_PART) return "";
  let cut = text.slice(0, max - 1);
  // Back to the last whole word, unless the cut already falls between two words.
  const space = /\s/.test(text[max - 1]) ? -1 : cut.search(/\s\S*$/);
  if (space > max * 0.7) cut = cut.slice(0, space);
  return `${cut.trimEnd()}…`;
}

const quote = (text) =>
  text
    .replace(/\r\n?/g, "\n")
    .trim()
    .split("\n")
    .map((line) => (line.trim() ? `> ${line}` : ">"))
    .join("\n");

function compose({ heading, question, choices, picks, answer, feedback }) {
  const blocks = [heading, `${LABELS.question}:\n${quote(question)}`];
  if (choices) blocks.push(`${LABELS.choices}:\n${quote(choices.join("\n"))}`);
  if (picks) blocks.push(picks);
  if (answer !== null) blocks.push(answer.quoted ? `${LABELS.answer}:\n${quote(answer.text)}` : `${LABELS.answer}: ${answer.text}`);
  if (feedback) blocks.push(`${LABELS.feedback}:\n${quote(feedback)}`);
  return blocks.join("\n\n");
}

/*
  Shortens `texts` (the larger ones first, then all alike) until `build(shortened)` fits in
  `limit`. Returns the shortened texts, or null when even empty texts don't fit.
*/
function fitTexts(texts, build, limit) {
  const caps = texts.map((text) => text.length);
  for (let round = 0; round < 200; round += 1) {
    const current = texts.map((text, index) => shortenText(text, caps[index]));
    const over = build(current).length - limit;
    if (over <= 0) return current;
    if (caps.every((cap) => cap < MIN_PART)) return null;
    const top = Math.max(...caps);
    const next = Math.max(...caps.filter((cap) => cap < top), MIN_PART - 1);
    const largest = caps.filter((cap) => cap === top).length;
    // Down to the next size (or by the overflow, shared), whichever is less.
    const cut = Math.max(1, Math.min(top - next, Math.ceil(over / largest)));
    for (let index = 0; index < caps.length; index += 1) if (caps[index] === top) caps[index] = top - cut;
  }
  return null;
}

/*
  The message for one checked question ({ type, question, choices, result }). It is at most
  `limit` characters unless the question itself is longer (then it can't be sent; the
  caller checks the length).
*/
export function examQuestionMessage(question, limit = MAX_MESSAGE_LENGTH) {
  const result = question.result ?? {};
  const answered = Boolean(result.answered);
  const heading = !answered ? HEADINGS.unanswered : result.verdict === "partially_correct" ? HEADINGS.partially_correct : HEADINGS.incorrect;
  const isChoice = question.type === "multiple_choice";
  const choices = isChoice ? (question.choices ?? []).map((choice, index) => ({ ...choice, letter: choiceLetter(index) })) : [];
  const letters = (ids) => {
    const wanted = new Set(ids ?? []);
    const picked = choices.filter((choice) => wanted.has(choice.id)).map((choice) => choice.letter);
    return picked.length ? picked.join(", ") : "none";
  };
  const picks = isChoice ? [answered && `${LABELS.picked}: ${letters(result.selected_choice_ids)}`, `${LABELS.correct}: ${letters(result.correct_choice_ids)}`].filter(Boolean).join("\n") : null;
  const answerText = !answered ? null : isChoice ? null : (result.answer_text ?? "").trim();
  // Feedback is Markdown, kept as written (the assistant reads Markdown).
  const feedback = answered && typeof result.feedback === "string" ? result.feedback.trim() : "";

  const parts = {
    heading,
    question: question.question ?? "",
    choices: isChoice ? choices.map((choice) => `${choice.letter}. ${choice.text}`) : null,
    picks,
    answer: !answered ? { text: NOT_ANSWERED, quoted: false } : answerText !== null ? { text: answerText, quoted: true } : null,
    feedback,
  };
  const withTexts = ([answer, fb]) =>
    compose({ ...parts, answer: parts.answer?.quoted ? (answer ? { text: answer, quoted: true } : { text: "(too long to include)", quoted: false }) : parts.answer, feedback: fb });

  // 1. The student's text and the feedback.
  const texts = [answerText ?? "", feedback];
  const fitted = fitTexts(texts, withTexts, limit);
  if (fitted) return withTexts(fitted);

  // 2. Not enough: both left out, and the choices shortened.
  const bare = { ...parts, answer: parts.answer?.quoted ? { text: "(too long to include)", quoted: false } : parts.answer, feedback: "" };
  if (!isChoice) return compose(bare);
  const choiceTexts = choices.map((choice) => choice.text);
  const build = (list) => compose({ ...bare, choices: choices.map((choice, index) => `${choice.letter}. ${list[index] || "…"}`) });
  const shortChoices = fitTexts(choiceTexts, build, limit);
  return build(shortChoices ?? choiceTexts.map(() => ""));
}

/* The title of a new chat opened for a question: "Exam question: What is the impurity …". */
export function examChatTitle(question) {
  const text = plainText(question.question ?? "");
  return shortenText(`Exam question: ${text}`, 60) || "Exam question";
}

/*
  The reverse, for showing the message in the chat: { heading, parts } where each part is
  { label, quote } (a quoted text) or { label, value } (one line). null for any other message.
*/
export function parseExamQuestionMessage(content = "") {
  const [heading, ...blocks] = content.split("\n\n");
  if (!HEADING_SET.has(heading) || blocks.length === 0) return null;
  const parts = [];
  for (const block of blocks) {
    const [first, ...rest] = block.split("\n");
    if (rest.length > 0 && first.endsWith(":") && rest.every((line) => line === ">" || line.startsWith("> "))) {
      parts.push({ label: first.slice(0, -1), quote: rest.map((line) => line.slice(2)).join("\n") });
      continue;
    }
    for (const line of [first, ...rest]) {
      const match = /^([^:>\n]+): (.+)$/.exec(line);
      if (!match) return null;
      parts.push({ label: match[1], value: match[2] });
    }
  }
  return { heading, parts };
}
