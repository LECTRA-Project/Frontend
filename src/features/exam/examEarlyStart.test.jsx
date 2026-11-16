import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { makeToken, mockApi, renderApp, saveToken } from "../../test/helpers.jsx";
import { daysAgo, installChatBackend } from "../../test/chatBackend.js";
import { examFixture, installExamBackend, KI02, QUESTIONS } from "../../test/examBackend.js";

// Poll quickly, so new questions show within a test.
vi.mock("../../api/services/exams.js", async (importOriginal) => ({ ...(await importOriginal()), POLL_INTERVAL_MS: 15 }));

/*
  Answering while the questions are still written: the fake backend is paused, and each
  exams.advance() writes the next question, which the page picks up on its next poll.
*/

let api;
let exams;

function setup(examList) {
  installChatBackend(api, {
    lectures: [KI02],
    sessions: [{ id: "s-hunt", title: "Hunt's algorithm", lectureIds: [KI02.id], updated_at: daysAgo(0) }],
  });
  exams = installExamBackend(api, { exams: examList });
  exams.paused = true;
}

beforeEach(() => {
  api = mockApi();
  saveToken(makeToken(1800));
  Object.defineProperty(window, "innerWidth", { configurable: true, value: 1440 });
});
afterEach(() => api.restore());

const STORAGE = (examId) => `lectra:exam:v1:user-1:${examId}`;
const saved = (examId) => JSON.parse(localStorage.getItem(STORAGE(examId)));
const map = () => within(screen.getByRole("navigation", { name: "Questions" }));
const mapItem = (n) => map().getByRole("button", { name: new RegExp(`^Question ${n},`) });
const announcement = () => screen.getAllByRole("status").find((element) => element.classList.contains("visually-hidden"));

async function openGenerating({ count = 5, ready = 0, id = "e-gen" } = {}) {
  setup([examFixture(id, { status: "generating", count, ready })]);
  const user = userEvent.setup();
  const result = renderApp(`/workspace/exam?chat=s-hunt&exam=${id}`);
  await screen.findByRole("heading", { level: 2, name: /^Exam/ });
  return { user, ...result };
}

/* Opens a generating exam with one question written and starts answering it. */
async function startEarly(options) {
  const opened = await openGenerating({ ready: 1, ...options });
  await opened.user.click(await screen.findByRole("button", { name: "Start with the first questions" }));
  await screen.findByRole("heading", { name: QUESTIONS[0].question });
  return opened;
}

