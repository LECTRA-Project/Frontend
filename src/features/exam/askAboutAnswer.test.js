import { describe, expect, it } from "vitest";

import { canAskAbout, examChatTitle, examQuestionMessage, parseExamQuestionMessage, shortenText } from "./askAboutAnswer.js";
import { MAX_MESSAGE_LENGTH } from "../../api/services/chat.js";

const CHOICE_QUESTION = {
  id: "q1",
  type: "multiple_choice",
  question: "Which split does Hunt's algorithm choose at a node?",
  choices: [
    { id: "a", text: "The attribute with the most values" },
    { id: "b", text: "The test that gives the purest subsets" },
    { id: "c", text: "A random attribute" },
    { id: "d", text: "A test that lowers the impurity" },
  ],
};
const TEXT_QUESTION = { id: "q2", type: "short_answer", question: "When does a node become a leaf?", choices: null };

const graded = (overrides) => ({ answered: true, graded: true, verdict: "incorrect", feedback: "", ...overrides });

describe("canAskAbout", () => {
  it("is offered for wrong, partly correct and unanswered questions only", () => {
    expect(canAskAbout(graded({ verdict: "incorrect" }))).toBe(true);
    expect(canAskAbout(graded({ verdict: "partially_correct" }))).toBe(true);
    expect(canAskAbout({ answered: false, graded: true, verdict: "incorrect" })).toBe(true);
    expect(canAskAbout({ answered: false, graded: false, verdict: null })).toBe(true);
    expect(canAskAbout(graded({ verdict: "correct" }))).toBe(false);
    // Waiting to be graded: there is nothing to explain yet.
    expect(canAskAbout({ answered: true, graded: false, verdict: null })).toBe(false);
    expect(canAskAbout(null)).toBe(false);
  });
});

describe("examQuestionMessage", () => {
  it("writes a wrong multiple-choice answer with the lettered choices, the picks and the correct ones", () => {
    const message = examQuestionMessage({
      ...CHOICE_QUESTION,
      result: graded({ selected_choice_ids: ["c", "a"], correct_choice_ids: ["b", "d"], feedback: "You picked **random** splits." }),
    });
    expect(message).toBe(
      [
        "I got this exam question wrong. Can you explain it using my lecture materials?",
        "Question:\n> Which split does Hunt's algorithm choose at a node?",
        "Choices:\n> A. The attribute with the most values\n> B. The test that gives the purest subsets\n> C. A random attribute\n> D. A test that lowers the impurity",
        "I picked: A, C\nCorrect choices: B, D",
        "Feedback I got:\n> You picked **random** splits.",
      ].join("\n\n")
    );
  });

  it("writes a partly correct short answer with the student's text quoted line by line", () => {
    const message = examQuestionMessage({
      ...TEXT_QUESTION,
      result: graded({ verdict: "partially_correct", answer_text: "When all records\n\nhave one class", feedback: "You named the main case." }),
    });
    expect(message).toBe(
      [
        "I got this exam question partly right. Can you explain what I missed, using my lecture materials?",
        "Question:\n> When does a node become a leaf?",
        "My answer:\n> When all records\n>\n> have one class",
        "Feedback I got:\n> You named the main case.",
      ].join("\n\n")
    );
  });

  it("says when the question wasn't answered, without the feedback", () => {
    const text = examQuestionMessage({ ...TEXT_QUESTION, result: { answered: false, graded: true, verdict: "incorrect", answer_text: "", feedback: "Not answered. When all records share a class." } });
    expect(text).toBe(
      [
        "I didn’t answer this exam question. Can you explain it using my lecture materials?",
        "Question:\n> When does a node become a leaf?",
        "My answer: I didn’t answer.",
      ].join("\n\n")
    );

    const choice = examQuestionMessage({ ...CHOICE_QUESTION, result: { answered: false, graded: true, verdict: "incorrect", selected_choice_ids: [], correct_choice_ids: ["b"], feedback: "Not answered." } });
    expect(choice).toContain("Choices:\n> A. The attribute with the most values");
    expect(choice).toContain("Correct choices: B\n\nMy answer: I didn’t answer.");
    expect(choice).not.toContain("I picked");
    expect(choice).not.toContain("Feedback");
  });

  it("shortens a long answer and long feedback to fit the chat's limit, never the question", () => {
    const question = `${"Explain how the Gini impurity of a split is computed. ".repeat(12)}Show each step.`;
    const answer = "word ".repeat(800).trim(); // 3999 characters
    const feedback = "The grader explains a lot here. ".repeat(100).trim();
    const message = examQuestionMessage({ ...TEXT_QUESTION, question, result: graded({ answer_text: answer, feedback }) });

    expect(message.length).toBeLessThanOrEqual(MAX_MESSAGE_LENGTH);
    expect(message.length).toBeGreaterThan(MAX_MESSAGE_LENGTH - 60);
    const parsed = parseExamQuestionMessage(message);
    expect(parsed.parts.find((part) => part.label === "Question").quote).toBe(question);
    const shortAnswer = parsed.parts.find((part) => part.label === "My answer").quote;
    const shortFeedback = parsed.parts.find((part) => part.label === "Feedback I got").quote;
    expect(shortAnswer).toMatch(/^word word .*word…$/);
    expect(shortFeedback).toMatch(/^The grader explains a lot here\. .*…$/);
    // Both get a fair share of the room.
    expect(Math.abs(shortAnswer.length - shortFeedback.length)).toBeLessThan(20);
  });

  it("gives a short feedback all of its room and the rest to the answer", () => {
    const answer = "x".repeat(4000);
    const message = examQuestionMessage({ ...TEXT_QUESTION, result: graded({ answer_text: answer, feedback: "Too long." }) });
    expect(message.length).toBeLessThanOrEqual(MAX_MESSAGE_LENGTH);
    expect(message.endsWith("Feedback I got:\n> Too long.")).toBe(true);
    expect(message).toMatch(/My answer:\n> x{1500,}…/);
  });

  it("shortens the choices only when the answer and feedback can't make room", () => {
    const choices = ["a", "b", "c", "d"].map((id) => ({ id, text: `${id.toUpperCase()} ${"long choice text ".repeat(40)}` }));
    const message = examQuestionMessage({
      ...CHOICE_QUESTION,
      choices,
      result: graded({ selected_choice_ids: ["a"], correct_choice_ids: ["b"], feedback: "f ".repeat(500) }),
    });
    expect(message.length).toBeLessThanOrEqual(MAX_MESSAGE_LENGTH);
    expect(message).toContain(`Question:\n> ${CHOICE_QUESTION.question}`);
    expect(message).toContain("I picked: A\nCorrect choices: B");
    expect(message).not.toContain("Feedback I got");
    expect(parseExamQuestionMessage(message).parts.find((part) => part.label === "Choices").quote.split("\n")).toHaveLength(4);
  });
});

