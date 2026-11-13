import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { makeToken, mockApi, renderApp, saveToken } from "../../test/helpers.jsx";
import { daysAgo, installChatBackend, lectureFixture } from "../../test/chatBackend.js";

/*
  The chat-first workspace over the real app routes and a fake chat backend:
  materials per chat, chats grouped by day, answers with sources or the general badge,
  the material viewer opened from a source, the notebook toggle / pin / widen, and the
  resize limits.
*/

const KI02 = lectureFixture("l-ki02", "KI 02 Classification Part1", { count: 65 });
const REG = lectureFixture("l-reg", "Regression solution", { fileType: "application/x-ipynb+json", count: 31 });
const EX31 = lectureFixture("l-ex31", "Exercise 3-1 Classification", { count: 2 });

const message = (id, session, role, content, sources = null) => ({ id, session_id: session, role, content, sources, created_at: daysAgo(0) });
const page = (lecture, number, type = "page") => ({
  lecture_id: lecture.id,
  lecture_title: lecture.title,
  page_number: number,
  source_type: type,
  location: `${{ page: "Page", cell: "Cell" }[type]} ${number}`,
});

let api;
let backend;

function setup(options = {}) {
  backend = installChatBackend(api, {
    lectures: [KI02, REG, EX31],
    sessions: [
      { id: "s-hunt", title: "Hunt's algorithm", lectureIds: [KI02.id], updated_at: daysAgo(0) },
      { id: "s-loan", title: "Exercise 3.1.1 bank loans", lectureIds: [EX31.id], updated_at: daysAgo(1) },
      { id: "s-reg", title: "Regression metrics", lectureIds: [REG.id], updated_at: daysAgo(3) },
      { id: "s-old", title: "Last month", lectureIds: [], updated_at: daysAgo(40) },
    ],
    messages: {
      "s-hunt": [
        message("m1", "s-hunt", "user", "Tell me about Hunt's algorithm"),
        message("m2", "s-hunt", "assistant", "Hunt's algorithm builds a decision tree greedily.", [page(KI02, 12), page(KI02, 13)]),
        message("m3", "s-hunt", "user", "What is 1+1?"),
        message("m4", "s-hunt", "assistant", "This is not covered in your lecture materials, but in general: 1 + 1 equals 2.", []),
      ],
      // Saved before sources had a source_type: the material type decides (a notebook → cell).
      "s-reg": [
        message("r1", "s-reg", "user", "Which metrics?"),
        message("r2", "s-reg", "assistant", "MSE, RMSE and R².", [{ lecture_id: REG.id, lecture_title: REG.title, page_number: 16 }]),
      ],
    },
    ...options,
  });
}

beforeEach(() => {
  api = mockApi();
  saveToken(makeToken(1800));
  Object.defineProperty(window, "innerWidth", { configurable: true, value: 1440 });
  let next = 0;
  vi.stubGlobal("URL", Object.assign(URL, { createObjectURL: () => `blob:test/${next++}`, revokeObjectURL: () => {} }));
});
afterEach(() => {
  api.restore();
  vi.unstubAllGlobals();
});

const menu = () => screen.getByRole("navigation", { name: "Chats and this chat's materials" });
const materialsList = () => within(menu()).getByRole("list", { name: "Materials in this chat" });
const materialNames = () => within(materialsList()).queryAllByRole("button", { name: /beside the chat$/ }).map((button) => button.getAttribute("aria-label"));
const viewer = () => document.querySelector(".cf-viewer");
const notebookPanel = () => screen.queryByRole("complementary", { name: "Notebook panel" });
const input = () => screen.getByLabelText("Message to the study assistant");

async function openWorkspace() {
  const user = userEvent.setup();
  const result = renderApp("/workspace");
  await within(await screen.findByRole("navigation", { name: "Chats and this chat's materials" })).findByRole("button", { name: "Hunt's algorithm" });
  return { user, ...result };
}

async function openChat(user, title) {
  await user.click(within(menu()).getByRole("button", { name: title }));
  await screen.findByRole("heading", { level: 1, name: title });
}