describe("starting while the questions are written", () => {
  it("offers to start once the first question is written, keeping the progress visible", async () => {
    const { user } = await openGenerating({ ready: 0 });
    expect(await screen.findByText("0 of 5 questions ready")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Start with the first questions" })).not.toBeInTheDocument();

    exams.advance("e-gen");
    const start = await screen.findByRole("button", { name: "Start with the first questions" });
    expect(screen.getByText("1 of 5 questions ready")).toBeInTheDocument();
    expect(screen.getByRole("progressbar", { name: "Questions ready" })).toHaveAttribute("aria-valuenow", "1");

    await user.click(start);
    const heading = await screen.findByRole("heading", { name: QUESTIONS[0].question });
    expect(heading).toHaveFocus();
    expect(screen.getByText("Question 1 of 5 · 1 point · from KI 02 Classification Part1, pages 12–13")).toBeInTheDocument();
    expect(screen.getByText("1 of 5 questions ready")).toBeInTheDocument();
    expect(screen.getByText("Step 2 of 3 · Answer")).toBeInTheDocument();
    expect(saved("e-gen").started).toBe(true);
  });

  it("shows the questions not written yet in the map as being written, not clickable", async () => {
    await startEarly();
    expect(mapItem(1)).toHaveAccessibleName("Question 1, not answered");
    expect(mapItem(1)).toBeEnabled();
    for (const n of [2, 3, 4, 5]) {
      expect(mapItem(n)).toHaveAccessibleName(`Question ${n}, being written`);
      expect(mapItem(n)).toBeDisabled();
    }
    exams.advance("e-gen");
    await waitFor(() => expect(mapItem(2)).toHaveAccessibleName("Question 2, not answered"));
    expect(mapItem(2)).toBeEnabled();
    expect(mapItem(3)).toBeDisabled();
    expect(screen.getByText("2 of 5 questions ready")).toBeInTheDocument();
  });

  it("keeps and saves the answers while more questions arrive, and announces them politely", async () => {
    const { user } = await startEarly();
    const choice = screen.getByRole("checkbox", { name: /purest subsets/ });
    await user.click(choice);
    expect(saved("e-gen").answers).toEqual({ q1: ["b"] });

    const live = announcement();
    expect(live).toHaveAttribute("aria-live", "polite");
    expect(live).toBeEmptyDOMElement();
    exams.advance("e-gen");
    await waitFor(() => expect(live).toHaveTextContent("Question 2 is ready."));
    // The focus stays where the student is, and the answer is kept.
    expect(choice).toHaveFocus();
    expect(choice).toBeChecked();
    expect(screen.getByText("1 of 2 answered")).toBeInTheDocument();

    exams.advance("e-gen", 2);
    await waitFor(() => expect(live).toHaveTextContent("Questions 3 and 4 are ready."));
    await user.click(mapItem(2));
    await user.type(screen.getByLabelText("Your answer"), "When all records have one class");
    exams.advance("e-gen");
    await waitFor(() => expect(mapItem(5)).toHaveAccessibleName("Question 5, not answered"));
    expect(screen.getByLabelText("Your answer")).toHaveValue("When all records have one class");
    expect(saved("e-gen")).toMatchObject({ answers: { q1: ["b"], q2: "When all records have one class" }, current: 1, started: true });
  });

  it("Next on the last written question waits for the next one", async () => {
    const { user } = await startEarly();
    await user.click(screen.getByRole("button", { name: "Next" }));
    const waiting = screen.getByRole("heading", { name: "Question 2 is being written…" });
    expect(waiting).toHaveFocus();
    expect(screen.getByRole("button", { name: "Next" })).toBeDisabled();
    expect(mapItem(2)).toHaveAttribute("aria-current", "step");

    exams.advance("e-gen");
    const heading = await screen.findByRole("heading", { name: QUESTIONS[1].question });
    expect(heading).toHaveFocus();
    expect(screen.queryByText("Question 2 is being written…")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Your answer")).toBeInTheDocument();
  });
});

describe("submitting", () => {
  it("keeps Finish disabled with a note until the exam is ready, then submits", async () => {
    const { user } = await startEarly({ count: 3 });
    exams.advance("e-gen");
    await user.click(await map().findByRole("button", { name: "Question 2, not answered" }));
    await user.type(screen.getByLabelText("Your answer"), "When all records have one class");
    await user.click(screen.getByRole("button", { name: "Next" }));
    expect(screen.getByRole("heading", { name: "Question 3 is being written…" })).toBeInTheDocument();
    const finish = screen.getByRole("button", { name: "Finish" });
    expect(finish).toBeDisabled();
    expect(finish).toHaveAccessibleDescription("1 question is still being written. You can finish once it’s ready.");

    exams.advance("e-gen");
    await screen.findByRole("heading", { name: QUESTIONS[2].question });
    expect(announcement()).toHaveTextContent("Question 3 is ready. All questions are ready. You can finish the exam now.");
    expect(screen.getByRole("button", { name: "Finish" })).toBeEnabled();
    expect(screen.queryByText(/still being written/)).not.toBeInTheDocument();
    const reads = exams.reads;
    await new Promise((resolve) => setTimeout(resolve, 60));
    expect(exams.reads).toBe(reads); // polling stops once ready

    await user.click(screen.getByRole("button", { name: "Finish" }));
    await user.click(screen.getByRole("button", { name: "Submit and check" }));
    await user.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Submit and check" }));
    expect(await screen.findByText("Step 3 of 3 · Results")).toBeInTheDocument();
    expect(exams.submitted).toEqual([{ id: "e-gen", answers: [{ task_id: "q2", answer_text: "When all records have one class" }] }]);
  });

  it("says so when the exam ends with fewer questions than asked", async () => {
    await startEarly({ count: 5 });
    exams.finalCount = 4;
    exams.advance("e-gen", 3);
    expect(await screen.findByText("This exam has 4 questions instead of 5: 1 question couldn’t be written.")).toBeInTheDocument();
    await waitFor(() => expect(announcement()).toHaveTextContent("All questions are written: this exam has 4 instead of 5. You can finish it now."));
    expect(map().getAllByRole("button")).toHaveLength(4);
    expect(map().queryByRole("button", { name: /being written/ })).not.toBeInTheDocument();
    expect(mapItem(4)).toHaveAccessibleName("Question 4, not answered");
    expect(screen.getByText("Question 1 of 4 · 1 point · from KI 02 Classification Part1, pages 12–13")).toBeInTheDocument();
  });

  it("goes back to the last question when the one waited for is never written", async () => {
    const { user } = await startEarly({ count: 5 });
    exams.advance("e-gen", 2);
    await user.click(await map().findByRole("button", { name: "Question 3, not answered" }));
    await user.click(screen.getByRole("button", { name: "Next" }));
    expect(screen.getByRole("heading", { name: "Question 4 is being written…" })).toHaveFocus();

    exams.finalCount = 3;
    exams.advance("e-gen");
    const heading = await screen.findByRole("heading", { name: QUESTIONS[2].question });
    expect(heading).toHaveFocus();
    expect(screen.getByText("This exam has 3 questions instead of 5: 2 questions couldn’t be written.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Finish" })).toBeEnabled();
  });
});

describe("failure after starting", () => {
  it("shows the error, keeps the answers read-only and retries with the same settings", async () => {
    const settings = { lectureIds: [KI02.id], questionCount: 5, types: ["multiple_choice", "short_answer"] };
    localStorage.setItem(STORAGE("e-gen"), JSON.stringify({ answers: {}, current: 0, settings }));
    const { user, router } = await startEarly();
    await user.click(screen.getByRole("checkbox", { name: /purest subsets/ }));
    exams.advance("e-gen");
    await user.click(await map().findByRole("button", { name: "Question 2, not answered" }));
    await user.type(screen.getByLabelText("Your answer"), "Pure node");

    exams.failAt = 3;
    exams.advance("e-gen");
    expect(await screen.findByRole("heading", { name: "The exam couldn’t be generated" })).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent("Not enough questions could be generated. Please try again in a minute");
    expect(screen.getByText(/your answers below are kept read-only/)).toBeInTheDocument();
    // The answers stay, but can't be changed or submitted.
    const box = screen.getByLabelText("Your answer");
    expect(box).toHaveValue("Pure node");
    expect(box).toHaveAttribute("readonly");
    expect(screen.queryByRole("button", { name: "Finish" })).not.toBeInTheDocument();
    expect(map().queryByRole("button", { name: /being written/ })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Previous" }));
    expect(screen.getByRole("checkbox", { name: /purest subsets/ })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: /purest subsets/ })).toBeDisabled();
    const reads = exams.reads;
    await new Promise((resolve) => setTimeout(resolve, 60));
    expect(exams.reads).toBe(reads); // polling stops once failed

    await user.click(screen.getByRole("button", { name: "Retry" }));
    await waitFor(() => expect(new URLSearchParams(router.state.location.search).get("exam")).toBe("e-new-1"));
    expect(exams.started).toEqual([{ lecture_ids: [KI02.id], question_count: 5, types: ["multiple_choice", "short_answer"] }]);
    expect(exams.deleted).toEqual(["e-gen"]);
    expect(await screen.findByRole("heading", { name: "Writing your questions…" })).toBeInTheDocument();
  });
});

