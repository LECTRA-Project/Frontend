import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createCell, createNotebook } from "../../services/notebook/ipynb.js";
import { saveNotebook } from "../../services/notebook/notebookStorage.js";
import { CELL_DRAG_TYPE } from "../../services/notebook/cellContext.js";
import { makeToken, mockApi, ok, openMaterialsMenu, renderApp, saveToken, TEST_USER } from "../../test/helpers.jsx";

/*
  Adding notebook cells to a Study Assistant question by dragging the cell's grip onto
  the assistant (mouse, touch/pen, or Enter on the grip), over the real workspace.
*/

const CODE = "def double(x):\n    return x * 2\n\n\tprint(double(3))  # tab kept";
const MARKDOWN = "# Notes\n\n- first point\n- second point";

// A lecture as the deployed backend returns it; chats are always about one lecture.
const LECTURE = {
  id: "l-search",
  user_id: TEST_USER.id,
  title: "Search algorithms",
  original_filename: "search.pdf",
  file_type: "application/pdf",
  file_size: 4096,
  s3_url: "https://bucket.example/search.pdf",
  uploaded_at: "2026-11-01T10:00:00Z",
  updated_at: "2026-11-01T10:00:00Z",
};
const CHAT = "/student_profile/chat/sessions";

let api;
let chatAvailable; // whether the server has the Lecture Chat API
let messageReply; // [status, body] for the next message sent
let sent; // { session, lectureId, content } of every message sent

beforeEach(() => {
  api = mockApi();
  const token = makeToken(1800);
  saveToken(token);
  chatAvailable = true;
  messageReply = null;
  sent = [];
  api.onGet("/users/me").reply(200, ok(TEST_USER));
  api.onGet("/student_profile/lectures").reply(200, ok({ lectures: [LECTURE], page: 1, page_size: 100, total: 1, total_pages: 1 }));
  api.onGet(CHAT).reply(() => (chatAvailable ? [200, ok({ sessions: [], page: 1, page_size: 100, total: 0, total_pages: 0 })] : [404, { detail: "Not Found" }]));
  api.onPost(CHAT).reply((config) => {
    const { lecture_id: lectureId } = JSON.parse(config.data);
    return [201, ok({ id: "s1", title: "New chat", lecture: { id: lectureId, title: LECTURE.title, file_type: LECTURE.file_type }, created_at: "2026-11-12T10:00:00Z", updated_at: "2026-11-12T10:00:00Z" })];
  });
  api.onPost(/\/chat\/sessions\/[^/]+\/messages$/).reply((config) => {
    const { content } = JSON.parse(config.data);
    sent.push({ session: config.url.split("/").at(-2), content });
    if (messageReply) return messageReply;
    const session = { id: "s1", title: "Notes", lecture: { id: LECTURE.id, title: LECTURE.title, file_type: LECTURE.file_type }, created_at: "2026-11-12T10:00:00Z", updated_at: "2026-11-12T10:00:01Z" };
    return [201, ok({
      question: { id: "q1", session_id: "s1", role: "user", content, sources: null, created_at: "2026-11-12T10:00:01Z" },
      answer: { id: "a1", session_id: "s1", role: "assistant", content: "They are bullet notes.", sources: [], created_at: "2026-11-12T10:00:02Z" },
      session,
    })];
  });

  const notebook = createNotebook("Week 3");
  notebook.cells = [{ ...createCell("code"), source: CODE }, { ...createCell("markdown"), source: MARKDOWN }];
  saveNotebook(TEST_USER.id, notebook);
});
afterEach(() => api.restore());

/* A DataTransfer stand-in (jsdom has none) that carries data from dragstart to drop. */
function dataTransfer() {
  const data = new Map();
  return {
    get types() {
      return [...data.keys()];
    },
    setData: (type, value) => data.set(type, value),
    getData: (type) => data.get(type) ?? "",
    setDragImage: vi.fn(),
    effectAllowed: "all",
    dropEffect: "none",
  };
}

const grip = (name) => screen.getByRole("button", { name: `Drag ${name} to the Study Assistant` });
const assistantPanel = () => document.querySelector(".assistant");

/* Drags a cell's grip and drops it on `target` (the composer by default). */
function dragCellTo(name, target = composer()) {
  const transfer = dataTransfer();
  fireEvent.dragStart(grip(name), { dataTransfer: transfer });
  fireEvent.dragOver(target, { dataTransfer: transfer });
  fireEvent.drop(target, { dataTransfer: transfer });
  fireEvent.dragEnd(grip(name), { dataTransfer: transfer });
}

/* Opens the lecture in the viewer: a chat is about the lecture that's open. */
async function openLecture(user) {
  const panel = await openMaterialsMenu();
  await user.click(await within(panel).findByRole("button", { name: /^Search algorithms/ }));
  await screen.findByRole("region", { name: /PDF viewer: Search algorithms/ });
}

