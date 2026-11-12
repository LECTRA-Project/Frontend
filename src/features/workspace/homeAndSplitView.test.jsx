import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createCell, createNotebook } from "../../services/notebook/ipynb.js";
import { saveNotebook } from "../../services/notebook/notebookStorage.js";
import { makeToken, mockApi, ok, renderApp, saveToken, TEST_USER, openMaterialsMenu } from "../../test/helpers.jsx";

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

const showMaterialsPanel = openMaterialsMenu;

async function openMaterialFromPanel(user, name) {
  const panel = await showMaterialsPanel(user);
  await user.click(await within(panel).findByRole("button", { name: new RegExp(`^${name}`) }));
}

describe("Home screen", () => {
  it("with no uploads, shows the greeting, the introduction and Upload materials, without recent uploads, the assistant or Exam", async () => {
    const user = userEvent.setup();
    renderApp("/workspace/home");

    expect(await screen.findByRole("heading", { name: /^Good (morning|afternoon|evening)/ })).toBeInTheDocument();
    expect(await screen.findByText(/Your study space for lectures/)).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Recent uploads" })).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "LECTRA" })).not.toBeInTheDocument();

    // No Study assistant, Exam button or Course materials menu on Home.
    expect(screen.queryByRole("region", { name: "Study assistant" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Exam" })).not.toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Course materials" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Show course materials" })).not.toBeInTheDocument();

    await user.click(within(document.querySelector(".home")).getByRole("button", { name: "Upload materials" }));
    expect(await screen.findByRole("dialog")).toBeInTheDocument();
  });

  it("groups recent uploads under Today, Yesterday and the date, newest first, and opens one in the workspace", async () => {
    const at = (daysAgo, hour) => {
      const date = new Date();
      date.setDate(date.getDate() - daysAgo);
      date.setHours(hour, 0, 0, 0);
      return date.toISOString();
    };
    lectures = [
      pdfLecture("l1", "Old lecture", at(5, 9)),
      pdfLecture("l2", "Today early", at(0, 0)),
      pdfLecture("l3", "Yesterday lecture", at(1, 12)),
      pdfLecture("l4", "Today late", at(0, 1)),
    ];
    const user = userEvent.setup();
    const { router } = renderApp("/workspace/home");

    const recent = await screen.findByRole("region", { name: "Recent uploads" });
    await within(recent).findByText("Today late");
    // With uploads: no introduction; Upload materials sits in the Recent uploads header.
    expect(screen.queryByText(/Your study space for lectures/)).not.toBeInTheDocument();
    expect(within(recent.querySelector(".home__recent-head")).getByRole("button", { name: "Upload materials" })).toBeInTheDocument();
    const headings = within(recent).getAllByRole("heading", { level: 4 }).map((node) => node.textContent);
    expect(headings.slice(0, 2)).toEqual(["Today", "Yesterday"]);
    expect(headings[2]).not.toMatch(/Today|Yesterday/);
    const todayRows = within(within(recent).getByRole("list", { name: "Today" })).getAllByRole("button");
    expect(todayRows.map((row) => row.textContent)).toEqual([expect.stringMatching(/^Today late/), expect.stringMatching(/^Today early/)]);

    await user.click(within(recent).getByRole("button", { name: /^Old lecture/ }));
    await waitFor(() => expect(router.state.location.pathname).toBe("/workspace"));
    expect(await screen.findByRole("region", { name: "PDF viewer: Old lecture" })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Notebook" })).toBeVisible();
    expect(screen.getByRole("region", { name: "Study assistant" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Exam" })).toBeInTheDocument();
  });
});

describe("PDF + notebook split view", () => {
  it("shows the PDF beside the notebook, keeps the notebook intact, and switches and closes PDFs", async () => {
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
    // Side by side: PDF | notebook | assistant, with a divider between each. The materials
    // menu closed when the PDF was opened, and it is never part of the grid.
    expect(screen.queryByRole("region", { name: "Course materials" })).not.toBeInTheDocument();
    expect([gridColumn("pdf"), gridColumn("notebook"), gridColumn("assistant")]).toEqual(["1", "2", "3"]);
    expect(gridRow("pdf")).toBe(gridRow("notebook"));
    expect(screen.getByRole("separator", { name: "Resize PDF viewer and Notebook" })).toBeInTheDocument();
    expect(screen.queryByRole("separator", { name: "Resize PDF and notebook" })).not.toBeInTheDocument();

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
    expect(screen.queryByRole("separator", { name: /PDF/ })).not.toBeInTheDocument();
    expect(screen.getByRole("group", { name: "Python cell 1" })).toBe(cell);
  });

  it("resizes side-by-side columns by dragging or with the arrow keys on their dividers", async () => {
    lectures = [pdfLecture("l1", "Lecture 1", "2026-11-01T10:00:00Z")];
    // jsdom has no layout: give each section a width.
    const widths = { materials: 280, pdf: 500, notebook: 500, assistant: 340 };
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function () {
      const width = widths[this.dataset?.section] ?? 0;
      return { width, height: 600, top: 0, left: 0, right: width, bottom: 600, x: 0, y: 0 };
    });
    const user = userEvent.setup();
    renderApp("/workspace");
    await screen.findByRole("group", { name: "Python cell 1" });
    await openMaterialFromPanel(user, "Lecture 1");
    const columns = () => document.querySelector(".workspace__body").style.getPropertyValue("--ws-columns");

    // Notebook | assistant: arrow left makes the assistant wider.
    const assistantDivider = screen.getByRole("separator", { name: "Resize Notebook and Study assistant" });
    assistantDivider.focus();
    await user.keyboard("{ArrowLeft}");
    expect(columns()).toBe("minmax(0, 1fr) minmax(0, 1fr) 364px");

    // PDF | notebook: dragging 100 px right gives the PDF the larger share.
    const pdfDivider = screen.getByRole("separator", { name: "Resize PDF viewer and Notebook" });
    fireEvent.pointerDown(pdfDivider, { button: 0, clientX: 800, pointerId: 1 });
    fireEvent.pointerMove(pdfDivider, { clientX: 900, pointerId: 1 });
    fireEvent.pointerUp(pdfDivider, { clientX: 900, pointerId: 1 });
    expect(columns()).toBe("minmax(0, 1.2fr) minmax(0, 0.8fr) 364px");
    vi.restoreAllMocks();
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
    expect(screen.queryByRole("separator", { name: /PDF/ })).not.toBeInTheDocument();
  });
});
