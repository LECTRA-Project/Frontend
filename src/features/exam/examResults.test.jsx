import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { makeToken, mockApi, renderApp, saveToken } from "../../test/helpers.jsx";
import { daysAgo, installChatBackend } from "../../test/chatBackend.js";
import { examFixture, installExamBackend, KI02, KI03, QUESTIONS, resultFixture, SLIDES } from "../../test/examBackend.js";

/*
  Submitting an exam and its checked answers, over the real app routes with the fake chat
  and exams backends: the confirmation, the grading state, 409 / 422, the results (every
  verdict, not answered, waiting + Grade again, a lecturer's correction, a deleted lecture),
  Open page, New exam on the same materials and a submitted exam opened by its link.
*/

let api;
let exams;

function setup({ examList = [] } = {}) {
  installChatBackend(api, {
    lectures: [KI02, KI03, SLIDES],
    sessions: [{ id: "s-hunt", title: "Hunt's algorithm", lectureIds: [KI02.id, SLIDES.id], updated_at: daysAgo(0) }],
  });
  exams = installExamBackend(api, { exams: examList });
}

beforeEach(() => {
  api = mockApi();
  saveToken(makeToken(1800));
  Object.defineProperty(window, "innerWidth", { configurable: true, value: 1440 });
});
afterEach(() => api.restore());

const search = (router) => Object.fromEntries(new URLSearchParams(router.state.location.search));
const STORAGE = (examId) => `lectra:exam:v1:user-1:${examId}`;
const SETTINGS = { lectureIds: [KI02.id], questionCount: 3, types: ["multiple_choice", "short_answer"] };

async function openAt(path) {
  const user = userEvent.setup();
  const result = renderApp(path);
  await screen.findByRole("heading", { level: 2, name: /^Exam/ });
  return { user, ...result };
}

/* A ready exam with `answers` saved on this device, opened at the review. */
async function openReview(answers, { examList = [examFixture("e-ready")] } = {}) {
  setup({ examList });
  localStorage.setItem(STORAGE("e-ready"), JSON.stringify({ answers, current: 2, settings: SETTINGS }));
  const opened = await openAt("/workspace/exam?chat=s-hunt&exam=e-ready");
  await opened.user.click(await screen.findByRole("button", { name: "Finish" }));
  return { ...opened, review: screen.getByRole("region", { name: "Review your answers" }) };
}

async function askToSubmit(user, review) {
  await user.click(within(review).getByRole("button", { name: "Submit and check" }));
  return screen.getByRole("dialog", { name: "Submit your exam?" });
}

const card = (number) => screen.getAllByRole("article")[number - 1];
const items = (list) => within(list).getAllByRole("listitem").map((item) => item.textContent.replace(/\s+/g, " ").trim());

/* A submitted exam: right, partly right (corrected), wrong, and not answered from a deleted lecture. */
function submittedExam({ ungraded = false } = {}) {
  const [q1, q2, q3] = QUESTIONS;
  const q4 = { id: "q4", position: 4, type: "short_answer", question: "What does *entropy* measure?", choices: null, points: 2, lecture_id: null, source_pages: [44] };
  const questions = [
    { ...q1, result: resultFixture(q1, { selected_choice_ids: ["b", "d"], feedback: "Correct. The test that gives the **purest** subsets." }) },
    {
      ...q2,
      result: ungraded
        ? resultFixture(q2, { answer_text: "When all records have one class", graded: false, verdict: null, points: null, feedback: null, scores: [] })
        : resultFixture(q2, {
            answer_text: "When all records have one class",
            verdict: "partially_correct",
            points: 2.5,
            feedback: "You named the **main case**.",
            scores: [
              { criterion_id: "c1", description: "Names the pure-node case", points: 2, max_points: 2, justification: "Named clearly." },
              { criterion_id: "c2", description: "Names the case without attributes", points: 0.5, max_points: 1, justification: "Only hinted at." },
            ],
            corrected: true,
            correction_comment: "Half a point for the hint at the attributes.",
          }),
    },
    { ...q3, result: resultFixture(q3, { selected_choice_ids: ["b"], verdict: "incorrect", points: 0, feedback: "You selected b, the correct answer is a." }) },
    {
      ...q4,
      result: {
        ...resultFixture(q4, { answer_text: "", answered: false, verdict: "incorrect", points: 0, feedback: "Not answered. Disorder.", reference_solution: "The disorder of the class labels." }),
        sources: [{ lecture_id: null, lecture_title: null, page_number: 44, source_type: "page", location: "Page 44" }],
      },
    },
  ];
  return {
    ...examFixture("e-done", { status: "submitted", count: 4, title: "KI 02 and KI 03", lectures: [{ lecture_id: KI02.id, title: KI02.title }, { lecture_id: null, title: "Entropy (deleted)" }] }),
    submitted_at: daysAgo(0),
    max_points: 7,
    total_points: ungraded ? null : 3.5,
    score_percent: ungraded ? null : 50,
    questions_ungraded: ungraded ? 1 : 0,
    questions,
  };
}

