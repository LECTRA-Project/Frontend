import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { makeToken, mockApi, ok, renderApp, saveToken, TEST_USER } from "../../test/helpers.jsx";

/*
  The Study Assistant with the Lecture Chat API (saved chat sessions, one lecture each),
  over the real workspace. Lectures have the deployed backend's shape (no AI processing
  fields), which is the server that has the chat API.
*/

const BASE = "/student_profile/chat/sessions";

function lecture(id, title, fileName, fileType) {
  return {
    id,
    user_id: TEST_USER.id,
    title,
    original_filename: fileName,
    file_type: fileType,
    file_size: 4096,
    s3_url: `https://bucket.example/${fileName}`,
    uploaded_at: "2026-11-01T10:00:00Z",
    updated_at: "2026-11-01T10:00:00Z",
  };
}

const SEARCH = lecture("l-search", "Search algorithms", "search.pdf", "application/pdf");
const GAMES = lecture("l-games", "Game playing", "games.pdf", "application/pdf");

const chatSession = (id, title, lec = SEARCH, updated = "2026-11-11T10:00:00Z") => ({
  id,
  title,
  lecture: lec && { id: lec.id, title: lec.title, file_type: lec.file_type },
  created_at: updated,
  updated_at: updated,
});

let api;
let sessions;
let sent;

beforeEach(() => {
  api = mockApi();
  saveToken(makeToken(1800));
  sent = [];
  sessions = [chatSession("s-old", "Minimax recap", GAMES, "2026-11-10T09:00:00Z")];
  const lectures = [SEARCH, GAMES];
  api.onGet("/users/me").reply(200, ok(TEST_USER));
  api.onGet("/student_profile/lectures").reply(200, ok({ lectures, page: 1, page_size: 100, total: 2, total_pages: 1 }));
  // The deployed backend has no GET for one lecture.
  api.onGet(/\/student_profile\/lectures\/.+/).reply(405);
  api.onGet(BASE).reply(() => [200, ok({ sessions, page: 1, page_size: 100, total: sessions.length, total_pages: 1 })]);
  api.onPost(BASE).reply((config) => {
    const body = JSON.parse(config.data);
    const lec = [SEARCH, GAMES].find((item) => item.id === body.lecture_id);
    const created = chatSession("s-new", "New chat", lec, "2026-11-11T11:00:00Z");
    sessions = [created, ...sessions];
    return [201, ok(created)];
  });
  api.onPost(/\/chat\/sessions\/[^/]+\/messages$/).reply((config) => {
    const id = config.url.split("/").at(-2);
    const { content } = JSON.parse(config.data);
    sent.push({ id, content });
    const current = sessions.find((item) => item.id === id);
    const renamed = { ...current, title: current.title === "New chat" ? content.slice(0, 60) : current.title };
    sessions = sessions.map((item) => (item.id === id ? renamed : item));
    return [
      201,
      ok({
        question: { id: `q-${sent.length}`, session_id: id, role: "user", content, sources: null, created_at: "2026-11-11T11:00:01Z" },
        answer: {
          id: `a-${sent.length}`,
          session_id: id,
          role: "assistant",
          content: "A* uses **f = g + h**.",
          sources: [{ lecture_id: current.lecture.id, lecture_title: current.lecture.title, page_number: 4 }],
          created_at: "2026-11-11T11:00:02Z",
        },
        session: renamed,
      }),
    ];
  });
  api.onGet(`${BASE}/s-old/messages`).reply(
    200,
    ok({
      messages: [
        { id: "m1", session_id: "s-old", role: "user", content: "What is minimax?", sources: null, created_at: "2026-11-10T09:00:00Z" },
        {
          id: "m2",
          session_id: "s-old",
          role: "assistant",
          content: "Minimax picks the best worst case.",
          sources: [{ lecture_id: GAMES.id, lecture_title: GAMES.title, page_number: 2 }],
          created_at: "2026-11-10T09:00:01Z",
        },
      ],
      page: 1,
      page_size: 100,
      total: 2,
      total_pages: 1,
    })
  );
});