describe("reload while generating", () => {
  it("lands in the questions again with the answers and the questions so far", async () => {
    localStorage.setItem(STORAGE("e-gen"), JSON.stringify({ answers: { q1: ["b", "d"], q2: "Pure node" }, current: 1, started: true }));
    const { user } = await openGenerating({ ready: 2 });
    expect(await screen.findByRole("heading", { name: QUESTIONS[1].question })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Start with the first questions" })).not.toBeInTheDocument();
    expect(screen.getByLabelText("Your answer")).toHaveValue("Pure node");
    expect(screen.getByText("2 of 2 answered")).toBeInTheDocument();
    expect(mapItem(3)).toHaveAccessibleName("Question 3, being written");

    // Polling goes on: the next question comes in.
    exams.advance("e-gen");
    await waitFor(() => expect(mapItem(3)).toHaveAccessibleName("Question 3, not answered"));
    await user.click(mapItem(3));
    expect(screen.getByRole("heading", { name: QUESTIONS[2].question })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Previous" }));
    await user.click(screen.getByRole("button", { name: "Previous" }));
    expect(screen.getByRole("checkbox", { name: /purest subsets/ })).toBeChecked();
  });

  it("without having started, shows the progress with the offer to start", async () => {
    await openGenerating({ ready: 2 });
    expect(await screen.findByRole("button", { name: "Start with the first questions" })).toBeInTheDocument();
    expect(screen.getByText("2 of 5 questions ready")).toBeInTheDocument();
  });
});
