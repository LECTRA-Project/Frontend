import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createCell, createNotebook } from "../../services/notebook/ipynb.js";
import { saveNotebook } from "../../services/notebook/notebookStorage.js";
import { makeToken, mockApi, ok, renderApp, saveToken, TEST_USER } from "../../test/helpers.jsx";

/*
  The Home / Welcome screen (/workspace/home) and the PDF + notebook split view,
  over the real workspace.
*/

const CODE = "total = 21 * 2\nprint(total)";

function pdfLecture(id, title, uploadedAt) {
  return {
    id,
    user_id: TEST_USER.id,
    title,
    original_filename: `${title}.pdf`,
    file_type: "application/pdf",
    file_size: 2048,
    s3_url: `local://lectures/${id}.pdf`,
    uploaded_at: uploadedAt,
    updated_at: uploadedAt,
    description: null,
    course: null,
    processing_status: "completed",
    processing_error: null,
    processing_attempts: 1,
    processed_at: uploadedAt,
    content_version: 1,
    chunk_count: 3,
    source_count: 5,
    source_type: "page",
  };
}

let api;
let lectures;

beforeEach(() => {
  api = mockApi();
  const token = makeToken(1800);
  saveToken(token);
  lectures = [];
  api.onGet("/users/me").reply(200, ok(TEST_USER));
  api.onGet("/student_profile/lectures").reply(() => [
    200,
    ok({ lectures, page: 1, page_size: 100, total: lectures.length, total_pages: 1 }),
  ]);
  api.onGet(/\/student_profile\/lectures\/.+\/file$/).reply(200, new Blob(["%PDF-1.4"], { type: "application/pdf" }));

  const notebook = createNotebook("Week 3");
  notebook.cells = [{ ...createCell("code"), source: CODE }];
  saveNotebook(TEST_USER.id, notebook);

  // jsdom has no blob: URLs; the viewer only needs a string.
  let next = 0;
  vi.stubGlobal("matchMedia", () => ({ matches: false, addEventListener() {}, removeEventListener() {} }));
  vi.stubGlobal("URL", Object.assign(URL, { createObjectURL: () => `blob:test/${next++}`, revokeObjectURL: () => {} }));
});
afterEach(() => {
  api.restore();
  vi.unstubAllGlobals();
});

const slot = (section) => document.querySelector(`[data-section="${section}"]`);
const gridRow = (section) => slot(section).style.getPropertyValue("--slot-row");
const gridColumn = (section) => slot(section).style.getPropertyValue("--slot-column");

async function showMaterialsPanel(user) {
  const panel = screen.getByRole("region", { name: "Course materials" });
  const show = within(panel).queryByRole("button", { name: "Show course materials" });
  if (show) await user.click(show);
  return panel;
}

async function openMaterialFromPanel(user, name) {
  const panel = await showMaterialsPanel(user);
  await user.click(await within(panel).findByRole("button", { name: new RegExp(`^${name}`) }));
}

