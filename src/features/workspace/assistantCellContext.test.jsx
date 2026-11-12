import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createCell, createNotebook } from "../../services/notebook/ipynb.js";
import { saveNotebook } from "../../services/notebook/notebookStorage.js";
import { CELL_DRAG_TYPE } from "../../services/notebook/cellContext.js";
import { makeToken, mockApi, renderApp, saveToken, TEST_USER } from "../../test/helpers.jsx";
import { installChatBackend } from "../../test/chatBackend.js";

/*
  Adding notebook cells to a chat question by dragging the cell's grip onto the chat
  (mouse, touch/pen, or Enter on the grip), over the real workspace. The notebook panel is
  opened from the header first; the chat beside it is the drop target.
*/

const CODE = "def double(x):\n    return x * 2\n\n\tprint(double(3))  # tab kept";
const MARKDOWN = "# Notes\n\n- first point\n- second point";

let api;
let backend;

function setupBackend(options) {
  backend = installChatBackend(api, options);
}

beforeEach(() => {
  api = mockApi();
  const token = makeToken(1800);
  saveToken(token);

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
const chatPanel = () => document.querySelector(".chat");

/* Drags a cell's grip and drops it on `target` (the composer by default). */
function dragCellTo(name, target = composer()) {
  const transfer = dataTransfer();
  fireEvent.dragStart(grip(name), { dataTransfer: transfer });
  fireEvent.dragOver(target, { dataTransfer: transfer });
  fireEvent.drop(target, { dataTransfer: transfer });
  fireEvent.dragEnd(grip(name), { dataTransfer: transfer });
}

async function openWorkspace({ chat = true } = {}) {
  setupBackend({ chat });
  const result = renderApp("/workspace");
  // Wait until the server's features are known, then open the notebook beside the chat.
  if (chat) await screen.findByText("Your chats will be listed here.");
  else await screen.findByText("This server has no chat assistant yet.");
  fireEvent.click(screen.getByRole("button", { name: "Notebook" }));
  await screen.findByRole("group", { name: "Python cell 1" });
  return result;
}

const composer = () => document.querySelector(".composer");
const cellList = () => within(composer()).queryByRole("list", { name: "Notebook cells" });

describe("notebook cells as chat context", () => {
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
    expect(backend.sent).toEqual([]);
    expect(document.querySelector(".chat-msg")).toBeNull();

    // Dropping the same unchanged cell again does not duplicate it.
    dragCellTo("Python cell 1");
    expect(within(cellList()).getAllByRole("listitem")).toHaveLength(1);
    expect(screen.getByText("Python cell 1 is already in your message to the study assistant.")).toBeInTheDocument();
  });

  it("accepts a drop anywhere on the chat, including the conversation area", async () => {
    await openWorkspace();
    dragCellTo("Markdown cell 2", document.querySelector(".chat__scroll"));
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
    expect(backend.sent).toEqual([]);
  });

  it("supports touch drags on the grip, highlighting the chat and adding on release over it", async () => {
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
      expect(chatPanel()).toHaveClass("chat--drop-over");

      fireEvent.pointerUp(handle, { pointerId: 7, pointerType: "touch", clientX: 600, clientY: 10 });
    } finally {
      document.elementFromPoint = original;
    }
    expect(within(cellList()).getByText("Markdown cell 2")).toBeInTheDocument();
    expect(composer()).not.toHaveClass("composer--drop-ready");
    expect(document.querySelector(".nb-cell__drag-ghost")).toBeNull();
    expect(backend.sent).toEqual([]);
  });

  it("does not add a touch drag released outside the chat, or a tap on the grip", async () => {
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
    expect(backend.sent).toEqual([]);
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
    dragCellTo("Markdown cell 2");
    dragCellTo("Python cell 1");
    expect(backend.sent).toEqual([]);

    await user.type(screen.getByLabelText("Message to the study assistant"), "What do these notes mean?{Enter}");

    await waitFor(() => expect(backend.sent).toHaveLength(1));
    // The backend has no cell field, so the full sources (indentation kept) follow the question.
    const { content } = backend.sent[0];
    expect(content.startsWith("What do these notes mean?\n\nNotebook context")).toBe(true);
    expect(content).toContain(MARKDOWN);
    expect(content).toContain(CODE);
    expect(content.indexOf("Markdown cell 2")).toBeLessThan(content.indexOf("Python cell 1"));
    // The chat shows what was typed, with the added cells listed under it.
    expect(await screen.findByText("What do these notes mean?")).toBeInTheDocument();
    expect(screen.getByText("Notebook context: Markdown cell 2")).toBeInTheDocument();
    expect(screen.getByText("Notebook context: Python cell 1")).toBeInTheDocument();
    await waitFor(() => expect(cellList()).toBeNull());
  });

  it("lets a draft with cells be prepared when the server has no chat assistant, without inventing an answer", async () => {
    await openWorkspace({ chat: false });
    dragCellTo("Python cell 1");

    expect(within(cellList()).getByText("Python cell 1")).toBeInTheDocument();
    expect(screen.getByText("This server has no chat assistant yet.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Send message" })).toBeDisabled();
    expect(document.querySelector(".chat-msg--assistant")).toBeNull();
  });

  it("keeps the draft context if sending fails", async () => {
    const user = userEvent.setup();
    await openWorkspace();
    api.onPost(/\/chat\/sessions\/[^/]+\/messages$/).reply(503, { detail: "offline" });
    dragCellTo("Python cell 1");

    await user.type(screen.getByLabelText("Message to the study assistant"), "Why?{Enter}");

    expect(await screen.findByText("offline")).toBeInTheDocument();
    expect(within(cellList()).getByText("Python cell 1")).toBeInTheDocument();
  });

  it("refuses a question that is too long with its cells, keeping the text", async () => {
    const user = userEvent.setup();
    await openWorkspace();
    dragCellTo("Python cell 1");
    const field = screen.getByLabelText("Message to the study assistant");
    fireEvent.change(field, { target: { value: "x".repeat(1990) } });
    await user.click(screen.getByRole("button", { name: "Send message" }));

    expect(screen.getByText(/the limit is 2000/)).toBeInTheDocument();
    expect(field).toHaveValue("x".repeat(1990));
    expect(backend.sent).toEqual([]);
  });
});