describe("chat-first workspace: chats and their materials", () => {
  beforeEach(() => setup());

  it("starts on an empty new chat and lists the chats grouped by their last activity", async () => {
    await openWorkspace();
    expect(screen.getByRole("heading", { name: "What are we studying today?" })).toBeInTheDocument();
    expect(screen.getByText("No materials in this chat yet.")).toBeInTheDocument();
    // No upload button in the chat and no "No materials yet" chip in the composer; uploads are in the menu.
    expect(screen.queryByRole("button", { name: "Upload materials" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "No materials yet" })).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 1, name: "New chat" })).toBeInTheDocument();
    expect(materialNames()).toEqual([]);
    expect(within(menu()).getByRole("button", { name: "Upload a PDF, slides or a notebook for this chat" })).toBeInTheDocument();

    const groups = within(menu()).getAllByRole("heading", { level: 3 }).map((node) => node.textContent);
    expect(groups).toEqual(["Today", "Yesterday", "Previous 7 days", "Older"]);
    expect(within(within(menu()).getByRole("list", { name: "Today" })).getByRole("button", { name: "Hunt's algorithm" })).toHaveTextContent("Hunt's algorithm");
    expect(within(within(menu()).getByRole("list", { name: "Yesterday" })).getByRole("button", { name: "Exercise 3.1.1 bank loans" })).toHaveTextContent("Exercise 3.1.1 bank loans");
    expect(within(within(menu()).getByRole("list", { name: "Previous 7 days" })).getByRole("button", { name: "Regression metrics" })).toHaveTextContent("Regression metrics");
    // The menu has no name / Settings footer (Account settings is in the header's profile menu).
    expect(within(menu()).queryByRole("link", { name: "Settings" })).not.toBeInTheDocument();
    // No notebook until it is asked for.
    expect(notebookPanel()).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Notebook" })).toHaveAttribute("aria-pressed", "false");
  });

  it("opens a chat with only its materials, its answers' sources and the general-answer badge", async () => {
    const { user } = await openWorkspace();
    await openChat(user, "Hunt's algorithm");

    expect(materialNames()).toEqual(["Open KI 02 Classification Part1 beside the chat"]);
    expect(within(menu()).getByRole("button", { name: "Hunt's algorithm" })).toHaveAttribute("aria-current", "page");
    expect(await screen.findByText("Hunt's algorithm builds a decision tree greedily.")).toBeInTheDocument();
    const sources = screen.getByRole("list", { name: "Sources" });
    expect(within(sources).getAllByRole("button").map((chip) => chip.textContent)).toEqual([
      "p. 12KI 02 Classification Part1",
      "p. 13KI 02 Classification Part1",
    ]);
    // Only the answer without sources is marked as general knowledge.
    expect(screen.getAllByText("Not from your materials")).toHaveLength(1);
    expect(screen.getByText(/1 \+ 1 equals 2/).closest(".chat-answer")).toHaveTextContent("Not from your materials");
    // The composer's scope chip names the chat's material and shows it in the menu.
    await user.click(screen.getByRole("button", { name: "KI 02 Classification Part1" }));
    await waitFor(() => expect(document.getElementById("cf-materials")).toHaveFocus());
  });

  it("switches the materials and closes the viewer when another chat is opened; a new chat has none", async () => {
    const { user } = await openWorkspace();
    await openChat(user, "Hunt's algorithm");
    await user.click(within(menu()).getByRole("button", { name: "Open KI 02 Classification Part1 beside the chat" }));
    expect(await screen.findByRole("region", { name: "PDF viewer: KI 02 Classification Part1" })).toBeInTheDocument();
    expect(within(menu()).getByRole("button", { name: "Open KI 02 Classification Part1 beside the chat" })).toHaveAttribute("aria-pressed", "true");

    await openChat(user, "Regression metrics");
    expect(materialNames()).toEqual(["Open Regression solution beside the chat"]);
    expect(viewer()).toBeNull();
    expect(await screen.findByText("MSE, RMSE and R².")).toBeInTheDocument();

    await user.click(within(menu()).getByRole("button", { name: "New chat" }));
    expect(screen.getByRole("heading", { name: "What are we studying today?" })).toBeInTheDocument();
    expect(materialNames()).toEqual([]);
  });

  it("opens a cited PDF page from a source chip, with the banner and the page highlighted until moving on", async () => {
    const { user } = await openWorkspace();
    await openChat(user, "Hunt's algorithm");
    await user.click(await screen.findByRole("button", { name: /^p\. 13/ }));

    const pdf = await screen.findByRole("region", { name: "PDF viewer: KI 02 Classification Part1" });
    expect(within(pdf).getByLabelText("Page number")).toHaveValue("13");
    expect(within(pdf).getByText("Opened from a source in the answer: page 13")).toBeInTheDocument();
    expect(pdf.querySelector(".viewer__position")).toHaveClass("viewer__position--cited");
    await waitFor(() => expect(pdf.querySelector("iframe")?.getAttribute("src")).toMatch(/^blob:test\/\d+#page=13&view=FitH&toolbar=0/));
    expect(screen.getByRole("complementary", { name: "KI 02 Classification Part1, open beside the chat" })).toBeInTheDocument();
    expect(within(pdf).getByRole("link", { name: "Open in a new tab" })).toHaveAttribute("target", "_blank");

    await user.click(within(pdf).getByRole("button", { name: "Next page" }));
    expect(within(pdf).getByLabelText("Page number")).toHaveValue("14");
    expect(within(pdf).queryByText(/Opened from a source/)).not.toBeInTheDocument();
    expect(pdf.querySelector(".viewer__position")).not.toHaveClass("viewer__position--cited");

    await user.click(within(pdf).getByRole("button", { name: "Close the material viewer" }));
    expect(viewer()).toBeNull();
  });

  it("opens a cited notebook cell in the extracted content, highlighted, with cell-by-cell navigation", async () => {
    const { user } = await openWorkspace();
    await openChat(user, "Regression metrics");
    await user.click(await screen.findByRole("button", { name: /^Cell 16/ }));

    const view = await screen.findByRole("region", { name: "Lecture: Regression solution" });
    expect(within(view).getByText("Opened from a source in the answer: cell 16")).toBeInTheDocument();
    await waitFor(() => expect(view.querySelector('[data-source="cell-16"]')).toHaveClass("source-block--focused"));
    expect(view.querySelector(".viewer__position")).toHaveTextContent("Cell 16");

    await user.click(within(view).getByRole("button", { name: "Next cell" }));
    expect(view.querySelector(".viewer__position")).toHaveTextContent("Cell 17");
    expect(within(view).queryByText(/Opened from a source/)).not.toBeInTheDocument();
    await user.click(within(view).getByRole("button", { name: "Zoom in" }));
    expect(within(view).getByText("110%")).toBeInTheDocument();
    expect(within(view).getByRole("button", { name: "Run in notebook" })).toBeInTheDocument();
  });

  it("uploads into a new chat: the chat is created with the new lecture", async () => {
    const { user } = await openWorkspace();
    await user.click(within(menu()).getByRole("button", { name: "Upload a material to this chat" }));
    const dialog = await screen.findByRole("dialog");
    await user.upload(within(dialog).getByTestId("upload-input"), new File(["%PDF-1.4"], "qa-Lecture 05.pdf", { type: "application/pdf" }));
    await user.click(within(dialog).getByRole("button", { name: "Upload" }));

    await waitFor(() => expect(materialNames()).toEqual(["Open qa Lecture 05 beside the chat"]));
    const created = api.history.post.find((request) => request.url === "/student_profile/chat/sessions");
    expect(JSON.parse(created.data)).toEqual({ lecture_ids: [backend.lectures[0].id] });
    expect(within(within(menu()).getByRole("list", { name: "Today" })).getAllByRole("button")[0]).toHaveTextContent("New chat");
    expect(screen.getByText("1 material ready in this chat.")).toBeInTheDocument();
  });

  it("uploads into the open chat, adds one of the other materials, and removes one from the chat", async () => {
    const { user } = await openWorkspace();
    await openChat(user, "Hunt's algorithm");

    await user.click(within(menu()).getByRole("button", { name: "Upload a material to this chat" }));
    const dialog = await screen.findByRole("dialog");
    await user.upload(within(dialog).getByTestId("upload-input"), new File(["{}"], "week4.ipynb", { type: "application/x-ipynb+json" }));
    await user.click(within(dialog).getByRole("button", { name: "Upload" }));
    await waitFor(() => expect(materialNames()).toHaveLength(2));
    expect(api.history.post.some((request) => request.url === "/student_profile/chat/sessions/s-hunt/lectures")).toBe(true);

    await user.click(within(menu()).getByRole("button", { name: "Add one of your materials to this chat" }));
    await user.click(screen.getByRole("menuitem", { name: "Exercise 3-1 Classification" }));
    await waitFor(() => expect(materialNames()).toHaveLength(3));

    // Removing the material open in the viewer closes the viewer too.
    await user.click(within(menu()).getByRole("button", { name: "Open KI 02 Classification Part1 beside the chat" }));
    await screen.findByRole("region", { name: "PDF viewer: KI 02 Classification Part1" });
    await user.click(within(menu()).getByRole("button", { name: "Remove KI 02 Classification Part1 from this chat" }));
    await waitFor(() => expect(materialNames()).not.toContain("Open KI 02 Classification Part1 beside the chat"));
    expect(api.history.delete.map((request) => request.url)).toContain(`/student_profile/chat/sessions/s-hunt/lectures/${KI02.id}`);
    expect(viewer()).toBeNull();
    // The lecture itself is kept: it can be added again.
    await user.click(within(menu()).getByRole("button", { name: "Add one of your materials to this chat" }));
    expect(screen.getByRole("menuitem", { name: "KI 02 Classification Part1" })).toBeInTheDocument();
  });

  it("asks in a new chat without materials: the chat is created empty and the answer is marked general", async () => {
    const { user } = await openWorkspace();
    await user.type(input(), "What is 1+1?{Enter}");

    expect(await screen.findByText(/1 \+ 1 equals 2/)).toBeInTheDocument();
    expect(screen.getByText("Not from your materials")).toBeInTheDocument();
    const created = api.history.post.find((request) => request.url === "/student_profile/chat/sessions");
    expect(JSON.parse(created.data)).toEqual({ lecture_ids: [] });
    expect(backend.sent).toEqual([{ id: expect.stringMatching(/^s-new/), content: "What is 1+1?" }]);
    expect(await screen.findByRole("heading", { level: 1, name: "What is 1+1?" })).toBeInTheDocument();
  });

  it("answers from the chat's materials with source chips", async () => {
    const { user } = await openWorkspace();
    await openChat(user, "Regression metrics");
    await user.type(input(), "Which metrics are computed?");
    await user.click(screen.getByRole("button", { name: "Send message" }));

    await screen.findByText("top-down");
    expect(backend.sent).toEqual([{ id: "s-reg", content: "Which metrics are computed?" }]);
    const lists = screen.getAllByRole("list", { name: "Sources" });
    expect(within(lists.at(-1)).getByRole("button")).toHaveTextContent("Cell 2Regression solution");
  });

  it("renames and deletes the open chat", async () => {
    const { user } = await openWorkspace();
    await openChat(user, "Hunt's algorithm");
    await user.click(screen.getByRole("button", { name: "Chat actions" }));
    await user.click(screen.getByRole("menuitem", { name: "Rename chat" }));
    const field = screen.getByLabelText("Chat title");
    await user.clear(field);
    await user.type(field, "Decision trees{Enter}");
    expect(await screen.findByRole("heading", { level: 1, name: "Decision trees" })).toBeInTheDocument();
    expect(within(menu()).getByRole("button", { name: "Decision trees" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Chat actions" }));
    await user.click(screen.getByRole("menuitem", { name: "Delete chat" }));
    await user.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Delete" }));
    await waitFor(() => expect(within(menu()).queryByRole("button", { name: "Decision trees" })).not.toBeInTheDocument());
    expect(screen.getByRole("heading", { name: "What are we studying today?" })).toBeInTheDocument();
  });

  describe("removing a chat from its ⋯ menu", () => {
    const chatRow = (title) => within(menu()).getByRole("button", { name: title });
    async function chooseRemove(user, title) {
      await user.click(within(menu()).getByRole("button", { name: `Actions for ${title}` }));
      await user.click(screen.getByRole("menuitem", { name: "Remove" }));
      return screen.getByRole("dialog", { name: "Remove chat?" });
    }
    const deletes = () => api.history.delete.map((request) => request.url);

    it("asks first, then deletes the chat and takes it off the list", async () => {
      const { user } = await openWorkspace();
      const dialog = await chooseRemove(user, "Regression metrics");
      expect(dialog).toHaveTextContent("“Regression metrics” and all its messages will be deleted. Its materials are kept.");
      await user.click(within(dialog).getByRole("button", { name: "Remove" }));

      await waitFor(() => expect(within(menu()).queryByRole("button", { name: "Regression metrics" })).not.toBeInTheDocument());
      expect(deletes()).toEqual(["/student_profile/chat/sessions/s-reg"]);
      expect(backend.sessions.map((item) => item.id)).not.toContain("s-reg");
      expect(await screen.findByText("Chat removed.")).toBeInTheDocument();
      expect(within(menu()).getByRole("button", { name: "New chat" })).toHaveFocus();
    });

    it("keeps the chat when the dialog is cancelled", async () => {
      const { user } = await openWorkspace();
      const dialog = await chooseRemove(user, "Regression metrics");
      await user.click(within(dialog).getByRole("button", { name: "Cancel" }));

      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
      expect(chatRow("Regression metrics")).toBeInTheDocument();
      expect(deletes()).toEqual([]);
      expect(within(menu()).getByRole("button", { name: "Actions for Regression metrics" })).toHaveFocus();
    });

    it("removing the open chat goes to a new chat, with no chat or material in the URL", async () => {
      const { user, router } = await openWorkspace();
      await openChat(user, "Hunt's algorithm");
      await user.click(within(menu()).getByRole("button", { name: "Open KI 02 Classification Part1 beside the chat" }));
      await screen.findByRole("region", { name: "PDF viewer: KI 02 Classification Part1" });

      await user.click(within(await chooseRemove(user, "Hunt's algorithm")).getByRole("button", { name: "Remove" }));

      expect(await screen.findByRole("heading", { level: 1, name: "New chat" })).toBeInTheDocument();
      await waitFor(() => expect(router.state.location.search).toBe(""));
      expect(within(menu()).queryByRole("button", { name: "Hunt's algorithm" })).not.toBeInTheDocument();
      expect(viewer()).toBeNull();
      expect(materialNames()).toEqual([]);
    });

    it("removing another chat leaves the open chat, its messages and the viewer as they are", async () => {
      const { user, router } = await openWorkspace();
      await openChat(user, "Hunt's algorithm");
      await user.click(within(menu()).getByRole("button", { name: "Open KI 02 Classification Part1 beside the chat" }));
      await screen.findByRole("region", { name: "PDF viewer: KI 02 Classification Part1" });

      await user.click(within(await chooseRemove(user, "Regression metrics")).getByRole("button", { name: "Remove" }));

      await waitFor(() => expect(within(menu()).queryByRole("button", { name: "Regression metrics" })).not.toBeInTheDocument());
      expect(screen.getByRole("heading", { level: 1, name: "Hunt's algorithm" })).toBeInTheDocument();
      expect(screen.getByText("Hunt's algorithm builds a decision tree greedily.")).toBeInTheDocument();
      expect(screen.getByRole("region", { name: "PDF viewer: KI 02 Classification Part1" })).toBeInTheDocument();
      expect(Object.fromEntries(new URLSearchParams(router.state.location.search))).toEqual({ chat: "s-hunt", lecture: KI02.id });
    });

    it("clicking ⋯ doesn't open the chat", async () => {
      const { user, router } = await openWorkspace();
      await user.click(within(menu()).getByRole("button", { name: "Actions for Regression metrics" }));

      expect(screen.getByRole("menu", { name: "Actions for Regression metrics" })).toBeInTheDocument();
      expect(screen.getByRole("heading", { level: 1, name: "New chat" })).toBeInTheDocument();
      expect(chatRow("Regression metrics")).not.toHaveAttribute("aria-current");
      expect(router.state.location.search).toBe("");
    });

    it("keeps the chat and shows the error when the server can't remove it", async () => {
      const { user } = await openWorkspace();
      api.onDelete("/student_profile/chat/sessions/s-reg").replyOnce(500, { success: false, message: "Could not delete the chat." });
      api.handlers.unshift(api.handlers.pop()); // checked before the fake backend's handler
      await user.click(within(await chooseRemove(user, "Regression metrics")).getByRole("button", { name: "Remove" }));

      await waitFor(() => expect(deletes()).toHaveLength(1));
      expect(chatRow("Regression metrics")).toBeInTheDocument();
      expect(await screen.findByText("Could not delete the chat.")).toBeInTheDocument();
      expect(screen.queryByText("Chat removed.")).not.toBeInTheDocument();
    });
  });

  describe("copying answers", () => {
    const CODE = 'def area(r):\n    return 3.14 * r * r\n\nprint(area(2))';
    const ANSWER = `Use a function:\n\n\`\`\`python\n${CODE}\n\`\`\`\n\n- one\n- two`;

    beforeEach(() => {
      backend.messages["s-old"] = [
        message("q1", "s-old", "user", "Show me code"),
        message("a1", "s-old", "assistant", ANSWER, [page(KI02, 4)]),
      ];
    });

    async function openCodeChat() {
      const result = await openWorkspace();
      await openChat(result.user, "Last month");
      await screen.findByText("Use a function:");
      return result;
    }

    it("copies only a code block's code, with its indentation, and says so", async () => {
      const { user } = await openCodeChat();
      const button = screen.getByRole("button", { name: "Copy code" });
      expect(button).toHaveTextContent("Copy");
      button.focus();
      await user.keyboard("{Enter}");

      expect(await navigator.clipboard.readText()).toBe(CODE);
      await waitFor(() => expect(button).toHaveTextContent("Copied"));
      expect(screen.getByText("Code copied.")).toBeInTheDocument();
      // The code shown is unchanged, and user messages have no copy buttons.
      expect(document.querySelector(".chat-code pre").textContent).toBe(CODE + "\n");
      expect(within(screen.getByText("Show me code").closest("li")).queryByRole("button")).toBeNull();
    });

    it("copies the whole answer as Markdown with its sources, without the question or labels", async () => {
      const { user } = await openCodeChat();
      expect(screen.getAllByRole("button", { name: "Copy answer" })).toHaveLength(1);
      await user.click(screen.getByRole("button", { name: "Copy answer" }));

      const copied = await navigator.clipboard.readText();
      expect(copied).toBe(`${ANSWER}\n\nSources:\n- p. 4 · KI 02 Classification Part1`);
      expect(copied).not.toContain("Show me code");
      expect(await screen.findByRole("button", { name: "Answer copied" })).toHaveTextContent("Copied");
    });

    it("doesn't show a copy button while the answer is still coming", async () => {
      const { user } = await openWorkspace();
      api.delayResponse = 300; // time to look while the answer is on its way
      await user.type(input(), "What is 1+1?{Enter}");
      expect(await screen.findByText("Reading your materials…")).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "Copy answer" })).not.toBeInTheDocument();
      expect(await screen.findByText(/1 \+ 1 equals 2/)).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Copy answer" })).toBeInTheDocument();
    });

    it("when the clipboard can't be used, says nothing was copied and shows the text to copy by hand", async () => {
      const { user } = await openCodeChat();
      vi.spyOn(navigator.clipboard, "writeText").mockRejectedValue(new Error("denied"));
      document.execCommand = () => false;
      await user.click(screen.getByRole("button", { name: "Copy code" }));

      const dialog = await screen.findByRole("dialog", { name: "Copy manually" });
      expect(within(dialog).getByLabelText("Text to copy")).toHaveValue(CODE);
      expect(screen.getByRole("button", { name: "Copy code" })).toHaveTextContent("Copy");
      expect(screen.queryByText("Code copied.")).not.toBeInTheDocument();
      await user.click(within(dialog).getByRole("button", { name: "Done" }));
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
      delete document.execCommand;
    });
  });

  it("keeps a failed question with the server's error", async () => {
    // Same matcher as the fake backend's, so it replaces that handler.
    api.onPost(/\/chat\/sessions\/[^/]+\/messages$/).reply(503, { detail: "The AI assistant is currently unavailable. Please try again later" });
    const { user } = await openWorkspace();
    await openChat(user, "Hunt's algorithm");
    await user.type(input(), "And Gini?{Enter}");
    expect(await screen.findByText("The AI assistant is currently unavailable. Please try again later")).toBeInTheDocument();
    expect(screen.getByText("And Gini?")).toBeInTheDocument();
  });

  it("shows the wait only in the chat that asked, so another chat can be used meanwhile", async () => {
    let release;
    api.onPost(/\/chat\/sessions\/[^/]+\/messages$/).reply(
      () => new Promise((resolve) => (release = () => resolve([503, { detail: "Too late" }])))
    );
    const { user } = await openWorkspace();
    await openChat(user, "Hunt's algorithm");
    await user.type(input(), "Slow question{Enter}");
    expect(await screen.findByText("Reading your materials…")).toBeInTheDocument();

    await openChat(user, "Regression metrics");
    expect(screen.queryByText("Reading your materials…")).not.toBeInTheDocument();
    await user.type(input(), "Another question");
    expect(screen.getByRole("button", { name: "Send message" })).toBeEnabled();

    release();
    await openChat(user, "Hunt's algorithm");
    await waitFor(() => expect(screen.queryByText("Reading your materials…")).not.toBeInTheDocument());
  });

  it("after a timeout, shows the answer the backend saved anyway", async () => {
    api.onPost(/\/chat\/sessions\/[^/]+\/messages$/).timeout();
    const { user } = await openWorkspace();
    await openChat(user, "Hunt's algorithm");
    // The backend went on and saved the answer after the request timed out.
    backend.messages["s-hunt"].push(
      message("late-q", "s-hunt", "user", "Slow question"),
      message("late-a", "s-hunt", "assistant", "The late answer.", [page(KI02, 4)])
    );
    await user.type(input(), "Slow question{Enter}");
    expect(await screen.findByText("The late answer.")).toBeInTheDocument();
    expect(screen.queryByText(/taking longer than usual/)).not.toBeInTheDocument();
  });

  it("after a timeout with nothing saved yet, says the answer may still arrive", async () => {
    api.onPost(/\/chat\/sessions\/[^/]+\/messages$/).timeout();
    const { user } = await openWorkspace();
    await openChat(user, "Hunt's algorithm");
    await user.type(input(), "Slow question{Enter}");
    expect(await screen.findByText(/taking longer than usual/)).toBeInTheDocument();
  });
});

