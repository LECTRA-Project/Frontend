import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { makeToken, mockApi, renderApp, saveToken } from "../../test/helpers.jsx";
import { daysAgo, installChatBackend } from "../../test/chatBackend.js";
import { installExamBackend, KI02, KI03, QUESTIONS, SLIDES, submittedExam } from "../../test/examBackend.js";

/*
  "Ask about this" on the exam results, over the real app routes with the fake chat and
  exams backends: which cards offer it, the open chat vs. a new chat with the exam's
  lectures (deleted ones left out), the prepared question and its answer in the chat, and
  "Back to exam results".
*/

let api;
let chats;

function setup({ exam = submittedExam(), sessions } = {}) {
  chats = installChatBackend(api, {
    lectures: [KI02, KI03, SLIDES],
    sessions: sessions ?? [{ id: "s-hunt", title: "Hunt's algorithm", lectureIds: [KI02.id, SLIDES.id], updated_at: daysAgo(0) }],
  });
  installExamBackend(api, { exams: [exam] });
}

beforeEach(() => {
  api = mockApi();
  saveToken(makeToken(1800));
  Object.defineProperty(window, "innerWidth", { configurable: true, value: 1440 });
});
afterEach(() => api.restore());

const search = (router) => Object.fromEntries(new URLSearchParams(router.state.location.search));
const card = (number) => screen.getAllByRole("article")[number - 1];
const askButton = (number) => within(card(number)).queryByRole("button", { name: `Ask about this: question ${number}` });
const created = () => chats.sessions.filter((session) => session.id.startsWith("s-new"));

async function openResults(path = "/workspace/exam?chat=s-hunt&exam=e-done") {
  const user = userEvent.setup();
  const result = renderApp(path);
  await screen.findByRole("region", { name: /Your answers are checked|Some answers are still waiting/ });
  return { user, ...result };
}

/* Asks about question `number` and waits for the answer in the chat. */
async function ask(user, number) {
  await user.click(askButton(number));
  await screen.findByRole("heading", { level: 1 });
  return screen.findByText("Hunt's algorithm grows a tree", { exact: false }).catch(() => screen.findByText(/1 \+ 1 equals 2/));
}

describe("Ask about this", () => {
  it("is on wrong, partly correct and unanswered answers only", async () => {
    setup();
    await openResults();
    expect(askButton(1)).not.toBeInTheDocument(); // correct
    expect(askButton(2)).toBeInTheDocument(); // partly correct
    expect(askButton(3)).toBeInTheDocument(); // wrong
    expect(askButton(4)).toBeInTheDocument(); // not answered
    expect(askButton(2)).toHaveTextContent("Ask about this");
  });

  it("is not on an answer waiting to be graded", async () => {
    setup({ exam: submittedExam({ ungraded: true }) });
    await openResults();
    expect(within(card(2)).getByText("Waiting to be graded")).toBeInTheDocument();
    expect(askButton(2)).not.toBeInTheDocument();
    expect(askButton(3)).toBeInTheDocument();
  });

  it("asks in the open chat when it has the exam's lectures, and the answer cites its pages", async () => {
    setup();
    const { user, router } = await openResults();
    await ask(user, 3);

    expect(router.state.location.pathname).toBe("/workspace");
    expect(search(router)).toEqual({ chat: "s-hunt", exam: "e-done" });
    expect(created()).toEqual([]);
    expect(chats.sent).toHaveLength(1);
    expect(chats.sent[0].id).toBe("s-hunt");
    expect(chats.sent[0].content).toBe(
      [
        "I got this exam question wrong. Can you explain it using my lecture materials?",
        `Question:\n> ${QUESTIONS[2].question}`,
        "Choices:\n> A. 0\n> B. 1",
        "I picked: B\nCorrect choices: A",
        "Feedback I got:\n> You selected b, the correct answer is a.",
      ].join("\n\n")
    );

    // Shown as a heading with its parts, not as the raw text.
    const thread = screen.getByRole("list", { name: "Messages" });
    const question = within(thread).getByText("I got this exam question wrong. Can you explain it using my lecture materials?").closest("li");
    expect(within(question).getByText("From your exam results")).toBeInTheDocument();
    expect(within(question).getByText(QUESTIONS[2].question)).toBeInTheDocument();
    expect(within(question).getByText("I picked")).toBeInTheDocument();
    expect(question).not.toHaveTextContent(">");
    // The answer cites the chat's materials.
    const sources = await screen.findByRole("list", { name: "Sources" });
    expect(within(sources).getAllByRole("button").map((chip) => chip.textContent)).toContain("p. 2KI 02 Classification Part1");
  });

  it("uses the open chat even before the list of chats has loaded", async () => {
    setup();
    let release;
    chats.sessionsGate = new Promise((resolve) => {
      release = resolve;
    });
    const { user, router } = await openResults();
    await user.click(askButton(3));
    await waitFor(() => expect(chats.sent).toHaveLength(1));
    expect(chats.sent[0].id).toBe("s-hunt");
    expect(created()).toEqual([]);
    release();
    expect(await screen.findByText("Hunt's algorithm grows a tree", { exact: false })).toBeInTheDocument();
    expect(search(router)).toEqual({ chat: "s-hunt", exam: "e-done" });
  });

  it("creates a chat with the exam's lectures when the open chat doesn't have them, leaving out deleted ones", async () => {
    // The exam is on KI 03 and a deleted lecture; the open chat has KI 02 only.
    setup({ exam: { ...submittedExam(), lectures: [{ lecture_id: KI03.id, title: KI03.title }, { lecture_id: null, title: "Entropy (deleted)" }] } });
    const { user, router } = await openResults();
    await ask(user, 2);

    expect(created()).toHaveLength(1);
    const [session] = created();
    expect(session.lectureIds).toEqual([KI03.id]);
    expect(session.title).toBe(`Exam question: ${QUESTIONS[1].question}`);
    expect(search(router)).toEqual({ chat: session.id, exam: "e-done" });
    expect(chats.sent).toEqual([{ id: session.id, content: expect.stringMatching(/^I got this exam question partly right\./) }]);
    expect(chats.sent[0].content).toContain("My answer:\n> When all records have one class");
    // The new chat is open, with its material, and listed first.
    expect(screen.getByRole("heading", { level: 1, name: `Exam question: ${QUESTIONS[1].question}` })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: `Open ${KI03.title} beside the chat` })).toBeInTheDocument();
  });

  it("creates a chat with the exam's lectures when no chat is open", async () => {
    setup();
    const { user, router } = await openResults("/workspace/exam?exam=e-done");
    await ask(user, 4);

    expect(created().map((session) => session.lectureIds)).toEqual([[KI02.id]]);
    expect(search(router)).toEqual({ chat: created()[0].id, exam: "e-done" });
    expect(chats.sent[0].content).toContain("My answer: I didn’t answer.");
    expect(within(screen.getByRole("list", { name: "Messages" })).getByText("I didn’t answer.")).toBeInTheDocument();
  });

  it("creates a chat without materials when all the exam's lectures were deleted; the answer is marked general", async () => {
    setup({ exam: { ...submittedExam(), lectures: [{ lecture_id: null, title: "Entropy (deleted)" }] } });
    const { user } = await openResults();
    await ask(user, 4);

    expect(created().map((session) => session.lectureIds)).toEqual([[]]);
    expect(await screen.findByText("Not from your materials")).toBeInTheDocument();
  });

  it("shows why the chat couldn't be opened, on the card", async () => {
    setup({ sessions: [] });
    api.onPost("/student_profile/chat/sessions").reply(503, { status: false, message: "The chat service is busy", data: null });
    const { user, router } = await openResults("/workspace/exam?exam=e-done");
    await user.click(askButton(3));
    expect(await within(card(3)).findByRole("alert")).toHaveTextContent("The chat service is busy");
    expect(router.state.location.pathname).toBe("/workspace/exam");
    expect(askButton(3)).toBeEnabled();
  });
});

