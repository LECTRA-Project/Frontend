import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { makeToken, mockApi, renderApp, saveToken } from "../../test/helpers.jsx";
import { daysAgo, installChatBackend, lectureFixture, SUGGESTION } from "../../test/chatBackend.js";

/* The assistant's suggestion of the next step under the latest answer ("Yes, please" asks for it). */

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