describe("chat-first workspace: notebook and viewer panels", () => {
  beforeEach(() => setup());

  it("shows the notebook only when asked for: floating over the chat, pinned beside it, widened and closed", async () => {
    const { user } = await openWorkspace();
    await user.click(screen.getByRole("button", { name: "Notebook" }));
    expect(screen.getByRole("button", { name: "Notebook" })).toHaveAttribute("aria-pressed", "true");
    const panel = notebookPanel();
    expect(panel).toHaveClass("cf-notebook--floating");
    expect(panel.style.width).toBe("480px");
    expect(await within(panel).findByRole("region", { name: "Notebook" })).toBeInTheDocument();

    const pin = within(panel).getByRole("button", { name: "Pin beside the chat" });
    expect(pin).toHaveAttribute("aria-pressed", "false");
    await user.click(pin);
    expect(panel).toHaveClass("cf-notebook--pinned");
    expect(within(panel).getByRole("button", { name: "Float over the chat" })).toHaveAttribute("aria-pressed", "true");

    // Widest pinned: 1440 − 272 (menu) − 380 (chat) = 788.
    await user.click(within(panel).getByRole("button", { name: "Widen notebook" }));
    expect(panel.style.width).toBe("788px");
    await user.click(within(panel).getByRole("button", { name: "Restore notebook width" }));
    expect(panel.style.width).toBe("480px");

    await user.click(within(panel).getByRole("button", { name: "Float over the chat" }));
    expect(panel).toHaveClass("cf-notebook--floating");
    await user.click(within(panel).getByRole("button", { name: "Close notebook" }));
    expect(notebookPanel()).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Notebook" })).toHaveAttribute("aria-pressed", "false");
  });

  it("floats the notebook left of an open viewer, and pinning it makes room between chat and viewer", async () => {
    const { user } = await openWorkspace();
    await openChat(user, "Hunt's algorithm");
    await user.click(within(menu()).getByRole("button", { name: "Open KI 02 Classification Part1 beside the chat" }));
    await screen.findByRole("region", { name: "PDF viewer: KI 02 Classification Part1" });
    expect(viewer().style.width).toBe("560px");

    await user.click(screen.getByRole("button", { name: "Notebook" }));
    const panel = notebookPanel();
    expect(panel.style.right).toBe("560px");

    await user.click(within(panel).getByRole("button", { name: "Pin beside the chat" }));
    // The viewer gives way to its minimum; the notebook takes what leaves the chat 380 px.
    expect(viewer().style.width).toBe("360px");
    expect(panel.style.width).toBe(`${1440 - 272 - 360 - 380}px`);
  });

  it("resizes the viewer by dragging, with the arrow keys and back with a double-click, leaving the chat at least 380 px", async () => {
    const { user } = await openWorkspace();
    await openChat(user, "Hunt's algorithm");
    await user.click(within(menu()).getByRole("button", { name: "Open KI 02 Classification Part1 beside the chat" }));
    const handle = await screen.findByRole("button", { name: /^Resize the material viewer/ });

    fireEvent.pointerDown(handle, { button: 0, pointerId: 1, clientX: 880 });
    fireEvent.pointerMove(handle, { pointerId: 1, clientX: 800 });
    expect(viewer().style.width).toBe("640px");
    fireEvent.pointerMove(handle, { pointerId: 1, clientX: 10 }); // far left: clamped
    expect(viewer().style.width).toBe(`${1440 - 272 - 380}px`);
    fireEvent.pointerMove(handle, { pointerId: 1, clientX: 1400 }); // far right: the minimum
    expect(viewer().style.width).toBe("360px");
    fireEvent.pointerUp(handle, { pointerId: 1, clientX: 1400 });
    fireEvent.pointerMove(handle, { pointerId: 1, clientX: 700 }); // not dragging any more
    expect(viewer().style.width).toBe("360px");

    handle.focus();
    await user.keyboard("{ArrowLeft}{ArrowLeft}");
    expect(viewer().style.width).toBe("424px");
    await user.keyboard("{ArrowRight}");
    expect(viewer().style.width).toBe("392px");
    await user.dblClick(handle);
    expect(viewer().style.width).toBe("560px");
  });

  it("collapses the menu to the icon rail, which gives the viewer more room", async () => {
    const { user } = await openWorkspace();
    await openChat(user, "Hunt's algorithm");
    await user.click(within(menu()).getByRole("button", { name: "Open KI 02 Classification Part1 beside the chat" }));
    const handle = await screen.findByRole("button", { name: /^Resize the material viewer/ });
    await user.click(within(menu()).getByRole("button", { name: "Collapse menu" }));
    expect(screen.getByRole("navigation", { name: "Menu" })).toBeInTheDocument();

    fireEvent.pointerDown(handle, { button: 0, pointerId: 1, clientX: 880 });
    fireEvent.pointerMove(handle, { pointerId: 1, clientX: 0 });
    fireEvent.pointerUp(handle, { pointerId: 1, clientX: 0 });
    expect(viewer().style.width).toBe(`${1440 - 64 - 380}px`);
  });
});

