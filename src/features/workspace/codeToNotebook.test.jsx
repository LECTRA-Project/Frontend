import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createCell, createNotebook } from "../../services/notebook/ipynb.js";
import { loadNotebook, saveNotebook } from "../../services/notebook/notebookStorage.js";
import { makeToken, mockApi, renderApp, saveToken, TEST_USER } from "../../test/helpers.jsx";
import { daysAgo, installChatBackend } from "../../test/chatBackend.js";

/*
  "Open in notebook" on code blocks in chat answers, over the real workspace: the button is
  on Python blocks and blocks without a language only; a click adds the code, exactly as
  shown, as a new cell after the last one (or fills the notebook's only, empty cell), opens
  the notebook, focuses the cell and never runs it. Existing cells and outputs are kept.
*/

// Indentation, a blank line, comments, a tab, < > & " ' and backslashes, all kept as they are.
const SPECIAL = [
  "import numpy as np",
  "",
  "def f(x):",
  '    # a comment with <b>tags</b> & "quotes" and \'apostrophes\'',
  '    if x < 1 and x > -1:  # \\ backslash',
  '        return "a\\\\b\\n"',
  "\treturn x  # a tab before this line",
  "",
  "",
  "print(f(0))",
].join("\n");
const SHORT = "x = 1";
const PLAIN = "print('no language')";

const fence = (language, code) => `\`\`\`${language}\n${code}\n\`\`\``;
const ANSWER = [
  "Python:",
  fence("python", SPECIAL),
  "Short:",
  fence("py", SHORT),
  "Plain:",
  fence("", PLAIN),
  "JavaScript:",
  fence("javascript", "console.log(1);"),
  "SQL:",
  fence("sql", "SELECT 1;"),
  "Bash:",
  fence("bash", "ls -la"),
  "Java:",
  fence("java", "int x = 1;"),
  "Diagram:",
  fence("mermaid", "graph TD\n  A --> B"),
].join("\n\n");

const message = (id, role, content) => ({ id, session_id: "s-code", role, content, sources: [], created_at: daysAgo(0) });

let api;

beforeEach(() => {
  api = mockApi();
  saveToken(makeToken(1800));
  installChatBackend(api, {
    sessions: [{ id: "s-code", title: "Code examples", lectureIds: [], updated_at: daysAgo(0) }],
    messages: { "s-code": [message("q1", "user", "Show me code"), message("a1", "assistant", ANSWER)] },
  });
});
afterEach(() => api.restore());

const menu = () => screen.getByRole("navigation", { name: "Chats and this chat's materials" });
const notebookPanel = () => screen.queryByRole("complementary", { name: "Notebook panel" });
// The code block (.chat-code) whose code starts with `code`.
const block = (code) =>
  [...document.querySelectorAll(".chat-answer .chat-code")].find((item) => item.querySelector("pre").textContent.startsWith(code));
const notebookButton = (code) => within(block(code)).queryByRole("button", { name: "Open code in notebook" });
const savedSources = () => loadNotebook(TEST_USER.id)?.notebook.cells.map((cell) => cell.source);

function saveCells(cells) {
  const notebook = createNotebook("Week 3");
  notebook.cells = cells;
  saveNotebook(TEST_USER.id, notebook);
}

async function openCodeChat() {
  const user = userEvent.setup();
  renderApp("/workspace");
  await user.click(await within(await screen.findByRole("navigation", { name: "Chats and this chat's materials" })).findByRole("button", { name: "Code examples" }));
  await screen.findByText("Python:");
  return user;
}

