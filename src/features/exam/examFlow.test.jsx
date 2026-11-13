import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { makeToken, mockApi, renderApp, saveToken } from "../../test/helpers.jsx";
import { daysAgo, installChatBackend } from "../../test/chatBackend.js";
import { examFixture, installExamBackend, KI02, KI03, QUESTIONS, SLIDES } from "../../test/examBackend.js";

// Poll quickly, so a generating exam gets ready within a test.
vi.mock("../../api/services/exams.js", async (importOriginal) => ({ ...(await importOriginal()), POLL_INTERVAL_MS: 15 }));

/*
  The Exam view over the real app routes, a fake chat backend and a fake exams backend:
  setup (preselection, validation, 409 / 422), generating (polling, failure with Retry),
  the questions (multi-select, short answer, navigation, map, answers kept on the device),
  resume and discard, and the exam in the URL.
*/

let api;
let exams;

function setup({ examList = [], startError = null } = {}) {
  installChatBackend(api, {
    lectures: [KI02, KI03, SLIDES],
    sessions: [
      { id: "s-hunt", title: "Hunt's algorithm", lectureIds: [KI02.id, SLIDES.id], updated_at: daysAgo(0) },
      { id: "s-empty", title: "Empty chat", lectureIds: [], updated_at: daysAgo(1) },
    ],
  });
  exams = installExamBackend(api, { exams: examList, startError });
}

beforeEach(() => {
  api = mockApi();
  saveToken(makeToken(1800));
  Object.defineProperty(window, "innerWidth", { configurable: true, value: 1440 });
});
afterEach(() => api.restore());

const search = (router) => Object.fromEntries(new URLSearchParams(router.state.location.search));
const STORAGE = (examId) => `lectra:exam:v1:user-1:${examId}`;

async function openAt(path) {
  const user = userEvent.setup();
  const result = renderApp(path);
  await screen.findByRole("heading", { level: 2, name: /^Exam/ });
  return { user, ...result };
}

async function openSetup(path = "/workspace/exam?chat=s-hunt") {
  const opened = await openAt(path);
  await screen.findByRole("heading", { name: "New exam" });
  await waitFor(() => expect(screen.queryByText("Loading materials…")).not.toBeInTheDocument());
  return opened;
}

const generate = () => screen.getByRole("button", { name: "Generate exam" });

