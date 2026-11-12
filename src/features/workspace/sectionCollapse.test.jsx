import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createCell, createNotebook } from "../../services/notebook/ipynb.js";
import { saveNotebook } from "../../services/notebook/notebookStorage.js";
import { makeToken, mockApi, ok, openMaterialsMenu, renderApp, saveToken, TEST_USER } from "../../test/helpers.jsx";

/*
  Collapsing the PDF viewer and the Study assistant, like the notebook: only hidden, never
  unmounted — the PDF stays at its page, the chat keeps its draft.
*/

const CODE = "def area(r):\n    return 3.14 * r * r\n\nprint(area(2))";
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

const columns = () => document.querySelector(".workspace__body").style.getPropertyValue("--ws-columns");
const status = () => [...document.querySelectorAll('[role="status"]')].map((node) => node.textContent).join(" | ");

async function openWorkspace(path = "/workspace") {
  const user = userEvent.setup();
  const result = renderApp(path);
  await screen.findByRole("group", { name: "Python cell 1" });
  return { user, ...result };
}

const assistant = () => screen.getByRole("region", { name: "Study assistant" });
const slot = (section) => document.querySelector(`[data-section="${section}"]`);

async function openPdf(user) {
  const panel = await openMaterialsMenu();
  await user.click(await within(panel).findByRole("button", { name: /^Lecture 1/ }));
  const pdf = await screen.findByRole("region", { name: "PDF viewer: Lecture 1" });
  await waitFor(() => expect(pdf.querySelector("iframe")).not.toBeNull());
  return pdf;
}

describe("collapsing the PDF viewer", () => {
  it("folds a side-by-side PDF into a rail, keeping its page, and expands it again", async () => {
    const { user } = await openWorkspace();
    const pdf = await openPdf(user);
    await user.click(within(pdf).getByRole("button", { name: "Next page" }));
    const frame = pdf.querySelector("iframe");
    expect(columns()).toBe("minmax(0, 1fr) minmax(0, 1fr) var(--ws-assistant-w)");

    await user.click(within(pdf).getByRole("button", { name: "Collapse PDF viewer" }));
    expect(pdf).toHaveClass("pdf--collapsed", "pdf--rail");
    expect(columns()).toBe("var(--ws-collapsed-w) minmax(0, 1fr) var(--ws-assistant-w)");
    expect(pdf.querySelector("#pdf-content")).not.toBeVisible();
    expect(within(pdf).getByRole("button", { name: "Close PDF viewer" })).toBeInTheDocument();
    expect(status()).toContain("PDF viewer collapsed.");

    await user.click(within(pdf).getByRole("button", { name: "Expand PDF viewer" }));
    expect(pdf).not.toHaveClass("pdf--collapsed");
    // Same frame, same page: nothing was reloaded.
    expect(pdf.querySelector("iframe")).toBe(frame);
    expect(within(pdf).getByLabelText("Page number")).toHaveValue("2");
  });

  it("folds up into its header when stacked with the notebook", async () => {
    localStorage.setItem(LAYOUT_KEY, JSON.stringify([["materials"], ["pdf", "notebook"], ["assistant"]]));
    const { user } = await openWorkspace();
    const pdf = await openPdf(user);
    await user.click(within(pdf).getByRole("button", { name: "Collapse PDF viewer" }));
    expect(pdf).toHaveClass("pdf--collapsed");
    expect(pdf).not.toHaveClass("pdf--rail");
    expect(slot("pdf")).toHaveClass("ws-slot--compact");
    expect(within(pdf).getByRole("button", { name: "Expand PDF viewer" })).toHaveAttribute("aria-expanded", "false");
  });

  it("opens expanded again when another lecture is opened", async () => {
    const { user } = await openWorkspace();
    const pdf = await openPdf(user);
    await user.click(within(pdf).getByRole("button", { name: "Collapse PDF viewer" }));
    await openPdf(user);
    expect(screen.getByRole("region", { name: "PDF viewer: Lecture 1" })).not.toHaveClass("pdf--collapsed");
  });
});

describe("collapsing the Study assistant", () => {
  it("folds into a rail, gives its width to the others, and keeps the draft", async () => {
    const { user } = await openWorkspace();
    await user.type(screen.getByLabelText("Message to the study assistant"), "half-written question");

    await user.click(within(assistant()).getByRole("button", { name: "Collapse study assistant" }));
    expect(assistant()).toHaveClass("assistant--collapsed", "assistant--rail");
    expect(columns()).toBe("minmax(0, 1fr) var(--ws-collapsed-w)");
    expect(screen.getByLabelText("Message to the study assistant")).not.toBeVisible();
    expect(status()).toContain("Study assistant collapsed.");

    await user.click(within(assistant()).getByRole("button", { name: "Expand study assistant" }));
    expect(columns()).toBe("minmax(0, 1fr) var(--ws-assistant-w)");
    expect(screen.getByLabelText("Message to the study assistant")).toHaveValue("half-written question");
  });

  it("is keyboard operable", async () => {
    const { user } = await openWorkspace();
    within(assistant()).getByRole("button", { name: "Collapse study assistant" }).focus();
    await user.keyboard("{Enter}");
    expect(within(assistant()).getByRole("button", { name: "Expand study assistant" })).toHaveFocus();
    await user.keyboard(" ");
    expect(assistant()).not.toHaveClass("assistant--collapsed");
  });
});
