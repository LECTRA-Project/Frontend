import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { makeToken, mockApi, renderApp, saveToken } from "../../test/helpers.jsx";
import { daysAgo, installChatBackend, lectureFixture, SUGGESTION } from "../../test/chatBackend.js";

/*
  The assistant's suggestion of the next step under the latest answer ("Yes, please" asks for it).
  With weak topics it offers two next steps, Review and Continue, as buttons that send their own
  text (issue #169).
*/

const REVIEW = "Review: Gini index, which went wrong in your exam (page 15)";
const CONTINUE = "Continue with: Splitting continuous attributes (page 19)";

const KI02 = lectureFixture("l-ki02", "KI 02 Classification Part1", { count: 65 });
const EX31 = lectureFixture("l-ex31", "Exercise 3-1 Classification", { count: 2 });

const page = (lecture, number) => ({
  lecture_id: lecture.id,
  lecture_title: lecture.title,
  page_number: number,
  source_type: "page",
  location: `Page ${number}`,
});
const message = (id, session, role, content, extra = {}) => ({
  id,
  session_id: session,
  role,
  content,
  sources: role === "assistant" ? [] : null,
  created_at: daysAgo(0),
  ...extra,
});

let api;
let backend;

beforeEach(() => {
  api = mockApi();
  saveToken(makeToken(1800));
  Object.defineProperty(window, "innerWidth", { configurable: true, value: 1440 });
  backend = installChatBackend(api, {
    lectures: [KI02, EX31],
    sessions: [
      { id: "s-hunt", title: "Hunt's algorithm", lectureIds: [KI02.id, EX31.id], updated_at: daysAgo(0) },
      { id: "s-general", title: "General maths", lectureIds: [], updated_at: daysAgo(1) },
      { id: "s-weak", title: "Gini after the exam", lectureIds: [KI02.id], updated_at: daysAgo(2) },
      { id: "s-ask", title: "Which way next", lectureIds: [KI02.id], updated_at: daysAgo(3) },
    ],
    messages: {
      "s-hunt": [
        message("m1", "s-hunt", "user", "Tell me about Hunt's algorithm"),
        message("m2", "s-hunt", "assistant", "Hunt's algorithm builds a tree greedily.", {
          sources: [page(KI02, 12)],
          suggestion: "Shall I explain impurity measures (page 13)?",
        }),
        message("m3", "s-hunt", "user", "And the stopping rule?"),
        message("m4", "s-hunt", "assistant", "It stops when a node is pure.", {
          sources: [page(KI02, 14)],
          suggestion: "Shall I explain the Gini index (page 15)?",
        }),
      ],
      "s-general": [
        message("g1", "s-general", "user", "What is 1+1?"),
        message("g2", "s-general", "assistant", "1 + 1 equals 2."),
      ],
      "s-weak": [
        message("w1", "s-weak", "user", "What is entropy?"),
        message("w2", "s-weak", "assistant", "Entropy measures impurity.", {
          sources: [page(KI02, 16)],
          suggestion: "Shall I explain information gain (page 17)?",
        }),
        message("w3", "s-weak", "user", "And the misclassification error?"),
        message("w4", "s-weak", "assistant", "It counts the wrong majority votes.", {
          sources: [page(KI02, 18)],
          review_suggestion: REVIEW,
          suggestion: CONTINUE,
        }),
      ],
      "s-ask": [
        message("a1", "s-ask", "user", "What is entropy?"),
        message("a2", "s-ask", "assistant", "Entropy measures impurity.", {
          sources: [page(KI02, 16)],
          review_suggestion: REVIEW,
          suggestion: CONTINUE,
        }),
        message("a3", "s-ask", "user", "Yes, please"),
        message("a4", "s-ask", "assistant", "Would you like to review the Gini index or continue with page 19?", {
          asks_choice: true,
          review_suggestion: REVIEW,
          suggestion: CONTINUE,
        }),
      ],
    },
  });
});
afterEach(() => {
  api.restore();
  vi.unstubAllGlobals();
  localStorage.clear();
});

const menu = () => screen.getByRole("navigation", { name: "Chats and this chat's materials" });

async function openWorkspace() {
  const user = userEvent.setup();
  renderApp("/workspace");
  await within(await screen.findByRole("navigation", { name: "Chats and this chat's materials" })).findByRole("button", {
    name: "Hunt's algorithm",
  });
  return user;
}