describe("exam setup", () => {
  it("preselects the open chat's materials and can't pick one without readable text", async () => {
    setup();
    await openSetup();
    expect(screen.getByRole("group", { name: "Materials in this chat" })).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: /KI 02 Classification Part1/ })).toBeChecked();
    const slides = screen.getByRole("checkbox", { name: /Search slides/ });
    expect(slides).not.toBeChecked();
    expect(slides).toBeDisabled();
    expect(screen.getByText(/Still processing/)).toBeInTheDocument();
    // Only the chat's materials, not the rest of the library.
    expect(screen.queryByRole("checkbox", { name: /KI 03/ })).not.toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "5" })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: "Multiple choice" })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: "Short answer" })).toBeChecked();
    expect(screen.getByText("5 questions from 1 material")).toBeInTheDocument();
    expect(generate()).toBeEnabled();
  });

  it("offers the library, nothing preselected, for a chat without materials", async () => {
    setup();
    await openSetup("/workspace/exam?chat=s-empty");
    expect(screen.getByRole("group", { name: "Your materials" })).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: /KI 02/ })).not.toBeChecked();
    expect(screen.getByRole("checkbox", { name: /KI 03/ })).not.toBeChecked();
    expect(screen.getByText("Pick at least one material.")).toBeInTheDocument();
    expect(generate()).toBeDisabled();
  });

  it("needs a material and a question type", async () => {
    setup();
    const { user } = await openSetup();
    await user.click(screen.getByRole("checkbox", { name: /KI 02/ }));
    expect(screen.getByText("Pick at least one material.")).toBeInTheDocument();
    expect(generate()).toBeDisabled();
    await user.click(screen.getByRole("checkbox", { name: /KI 02/ }));
    await user.click(screen.getByRole("checkbox", { name: "Multiple choice" }));
    await user.click(screen.getByRole("checkbox", { name: "Short answer" }));
    expect(screen.getByText("Pick at least one question type.")).toBeInTheDocument();
    expect(generate()).toBeDisabled();
    await user.click(screen.getByRole("checkbox", { name: "Short answer" }));
    expect(generate()).toBeEnabled();
    expect(exams.started).toEqual([]);
  });

  it("starts the exam with the chosen settings and puts it in the URL", async () => {
    setup();
    const { user, router } = await openSetup("/workspace/exam?chat=s-empty");
    await user.click(screen.getByRole("checkbox", { name: /KI 03/ }));
    await user.click(screen.getByRole("checkbox", { name: /KI 02/ }));
    await user.click(screen.getByRole("radio", { name: "3" }));
    await user.click(screen.getByRole("checkbox", { name: "Multiple choice" }));
    await user.click(generate());
    // In the order they are listed (the library's order).
    expect(exams.started).toEqual([{ lecture_ids: [KI02.id, KI03.id], question_count: 3, types: ["short_answer"] }]);
    await waitFor(() => expect(search(router)).toEqual({ chat: "s-empty", exam: "e-new-1" }));
    expect(await screen.findByRole("heading", { name: "Writing your questions…" })).toBeInTheDocument();
    // The settings are kept for Retry.
    expect(JSON.parse(localStorage.getItem(STORAGE("e-new-1"))).settings).toEqual({ lectureIds: [KI02.id, KI03.id], questionCount: 3, types: ["short_answer"] });
  });

  it("explains 409 and opens the exam already being generated", async () => {
    const busy = examFixture("e-busy", { status: "generating", count: 7, ready: 2 });
    setup({
      examList: [busy],
      startError: [409, { status: false, message: "An exam is already being generated. Wait until it is ready, then start the next one", data: null }],
    });
    const { user, router } = await openSetup();
    await user.click(generate());
    expect(await screen.findByText(/An exam is already being generated/)).toBeInTheDocument();
    await user.click(await screen.findByRole("button", { name: "Open that exam" }));
    expect(search(router)).toEqual({ chat: "s-hunt", exam: "e-busy" });
    expect(await screen.findByRole("heading", { name: "Writing your questions…" })).toBeInTheDocument();
  });

  it("shows the 422 message that names the material", async () => {
    setup({ startError: [422, { status: false, message: "“KI 02 Classification Part1” has no readable text yet, so no questions can be made from it", data: null }] });
    const { user, router } = await openSetup();
    await user.click(generate());
    expect(await screen.findByRole("alert")).toHaveTextContent("“KI 02 Classification Part1” has no readable text yet");
    expect(screen.queryByRole("button", { name: "Open that exam" })).not.toBeInTheDocument();
    expect(search(router)).toEqual({ chat: "s-hunt" });
  });
});