describe("submitting", () => {
  it("names the unanswered questions and can go back to answer them", async () => {
    const { user, review } = await openReview({ q1: ["b"] });
    const dialog = await askToSubmit(user, review);
    expect(within(dialog).getByText("Questions 2 and 3 are not answered yet and will get 0 points.")).toBeInTheDocument();

    await user.click(within(dialog).getByRole("button", { name: "Answer them first" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: QUESTIONS[1].question })).toBeInTheDocument();
    expect(exams.submitted).toEqual([]);

    // One left: it is named alone, and Answer question 3 goes there.
    await user.type(screen.getByLabelText("Your answer"), "All records have one class");
    await user.click(screen.getByRole("button", { name: "Next" }));
    await user.click(screen.getByRole("button", { name: "Finish" }));
    const again = await askToSubmit(user, screen.getByRole("region", { name: "Review your answers" }));
    expect(within(again).getByText("Question 3 is not answered yet and will get 0 points.")).toBeInTheDocument();
    await user.click(within(again).getByRole("button", { name: "Answer question 3" }));
    expect(screen.getByRole("heading", { name: QUESTIONS[2].question })).toBeInTheDocument();
    expect(exams.submitted).toEqual([]);
  });

  it("confirms an exam with every question answered, and Escape keeps it open", async () => {
    const { user, review } = await openReview({ q1: ["b", "d"], q2: "Pure node, one class", q3: ["a"] });
    let dialog = await askToSubmit(user, review);
    expect(within(dialog).getByText("All 3 questions are answered.")).toBeInTheDocument();
    expect(within(dialog).queryByText(/0 points/)).not.toBeInTheDocument();
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(exams.submitted).toEqual([]);

    dialog = await askToSubmit(user, review);
    await user.click(within(dialog).getByRole("button", { name: "Submit and check" }));
    expect(await screen.findByRole("heading", { name: "Your answers are checked" })).toBeInTheDocument();
    expect(exams.submitted).toEqual([
      {
        id: "e-ready",
        answers: [
          { task_id: "q1", selected_choice_ids: ["b", "d"] },
          { task_id: "q2", answer_text: "Pure node, one class" },
          { task_id: "q3", selected_choice_ids: ["a"] },
        ],
      },
    ]);
  });

  it("shows the grading state, then the results, and forgets the answers on this device", async () => {
    let release;
    const { user, review, router } = await openReview({ q1: ["b"], q2: "  " });
    exams.submitGate = new Promise((resolve) => {
      release = resolve;
    });
    const dialog = await askToSubmit(user, review);
    await user.click(within(dialog).getByRole("button", { name: "Submit and check" }));

    expect(await screen.findByRole("heading", { name: "Checking your answers…" })).toBeInTheDocument();
    expect(screen.getByText("Step 3 of 3 · Checking")).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("This takes only a moment.");
    expect(screen.queryByRole("region", { name: "Review your answers" })).not.toBeInTheDocument();
    // Empty answers are left out (they get 0 points).
    expect(exams.submitted[0].answers).toEqual([{ task_id: "q1", selected_choice_ids: ["b"] }]);

    release();
    expect(await screen.findByRole("heading", { name: "Your answers are checked" })).toBeInTheDocument();
    expect(screen.getByText("Step 3 of 3 · Results")).toBeInTheDocument();
    expect(search(router)).toEqual({ chat: "s-hunt", exam: "e-ready" });
    // The answers are gone; the settings stay for a new exam on the same materials.
    expect(JSON.parse(localStorage.getItem(STORAGE("e-ready")))).toMatchObject({ answers: {}, settings: SETTINGS });
  });

  it("says how many short answers are graded while checking", async () => {
    const { user, review } = await openReview({ q1: ["b"], q2: "A pure node" });
    exams.submitGate = new Promise(() => {});
    await user.click(within(await askToSubmit(user, review)).getByRole("button", { name: "Submit and check" }));
    expect(await screen.findByText("Your short answer is graded against the lecture, a few seconds each.")).toBeInTheDocument();
  });

  it("shows a 422 in the review and keeps the answers", async () => {
    const { user, review } = await openReview({ q1: ["b"] });
    exams.submitError = [422, { status: false, message: "Question 1 takes the ids of its choices, not a text answer", data: null }];
    await user.click(within(await askToSubmit(user, review)).getByRole("button", { name: "Submit and check" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Question 1 takes the ids of its choices, not a text answer");
    expect(screen.getByRole("region", { name: "Review your answers" })).toBeInTheDocument();
    expect(screen.getByText("Step 2 of 3 · Answer")).toBeInTheDocument();
    expect(JSON.parse(localStorage.getItem(STORAGE("e-ready"))).answers).toEqual({ q1: ["b"] });
  });

  it("shows a 409 for an exam that can't be submitted", async () => {
    const { user, review } = await openReview({ q1: ["b"] });
    exams.submitError = [409, { status: false, message: "This exam is not ready to be submitted yet", data: null }];
    await user.click(within(await askToSubmit(user, review)).getByRole("button", { name: "Submit and check" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("This exam is not ready to be submitted yet");
    expect(screen.getByRole("button", { name: "Submit and check" })).toBeInTheDocument();
  });

  it("shows the results when the exam turns out to be submitted already (409)", async () => {
    const { user, review } = await openReview({ q1: ["b"] });
    exams.submitError = [409, { status: false, message: "This exam was already submitted", data: null }];
    // Submitted meanwhile, e.g. in another tab.
    Object.assign(exams.exams[0], submittedExam(), { id: "e-ready" });
    await user.click(within(await askToSubmit(user, review)).getByRole("button", { name: "Submit and check" }));
    expect(await screen.findByText("This exam was already submitted. These are its results.")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Your answers are checked" })).toBeInTheDocument();
    expect(JSON.parse(localStorage.getItem(STORAGE("e-ready"))).answers).toEqual({});
  });
});

describe("results", () => {
  it("shows the score, every verdict, the answers, feedback, criteria and a correction", async () => {
    setup({ examList: [submittedExam()] });
    await openAt("/workspace/exam?chat=s-hunt&exam=e-done");

    // A submitted exam opened by its link shows its results.
    const score = await screen.findByRole("region", { name: "Your answers are checked" });
    expect(screen.getByText("Step 3 of 3 · Results")).toBeInTheDocument();
    expect(within(score).getByRole("img", { name: "Score 50 %, 3.5 of 7 points" })).toBeInTheDocument();
    expect(within(score).getByText("3.5 of 7 points")).toBeInTheDocument();
    const verdicts = within(score).getByRole("list", { name: "Answers by verdict" });
    expect(within(verdicts).getAllByRole("listitem").map((item) => item.textContent)).toEqual(["1 correct", "1 partly correct", "2 wrong"]);
    expect(within(score).queryByRole("button", { name: "Grade again" })).not.toBeInTheDocument();

    // Correct: the picks next to the correct choices, with their texts.
    const first = card(1);
    expect(within(first).getByText("Correct")).toBeInTheDocument();
    expect(within(first).getByText("Question 1 · 1 / 1 point")).toBeInTheDocument();
    expect(within(first).getByRole("heading", { level: 3, name: QUESTIONS[0].question })).toBeInTheDocument();
    const [yours, correct] = within(first).getAllByRole("list").slice(0, 2);
    expect(items(yours)).toEqual(["BThe test that gives the purest subsets right", "DA test that lowers the impurity right"]);
    expect(items(correct)).toEqual(["BThe test that gives the purest subsets", "DA test that lowers the impurity"]);
    // Markdown feedback is rendered, not shown with its symbols.
    expect(within(first).getByText("purest", { selector: "strong" })).toBeInTheDocument();
    expect(first).not.toHaveTextContent("**");

    // Partly correct, corrected by the lecturer: text vs reference, criteria, the comment.
    const second = card(2);
    expect(within(second).getByText("Partly correct")).toBeInTheDocument();
    expect(within(second).getByText("Question 2 · 2.5 / 3 points")).toBeInTheDocument();
    expect(within(second).getByText("When all records have one class")).toBeInTheDocument();
    expect(within(second).getByText("When all records have the same class, or no attribute is left.")).toBeInTheDocument();
    expect(within(second).getByText("Corrected by your lecturer")).toBeInTheDocument();
    expect(within(second).getByText("Half a point for the hint at the attributes.")).toBeInTheDocument();
    const criteria = within(second).getByText("Points per criterion").closest("details");
    expect(criteria).toHaveAttribute("open");
    expect(items(criteria)).toEqual([
      "Names the pure-node case2 / 2Named clearly.",
      "Names the case without attributes0.5 / 1Only hinted at.",
    ]);

    // Wrong: the wrong pick is marked as such.
    const third = card(3);
    expect(within(third).getByText("Wrong")).toBeInTheDocument();
    expect(within(third).getByText("Question 3 · 0 / 1 point")).toBeInTheDocument();
    expect(items(within(third).getAllByRole("list")[0])).toEqual(["B1 wrong"]);
    expect(items(within(third).getAllByRole("list")[1])).toEqual(["A0"]);

    // Not answered, from a lecture deleted since: the page is plain text, not a link.
    const fourth = card(4);
    expect(within(fourth).getAllByText("Not answered")).toHaveLength(2); // the verdict and the answer
    expect(within(fourth).getByText("Question 4 · 0 / 2 points")).toBeInTheDocument();
    expect(within(fourth).getByText("The disorder of the class labels.")).toBeInTheDocument();
    expect(within(fourth).queryByText(/^Not answered\. Disorder/)).not.toBeInTheDocument();
    const sources = within(fourth).getByRole("list", { name: "Pages of a deleted lecture" });
    expect(items(sources)).toEqual(["Page 44"]);
    expect(within(fourth).getByText("The lecture was deleted")).toBeInTheDocument();
    expect(within(fourth).queryByRole("button", { name: /^Open/ })).not.toBeInTheDocument();
  });

  it("says when answers wait to be graded, and Grade again grades them and refreshes", async () => {
    setup({ examList: [submittedExam({ ungraded: true })] });
    const { user } = await openAt("/workspace/exam?chat=s-hunt&exam=e-done");
    const score = await screen.findByRole("region", { name: "Some answers are still waiting to be graded" });
    expect(within(score).getByRole("img", { name: "Score not known yet" })).toBeInTheDocument();
    expect(within(score).getByText("1 answer couldn’t be graded yet, so the total isn’t known. Grade again to try now.")).toBeInTheDocument();
    expect(within(score).getByText("1 waiting")).toBeInTheDocument();
    expect(within(card(2)).getByText("Waiting to be graded")).toBeInTheDocument();
    expect(within(card(2)).getByText("Question 2 · – / 3 points")).toBeInTheDocument();

    await user.click(within(score).getByRole("button", { name: "Grade again" }));
    expect(exams.regraded).toEqual(["e-done"]);
    const checked = await screen.findByRole("region", { name: "Your answers are checked" });
    // The fake grades "…one class" as partly correct: 2 of 3.
    expect(within(checked).getByText("3 of 7 points")).toBeInTheDocument();
    expect(within(card(2)).getByText("Partly correct")).toBeInTheDocument();
    expect(within(checked).queryByRole("button", { name: "Grade again" })).not.toBeInTheDocument();
  });

  it("shows why Grade again failed", async () => {
    setup({ examList: [submittedExam({ ungraded: true })] });
    exams.regradeError = [503, { status: false, message: "The grading service is busy. Try again in a minute", data: null }];
    const { user } = await openAt("/workspace/exam?chat=s-hunt&exam=e-done");
    const score = await screen.findByRole("region", { name: "Some answers are still waiting to be graded" });
    await user.click(within(score).getByRole("button", { name: "Grade again" }));
    expect(await within(score).findByRole("alert")).toHaveTextContent("The grading service is busy");
  });

  it("opens a question's page beside the exam", async () => {
    setup({ examList: [submittedExam()] });
    const { user, router } = await openAt("/workspace/exam?chat=s-hunt&exam=e-done");
    await screen.findByRole("region", { name: "Your answers are checked" });
    const sources = within(card(1)).getByRole("list", { name: `Pages in ${KI02.title}` });
    expect(within(sources).getAllByRole("button").map((button) => button.textContent)).toEqual(["Page 12", "Page 13"]);
    expect(within(card(1)).getByText(`In ${KI02.title}`)).toBeInTheDocument();

    await user.click(within(sources).getByRole("button", { name: `Open page 13 of ${KI02.title}` }));
    await waitFor(() => expect(search(router)).toEqual({ chat: "s-hunt", lecture: KI02.id, exam: "e-done" }));
    expect(router.state.location.pathname).toBe("/workspace/exam");
    const pdf = await screen.findByRole("region", { name: `PDF viewer: ${KI02.title}` });
    expect(within(pdf).getByLabelText("Page number")).toHaveValue("13");
    expect(within(pdf).getByText("Opened from a source in the exam results: page 13")).toBeInTheDocument();
    // The results stay beside it.
    expect(screen.getByRole("region", { name: "Your answers are checked" })).toBeInTheDocument();
  });

  it("starts a new exam on the same materials with the saved number and types", async () => {
    setup({ examList: [submittedExam()] });
    localStorage.setItem(STORAGE("e-done"), JSON.stringify({ answers: {}, current: 0, settings: { lectureIds: [KI02.id], questionCount: 7, types: ["short_answer"] } }));
    const { user, router } = await openAt("/workspace/exam?chat=s-hunt&exam=e-done");
    await user.click(await screen.findByRole("button", { name: "New exam on the same materials" }));

    expect(await screen.findByRole("heading", { name: "New exam" })).toBeInTheDocument();
    expect(search(router)).toEqual({ chat: "s-hunt" });
    await waitFor(() => expect(screen.getByRole("checkbox", { name: /KI 02 Classification Part1/ })).toBeChecked());
    expect(screen.getByRole("radio", { name: "7" })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: "Multiple choice" })).not.toBeChecked();
    expect(screen.getByRole("checkbox", { name: "Short answer" })).toBeChecked();

    await user.click(screen.getByRole("button", { name: "Generate exam" }));
    expect(exams.started).toEqual([{ lecture_ids: [KI02.id], question_count: 7, types: ["short_answer"] }]);
  });

  it("without saved settings, takes the exam's materials from the library, its size and its question types", async () => {
    const done = { ...submittedExam(), lectures: [{ lecture_id: KI03.id, title: KI03.title }, { lecture_id: null, title: "Entropy (deleted)" }] };
    setup({ examList: [done] });
    const { user } = await openAt("/workspace/exam?chat=s-hunt&exam=e-done");
    await user.click(await screen.findByRole("button", { name: "New exam on the same materials" }));

    // KI 03 isn't in this chat, so the library is offered with it chosen.
    expect(await screen.findByRole("group", { name: "Your materials" })).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole("checkbox", { name: /KI 03/ })).toBeChecked());
    expect(screen.getByRole("checkbox", { name: /KI 02/ })).not.toBeChecked();
    // 4 isn't offered, so the default 5; both types were in the exam.
    expect(screen.getByRole("radio", { name: "5" })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: "Multiple choice" })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: "Short answer" })).toBeChecked();
  });

  it("reloads a submitted exam's link into its results", async () => {
    setup({ examList: [submittedExam()] });
    const first = await openAt("/workspace/exam?exam=e-done");
    expect(await screen.findByRole("region", { name: "Your answers are checked" })).toBeInTheDocument();
    first.unmount();
    renderApp("/workspace/exam?exam=e-done");
    expect(await screen.findByRole("region", { name: "Your answers are checked" })).toBeInTheDocument();
    expect(screen.queryByText("This exam was submitted")).not.toBeInTheDocument();
    expect(screen.getAllByRole("article")).toHaveLength(4);
  });
});