describe("Home / Welcome screen", () => {
  it("shows the welcome message, actions and the empty recent-materials state", async () => {
    renderApp("/workspace/home");

    expect(await screen.findByRole("heading", { name: "Welcome to LECTRA" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Browse course materials" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Recent study materials" })).toBeInTheDocument();
    expect(await screen.findByText("No recent study materials")).toBeInTheDocument();

    // The rest of the workspace is unchanged.
    expect(screen.getByRole("region", { name: "Course materials" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Study assistant" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Exam" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Open profile menu" })).toBeInTheDocument();
  });

  it("lists real lectures newest first, and opening a PDF shows it above the notebook", async () => {
    lectures = [pdfLecture("l1", "Lecture 1", "2026-11-01T10:00:00Z"), pdfLecture("l2", "Lecture 2", "2026-11-05T10:00:00Z")];
    const user = userEvent.setup();
    const { router } = renderApp("/workspace/home");

    const recent = await screen.findByRole("region", { name: "Recent study materials" });
    const rows = await within(recent).findAllByRole("button");
    expect(rows.map((row) => row.textContent)).toEqual([expect.stringMatching(/^Lecture 2/), expect.stringMatching(/^Lecture 1/)]);
    expect(within(recent).queryByText("No recent study materials")).not.toBeInTheDocument();

    await user.click(rows[1]);

    await waitFor(() => expect(router.state.location.pathname).toBe("/workspace"));
    expect(await screen.findByRole("region", { name: "PDF viewer: Lecture 1" })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Notebook" })).toBeVisible();
    expect(slot("pdf")).toBeVisible();
  });

  it("opens the course-materials panel from “Browse course materials”", async () => {
    const user = userEvent.setup();
    renderApp("/workspace/home");
    await user.click(await screen.findByRole("button", { name: "Browse course materials" }));
    expect(screen.getByRole("button", { name: "Hide course materials" })).toHaveAttribute("aria-expanded", "true");
  });
});

describe("PDF + notebook split view", () => {
  it("shows the PDF above the notebook, keeps the notebook intact, and switches and closes PDFs", async () => {
    lectures = [pdfLecture("l1", "Lecture 1", "2026-11-01T10:00:00Z"), pdfLecture("l2", "Lecture 2", "2026-11-05T10:00:00Z")];
    const user = userEvent.setup();
    renderApp("/workspace");
    const cell = await screen.findByRole("group", { name: "Python cell 1" });

    // Some notebook UI state that would be lost if the notebook were remounted.
    await user.click(screen.getByRole("button", { name: "More actions for cell 1" }));
    await user.keyboard("{Escape}");
    cell.focus();

    await openMaterialFromPanel(user, "Lecture 1");

    expect(slot("pdf")).toBeVisible();
    const pdfPane = screen.getByRole("region", { name: "PDF viewer: Lecture 1" });
    await waitFor(() => expect(pdfPane.querySelector("iframe")).not.toBeNull()); // file fetched
    const notebookPane = screen.getByRole("region", { name: "Notebook" });
    expect(notebookPane).toBeVisible();
    // PDF on top, divider, notebook below.
    expect(gridColumn("pdf")).toBe(gridColumn("notebook"));
    expect([gridRow("pdf"), gridRow("notebook")]).toEqual(["1 / 2", "2 / 3"]);
    expect(screen.getByRole("separator", { name: "Resize PDF and notebook" })).toBeInTheDocument();

    // The same notebook element is still there: not remounted, cell source unchanged.
    expect(screen.getByRole("group", { name: "Python cell 1" })).toBe(cell);
    expect(cell).toHaveTextContent("print(total)");

    // PDF controls work in the PDF pane.
    await user.click(within(pdfPane).getByRole("button", { name: "Next page" }));
    expect(within(pdfPane).getByLabelText("Page number")).toHaveValue("2");
    // Notebook controls are available in the notebook pane.
    expect(within(notebookPane).getByRole("button", { name: "Run cell 1" })).toBeEnabled();

    // Another PDF replaces the PDF pane (reset to page 1) without touching the notebook.
    await openMaterialFromPanel(user, "Lecture 2");
    const secondPane = screen.getByRole("region", { name: "PDF viewer: Lecture 2" });
    expect(within(secondPane).getByLabelText("Page number")).toHaveValue("1");
    expect(screen.queryByRole("region", { name: "PDF viewer: Lecture 1" })).not.toBeInTheDocument();
    expect(screen.getByRole("group", { name: "Python cell 1" })).toBe(cell);

    // Closing returns to the notebook alone, still the same notebook.
    await user.click(within(secondPane).getByRole("button", { name: "Close PDF viewer" }));
    expect(screen.queryByRole("region", { name: /PDF viewer/ })).not.toBeInTheDocument();
    expect(slot("pdf")).not.toBeVisible();
    expect(screen.queryByRole("separator")).not.toBeInTheDocument();
    expect(screen.getByRole("group", { name: "Python cell 1" })).toBe(cell);
  });

  it("resizes the panes with the keyboard on the divider", async () => {
    lectures = [pdfLecture("l1", "Lecture 1", "2026-11-01T10:00:00Z")];
    const user = userEvent.setup();
    renderApp("/workspace");
    await screen.findByRole("group", { name: "Python cell 1" });
    await openMaterialFromPanel(user, "Lecture 1");

    const divider = screen.getByRole("separator", { name: "Resize PDF and notebook" });
    expect(divider).toHaveAttribute("aria-valuenow", "50");
    divider.focus();
    await user.keyboard("{ArrowDown}{ArrowDown}");
    expect(divider).toHaveAttribute("aria-valuenow", "60");
    expect(document.querySelector(".workspace__body").style.getPropertyValue("--ws-rows")).toBe("minmax(0, 0.6fr) minmax(0, 0.4fr)");
    fireEvent.keyDown(divider, { key: "Home" });
    expect(divider).toHaveAttribute("aria-valuenow", "20");
    fireEvent.keyDown(divider, { key: "End" });
    expect(divider).toHaveAttribute("aria-valuenow", "80");
  });

  it("keeps the existing full viewer over the Exam view", async () => {
    lectures = [pdfLecture("l1", "Lecture 1", "2026-11-01T10:00:00Z")];
    const user = userEvent.setup();
    renderApp("/workspace/exam");
    await screen.findByRole("button", { name: "Exam" });
    await openMaterialFromPanel(user, "Lecture 1");

    expect(screen.getByRole("region", { name: "PDF viewer: Lecture 1" })).toBeInTheDocument();
    expect(slot("pdf")).not.toBeVisible();
    expect(within(slot("notebook")).getByRole("region", { name: "PDF viewer: Lecture 1" })).toBeInTheDocument();
    expect(screen.queryByRole("separator")).not.toBeInTheDocument();
  });
});