describe("generating", () => {
  it("polls the exam, shows how many questions are ready, then the questions", async () => {
    setup();
    const { user } = await openSetup();
    await user.click(screen.getByRole("radio", { name: "3" }));
    await user.click(generate());
    expect(await screen.findByText("0 of 3 questions ready")).toBeInTheDocument();
    expect(await screen.findByText("1 of 3 questions ready")).toBeInTheDocument();
    expect(await screen.findByText("2 of 3 questions ready")).toBeInTheDocument();
    expect(screen.getByRole("progressbar", { name: "Questions ready" })).toHaveAttribute("aria-valuenow", "2");
    expect(await screen.findByRole("heading", { name: QUESTIONS[0].question })).toBeInTheDocument();
    const reads = exams.reads;
    await new Promise((resolve) => setTimeout(resolve, 60));
    expect(exams.reads).toBe(reads); // no polling once ready
  });

  it("shows the error of a failed exam, retries with the same settings and goes back", async () => {
    setup();
    const { user, router } = await openSetup();
    exams.failAt = 1;
    await user.click(screen.getByRole("radio", { name: "7" }));
    await user.click(generate());
    expect(await screen.findByRole("heading", { name: "The exam couldn’t be generated" })).toBeInTheDocument();
    expect(screen.getByText(/Not enough questions could be generated/)).toBeInTheDocument();

    exams.failAt = null;
    await user.click(screen.getByRole("button", { name: "Retry" }));
    expect(exams.started).toEqual([
      { lecture_ids: [KI02.id], question_count: 7, types: ["multiple_choice", "short_answer"] },
      { lecture_ids: [KI02.id], question_count: 7, types: ["multiple_choice", "short_answer"] },
    ]);
    await waitFor(() => expect(search(router).exam).toBe("e-new-2"));
    expect(exams.deleted).toEqual(["e-new-1"]); // the failed one is discarded
    expect(await screen.findByRole("heading", { name: "Writing your questions…" })).toBeInTheDocument();
  });

  it("Back leaves a failed exam for the setup", async () => {
    setup({ examList: [examFixture("e-failed", { status: "failed", error: "The exam stopped being generated. Please start a new one" })] });
    const { user, router } = await openAt("/workspace/exam?chat=s-hunt&exam=e-failed");
    expect(await screen.findByText("The exam stopped being generated. Please start a new one")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Back" }));
    expect(search(router)).toEqual({ chat: "s-hunt" });
    expect(await screen.findByRole("heading", { name: "New exam" })).toBeInTheDocument();
  });
});

describe("answering", () => {
  async function openReady(path = "/workspace/exam?chat=s-hunt&exam=e-ready") {
    setup({ examList: [examFixture("e-ready")] });
    const opened = await openAt(path);
    await screen.findByRole("navigation", { name: "Questions" });
    return opened;
  }
  const mapItem = (n) => within(screen.getByRole("navigation", { name: "Questions" })).getByRole("button", { name: new RegExp(`^Question ${n},`) });

  it("lets a multiple-choice question take several choices and marks it answered", async () => {
    const { user } = await openReady();
    expect(screen.getByText("Select every correct answer")).toBeInTheDocument();
    expect(screen.getByText(/Question 1 of 3 · 1 point · from KI 02 Classification Part1, pages 12–13/)).toBeInTheDocument();
    expect(screen.getByText("0 of 3 answered")).toBeInTheDocument();
    expect(mapItem(1)).toHaveAccessibleName("Question 1, not answered");

    await user.click(screen.getByRole("checkbox", { name: /purest subsets/ }));
    await user.click(screen.getByRole("checkbox", { name: /lowers the impurity/ }));
    expect(screen.getByRole("checkbox", { name: /purest subsets/ })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: /lowers the impurity/ })).toBeChecked();
    expect(screen.getByText("1 of 3 answered")).toBeInTheDocument();
    expect(mapItem(1)).toHaveAccessibleName("Question 1, answered");
    expect(JSON.parse(localStorage.getItem(STORAGE("e-ready"))).answers).toEqual({ q1: ["b", "d"] });

    await user.click(screen.getByRole("checkbox", { name: /purest subsets/ }));
    expect(JSON.parse(localStorage.getItem(STORAGE("e-ready"))).answers).toEqual({ q1: ["d"] });
  });

  it("takes a short answer of at most 4000 characters", async () => {
    const { user } = await openReady();
    await user.click(screen.getByRole("button", { name: "Next" }));
    const box = await screen.findByLabelText("Your answer");
    expect(screen.getByText(/Short answer/, { selector: ".exam-tag" })).toBeInTheDocument();
    expect(box).toHaveAttribute("maxLength", "4000");
    await user.type(box, "When all records have one class");
    expect(screen.getByText("31 / 4000")).toBeInTheDocument();
    expect(mapItem(2)).toHaveAccessibleName("Question 2, answered");
    expect(JSON.parse(localStorage.getItem(STORAGE("e-ready"))).answers.q2).toBe("When all records have one class");
    await user.clear(box);
    await user.type(box, "   ");
    expect(mapItem(2)).toHaveAccessibleName("Question 2, not answered");
  });

  it("moves with Previous / Next and the map, and Finish opens the review without submitting", async () => {
    const { user } = await openReady();
    expect(screen.getByRole("button", { name: "Previous" })).toBeDisabled();
    expect(mapItem(1)).toHaveAttribute("aria-current", "step");
    await user.click(screen.getByRole("button", { name: "Next" }));
    expect(screen.getByRole("heading", { name: QUESTIONS[1].question })).toBeInTheDocument();
    await user.click(mapItem(3));
    expect(screen.getByRole("heading", { name: QUESTIONS[2].question })).toBeInTheDocument();
    expect(mapItem(3)).toHaveAttribute("aria-current", "step");
    expect(screen.queryByRole("button", { name: "Next" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("checkbox", { name: "0" }));
    await user.click(screen.getByRole("button", { name: "Previous" }));
    expect(screen.getByRole("heading", { name: QUESTIONS[1].question })).toBeInTheDocument();
    await user.click(mapItem(3));

    await user.click(screen.getByRole("button", { name: "Finish" }));
    const review = screen.getByRole("region", { name: "Review your answers" });
    expect(within(review).getByText("1 of 3 answered · 2 questions aren’t answered yet.")).toBeInTheDocument();
    const items = within(review).getAllByRole("button", { name: /^\d/ });
    expect(items.map((item) => item.textContent)).toEqual([
      `1${QUESTIONS[0].question}Not answered`,
      `2${QUESTIONS[1].question}Not answered`,
      `3${QUESTIONS[2].question}Answered`,
    ]);
    // Submitting asks first (see examResults.test.jsx); nothing is sent from the review itself.
    expect(within(review).getByRole("button", { name: "Submit and check" })).toBeInTheDocument();
    expect(exams.submitted).toEqual([]);

    await user.click(items[1]);
    expect(screen.getByRole("heading", { name: QUESTIONS[1].question })).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Review your answers" })).not.toBeInTheDocument();
  });

  it("restores the answers and the question from this device after a reload", async () => {
    localStorage.setItem(STORAGE("e-ready"), JSON.stringify({ answers: { q1: ["a", "c"], q2: "Pure node" }, current: 1 }));
    const first = await openReady();
    expect(screen.getByRole("heading", { name: QUESTIONS[1].question })).toBeInTheDocument();
    expect(screen.getByLabelText("Your answer")).toHaveValue("Pure node");
    expect(screen.getByText("2 of 3 answered")).toBeInTheDocument();
    await first.user.type(screen.getByLabelText("Your answer"), ", one class");
    first.unmount();

    // A reload: the same URL in a fresh app.
    const second = renderApp("/workspace/exam?chat=s-hunt&exam=e-ready");
    expect(await screen.findByLabelText("Your answer")).toHaveValue("Pure node, one class");
    await userEvent.setup().click(screen.getByRole("button", { name: "Previous" }));
    expect(screen.getByRole("checkbox", { name: /most values/ })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: /random attribute/ })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: /purest subsets/ })).not.toBeChecked();
    second.unmount();
  });

  it("keeps answers per user: another student's answers on this device don't show", async () => {
    localStorage.setItem("lectra:exam:v1:user-2:e-ready", JSON.stringify({ answers: { q1: ["a"] }, current: 0 }));
    await openReady();
    expect(screen.getByText("0 of 3 answered")).toBeInTheDocument();
  });
});

