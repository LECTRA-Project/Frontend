import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { makeToken, mockApi, renderApp, saveToken } from "../../test/helpers.jsx";
import { daysAgo, installChatBackend } from "../../test/chatBackend.js";
import { examFixture, installExamBackend, KI02, QUESTIONS } from "../../test/examBackend.js";

/*
  Flagging questions for review, over the real app routes: the toggle on every question,
  the flag in the question map, flagged questions first in the review, the submit
  confirmation naming them (and going to one), kept on the device per user and exam,
  gone once submitted, German.
*/

let api;
let exams;

beforeEach(() => {
  api = mockApi();
  saveToken(makeToken(1800));
  Object.defineProperty(window, "innerWidth", { configurable: true, value: 1440 });
});
afterEach(() => api.restore());

const STORAGE = (examId) => `lectra:exam:v1:user-1:${examId}`;
const saved = () => JSON.parse(localStorage.getItem(STORAGE("e-ready")) ?? "{}");
const map = () => within(screen.getByRole("navigation", { name: "Questions" }));
const mapItem = (n) => map().getByRole("button", { name: new RegExp(`^Question ${n},`) });
const flag = () => screen.getByRole("button", { name: "Flag for review" });

async function openReady({ language, examList } = {}) {
  installChatBackend(api, { lectures: [KI02], sessions: [{ id: "s-hunt", title: "Hunt's algorithm", lectureIds: [KI02.id], updated_at: daysAgo(0) }] });
  exams = installExamBackend(api, { exams: examList ?? [examFixture("e-ready")] });
  if (language) localStorage.setItem("lectra:language:v1:user-1", language);
  const user = userEvent.setup();
  const result = renderApp("/workspace/exam?chat=s-hunt&exam=e-ready");
  await screen.findByRole("navigation", { name: language === "de" ? "Fragen" : "Questions" });
  return { user, ...result };
}

describe("flag for review", () => {
  it("flags a question, marks it in the map and keeps it after a reload", async () => {
    const { user, unmount } = await openReady();
    expect(flag()).toHaveAttribute("aria-pressed", "false");
    await user.click(screen.getByRole("button", { name: "Next" }));
    await user.click(flag());
    expect(flag()).toHaveAttribute("aria-pressed", "true");
    expect(mapItem(2)).toHaveAccessibleName("Question 2, not answered, flagged for review");
    expect(mapItem(1)).toHaveAccessibleName("Question 1, not answered");
    expect(saved().flagged).toEqual(["q2"]);

    await user.type(screen.getByLabelText("Your answer"), "When it is pure");
    expect(mapItem(2)).toHaveAccessibleName("Question 2, answered, flagged for review");

    unmount();
    renderApp("/workspace/exam?chat=s-hunt&exam=e-ready");
    await screen.findByRole("navigation", { name: "Questions" });
    expect(mapItem(2)).toHaveAccessibleName("Question 2, answered, flagged for review");
    expect(flag()).toHaveAttribute("aria-pressed", "true"); // still on question 2

    await user.click(flag());
    expect(mapItem(2)).toHaveAccessibleName("Question 2, answered");
    expect(saved().flagged).toEqual([]);
  });

  it("lists flagged questions first in the review", async () => {
    const { user } = await openReady();
    await user.click(mapItem(3));
    await user.click(flag());
    await user.click(screen.getByRole("checkbox", { name: "0" }));
    await user.click(screen.getByRole("button", { name: "Finish" }));

    const review = screen.getByRole("region", { name: "Review your answers" });
    expect(within(review).getByText(/1 question is flagged for review and listed first\./)).toBeInTheDocument();
    const items = within(review).getAllByRole("button", { name: /^\d/ });
    expect(items.map((item) => item.textContent)).toEqual([
      `3${QUESTIONS[2].question}FlaggedAnswered`,
      `1${QUESTIONS[0].question}Not answered`,
      `2${QUESTIONS[1].question}Not answered`,
    ]);
    // A click still opens that question.
    await user.click(items[0]);
    expect(screen.getByRole("heading", { name: QUESTIONS[2].question })).toBeInTheDocument();
  });

  it("names the flagged questions before submitting and can go to one", async () => {
    const { user } = await openReady();
    await user.click(screen.getByRole("checkbox", { name: /purest subsets/ }));
    await user.click(flag());
    await user.click(screen.getByRole("button", { name: "Next" }));
    await user.type(screen.getByLabelText("Your answer"), "Pure");
    await user.click(flag());
    await user.click(screen.getByRole("button", { name: "Next" }));
    await user.click(screen.getByRole("checkbox", { name: "0" }));
    await user.click(screen.getByRole("button", { name: "Finish" }));
    await user.click(screen.getByRole("button", { name: "Submit and check" }));

    const dialog = await screen.findByRole("dialog", { name: "Submit your exam?" });
    expect(within(dialog).getByText("Questions 1 and 2 are flagged for review.")).toBeInTheDocument();
    await user.click(within(dialog).getByRole("button", { name: "Go to question 1" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: QUESTIONS[0].question })).toBeInTheDocument();
  });

  it("names a flagged question next to the unanswered ones", async () => {
    const { user } = await openReady();
    await user.click(flag());
    await user.click(mapItem(3));
    await user.click(screen.getByRole("button", { name: "Finish" }));
    await user.click(screen.getByRole("button", { name: "Submit and check" }));
    const dialog = await screen.findByRole("dialog", { name: "Submit your exam?" });
    expect(within(dialog).getByText("Question 1 is flagged for review.")).toBeInTheDocument();
    expect(within(dialog).getByText(/None of the questions is answered yet/)).toBeInTheDocument();
    // Answering comes first: the button goes to the first unanswered question.
    expect(within(dialog).getByRole("button", { name: "Answer them first" })).toBeInTheDocument();
  });

  it("forgets the flags once the exam is submitted", async () => {
    const { user } = await openReady();
    await user.click(flag());
    await user.click(mapItem(3));
    await user.click(screen.getByRole("button", { name: "Finish" }));
    await user.click(screen.getByRole("button", { name: "Submit and check" }));
    await user.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "Submit and check" }));
    await screen.findByRole("heading", { name: "Your answers are checked" });
    await waitFor(() => expect(saved().flagged ?? []).toEqual([]));
    expect(exams.submitted).toHaveLength(1);
  });

  it("is in German", async () => {
    const { user } = await openReady({ language: "de" });
    await user.click(screen.getByRole("button", { name: "Zur Überprüfung markieren" }));
    expect(within(screen.getByRole("navigation", { name: "Fragen" })).getByRole("button", { name: "Frage 1, nicht beantwortet, zur Überprüfung markiert" })).toBeInTheDocument();
  });
});