describe("parseExamQuestionMessage", () => {
  it("reads back the heading and the parts", () => {
    const message = examQuestionMessage({ ...CHOICE_QUESTION, result: graded({ selected_choice_ids: ["a"], correct_choice_ids: ["b"], feedback: "Line one.\n\nLine two." }) });
    expect(parseExamQuestionMessage(message)).toEqual({
      heading: "I got this exam question wrong. Can you explain it using my lecture materials?",
      parts: [
        { label: "Question", quote: CHOICE_QUESTION.question },
        { label: "Choices", quote: "A. The attribute with the most values\nB. The test that gives the purest subsets\nC. A random attribute\nD. A test that lowers the impurity" },
        { label: "I picked", value: "A" },
        { label: "Correct choices", value: "B" },
        { label: "Feedback I got", quote: "Line one.\n\nLine two." },
      ],
    });
  });

  it("leaves any other message alone", () => {
    expect(parseExamQuestionMessage("What is entropy?")).toBeNull();
    expect(parseExamQuestionMessage("I got this exam question wrong. Can you explain it using my lecture materials?")).toBeNull();
    expect(parseExamQuestionMessage("I got this exam question wrong. Can you explain it using my lecture materials?\n\nsome free text")).toBeNull();
  });
});

describe("helpers", () => {
  it("cuts text at a word with an ellipsis", () => {
    expect(shortenText("short", 10)).toBe("short");
    expect(shortenText("The quick brown fox jumps over the lazy dog again and again", 45)).toBe("The quick brown fox jumps over the lazy dog…");
    expect(shortenText("anything", 3)).toBe("");
  });

  it("names a new chat after the question", () => {
    expect(examChatTitle(TEXT_QUESTION)).toBe("Exam question: When does a node become a leaf?");
    expect(examChatTitle({ question: "What does *entropy* measure in a decision tree with many classes and attributes?" })).toBe("Exam question: What does entropy measure in a decision tree…");
  });
});