describe("resume and discard", () => {
  it("lists the unfinished exams, continues one and discards another after confirming", async () => {
    setup({
      examList: [
        examFixture("e-gen", { status: "generating", count: 5, ready: 2, title: "KI 03 Classification Part2" }),
        examFixture("e-ready", { title: "KI 02 Classification Part1" }),
        examFixture("e-failed", { status: "failed", title: "Failed one" }),
        { ...examFixture("e-done", { title: "Submitted one" }), status: "submitted" },
      ],
    });
    localStorage.setItem(STORAGE("e-ready"), JSON.stringify({ answers: { q1: ["b"], q2: "x" }, current: 2 }));
    const { user, router } = await openSetup();
    const list = await screen.findByRole("region", { name: "Continue an exam" });
    const rows = within(list).getAllByRole("listitem");
    expect(rows).toHaveLength(2);
    expect(rows[0]).toHaveTextContent("KI 03 Classification Part2");
    expect(rows[0]).toHaveTextContent("Generating · 2 of 5 questions ready");
    expect(rows[1]).toHaveTextContent("2 of 3 answered");
    expect(within(list).queryByText("Failed one")).not.toBeInTheDocument();
    expect(within(list).queryByText("Submitted one")).not.toBeInTheDocument();

    // Discard: asks first; Cancel keeps it.
    await user.click(within(rows[0]).getByRole("button", { name: "Discard KI 03 Classification Part2" }));
    const dialog = screen.getByRole("dialog", { name: "Discard this exam?" });
    await user.click(within(dialog).getByRole("button", { name: "Cancel" }));
    expect(exams.deleted).toEqual([]);
    await user.click(within(rows[0]).getByRole("button", { name: "Discard KI 03 Classification Part2" }));
    await user.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Discard exam" }));
    await waitFor(() => expect(exams.deleted).toEqual(["e-gen"]));
    expect(await screen.findByText("Exam discarded.")).toBeInTheDocument();
    expect(within(list).getAllByRole("listitem")).toHaveLength(1);

    // Continue: the exam opens at the saved question.
    await user.click(within(list).getByRole("button", { name: "Continue KI 02 Classification Part1" }));
    expect(search(router)).toEqual({ chat: "s-hunt", exam: "e-ready" });
    expect(await screen.findByRole("heading", { name: QUESTIONS[2].question })).toBeInTheDocument();
    expect(screen.getByText("2 of 3 answered")).toBeInTheDocument();
  });

  it("clears the answers on this device when an exam is discarded, and shows a failed discard", async () => {
    // Registered first, so it answers before the fake backend's DELETE.
    api.onDelete("/exams/e-other").reply(409, { status: false, message: "A submitted exam stays in your history and can't be deleted", data: null });
    setup({ examList: [examFixture("e-ready"), examFixture("e-other", { title: "Other exam" })] });
    localStorage.setItem(STORAGE("e-ready"), JSON.stringify({ answers: { q1: ["b"] }, current: 0 }));
    const { user } = await openSetup();
    const list = await screen.findByRole("region", { name: "Continue an exam" });
    await user.click(within(list).getByRole("button", { name: "Discard Other exam" }));
    await user.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Discard exam" }));
    expect(await within(list).findByRole("alert")).toHaveTextContent("A submitted exam stays in your history");

    await user.click(within(list).getByRole("button", { name: `Discard ${KI02.title}` }));
    await user.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Discard exam" }));
    await waitFor(() => expect(localStorage.getItem(STORAGE("e-ready"))).toBeNull());
  });
});

