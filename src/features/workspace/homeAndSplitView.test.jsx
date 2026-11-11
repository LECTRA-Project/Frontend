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

let api;

beforeEach(() => {
  api = mockApi();
  const token = makeToken(1800);
  saveToken(token);
  api.onGet("/auth/user").reply(200, ok(TEST_USER));
  api.onGet("/users/me").reply(200, ok(TEST_USER)); // auth.js currently calls /users/me

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

const pdf = (name) => new File(["%PDF-1.4"], name, { type: "application/pdf" });

async function showMaterialsPanel(user) {
  const panel = screen.getByRole("region", { name: "Course materials" });
  const show = within(panel).queryByRole("button", { name: "Show course materials" });
  if (show) await user.click(show);
  return panel;
}

async function uploadMaterials(user, files) {
  const panel = await showMaterialsPanel(user);
  await user.click(within(panel).getByRole("button", { name: "Upload materials" }));
  const dialog = await screen.findByRole("dialog");
  await user.upload(dialog.querySelector('input[type="file"]'), files);
  await user.click(within(dialog).getByRole("button", { name: "Upload" }));
  await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
}

async function openMaterialFromPanel(user, name) {
  const panel = await showMaterialsPanel(user);
  await user.click(within(panel).getByRole("button", { name: new RegExp(`^${name}`) }));
}

describe("Home / Welcome screen", () => {
  it("shows the welcome message, actions and the empty recent-materials state", async () => {
    renderApp("/workspace/home");

    expect(await screen.findByRole("heading", { name: "Welcome to LECTRA" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Browse course materials" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Recent study materials" })).toBeInTheDocument();
    expect(screen.getByText("No recent study materials")).toBeInTheDocument();

    // The rest of the workspace is unchanged.
    expect(screen.getByRole("region", { name: "Course materials" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Study assistant" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Exam" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Open profile menu" })).toBeInTheDocument();
  });

  it("lists real uploads as recent materials, and opening a PDF shows it above the notebook", async () => {
    const user = userEvent.setup();
    const { router } = renderApp("/workspace/home");
    await screen.findByRole("heading", { name: "Welcome to LECTRA" });

    const home = screen.getByRole("region", { name: "Welcome to LECTRA" });
    await uploadMaterials(user, [pdf("Lecture 1.pdf")]);

    const recent = within(home).getByRole("region", { name: "Recent study materials" });
    expect(within(recent).queryByText("No recent study materials")).not.toBeInTheDocument();
    await user.click(within(recent).getByRole("button", { name: /Lecture 1\.pdf/ }));

    await waitFor(() => expect(router.state.location.pathname).toBe("/workspace"));
    expect(screen.getByRole("region", { name: "PDF viewer: Lecture 1.pdf" })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Notebook" })).toBeVisible();
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
    const user = userEvent.setup();
    renderApp("/workspace");
    const cell = await screen.findByRole("group", { name: "Python cell 1" });

    // Some notebook UI state that would be lost if the notebook were remounted.
    await user.click(screen.getByRole("button", { name: "More actions for cell 1" }));
    await user.keyboard("{Escape}");
    cell.focus();

    await uploadMaterials(user, [pdf("Lecture 1.pdf"), pdf("Lecture 2.pdf")]);
    await openMaterialFromPanel(user, "Lecture 1.pdf");

    const area = document.querySelector(".center-area");
    expect(area).toHaveClass("center-area--split");
    const pdfPane = screen.getByRole("region", { name: "PDF viewer: Lecture 1.pdf" });
    const notebookPane = screen.getByRole("region", { name: "Notebook" });
    expect(notebookPane).toBeVisible();
    // PDF on top, divider, notebook below.
    expect(pdfPane.compareDocumentPosition(notebookPane) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
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
    await openMaterialFromPanel(user, "Lecture 2.pdf");
    const secondPane = screen.getByRole("region", { name: "PDF viewer: Lecture 2.pdf" });
    expect(within(secondPane).getByLabelText("Page number")).toHaveValue("1");
    expect(screen.queryByRole("region", { name: "PDF viewer: Lecture 1.pdf" })).not.toBeInTheDocument();
    expect(screen.getByRole("group", { name: "Python cell 1" })).toBe(cell);

    // Closing returns to the notebook alone, still the same notebook.
    await user.click(within(secondPane).getByRole("button", { name: "Close PDF viewer" }));
    expect(screen.queryByRole("region", { name: /PDF viewer/ })).not.toBeInTheDocument();
    expect(area).not.toHaveClass("center-area--split");
    expect(screen.queryByRole("separator")).not.toBeInTheDocument();
    expect(screen.getByRole("group", { name: "Python cell 1" })).toBe(cell);
  });

  it("resizes the panes with the keyboard on the divider", async () => {
    const user = userEvent.setup();
    renderApp("/workspace");
    await screen.findByRole("group", { name: "Python cell 1" });
    await uploadMaterials(user, [pdf("Lecture 1.pdf")]);
    await openMaterialFromPanel(user, "Lecture 1.pdf");

    const divider = screen.getByRole("separator", { name: "Resize PDF and notebook" });
    expect(divider).toHaveAttribute("aria-valuenow", "50");
    divider.focus();
    await user.keyboard("{ArrowDown}{ArrowDown}");
    expect(divider).toHaveAttribute("aria-valuenow", "60");
    expect(document.querySelector(".center-area").style.getPropertyValue("--split-pdf")).toBe("0.6fr");
    fireEvent.keyDown(divider, { key: "Home" });
    expect(divider).toHaveAttribute("aria-valuenow", "20");
    fireEvent.keyDown(divider, { key: "End" });
    expect(divider).toHaveAttribute("aria-valuenow", "80");
  });

  it("keeps the existing full viewer over the Exam view", async () => {
    const user = userEvent.setup();
    renderApp("/workspace/exam");
    await screen.findByRole("button", { name: "Exam" });
    await uploadMaterials(user, [pdf("Lecture 1.pdf")]);
    await openMaterialFromPanel(user, "Lecture 1.pdf");

    expect(screen.getByRole("region", { name: "PDF viewer: Lecture 1.pdf" })).toBeInTheDocument();
    expect(document.querySelector(".center-area")).not.toHaveClass("center-area--split");
    expect(screen.queryByRole("separator")).not.toBeInTheDocument();
  });
});
