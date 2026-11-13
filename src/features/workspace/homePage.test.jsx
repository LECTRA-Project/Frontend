import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createCell, createNotebook } from "../../services/notebook/ipynb.js";
import { saveNotebook } from "../../services/notebook/notebookStorage.js";
import { makeToken, mockApi, ok, renderApp, saveToken, TEST_USER } from "../../test/helpers.jsx";

/*
  The Home / Welcome screen (/workspace/home) over the real workspace: recent uploads, files
  being uploaded, and opening a material, which goes to the chat with the material in the
  viewer beside it (?lecture=<id> in the URL).
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
  api.onGet("/student_profile/chat/sessions").reply(200, ok({ sessions: [], page: 1, page_size: 100, total: 0, total_pages: 0 }));

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
    // Beside the chat, which stays in the centre; the notebook stays closed.
    expect(screen.getByRole("heading", { name: "What are we studying today?" })).toBeInTheDocument();
    expect(screen.queryByRole("complementary", { name: "Notebook panel" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Exam" })).toBeInTheDocument();
    expect(router.state.location.search).toBe("?lecture=l1");
  });

  it("marks materials that are still processing or failed", async () => {
    const now = new Date().toISOString();
    lectures = [
      { ...pdfLecture("l1", "Busy lecture", now), processing_status: "processing" },
      { ...pdfLecture("l2", "Broken lecture", now), processing_status: "failed", processing_error: "No text" },
    ];
    renderApp("/workspace/home");
    const recent = await screen.findByRole("region", { name: "Recent uploads" });
    expect(await within(recent).findByRole("button", { name: /^Busy lecture.*Processing…/ })).toBeInTheDocument();
    expect(within(recent).getByRole("button", { name: /^Broken lecture.*Processing failed — open it to retry/ })).toBeInTheDocument();
  });
});

describe("uploading from Home", () => {
  it("shows the file as uploading in Recent uploads until the server answers, then lists it", async () => {
    let answer;
    api.onPost("/student_profile/upload-lecture").reply(
      () =>
        new Promise((resolve) => {
          answer = () => {
            const created = pdfLecture("l9", "neural nets", new Date().toISOString());
            lectures = [created];
            resolve([201, ok(created)]);
          };
        })
    );
    const user = userEvent.setup();
    renderApp("/workspace/home");
    await user.click(await screen.findByRole("button", { name: "Upload materials" }));
    const dialog = screen.getByRole("dialog", { name: "Upload lecture materials" });
    await user.upload(within(dialog).getByTestId("upload-input"), new File(["%PDF-"], "neural_nets.pdf", { type: "application/pdf" }));
    await user.click(within(dialog).getByRole("button", { name: "Upload" }));

    // A first upload shows the Recent uploads card, with the file in progress under Today.
    const recent = await screen.findByRole("region", { name: "Recent uploads" });
    const today = within(recent).getByRole("list", { name: "Today" });
    expect(within(today).getByText("neural_nets.pdf")).toBeInTheDocument();
    expect(within(today).getByRole("status")).toHaveTextContent(/Uploading… \d+%|Processing…/);
    expect(screen.queryByText(/Your study space for lectures/)).not.toBeInTheDocument();

    answer();
    expect(await within(recent).findByRole("button", { name: /^neural nets/ })).toBeInTheDocument();
    expect(within(recent).queryByText("neural_nets.pdf")).not.toBeInTheDocument();
  });

  it("shows a failed upload with its error and lets it be dismissed", async () => {
    api.onPost("/student_profile/upload-lecture").reply(413, { detail: "File too large" });
    const user = userEvent.setup();
    renderApp("/workspace/home");
    await user.click(await screen.findByRole("button", { name: "Upload materials" }));
    const dialog = screen.getByRole("dialog", { name: "Upload lecture materials" });
    await user.upload(within(dialog).getByTestId("upload-input"), new File(["%PDF-"], "big.pdf", { type: "application/pdf" }));
    await user.click(within(dialog).getByRole("button", { name: "Upload" }));

    expect(await screen.findByText("Upload failed: File too large")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Dismiss big.pdf" }));
    expect(screen.queryByRole("region", { name: "Recent uploads" })).not.toBeInTheDocument();
  });
});