describe("chat-first workspace at phone width", () => {
  beforeEach(() => {
    setup();
    Object.defineProperty(window, "innerWidth", { configurable: true, value: 390 });
    vi.stubGlobal("matchMedia", (query) => ({ matches: query === "(max-width: 760px)", addEventListener() {}, removeEventListener() {} }));
  });

  it("opens the menu as an overlay from the header and closes it on choosing a chat", async () => {
    const user = userEvent.setup();
    renderApp("/workspace");
    const open = await screen.findByRole("button", { name: "Open menu" });
    expect(screen.queryByRole("navigation", { name: "Chats and this chat's materials" })).not.toBeInTheDocument();
    expect(screen.queryByRole("navigation", { name: "Menu" })).not.toBeInTheDocument(); // no rail on a phone

    await user.click(open);
    const nav = screen.getByRole("navigation", { name: "Chats and this chat's materials" });
    expect(nav).toHaveClass("cf-side--overlay");
    await user.click(await within(nav).findByRole("button", { name: "Hunt's algorithm" }));
    expect(screen.queryByRole("navigation", { name: "Chats and this chat's materials" })).not.toBeInTheDocument();
    expect(await screen.findByRole("heading", { level: 1, name: "Hunt's algorithm" })).toBeInTheDocument();

    // The scope chip under the message box opens the menu with the chat's materials.
    await user.click(await screen.findByRole("button", { name: "KI 02 Classification Part1" }));
    expect(materialNames()).toEqual(["Open KI 02 Classification Part1 beside the chat"]);
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("navigation", { name: "Chats and this chat's materials" })).not.toBeInTheDocument();
  });
});

