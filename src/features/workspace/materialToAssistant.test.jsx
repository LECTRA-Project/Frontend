import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { makeToken, mockApi, ok, renderApp, saveToken, TEST_USER, openMaterialsMenu } from "../../test/helpers.jsx";

/*
  Dragging course materials into the Study Assistant composer as context, over the real
  workspace. The materials are backend lectures; a dropped material becomes the lecture the
  chat is about (Lecture Chat API: the chat is created with its lecture_id).
*/

function lecture(id, title, fileName, fileType, overrides = {}) {
  return {
    id,
    user_id: TEST_USER.id,
    title,
    original_filename: fileName,
    file_type: fileType,
    file_size: 4096,
    s3_url: `local://${fileName}`,
    uploaded_at: "2026-11-01T10:00:00Z",
    updated_at: "2026-11-01T10:00:00Z",
    description: null,
    course: null,
    processing_status: "completed",
    processing_error: null,
    processing_attempts: 1,
    processed_at: "2026-11-01T10:00:05Z",
    content_version: 1,
    chunk_count: 4,
    source_count: 3,
    source_type: "page",
    ...overrides,
  };
}

const PDF = lecture("l-pdf", "Search algorithms", "search.pdf", "application/pdf");
const SLIDES = lecture(
  "l-pptx",
  "Game playing",
  "games.pptx",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  { source_type: "slide" }
);
const NOTES = lecture("l-md", "Week 2 notes", "week2.md", "text/markdown", { source_type: "section" });
const NOTEBOOK = lecture("l-ipynb", "Lab 1", "lab1.ipynb", "application/x-ipynb+json", { source_type: "cell" });
const PROCESSING = lecture("l-new", "Fresh upload", "fresh.pdf", "application/pdf", { processing_status: "processing" });
const IMAGE = lecture("l-img", "Whiteboard photo", "board.png", "image/png", { processing_status: "skipped", source_type: null });

const CHAT = "/student_profile/chat/sessions";

let api;
let asked; // { lectureId, content } of every question sent
let chatAvailable;

beforeEach(() => {
  api = mockApi();
  asked = [];
  chatAvailable = true;
  saveToken(makeToken(1800));
  const lectures = [PDF, SLIDES, NOTES, NOTEBOOK, PROCESSING, IMAGE];
  api.onGet("/users/me").reply(200, ok(TEST_USER));
  api.onGet("/student_profile/lectures").reply(200, ok({ lectures, page: 1, page_size: 100, total: lectures.length, total_pages: 1 }));
  api.onGet(CHAT).reply(() => (chatAvailable ? [200, ok({ sessions: [], page: 1, page_size: 100, total: 0, total_pages: 0 })] : [404, { detail: "Not Found" }]));
  let sessionLecture = null;
  api.onPost(CHAT).reply((config) => {
    const lec = lectures.find((item) => item.id === JSON.parse(config.data).lecture_id);
    sessionLecture = { id: lec.id, title: lec.title, file_type: lec.file_type };
    return [201, ok({ id: "s1", title: "New chat", lecture: sessionLecture, created_at: "2026-11-12T10:00:00Z", updated_at: "2026-11-12T10:00:00Z" })];
  });
  api.onPost(/\/chat\/sessions\/[^/]+\/messages$/).reply((config) => {
    const { content } = JSON.parse(config.data);
    asked.push({ lectureId: sessionLecture.id, content });
    const session = { id: "s1", title: content, lecture: sessionLecture, created_at: "2026-11-12T10:00:00Z", updated_at: "2026-11-12T10:00:01Z" };
    return [201, ok({
      question: { id: "q1", session_id: "s1", role: "user", content, sources: null, created_at: "2026-11-12T10:00:01Z" },
      answer: { id: "a1", session_id: "s1", role: "assistant", content: "From your materials.", sources: [], created_at: "2026-11-12T10:00:02Z" },
      session,
    })];
  });
});
afterEach(() => {
  api.restore();
  document.elementFromPoint = undefined;
});

const composer = () => document.querySelector(".composer");
const chips = () => within(composer()).queryByRole("list", { name: "Course materials" });
const materialsPanel = () => screen.getByRole("region", { name: "Course materials" });
const row = (title) => within(materialsPanel()).getByRole("button", { name: new RegExp(`^${title}`) });
const assistant = () => document.querySelector(".assistant");