describe("Open in notebook on code blocks in answers", () => {
  it("is shown on Python blocks and blocks without a language, before Copy, and not on other languages", async () => {
    saveCells([]);
    await openCodeChat();
    expect(menu()).toBeInTheDocument();

    for (const code of [SPECIAL, SHORT, PLAIN]) {
      const button = notebookButton(code);
      expect(button).toBeInTheDocument();
      expect(button.tagName).toBe("BUTTON");
      expect(button).toHaveAttribute("title", "Open code in notebook");
      expect(button).toHaveTextContent("Open in notebook");
      // [Open in notebook] [Copy], in the block's top-right toolbar.
      expect(within(block(code)).getAllByRole("button").map((item) => item.getAttribute("aria-label"))).toEqual(["Open code in notebook", "Copy code"]);
    }
    for (const code of ["console.log(1);", "SELECT 1;", "ls -la", "int x = 1;"]) {
      expect(notebookButton(code)).not.toBeInTheDocument();
      expect(within(block(code)).getByRole("button", { name: "Copy code" })).toBeInTheDocument();
    }
    // A Mermaid diagram (or its source, while it isn't drawn) never gets the button.
    const mermaid = document.querySelector("code.language-mermaid")?.closest(".chat-code");
    if (mermaid) expect(within(mermaid).queryByRole("button", { name: "Open code in notebook" })).not.toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "Open code in notebook" })).toHaveLength(3);

    // The code is shown as text: no markup was made from it.
    expect(block(SPECIAL).querySelector("pre b")).toBeNull();
    expect(block(SPECIAL).querySelector("pre").textContent).toBe(SPECIAL + "\n");
  });

  it("opens the closed notebook and adds the exact code after the last cell, keeping cells and outputs, without running it", async () => {
    const ran = { ...createCell("code"), source: "print(2 + 2)", outputs: [{ output_type: "stream", name: "stdout", text: "4\n" }], execution_count: 1 };
    const notes = { ...createCell("markdown"), source: "# Notes" };
    saveCells([ran, notes]);
    const user = await openCodeChat();
    expect(notebookPanel()).not.toBeInTheDocument();

    const button = notebookButton(SPECIAL);
    button.focus();
    await user.keyboard("{Enter}");

    expect(notebookPanel()).toBeInTheDocument();
    const cell = await screen.findByRole("group", { name: "Python cell 3" });
    // The new cell is focused (its editor), so it can be run with Shift+Enter.
    await waitFor(() => expect(cell.contains(document.activeElement)).toBe(true));
    expect(button).toHaveTextContent("Added ✓");
    expect(button).toHaveAttribute("data-added");
    expect(screen.getByText("Code added to notebook")).toBeInTheDocument();

    await waitFor(() => expect(savedSources()).toEqual(["print(2 + 2)", "# Notes", SPECIAL]), { timeout: 3000 });
    const [first, , added] = loadNotebook(TEST_USER.id).notebook.cells;
    expect(first.outputs).toEqual([{ output_type: "stream", name: "stdout", text: "4\n" }]);
    expect(first.execution_count).toBe(1);
    // Not run: no outputs and no execution count.
    expect(added.cell_type).toBe("code");
    expect(added.outputs).toEqual([]);
    expect(added.execution_count).toBeNull();

    // The label comes back after a moment.
    await waitFor(() => expect(button).toHaveTextContent("Open in notebook"), { timeout: 3000 });
  });

  it("adds one new cell per click, in order, overwriting nothing", async () => {
    saveCells([{ ...createCell("code"), source: "a = 1" }]);
    const user = await openCodeChat();

    await user.click(notebookButton(SPECIAL));
    await user.click(notebookButton(SHORT));
    await user.click(notebookButton(PLAIN));
    await user.click(notebookButton(SHORT));

    await waitFor(() => expect(savedSources()).toEqual(["a = 1", SPECIAL, SHORT, PLAIN, SHORT]), { timeout: 3000 });
    expect(screen.getAllByRole("group", { name: /^Python cell \d$/ })).toHaveLength(5);
  });

  it("fills the notebook's only cell when it is an empty code cell", async () => {
    saveCells([createCell("code")]);
    const user = await openCodeChat();
    await user.click(notebookButton(SHORT));

    await waitFor(() => expect(savedSources()).toEqual([SHORT]), { timeout: 3000 });
    const cell = screen.getByRole("group", { name: "Python cell 1" });
    await waitFor(() => expect(cell.contains(document.activeElement)).toBe(true));
  });

  it("adds a cell to a notebook without cells", async () => {
    saveCells([]);
    const user = await openCodeChat();
    await user.click(notebookButton(SHORT));
    await waitFor(() => expect(savedSources()).toEqual([SHORT]), { timeout: 3000 });
  });

  it("keeps an only Markdown cell and adds the code after it", async () => {
    saveCells([createCell("markdown")]);
    const user = await openCodeChat();
    await user.click(notebookButton(PLAIN));
    await waitFor(() => expect(savedSources()).toEqual(["", PLAIN]), { timeout: 3000 });
  });

  it("keeps the notebook open when it already is, and Copy still copies the same code", async () => {
    saveCells([]);
    const user = await openCodeChat();
    fireEvent.click(screen.getByRole("button", { name: "Notebook" }));
    expect(notebookPanel()).toBeInTheDocument();

    await user.click(notebookButton(PLAIN));
    expect(notebookPanel()).toBeInTheDocument();
    await waitFor(() => expect(savedSources()).toEqual([PLAIN]), { timeout: 3000 });

    await user.click(within(block(SPECIAL)).getByRole("button", { name: "Copy code" }));
    expect(await navigator.clipboard.readText()).toBe(SPECIAL);
    await waitFor(() => expect(within(block(SPECIAL)).getByRole("button", { name: "Copy code" })).toHaveTextContent("Copied"));
  });
});
