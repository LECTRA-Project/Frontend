import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createCell, createNotebook } from "../../services/notebook/ipynb.js";
import { saveNotebook } from "../../services/notebook/notebookStorage.js";
import { makeToken, mockApi, ok, renderApp, saveToken, TEST_USER, openMaterialsMenu } from "../../test/helpers.jsx";

/*
  Rearranging the four workspace sections (drag the header grip, or its Move menu),
  over the real workspace.
*/

const CODE = "answer = 6 * 7\nprint(answer)";
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
let narrow;

beforeEach(() => {
  api = mockApi();
  saveToken(makeToken(1800));
  api.onGet("/users/me").reply(200, ok(TEST_USER));
  api.onGet("/student_profile/lectures").reply(200, ok({ lectures: [LECTURE], page: 1, page_size: 100, total: 1, total_pages: 1 }));
  api.onGet(/\/student_profile\/lectures\/.+\/file$/).reply(200, new Blob(["%PDF-1.4"], { type: "application/pdf" }));

  const notebook = createNotebook("Week 4");
  notebook.cells = [{ ...createCell("code"), source: CODE }];
  saveNotebook(TEST_USER.id, notebook);

  narrow = false;
  vi.stubGlobal("matchMedia", (query) => ({
    matches: narrow && query.includes("880px"),
    addEventListener() {},
    removeEventListener() {},
  }));
  let next = 0;
  vi.stubGlobal("URL", Object.assign(URL, { createObjectURL: () => `blob:test/${next++}`, revokeObjectURL: () => {} }));
});
afterEach(() => {
  api.restore();
  vi.unstubAllGlobals();
  document.elementFromPoint = undefined;
});

const slot = (section) => document.querySelector(`[data-section="${section}"]`);
const placeOf = (section) => ({
  column: slot(section).style.getPropertyValue("--slot-column"),
  row: slot(section).style.getPropertyValue("--slot-row"),
});
const columns = () => document.querySelector(".workspace__body").style.getPropertyValue("--ws-columns");
const grip = (label) => screen.getByRole("button", { name: `Move ${label}` });
const status = () => [...document.querySelectorAll('[role="status"]')].map((node) => node.textContent).join(" | ");

async function openWorkspace() {
  const user = userEvent.setup();
  const result = renderApp("/workspace");
  await screen.findByRole("group", { name: "Python cell 1" });
  return { user, ...result };
}

async function chooseMove(user, label, item) {
  await user.click(grip(label));
  await user.click(screen.getByRole("menuitem", { name: item }));
}

async function openPdf(user) {
  const panel = await openMaterialsMenu();
  await user.click(await within(panel).findByRole("button", { name: /^Lecture 1/ }));
  const pdf = await screen.findByRole("region", { name: "PDF viewer: Lecture 1" });
  await waitFor(() => expect(pdf.querySelector("iframe")).not.toBeNull());
  return pdf;
}

/* Pointer-drags a section grip; `over` is the drop-zone element under the pointer (or null). */
function dragSection(label, over, { release = true } = {}) {
  const handle = grip(label);
  document.elementFromPoint = () => handle;
  fireEvent.pointerDown(handle, { pointerId: 1, pointerType: "mouse", button: 0, clientX: 10, clientY: 10 });
  fireEvent.pointerMove(handle, { pointerId: 1, pointerType: "mouse", clientX: 40, clientY: 10 });
  const target = typeof over === "function" ? over() : over;
  document.elementFromPoint = () => target;
  fireEvent.pointerMove(handle, { pointerId: 1, pointerType: "mouse", clientX: 300, clientY: 200 });
  if (release) {
    fireEvent.pointerUp(handle, { pointerId: 1, pointerType: "mouse", clientX: 300, clientY: 200 });
    fireEvent.click(handle); // what the browser sends after the drag — must not open the menu
  }
  return handle;
}

const zone = (target, edge) => document.querySelector(`[data-drop-target="${target}"][data-drop-edge="${edge}"]`);