async function openWorkspace() {
  const result = renderApp("/workspace");
  await screen.findByRole("group", { name: "Python cell 1" });
  // Wait until the workspace knows whether the server has the chat API (the assistant then
  // switches from "Connecting…" to the chat or "Not available").
  await waitFor(() => expect(screen.queryByText("Connecting…")).not.toBeInTheDocument());
  return result;
}

const composer = () => document.querySelector(".composer");
const cellList = () => within(composer()).queryByRole("list", { name: "Notebook cells" });

describe("notebook cells as Study Assistant context", () => {
  it("has no “Add to Study Assistant” item in the cell menu", async () => {
    const user = userEvent.setup();
    await openWorkspace();
    await user.click(screen.getByRole("button", { name: "More actions for cell 1" }));
    expect(screen.getByRole("menuitem", { name: "Duplicate cell" })).toBeInTheDocument();
    expect(screen.queryByRole("menuitem", { name: /Study Assistant/i })).not.toBeInTheDocument();
  });

  it("adds a dropped cell with its full source, without running it or sending anything", async () => {
    await openWorkspace();
    dragCellTo("Python cell 1");

    const list = cellList();
    expect(within(list).getByText("Python cell 1")).toBeInTheDocument();
    expect(within(list).getByText("4 lines")).toBeInTheDocument();
    expect(within(list).getByLabelText("Source of Python cell 1").textContent).toBe(CODE);
    expect(screen.getByText("Python cell 1 added to your message to the study assistant.")).toBeInTheDocument();

    // Not run, not changed, not sent.
    expect(screen.queryByText("In [*]:")).not.toBeInTheDocument();
    expect(document.querySelector(".nb-output")).toBeNull();
    expect(screen.getByRole("group", { name: "Python cell 1" })).toHaveTextContent("return x * 2");
    expect(sent).toHaveLength(0);
    expect(document.querySelector(".chat-msg")).toBeNull();

    // Dropping the same unchanged cell again does not duplicate it.
    dragCellTo("Python cell 1");
    expect(within(cellList()).getAllByRole("listitem")).toHaveLength(1);
    expect(screen.getByText("Python cell 1 is already in your message to the study assistant.")).toBeInTheDocument();
  });

  it("accepts a drop anywhere on the Study Assistant panel, including the chat area", async () => {
    await openWorkspace();
    dragCellTo("Markdown cell 2", document.querySelector(".assistant__body"));
    expect(within(cellList()).getByText("Markdown cell 2")).toBeInTheDocument();
  });

  it("adds the cell with Enter on its grip and moves focus to the message box", async () => {
    const user = userEvent.setup();
    await openWorkspace();
    grip("Python cell 1").focus();
    await user.keyboard("{Enter}");

    expect(within(cellList()).getByText("Python cell 1")).toBeInTheDocument();
    expect(screen.getByLabelText("Message to the study assistant")).toHaveFocus();
    expect(screen.queryByText("In [*]:")).not.toBeInTheDocument(); // Enter on the grip does not edit or run
    expect(sent).toHaveLength(0);
  });

  it("supports touch drags on the grip, highlighting the assistant and adding on release over it", async () => {
    await openWorkspace();
    const handle = grip("Markdown cell 2");
    const original = document.elementFromPoint;
    document.elementFromPoint = (x) => (x > 500 ? document.querySelector(".composer__input") : handle);
    try {
      fireEvent.pointerDown(handle, { pointerId: 7, pointerType: "touch", clientX: 10, clientY: 10 });
      fireEvent.pointerMove(handle, { pointerId: 7, pointerType: "touch", clientX: 40, clientY: 10 });
      expect(composer()).toHaveClass("composer--drop-ready");
      expect(document.querySelector(".nb-cell__drag-ghost")).toHaveTextContent("Markdown cell 2");

      fireEvent.pointerMove(handle, { pointerId: 7, pointerType: "touch", clientX: 600, clientY: 10 });
      expect(composer()).toHaveClass("composer--drop-over");
      expect(assistantPanel()).toHaveClass("assistant--drop-over");

      fireEvent.pointerUp(handle, { pointerId: 7, pointerType: "touch", clientX: 600, clientY: 10 });
    } finally {
      document.elementFromPoint = original;
    }
    expect(within(cellList()).getByText("Markdown cell 2")).toBeInTheDocument();
    expect(composer()).not.toHaveClass("composer--drop-ready");
    expect(document.querySelector(".nb-cell__drag-ghost")).toBeNull();
    expect(sent).toHaveLength(0);
  });

  it("does not add a touch drag released outside the assistant, or a tap on the grip", async () => {
    await openWorkspace();
    const handle = grip("Python cell 1");
    const original = document.elementFromPoint;
    document.elementFromPoint = () => handle;
    try {
      fireEvent.pointerDown(handle, { pointerId: 3, pointerType: "touch", clientX: 10, clientY: 10 });
      fireEvent.pointerUp(handle, { pointerId: 3, pointerType: "touch", clientX: 11, clientY: 10 });
      fireEvent.pointerDown(handle, { pointerId: 4, pointerType: "touch", clientX: 10, clientY: 10 });
      fireEvent.pointerMove(handle, { pointerId: 4, pointerType: "touch", clientX: 80, clientY: 90 });
      fireEvent.pointerUp(handle, { pointerId: 4, pointerType: "touch", clientX: 80, clientY: 90 });
    } finally {
      document.elementFromPoint = original;
    }
    expect(cellList()).toBeNull();
    expect(composer()).not.toHaveClass("composer--drop-ready");
  });

  it("adds a dragged cell as a separate item and shows the drop target while dragging", async () => {
    await openWorkspace();
    dragCellTo("Python cell 1");

    const handle = grip("Markdown cell 2");
    expect(handle).toHaveAttribute("draggable", "true");
    const transfer = dataTransfer();

    fireEvent.dragStart(handle, { dataTransfer: transfer });
    expect(transfer.types).toEqual([CELL_DRAG_TYPE]); // no plain text, so editors don't paste it
    expect(composer()).toHaveClass("composer--drop-ready");
    expect(screen.getByText("Drop to add this cell to your question")).toBeInTheDocument();

    fireEvent.dragOver(composer(), { dataTransfer: transfer });
    expect(composer()).toHaveClass("composer--drop-over");
    fireEvent.drop(composer(), { dataTransfer: transfer });
    fireEvent.dragEnd(handle, { dataTransfer: transfer });

    const items = within(cellList()).getAllByRole("listitem");
    expect(items).toHaveLength(2);
    expect(within(items[1]).getByText("Markdown cell 2")).toBeInTheDocument();
    expect(within(items[1]).getByLabelText("Source of Markdown cell 2").textContent).toBe(MARKDOWN);
    expect(composer()).not.toHaveClass("composer--drop-ready");
    expect(composer()).not.toHaveClass("composer--drop-over");
    expect(sent).toHaveLength(0);
  });

  it("ignores drops that are not notebook cells", async () => {
    await openWorkspace();
    const transfer = dataTransfer();
    transfer.setData("text/plain", "hello");
    fireEvent.dragOver(composer(), { dataTransfer: transfer });
    expect(composer()).not.toHaveClass("composer--drop-over");
    fireEvent.drop(composer(), { dataTransfer: transfer });
    expect(cellList()).toBeNull();
  });

  it("removes a cell from the draft", async () => {
    const user = userEvent.setup();
    await openWorkspace();
    dragCellTo("Python cell 1");

    await user.click(screen.getByRole("button", { name: "Remove Python cell 1 from your message" }));

    expect(cellList()).toBeNull();
    expect(screen.getByText("Python cell 1 removed from your message.")).toBeInTheDocument();
  });

  it("sends the cells with the question only when Send is pressed, then clears them", async () => {
    const user = userEvent.setup();
    await openWorkspace();
    await openLecture(user);
    dragCellTo("Markdown cell 2");
    dragCellTo("Python cell 1");
    expect(sent).toHaveLength(0);

    await user.type(screen.getByLabelText("Message to the study assistant"), "What do these notes mean?{Enter}");

    expect(await screen.findByText("They are bullet notes.")).toBeInTheDocument();
    expect(JSON.parse(api.history.post.find((request) => request.url === CHAT).data)).toEqual({ lecture_id: LECTURE.id });
    expect(sent).toHaveLength(1);
    // The chat API has no cell field, so the full sources (indentation kept) follow the question.
    expect(sent[0].content.startsWith("What do these notes mean?\n\nNotebook context")).toBe(true);
    expect(sent[0].content).toContain(MARKDOWN);
    expect(sent[0].content).toContain(CODE);
    await waitFor(() => expect(cellList()).toBeNull());
  });

  it("lets a draft with cells be prepared when the server has no assistant, without inventing an answer", async () => {
    chatAvailable = false;
    await openWorkspace();
    expect(await screen.findByText("Not available")).toBeInTheDocument();
    dragCellTo("Python cell 1");

    expect(within(cellList()).getByText("Python cell 1")).toBeInTheDocument();
    expect(screen.getByText(/The assistant isn’t available on this server yet/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Send message" })).toBeDisabled();
    expect(document.querySelector(".chat-msg--assistant")).toBeNull();
    expect(sent).toHaveLength(0);
  });

  it("keeps the draft context if sending fails", async () => {
    messageReply = [503, { status: false, message: "The assistant is offline.", data: null }];
    const user = userEvent.setup();
    await openWorkspace();
    await openLecture(user);
    dragCellTo("Python cell 1");

    await user.type(screen.getByLabelText("Message to the study assistant"), "Why?{Enter}");

    expect(await screen.findByText(/The assistant is offline/)).toBeInTheDocument();
    expect(within(cellList()).getByText("Python cell 1")).toBeInTheDocument();
  });
});
