import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createCell, createNotebook } from "../../services/notebook/ipynb.js";
import { saveNotebook } from "../../services/notebook/notebookStorage.js";
import { makeToken, mockApi, ok, openMaterialsMenu, renderApp, saveToken, TEST_USER } from "../../test/helpers.jsx";

/*
  Collapsing the notebook: it only hides the cells — code, outputs and the kernel are untouched.
*/

const CODE = "def area(r):\n    return 3.14 * r * r\n\nprint(area(2))";
const NOTEBOOK_KEY = `lectra:notebook:v1:${TEST_USER.id}`;
const LAYOUT_KEY = `lectra:workspace-layout:v2:${TEST_USER.id}`;

const LECTURE = {
  id: "l1",
  user_id: TEST_USER.id,
  title: "Lecture 1",
  original_filename: "Lecture 1.pdf",
  file_type: "application/pdf",
  file_size: 2048,
  s3_url: "local://lectures/l1.pdf",
  uploaded_at: "2026-11-01T10:00:00Z",
  updated_at: "2026-11-01T10:00:00Z",
  description: null,
  course: null,
  processing_status: "completed",
  processing_error: null,
  processing_attempts: 1,
  processed_at: "2026-11-01T10:00:00Z",
  content_version: 1,
  chunk_count: 3,
  source_count: 5,
  source_type: "page",
};

let api;

beforeEach(() => {
  api = mockApi();
  saveToken(makeToken(1800));
  api.onGet("/users/me").reply(200, ok(TEST_USER));
  api.onGet("/student_profile/lectures").reply(200, ok({ lectures: [LECTURE], page: 1, page_size: 100, total: 1, total_pages: 1 }));
  api.onGet(/\/student_profile\/lectures\/.+\/file$/).reply(200, new Blob(["%PDF-1.4"], { type: "application/pdf" }));

  const notebook = createNotebook("Week 5");
  notebook.cells = [{ ...createCell("code"), source: CODE }];
  saveNotebook(TEST_USER.id, notebook);

  vi.stubGlobal("matchMedia", () => ({ matches: false, addEventListener() {}, removeEventListener() {} }));
  let next = 0;
  vi.stubGlobal("URL", Object.assign(URL, { createObjectURL: () => `blob:test/${next++}`, revokeObjectURL: () => {} }));
});
afterEach(() => {
  api.restore();
  vi.unstubAllGlobals();
});

const notebook = () => screen.getByRole("region", { name: "Notebook" });
const columns = () => document.querySelector(".workspace__body").style.getPropertyValue("--ws-columns");
const status = () => [...document.querySelectorAll('[role="status"]')].map((node) => node.textContent).join(" | ");
const savedSource = () => JSON.parse(localStorage.getItem(NOTEBOOK_KEY)).notebook.cells[0].source;

async function openWorkspace(path = "/workspace") {
  const user = userEvent.setup();
  const result = renderApp(path);
  await screen.findByRole("group", { name: "Python cell 1" });
  return { user, ...result };
}

describe("collapsing the notebook", () => {
  it("folds a side-by-side notebook into a rail and gives its width to the assistant, keeping the code", async () => {
    const { user } = await openWorkspace();
    const cell = screen.getByRole("group", { name: "Python cell 1" });
    const before = savedSource();
    expect(columns()).toContain("minmax(0, 1fr)"); // the notebook column

    const toggle = within(notebook()).getByRole("button", { name: "Collapse notebook" });
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    await user.click(toggle);

    const expand = within(notebook()).getByRole("button", { name: "Expand notebook" });
    expect(expand).toHaveAttribute("aria-expanded", "false");
    expect(notebook()).toHaveClass("notebook--collapsed", "notebook--rail");
    expect(cell).not.toBeVisible(); // hidden …
    expect(cell).toBeInTheDocument(); // … not removed
    expect(notebook().querySelector(".notebook-toolbar__actions")).not.toBeVisible();
    expect(columns()).toBe("var(--ws-collapsed-w) minmax(0, 1fr)"); // narrow rail, assistant takes the rest
    expect(document.querySelector(".column-divider, [aria-label^='Resize'][role='separator']")).toBeNull();
    expect(status()).toContain("Notebook collapsed. Your cells and Python session are kept.");
    expect(within(notebook()).getByRole("button", { name: "Move Notebook" })).toBeInTheDocument(); // still movable

    await user.click(expand);
    expect(notebook()).not.toHaveClass("notebook--collapsed");
    expect(screen.getByRole("group", { name: "Python cell 1" })).toBe(cell); // the very same cell
    expect(cell).toBeVisible();
    expect(cell).toHaveTextContent("return 3.14 * r * r");
    expect(savedSource()).toEqual(before); // the code itself never changed
    expect(screen.queryByText("In [*]:")).not.toBeInTheDocument(); // nothing was run
    expect(status()).toContain("Notebook expanded.");
  });

  it("folds up into its header when stacked with the PDF, and the PDF takes the height", async () => {
    localStorage.setItem(LAYOUT_KEY, JSON.stringify([["materials"], ["pdf", "notebook"], ["assistant"]]));
    const { user } = await openWorkspace();
    const panel = await openMaterialsMenu();
    await user.click(await within(panel).findByRole("button", { name: /^Lecture 1/ }));
    const pdf = await screen.findByRole("region", { name: "PDF viewer: Lecture 1" });
    await waitFor(() => expect(pdf.querySelector("iframe")).not.toBeNull());
    await user.click(within(pdf).getByRole("button", { name: "Next page" }));

    await user.click(within(notebook()).getByRole("button", { name: "Collapse notebook" }));

    expect(notebook()).toHaveClass("notebook--collapsed");
    expect(notebook()).not.toHaveClass("notebook--rail");
    const slot = document.querySelector('[data-section="notebook"]');
    expect(slot).toHaveClass("ws-slot--compact");
    expect(document.querySelector(".workspace__body").style.getPropertyValue("--ws-rows")).toMatch(/auto$/);
    expect(screen.queryByRole("separator", { name: "Resize PDF and notebook" })).not.toBeInTheDocument();
    // The PDF is untouched.
    expect(screen.getByRole("region", { name: "PDF viewer: Lecture 1" })).toBe(pdf);
    expect(within(pdf).getByLabelText("Page number")).toHaveValue("2");
  });

  it("doesn't squeeze Exam into the rail, and is still collapsed when you come back", async () => {
    const { user } = await openWorkspace();
    await user.click(within(notebook()).getByRole("button", { name: "Collapse notebook" }));

    await user.click(screen.getByRole("button", { name: "Exam" }));
    await screen.findByRole("heading", { name: /exam/i });
    expect(columns()).not.toContain("var(--ws-collapsed-w)");

    await user.click(screen.getByRole("button", { name: "Exam" }));
    await screen.findByRole("group", { name: "Python cell 1", hidden: true });
    expect(notebook()).toHaveClass("notebook--collapsed");
    expect(within(notebook()).getByRole("button", { name: "Expand notebook" })).toBeInTheDocument();
  });

  it("is keyboard operable", async () => {
    const { user } = await openWorkspace();
    const toggle = within(notebook()).getByRole("button", { name: "Collapse notebook" });
    expect(toggle).toHaveAttribute("aria-controls", "notebook-content");
    toggle.focus();
    await user.keyboard("{Enter}");
    expect(notebook()).toHaveClass("notebook--collapsed");
    expect(within(notebook()).getByRole("button", { name: "Expand notebook" })).toHaveFocus();
    await user.keyboard(" ");
    expect(notebook()).not.toHaveClass("notebook--collapsed");
  });
});