async function openChat(user, title) {
  await user.click(within(menu()).getByRole("button", { name: title }));
  await screen.findByRole("heading", { level: 1, name: title });
}

describe("the suggestion of the next step", () => {
  it("shows only the latest answer's suggestion, and Yes, please asks for it", async () => {
    const user = await openWorkspace();
    await openChat(user, "Hunt's algorithm");
    expect(await screen.findByText("Shall I explain the Gini index (page 15)?")).toBeInTheDocument();
    expect(screen.queryByText("Shall I explain impurity measures (page 13)?")).not.toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "Yes, please" })).toHaveLength(1);

    await user.click(screen.getByRole("button", { name: "Yes, please" }));
    await waitFor(() => expect(backend.sent).toEqual([{ id: "s-hunt", content: "Yes, please" }]));
    // The new answer's suggestion replaces the old one.
    expect(await screen.findByText(SUGGESTION, {}, { timeout: 4000 })).toBeInTheDocument();
    expect(screen.queryByText("Shall I explain the Gini index (page 15)?")).not.toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "Yes, please" })).toHaveLength(1);
  });

  it("is not shown under a general answer", async () => {
    const user = await openWorkspace();
    await openChat(user, "General maths");
    expect(await screen.findByText("1 + 1 equals 2.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Yes, please" })).not.toBeInTheDocument();
    expect(screen.queryByText("Next step")).not.toBeInTheDocument();
  });

  it("offers Review and Continue after an exam mistake; each sends its own text", async () => {
    const user = await openWorkspace();
    await openChat(user, "Gini after the exam");
    const group = await screen.findByRole("group", { name: "Choose your next step" });
    const options = within(group).getAllByRole("button");
    expect(options.map((button) => button.textContent)).toEqual([REVIEW, CONTINUE]);
    // No "Yes, please": with two options a yes wouldn't say which.
    expect(screen.queryByRole("button", { name: "Yes, please" })).not.toBeInTheDocument();
    // Only the latest answer offers anything.
    expect(screen.queryByText("Shall I explain information gain (page 17)?")).not.toBeInTheDocument();

    await user.click(within(group).getByRole("button", { name: REVIEW }));
    await waitFor(() => expect(backend.sent).toEqual([{ id: "s-weak", content: REVIEW }]));
    // The choice shows in the chat like a typed question.
    expect(await screen.findByText(REVIEW, { selector: ".chat-msg__text" })).toBeInTheDocument();
  });

  it("sends the Continue option's text", async () => {
    const user = await openWorkspace();
    await openChat(user, "Gini after the exam");
    const group = await screen.findByRole("group", { name: "Choose your next step" });
    await user.click(within(group).getByRole("button", { name: CONTINUE }));
    await waitFor(() => expect(backend.sent).toEqual([{ id: "s-weak", content: CONTINUE }]));
  });

  it("keeps both options under a question back, without the not-from-materials label", async () => {
    const user = await openWorkspace();
    await openChat(user, "Which way next");
    expect(await screen.findByText("Would you like to review the Gini index or continue with page 19?")).toBeInTheDocument();
    const group = screen.getByRole("group", { name: "Choose your next step" });
    expect(within(group).getAllByRole("button")).toHaveLength(2);
    expect(screen.queryByText("Not from your materials")).not.toBeInTheDocument();
  });

  it("is hidden while the next question is answered", async () => {
    const user = await openWorkspace();
    await openChat(user, "Hunt's algorithm");
    await screen.findByText("Shall I explain the Gini index (page 15)?");
    let release;
    api.onPost(/\/chat\/sessions\/s-hunt\/messages$/).replyOnce(() => new Promise((resolve) => (release = resolve)));
    api.handlers.unshift(api.handlers.pop()); // checked before the fake backend's handler
    await user.type(screen.getByLabelText("Message to the study assistant"), "Next question{Enter}");
    await waitFor(() => expect(screen.queryByRole("button", { name: "Yes, please" })).not.toBeInTheDocument());
    release([503, { status: false, message: "The AI assistant is currently unavailable. Please try again later", data: null }]);
    expect(await screen.findByText("The AI assistant is currently unavailable. Please try again later")).toBeInTheDocument();
  });
});