async function openWorkspace() {
  const user = userEvent.setup();
  renderApp("/workspace");
  await openMaterialsMenu();
  await within(materialsPanel()).findByText("Search algorithms");
  // Wait until the workspace knows whether the server has the chat API.
  await waitFor(() => expect(screen.queryByText("Connecting…")).not.toBeInTheDocument());
  return user;
}

/* Drags `source` (a row or a grip) with `pointerType` and releases over `target` (null = nowhere). */
function drag(source, target, { pointerType = "mouse", release = true } = {}) {
  document.elementFromPoint = () => source;
  fireEvent.pointerDown(source, { pointerId: 5, pointerType, button: 0, clientX: 20, clientY: 20 });
  fireEvent.pointerMove(source, { pointerId: 5, pointerType, clientX: 60, clientY: 20 });
  document.elementFromPoint = () => target;
  fireEvent.pointerMove(source, { pointerId: 5, pointerType, clientX: 900, clientY: 700 });
  if (!release) return;
  fireEvent.pointerUp(source, { pointerId: 5, pointerType, clientX: 900, clientY: 700 });
  fireEvent.click(source); // what the browser sends after the press — must not open the material
}

const intoComposer = () => screen.getByLabelText("Message to the study assistant");

describe("dragging course materials into the Study Assistant", () => {
  it.each([
    ["Search algorithms", "search.pdf", "PDF"],
    ["Game playing", "games.pptx", "PPTX"],
    ["Week 2 notes", "week2.md", "MD"],
    ["Lab 1", "lab1.ipynb", "IPYNB"],
  ])("adds %s as a removable chip without opening, moving or sending it", async (title, fileName, type) => {
    await openWorkspace();
    drag(row(title), intoComposer());

    const chip = within(chips()).getByRole("listitem");
    expect(chip).toHaveTextContent(fileName);
    expect(chip).toHaveTextContent(type);
    expect(within(chip).getByRole("button", { name: `Remove ${fileName} from your message` })).toBeInTheDocument();
    expect(screen.getByText(`${fileName} added to your message to the study assistant.`)).toBeInTheDocument();

    // The original stays in Course materials, isn't opened or selected, and nothing was sent.
    expect(row(title)).toBeInTheDocument();
    expect(row(title)).not.toHaveAttribute("aria-current");
    expect(screen.queryByRole("region", { name: /PDF viewer|Viewer:/ })).not.toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Notebook" })).toBeVisible();
    expect(asked).toHaveLength(0);
  });

  it("highlights the drop area while a material is dragged over it", async () => {
    await openWorkspace();
    drag(row("Search algorithms"), null, { release: false });
    expect(composer()).toHaveClass("composer--drop-ready");
    expect(screen.getByText("Drop to add “search.pdf” to your question")).toBeInTheDocument();
    expect(document.querySelector(".section-ghost")).toHaveTextContent("search.pdf");

    const source = row("Search algorithms");
    document.elementFromPoint = () => intoComposer();
    fireEvent.pointerMove(source, { pointerId: 5, pointerType: "mouse", clientX: 910, clientY: 700 });
    expect(assistant()).toHaveClass("assistant--drop-over");
    expect(composer()).toHaveClass("composer--drop-over");
    fireEvent.pointerUp(source, { pointerId: 5, pointerType: "mouse", clientX: 910, clientY: 700 });
    expect(composer()).not.toHaveClass("composer--drop-ready");
    expect(document.querySelector(".section-ghost")).toBeNull();
  });

  it("keeps several materials, removes extras, ignores duplicates, and chats about the one left only on Send", async () => {
    const user = await openWorkspace();
    drag(row("Search algorithms"), intoComposer());
    drag(row("Game playing"), intoComposer());
    drag(row("Lab 1"), assistant()); // anywhere on the assistant panel
    drag(row("Search algorithms"), intoComposer()); // already there
    expect(within(chips()).getAllByRole("listitem")).toHaveLength(3);
    expect(screen.getByText("search.pdf is already in your message to the study assistant.")).toBeInTheDocument();
    // A chat is about one lecture: with several, the assistant says to keep one.
    expect(screen.getByText("A chat answers from one lecture at a time. Keep one course material and remove the others.")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Remove games.pptx from your message" }));
    await user.click(screen.getByRole("button", { name: "Remove lab1.ipynb from your message" }));
    expect(within(chips()).getAllByRole("listitem")).toHaveLength(1);
    expect(asked).toHaveLength(0);

    await user.type(intoComposer(), "Explain this{Enter}");
    expect(await screen.findByText("From your materials.")).toBeInTheDocument();
    expect(JSON.parse(api.history.post.find((request) => request.url === CHAT).data)).toEqual({ lecture_id: "l-pdf" });
    expect(asked).toEqual([{ lectureId: "l-pdf", content: "Explain this" }]); // answered from that lecture
    await waitFor(() => expect(chips()).toBeNull());
  });

  it("explains why a material can't be added: still processing, or not a supported type", async () => {
    await openWorkspace();

    drag(row("Fresh upload"), null, { release: false });
    const source = row("Fresh upload");
    document.elementFromPoint = () => intoComposer();
    fireEvent.pointerMove(source, { pointerId: 5, pointerType: "mouse", clientX: 910, clientY: 700 });
    expect(assistant()).toHaveClass("assistant--drop-invalid");
    expect(composer()).toHaveClass("composer--drop-invalid");
    expect(within(composer()).getByText("“fresh.pdf” is still being processed, so the study assistant can’t read it yet.")).toBeInTheDocument();
    fireEvent.pointerUp(source, { pointerId: 5, pointerType: "mouse", clientX: 910, clientY: 700 });
    expect(chips()).toBeNull();
    expect(document.querySelector(".workspace__notice")).toHaveTextContent("still being processed");

    drag(row("Whiteboard photo"), intoComposer());
    expect(chips()).toBeNull();
    expect(document.querySelector(".workspace__notice")).toHaveTextContent(
      "“board.png” can’t be added: the study assistant reads PDFs, slides, notes and notebooks only."
    );
  });

  it("does nothing when the material is dropped outside the assistant or the drag is cancelled", async () => {
    await openWorkspace();
    drag(row("Search algorithms"), screen.getByRole("region", { name: "Notebook" }));
    expect(chips()).toBeNull();
    expect(screen.getByText("search.pdf was not added to your message.")).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: /PDF viewer/ })).not.toBeInTheDocument(); // not opened either

    drag(row("Lab 1"), intoComposer(), { release: false });
    fireEvent.keyDown(window, { key: "Escape" });
    expect(composer()).not.toHaveClass("composer--drop-ready");
    fireEvent.pointerUp(row("Lab 1"), { pointerId: 5, pointerType: "mouse", clientX: 900, clientY: 700 });
    expect(chips()).toBeNull();
  });

  it("still opens a material with a plain click on its row, closing the menu", async () => {
    const user = await openWorkspace();
    await user.click(row("Game playing"));
    expect(screen.queryByRole("region", { name: "Course materials" })).not.toBeInTheDocument();
    await openMaterialsMenu();
    expect(row("Game playing")).toHaveAttribute("aria-current", "true");
    expect(chips()).toBeNull();
  });

  it("adds a material from the keyboard with its grip and moves focus to the message box", async () => {
    const user = await openWorkspace();
    within(materialsPanel()).getByRole("button", { name: "Add Week 2 notes to your Study Assistant message" }).focus();
    await user.keyboard("{Enter}");
    expect(within(chips()).getByRole("listitem")).toHaveTextContent("week2.md");
    // The menu closes so the message box can be used.
    expect(screen.queryByRole("region", { name: "Course materials" })).not.toBeInTheDocument();
    await waitFor(() => expect(intoComposer()).toHaveFocus());
    expect(asked).toHaveLength(0);
  });

  it("drags with touch from the grip, while a touch on the row itself doesn't start a drag", async () => {
    await openWorkspace();
    drag(row("Lab 1"), intoComposer(), { pointerType: "touch" });
    expect(chips()).toBeNull();
    await openMaterialsMenu(); // the touch on the row opened Lab 1, which closed the menu

    const gripButton = within(materialsPanel()).getByRole("button", { name: "Add Lab 1 to your Study Assistant message" });
    drag(gripButton, intoComposer(), { pointerType: "touch" });
    expect(within(chips()).getAllByRole("listitem")).toHaveLength(1); // added once, not again by the click
  });

  it("lets a draft be prepared when the server has no assistant, without claiming an answer", async () => {
    chatAvailable = false;
    await openWorkspace();
    expect(await screen.findByText("Not available")).toBeInTheDocument();
    drag(row("Search algorithms"), intoComposer());

    expect(within(chips()).getByRole("listitem")).toHaveTextContent("search.pdf");
    expect(screen.getByText(/The assistant isn’t available on this server yet/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Send message" })).toBeDisabled();
    expect(asked).toHaveLength(0);
  });
});