describe("chat-first workspace without the chat API", () => {
  beforeEach(() => setup({ chat: false }));

  it("says chats are not available and does not send", async () => {
    renderApp("/workspace");
    expect(await screen.findByText("This server has no chat assistant yet.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Send message" })).toBeDisabled();
    expect(within(menu()).getByRole("button", { name: "Upload a material to this chat" })).toBeDisabled();
  });
});

describe("chat-first workspace: the open chat and material in the URL", () => {
  beforeEach(() => setup());

  async function openAt(path) {
    const user = userEvent.setup();
    const result = renderApp(path);
    await within(await screen.findByRole("navigation", { name: "Chats and this chat's materials" })).findByRole("button", { name: "Hunt's algorithm" });
    return { user, ...result };
  }
  const search = (router) => Object.fromEntries(new URLSearchParams(router.state.location.search));

  it("puts the chat and the open material in the URL, and drops the material when it is closed", async () => {
    const { user, router } = await openAt("/workspace");
    await openChat(user, "Hunt's algorithm");
    expect(search(router)).toEqual({ chat: "s-hunt" });

    await user.click(within(menu()).getByRole("button", { name: "Open KI 02 Classification Part1 beside the chat" }));
    await screen.findByRole("region", { name: "PDF viewer: KI 02 Classification Part1" });
    expect(search(router)).toEqual({ chat: "s-hunt", lecture: KI02.id });

    await user.click(screen.getByRole("button", { name: "Close the material viewer" }));
    expect(search(router)).toEqual({ chat: "s-hunt" });
    expect(viewer()).toBeNull();

    // Another chat replaces the chat id; New chat clears both.
    await openChat(user, "Regression metrics");
    expect(search(router)).toEqual({ chat: "s-reg" });
    await user.click(within(menu()).getByRole("button", { name: "New chat" }));
    await waitFor(() => expect(router.state.location.search).toBe(""));
  });

  it("opens the chat and the material from a pasted or reloaded link", async () => {
    await openAt(`/workspace?chat=s-reg&lecture=${KI02.id}`);
    expect(await screen.findByRole("heading", { level: 1, name: "Regression metrics" })).toBeInTheDocument();
    expect(await screen.findByText("MSE, RMSE and R².")).toBeInTheDocument();
    expect(await screen.findByRole("region", { name: "PDF viewer: KI 02 Classification Part1" })).toBeInTheDocument();
    expect(materialNames()).toEqual(["Open Regression solution beside the chat"]);
  });

  it("goes back to the previous chat, and closes a material, with the browser's Back", async () => {
    const { user, router } = await openAt("/workspace");
    await openChat(user, "Hunt's algorithm");
    await user.click(within(menu()).getByRole("button", { name: "Open KI 02 Classification Part1 beside the chat" }));
    await screen.findByRole("region", { name: "PDF viewer: KI 02 Classification Part1" });
    await openChat(user, "Regression metrics");

    await router.navigate(-1);
    expect(await screen.findByRole("heading", { level: 1, name: "Hunt's algorithm" })).toBeInTheDocument();
    expect(await screen.findByRole("region", { name: "PDF viewer: KI 02 Classification Part1" })).toBeInTheDocument();
    await router.navigate(-1);
    await waitFor(() => expect(viewer()).toBeNull());
    expect(screen.getByRole("heading", { level: 1, name: "Hunt's algorithm" })).toBeInTheDocument();
  });

  it("writes a chat created by its first question into the URL", async () => {
    const { user, router } = await openAt("/workspace");
    await user.type(input(), "What is 1+1?{Enter}");
    expect(await screen.findByText(/1 \+ 1 equals 2/)).toBeInTheDocument();
    await waitFor(() => expect(search(router).chat).toMatch(/^s-new-/));
    expect(screen.getByText(/1 \+ 1 equals 2/)).toBeInTheDocument(); // still the same chat
  });

  it("keeps the chat and the material across the Exam view", async () => {
    const { user, router } = await openAt(`/workspace?chat=s-hunt&lecture=${KI02.id}`);
    await screen.findByRole("region", { name: "PDF viewer: KI 02 Classification Part1" });
    await user.click(screen.getByRole("button", { name: "Exam" }));
    expect(router.state.location.pathname).toBe("/workspace/exam");
    expect(search(router)).toEqual({ chat: "s-hunt", lecture: KI02.id });
    await user.click(screen.getByRole("link", { name: "Back to chat" }));
    expect(router.state.location.pathname).toBe("/workspace");
    expect(await screen.findByRole("heading", { level: 1, name: "Hunt's algorithm" })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "PDF viewer: KI 02 Classification Part1" })).toBeInTheDocument();
  });

  it("says so when the linked chat isn't the student's, and drops it from the URL", async () => {
    const { router } = await openAt("/workspace?chat=s-gone");
    expect(await screen.findByText("That chat isn’t in your chats.")).toBeInTheDocument();
    await waitFor(() => expect(router.state.location.search).toBe(""));
    expect(screen.getByRole("heading", { level: 1, name: "New chat" })).toBeInTheDocument();
    expect(viewer()).toBeNull();
  });

  it("says so when the linked lecture isn't in the student's materials, and keeps the chat", async () => {
    const { router } = await openAt("/workspace?chat=s-hunt&lecture=missing");
    expect(await screen.findByText("That lecture isn’t in your materials.")).toBeInTheDocument();
    await waitFor(() => expect(search(router)).toEqual({ chat: "s-hunt" }));
    expect(screen.getByRole("heading", { level: 1, name: "Hunt's algorithm" })).toBeInTheDocument();
  });
});