afterEach(() => api.restore());

const assistant = () => screen.getByRole("region", { name: "Study assistant" });
const input = () => screen.getByLabelText("Message to the study assistant");

async function openWorkspace() {
  const user = userEvent.setup();
  renderApp("/workspace");
  await screen.findByRole("region", { name: "Study assistant" });
  await within(assistant()).findByLabelText("Chat about");
  return user;
}

describe("Study Assistant lecture chats", () => {
  it("starts a chat about the chosen lecture, shows the answer with its cited page, and saves it", async () => {
    const user = await openWorkspace();
    expect(within(assistant()).getByText("New chat", { selector: ".chat-bar__title" })).toBeInTheDocument();

    await user.selectOptions(within(assistant()).getByLabelText("Chat about"), "l-games");
    await user.type(input(), "What is A*?");
    await user.click(screen.getByRole("button", { name: "Send message" }));

    expect(await within(assistant()).findByText("f = g + h")).toBeInTheDocument();
    const create = api.history.post.find((request) => request.url === BASE);
    expect(JSON.parse(create.data)).toEqual({ lecture_id: "l-games" });
    expect(sent).toEqual([{ id: "s-new", content: "What is A*?" }]);
    // The backend titled the chat after the first question.
    expect(within(assistant()).getByText("What is A*?", { selector: ".chat-bar__title" })).toBeInTheDocument();
    expect(within(assistant()).getByText("About")).toBeInTheDocument();
    expect(within(assistant()).getByRole("list", { name: "Sources" })).toHaveTextContent("p. 4");

    // A follow-up stays in the same chat.
    await user.type(input(), "And h?");
    await user.click(screen.getByRole("button", { name: "Send message" }));
    await waitFor(() => expect(sent).toHaveLength(2));
    expect(sent[1].id).toBe("s-new");
    expect(api.history.post.filter((request) => request.url === BASE)).toHaveLength(1);
  });

  it("opens an earlier chat from the Chats list with its saved messages", async () => {
    const user = await openWorkspace();
    await user.click(within(assistant()).getByRole("button", { name: /^Chats/ }));
    await user.click(await within(assistant()).findByRole("button", { name: /^Minimax recap/ }));

    expect(await within(assistant()).findByText("Minimax picks the best worst case.")).toBeInTheDocument();
    expect(within(assistant()).getByText("What is minimax?")).toBeInTheDocument();
    expect(within(assistant()).getByText("Game playing", { selector: ".chat-bar__lecture" })).toBeInTheDocument();

    await user.type(input(), "Alpha-beta?");
    await user.click(screen.getByRole("button", { name: "Send message" }));
    await waitFor(() => expect(sent).toEqual([{ id: "s-old", content: "Alpha-beta?" }]));
  });

  it("renames and deletes chats", async () => {
    api.onPatch(`${BASE}/s-old`).reply((config) => [200, ok({ ...sessions[0], title: JSON.parse(config.data).title })]);
    api.onDelete(`${BASE}/s-old`).reply(200, ok({ id: "s-old" }));
    const user = await openWorkspace();
    await user.click(within(assistant()).getByRole("button", { name: /^Chats/ }));

    await user.click(await within(assistant()).findByRole("button", { name: "Rename “Minimax recap”" }));
    const field = within(assistant()).getByLabelText("Chat title");
    await user.clear(field);
    await user.type(field, "Exam prep{Enter}");
    expect(await within(assistant()).findByRole("button", { name: /^Exam prep/ })).toBeInTheDocument();
    expect(JSON.parse(api.history.patch[0].data)).toEqual({ title: "Exam prep" });

    await user.click(within(assistant()).getByRole("button", { name: "Delete “Exam prep”" }));
    await user.click(await screen.findByRole("button", { name: "Delete" }));
    expect(await within(assistant()).findByText("No chats yet")).toBeInTheDocument();
    expect(api.history.delete[0].url).toBe(`${BASE}/s-old`);
  });

  it("keeps a failed question visible with the server's error and keeps the draft context", async () => {
    api.onPost(/\/chat\/sessions\/[^/]+\/messages$/).reply(503, {
      detail: "The AI assistant is currently unavailable. Please try again later",
    });
    const user = await openWorkspace();
    await user.type(input(), "What is BFS?");
    await user.click(screen.getByRole("button", { name: "Send message" }));

    expect(await within(assistant()).findByText(/currently unavailable/)).toBeInTheDocument();
    expect(within(assistant()).getByText("What is BFS?")).toBeInTheDocument();
  });

  it("can't send in a chat whose lecture was deleted", async () => {
    sessions = [chatSession("s-old", "Minimax recap", null)];
    const user = await openWorkspace();
    await user.click(within(assistant()).getByRole("button", { name: /^Chats/ }));
    await user.click(await within(assistant()).findByRole("button", { name: /^Minimax recap/ }));

    expect(await within(assistant()).findByText(/lecture of this chat was deleted/)).toBeInTheDocument();
    await user.type(input(), "Hello");
    expect(screen.getByRole("button", { name: "Send message" })).toBeDisabled();
  });

  it("explains what to do when the lecture has no readable text saved", async () => {
    api.onPost(/\/chat\/sessions\/[^/]+\/messages$/).reply((config) => {
      const id = config.url.split("/").at(-2);
      const current = sessions.find((item) => item.id === id);
      return [
        201,
        ok({
          question: { id: "q", session_id: id, role: "user", content: "what is Anaconda", sources: null, created_at: "2026-11-11T11:00:01Z" },
          answer: {
            id: "a",
            session_id: id,
            role: "assistant",
            content:
              "The selected lectures have no readable text yet, so I cannot answer from them. Text is read from PDF, PPTX and notebook files when they are uploaded.",
            sources: [],
            created_at: "2026-11-11T11:00:02Z",
          },
          session: current,
        }),
      ];
    });
    const user = await openWorkspace();
    await user.type(input(), "what is Anaconda");
    await user.click(screen.getByRole("button", { name: "Send message" }));

    expect(await within(assistant()).findByText("This lecture has no readable text saved")).toBeInTheDocument();
    expect(within(assistant()).getByText(/delete it and upload the file again/)).toBeInTheDocument();
    await user.click(within(assistant()).getByRole("button", { name: "Upload the file again" }));
    expect(await screen.findByRole("dialog")).toBeInTheDocument();
  });

  it("after a timeout, shows the answer the backend saved anyway", async () => {
    api.onPost(/\/chat\/sessions\/[^/]+\/messages$/).timeout();
    api.onGet(`${BASE}/s-new/messages`).reply(
      200,
      ok({
        messages: [
          { id: "q1", session_id: "s-new", role: "user", content: "what is FMEA", sources: null, created_at: "2026-11-11T11:00:01Z" },
          { id: "a1", session_id: "s-new", role: "assistant", content: "Failure mode and effects analysis.", sources: [], created_at: "2026-11-11T11:01:40Z" },
        ],
        page: 1,
        page_size: 100,
        total: 2,
        total_pages: 1,
      })
    );
    const user = await openWorkspace();
    await user.type(input(), "what is FMEA");
    await user.click(screen.getByRole("button", { name: "Send message" }));

    expect(await within(assistant()).findByText("Failure mode and effects analysis.")).toBeInTheDocument();
    expect(within(assistant()).queryByText(/timed out/)).not.toBeInTheDocument();
  });

  it("after a timeout with nothing saved yet, says the answer may still arrive", async () => {
    api.onPost(/\/chat\/sessions\/[^/]+\/messages$/).timeout();
    api.onGet(`${BASE}/s-new/messages`).reply(200, ok({ messages: [], page: 1, page_size: 100, total: 0, total_pages: 0 }));
    const user = await openWorkspace();
    await user.type(input(), "what is FMEA");
    await user.click(screen.getByRole("button", { name: "Send message" }));

    expect(await within(assistant()).findByText(/taking longer than usual/)).toBeInTheDocument();
  });
});