describe("the exam in the URL", () => {
  it("opens the linked exam, keeps the chat, and Back to chat returns to that chat", async () => {
    setup({ examList: [examFixture("e-ready")] });
    const { user, router } = await openAt(`/workspace/exam?chat=s-hunt&exam=e-ready`);
    expect(await screen.findByRole("heading", { name: QUESTIONS[0].question })).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 2, name: `Exam · ${KI02.title}` })).toBeInTheDocument();
    expect(screen.getByText("Step 2 of 3 · Answer")).toBeInTheDocument();
    await user.click(screen.getByRole("link", { name: "Back to chat" }));
    expect(router.state.location.pathname).toBe("/workspace");
    expect(search(router)).toEqual({ chat: "s-hunt" });
    expect(await screen.findByRole("heading", { level: 1, name: "Hunt's algorithm" })).toBeInTheDocument();

    // The header's Exam opens the setup (the last exam is listed there to continue).
    await user.click(screen.getByRole("button", { name: "Exam" }));
    expect(search(router)).toEqual({ chat: "s-hunt" });
    expect(await screen.findByRole("heading", { name: "New exam" })).toBeInTheDocument();
    expect(await screen.findByRole("button", { name: `Continue ${KI02.title}` })).toBeInTheDocument();
  });

  it("keeps the exam in the URL when a material is opened beside it", async () => {
    setup({ examList: [examFixture("e-ready")] });
    const { user, router } = await openAt(`/workspace/exam?chat=s-hunt&exam=e-ready`);
    await screen.findByRole("heading", { name: QUESTIONS[0].question });
    const menu = screen.getByRole("navigation", { name: "Chats and this chat's materials" });
    await user.click(await within(menu).findByRole("button", { name: /KI 02 Classification Part1.*beside the chat$/ }));
    await waitFor(() => expect(search(router)).toEqual({ chat: "s-hunt", lecture: KI02.id, exam: "e-ready" }));
    expect(router.state.location.pathname).toBe("/workspace/exam");
    expect(screen.getByRole("heading", { name: QUESTIONS[0].question })).toBeInTheDocument();
  });

  it("says so when the linked exam isn't the student's and shows the setup", async () => {
    setup();
    const { router } = await openAt("/workspace/exam?chat=s-hunt&exam=e-gone");
    expect(await screen.findByText(/That exam isn’t in your exams/)).toBeInTheDocument();
    await waitFor(() => expect(search(router)).toEqual({ chat: "s-hunt" }));
    expect(await screen.findByRole("heading", { name: "New exam" })).toBeInTheDocument();
  });
});