describe("back to the exam results", () => {
  it("keeps the exam while a source is opened in the chat, and goes back to the results", async () => {
    setup();
    const { user, router } = await openResults();
    await ask(user, 3);

    await user.click(await screen.findByRole("button", { name: /^p\. 2/ }));
    await waitFor(() => expect(search(router)).toEqual({ chat: "s-hunt", lecture: KI02.id, exam: "e-done" }));
    const pdf = await screen.findByRole("region", { name: `PDF viewer: ${KI02.title}` });
    expect(within(pdf).getByText("Opened from a source in the answer: page 2")).toBeInTheDocument();

    await user.click(screen.getByRole("link", { name: "Back to exam results" }));
    expect(await screen.findByRole("region", { name: "Your answers are checked" })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe("/workspace/exam");
    expect(search(router)).toEqual({ chat: "s-hunt", lecture: KI02.id, exam: "e-done" });
  });

  it("goes back from a new chat to the results, and Back to chat returns to that chat", async () => {
    setup();
    const { user, router } = await openResults("/workspace/exam?exam=e-done");
    await ask(user, 3);
    const chatId = created()[0].id;

    await user.click(screen.getByRole("link", { name: "Back to exam results" }));
    expect(await screen.findByRole("region", { name: "Your answers are checked" })).toBeInTheDocument();
    expect(search(router)).toEqual({ chat: chatId, exam: "e-done" });

    await user.click(screen.getByRole("link", { name: "Back to chat" }));
    expect(await screen.findByText("Hunt's algorithm grows a tree", { exact: false })).toBeInTheDocument();
    expect(search(router)).toEqual({ chat: chatId });
    expect(screen.queryByRole("link", { name: "Back to exam results" })).not.toBeInTheDocument();
  });

  it("drops the way back when another chat is opened", async () => {
    setup({
      sessions: [
        { id: "s-hunt", title: "Hunt's algorithm", lectureIds: [KI02.id], updated_at: daysAgo(0) },
        { id: "s-other", title: "Regression", lectureIds: [KI03.id], updated_at: daysAgo(1) },
      ],
    });
    const { user, router } = await openResults();
    await ask(user, 3);
    expect(screen.getByRole("link", { name: "Back to exam results" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Regression" }));
    await waitFor(() => expect(search(router)).toEqual({ chat: "s-other" }));
    expect(screen.queryByRole("link", { name: "Back to exam results" })).not.toBeInTheDocument();
  });
});