describe("rearranging workspace sections", () => {
  it("starts with the notebook and assistant side by side and a labelled grip in every section header", async () => {
    await openWorkspace();
    expect(columns()).toBe("minmax(0, 1fr) var(--ws-assistant-w)");
    expect(placeOf("notebook").column).toBe("1");
    expect(placeOf("assistant").column).toBe("2");
    for (const label of ["Notebook", "Study assistant"]) expect(grip(label)).toBeInTheDocument();
    // Course materials is a menu over the workspace, not a section.
    expect(screen.queryByRole("button", { name: "Move Course materials" })).not.toBeInTheDocument();
    expect(localStorage.getItem(LAYOUT_KEY)).toBeNull();
  });

  it("drags a section onto a highlighted drop zone and reflows the others", async () => {
    await openWorkspace();
    const handle = dragSection("Study assistant", () => zone("notebook", "left"), { release: false });

    // While dragging: the moved section is marked, the other sections offer drop zones.
    expect(slot("assistant")).toHaveClass("ws-slot--dragging");
    expect(zone("notebook", "top")).not.toBeNull();
    expect(zone("assistant", "left")).toBeNull(); // not onto itself
    expect(zone("notebook", "left")).toHaveClass("section-drop__zone--active");
    expect(slot("notebook").querySelector(".section-drop__label")).toHaveTextContent("Place to the left of Notebook");
    expect(document.querySelector(".section-ghost")).toHaveTextContent("Moving Study assistant");

    fireEvent.pointerUp(handle, { pointerId: 1, pointerType: "mouse", clientX: 300, clientY: 200 });
    fireEvent.click(handle);

    expect(placeOf("assistant").column).toBe("1");
    expect(placeOf("notebook").column).toBe("2");
    expect(columns()).toBe("var(--ws-assistant-w) minmax(0, 1fr)");
    expect(document.querySelector(".section-drop")).toBeNull();
    expect(screen.queryByRole("menu")).not.toBeInTheDocument(); // the drag didn't open the menu
    expect(status()).toContain("Study assistant moved to the left of Notebook.");
    expect(JSON.parse(localStorage.getItem(LAYOUT_KEY))).toEqual([["materials"], ["pdf"], ["assistant"], ["notebook"]]);
  });

  it("leaves everything in place when dropped outside a target or cancelled with Escape", async () => {
    await openWorkspace();
    dragSection("Notebook", null);
    expect(placeOf("notebook").column).toBe("1");
    expect(status()).toContain("Notebook was not moved.");

    dragSection("Study assistant", () => zone("notebook", "left"), { release: false });
    fireEvent.keyDown(window, { key: "Escape" });
    expect(document.querySelector(".section-drop")).toBeNull();
    expect(placeOf("assistant").column).toBe("2");
    expect(localStorage.getItem(LAYOUT_KEY)).toBeNull();
  });

  it("moves sections with the keyboard from the grip's Move menu and can reset the layout", async () => {
    const { user } = await openWorkspace();

    grip("Study assistant").focus();
    await user.keyboard("{Enter}");
    expect(screen.getByRole("menuitem", { name: "Move right" })).toBeDisabled(); // already at the right edge
    await user.keyboard("{Escape}");

    await chooseMove(user, "Study assistant", "Move left"); // joins the notebook column
    expect(placeOf("assistant").column).toBe("1");
    expect(status()).toContain("Study assistant moved left.");
    expect(grip("Study assistant")).toHaveFocus(); // focus comes back to the same grip

    await chooseMove(user, "Study assistant", "Move up");
    expect(placeOf("assistant").row).toBe("1 / 2");
    expect(placeOf("notebook").row).toBe("2 / 3");

    await chooseMove(user, "Notebook", "Reset layout");
    expect(columns()).toBe("minmax(0, 1fr) var(--ws-assistant-w)");
    expect(status()).toContain("Workspace layout reset.");
    expect(localStorage.getItem(LAYOUT_KEY)).toBeNull();
  });

  it("keeps every section's state when sections move — nothing is recreated", async () => {
    const { user } = await openWorkspace();
    const pdf = await openPdf(user);
    await user.click(within(pdf).getByRole("button", { name: "Next page" }));
    await user.click(within(pdf).getByRole("button", { name: "Zoom in" }));
    const zoom = within(pdf).getByText(/%$/).textContent;
    const frame = pdf.querySelector("iframe"); // the viewer reloads its frame on page/zoom changes, not on moves
    const cell = screen.getByRole("group", { name: "Python cell 1" });
    await user.type(screen.getByLabelText("Message to the study assistant"), "half-written question");
    const assistant = screen.getByRole("region", { name: "Study assistant" });

    // The PDF starts beside the notebook; drop it below the notebook, then the assistant to the far left.
    expect(placeOf("pdf").column).toBe("1");
    expect(placeOf("notebook").column).toBe("2");
    dragSection("PDF viewer", () => zone("notebook", "bottom"));
    expect(placeOf("notebook").row).toBe("1 / 2");
    expect(placeOf("pdf").row).toBe("2 / 3");
    expect(screen.getByRole("separator", { name: "Resize PDF and notebook" })).toHaveAttribute("aria-valuetext", "Notebook 50% of the height");
    dragSection("Study assistant", () => zone("notebook", "left"));
    expect(placeOf("assistant").column).toBe("1");

    // Same elements, same state.
    expect(screen.getByRole("region", { name: "PDF viewer: Lecture 1" })).toBe(pdf);
    expect(pdf.querySelector("iframe")).toBe(frame);
    expect(within(pdf).getByLabelText("Page number")).toHaveValue("2");
    expect(within(pdf).getByText(/%$/).textContent).toBe(zoom);
    expect(screen.getByRole("group", { name: "Python cell 1" })).toBe(cell);
    expect(cell).toHaveTextContent("print(answer)");
    expect(within(await openMaterialsMenu()).getByRole("button", { name: /^Lecture 1/ })).toHaveAttribute("aria-current", "true");
    expect(screen.getByRole("region", { name: "Study assistant" })).toBe(assistant);
    expect(screen.getByLabelText("Message to the study assistant")).toHaveValue("half-written question");
  });

  it("restores the saved arrangement after a reload and ignores invalid saved data", async () => {
    localStorage.setItem(LAYOUT_KEY, JSON.stringify([["notebook"], ["materials", "assistant"], ["pdf"]]));
    const first = await openWorkspace();
    expect(placeOf("notebook").column).toBe("1");
    expect(placeOf("assistant").column).toBe("2");
    first.unmount();

    localStorage.setItem(LAYOUT_KEY, JSON.stringify([["notebook"], ["materials"]]));
    await openWorkspace();
    expect(columns()).toBe("minmax(0, 1fr) var(--ws-assistant-w)");
  });

  it("stacks every section in layout order on narrow screens, with only above/below drop zones", async () => {
    narrow = true;
    localStorage.setItem(LAYOUT_KEY, JSON.stringify([["assistant"], ["materials"], ["pdf", "notebook"]]));
    await openWorkspace();
    const body = document.querySelector(".workspace__body");
    expect(body).toHaveClass("workspace__body--stacked");
    expect(document.querySelector(".workspace")).toHaveClass("workspace--stacked");
    const order = (section) => Number(slot(section).style.getPropertyValue("--slot-order"));
    expect(order("assistant")).toBeLessThan(order("notebook"));

    dragSection("Notebook", () => zone("assistant", "top"), { release: false });
    expect(zone("assistant", "left")).toBeNull();
    expect(zone("assistant", "top")).not.toBeNull();
    act(() => {
      fireEvent.pointerUp(grip("Notebook"), { pointerId: 1, pointerType: "mouse", clientX: 300, clientY: 200 });
    });
    expect(order("notebook")).toBeLessThan(order("assistant"));
  });
});
