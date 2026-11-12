import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { makeToken, mockApi, ok, renderApp, saveToken, TEST_USER, openMaterialsMenu } from "../../test/helpers.jsx";

const token = makeToken();

function lecture(overrides) {
  return {
    id: "l1",
    user_id: TEST_USER.id,
    title: "Search algorithms",
    original_filename: "search.pdf",
    file_type: "application/pdf",
    file_size: 100,
    s3_url: "local://lectures/u/1/search.pdf",
    uploaded_at: "2026-11-01T10:00:00Z",
    updated_at: "2026-11-01T10:00:00Z",
    description: null,
    course: "AI Basics",
    processing_status: "completed",
    processing_error: null,
    processing_attempts: 1,
    processed_at: "2026-11-01T10:00:05Z",
    content_version: 1,
    chunk_count: 4,
    source_count: 12,
    source_type: "page",
    ...overrides,
  };
}

const DECK = lecture({
  id: "l2",
  title: "Game playing",
  original_filename: "games.pptx",
  file_type: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  source_type: "slide",
  source_count: 3,
});
const FAILED = lecture({
  id: "l3",
  title: "Scanned notes",
  original_filename: "scan.pdf",
  processing_status: "failed",
  processing_error: "No text could be extracted from this file.",
});

describe("lecture workspace", () => {
  let api;
  let lectures;

  beforeEach(() => {
    api = mockApi();
    lectures = [lecture(), DECK, FAILED];
    api.onGet("/users/me").reply(200, ok(TEST_USER));
    api.onGet("/student_profile/lectures").reply(() => [
      200,
      ok({ lectures, page: 1, page_size: 100, total: lectures.length, total_pages: 1 }),
    ]);
    saveToken(token);
  });

  afterEach(() => {
    api.restore();
    localStorage.clear();
  });

  async function openWorkspace() {
    const user = userEvent.setup();
    renderApp("/workspace");
    const panel = await openMaterialsMenu();
    await within(panel).findByText("Search algorithms");
    return { user, panel };
  }

  it("lists backend lectures with their type, size and processing status", async () => {
    const { panel } = await openWorkspace();
    expect(within(panel).getAllByText("PDF · 12 pages · AI Basics")).toHaveLength(2);
    expect(within(panel).getByText("PPTX · 3 slides · AI Basics")).toBeInTheDocument();
    expect(within(panel).getByText("Failed")).toBeInTheDocument();
    expect(within(panel).getByText("No text could be extracted from this file.")).toBeInTheDocument();
  });

  it("rejects unsupported file types in the upload dialog", async () => {
    const { user, panel } = await openWorkspace();
    await user.click(within(panel).getByRole("button", { name: "Upload materials" }));
    const dialog = screen.getByRole("dialog", { name: "Upload lecture materials" });
    await userEvent.setup({ applyAccept: false }).upload(within(dialog).getByTestId("upload-input"), new File(["x"], "virus.exe"));
    expect(within(dialog).getByRole("alert")).toHaveTextContent("virus.exe");
    expect(within(dialog).getByRole("button", { name: "Upload" })).toBeDisabled();
  });

  it("edits only the changed metadata", async () => {
    api.onPatch("/student_profile/lectures/l1").reply((config) => {
      expect(JSON.parse(config.data)).toEqual({ title: "Search (week 3)" });
      return [200, ok(lecture({ title: "Search (week 3)" }))];
    });
    const { user, panel } = await openWorkspace();
    await user.click(within(panel).getByRole("button", { name: "Edit Search algorithms" }));
    const dialog = screen.getByRole("dialog", { name: "Edit lecture" });
    const title = within(dialog).getByLabelText("Title");
    await user.clear(title);
    await user.type(title, "Search (week 3)");
    await user.click(within(dialog).getByRole("button", { name: "Save changes" }));
    expect(await within(panel).findByText("Search (week 3)")).toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("deletes a lecture after confirmation", async () => {
    api.onDelete("/student_profile/lectures/l2").reply(() => {
      lectures = lectures.filter((item) => item.id !== "l2");
      return [200, ok({ id: "l2" })];
    });
    const { user, panel } = await openWorkspace();
    await user.click(within(panel).getByRole("button", { name: "Delete Game playing" }));
    await user.click(within(screen.getByRole("dialog", { name: "Delete lecture?" })).getByRole("button", { name: "Delete" }));
    await waitFor(() => expect(within(panel).queryByText("Game playing")).not.toBeInTheDocument());
  });

});

describe("lecture workspace on a backend without AI processing (e.g. today's Render deployment)", () => {
  let api;
  // Exactly what that backend returns: no processing fields, a public S3 URL.
  const legacy = {
    id: "old-1", user_id: TEST_USER.id, title: "Intro slides", original_filename: "intro.pptx",
    file_type: "application/vnd.openxmlformats-officedocument.presentationml.presentation", file_size: 10,
    s3_url: "https://bucket.s3.eu-central-1.amazonaws.com/lectures/u/1/intro.pptx",
    uploaded_at: "2026-11-01T10:00:00Z", updated_at: "2026-11-01T10:00:00Z",
  };
  const legacyPdf = { ...legacy, id: "old-2", title: "Reading", original_filename: "reading.pdf", file_type: "application/pdf",
    s3_url: "https://bucket.s3.eu-central-1.amazonaws.com/lectures/u/2/reading.pdf" };

  beforeEach(() => {
    api = mockApi();
    api.onGet("/users/me").reply(200, ok(TEST_USER));
    api.onGet("/student_profile/lectures").reply(200, ok({ lectures: [legacy, legacyPdf], page: 1, page_size: 100, total: 2, total_pages: 1 }));
    saveToken(token);
  });

  afterEach(() => {
    api.restore();
    localStorage.clear();
  });

  async function openWorkspace() {
    const user = userEvent.setup();
    renderApp("/workspace");
    const panel = await openMaterialsMenu();
    await within(panel).findByText("Intro slides");
    const assistant = screen.getByRole("region", { name: "Study assistant" });
    await within(assistant).findByText("Assistant not available yet");
    return { user, panel, assistant };
  }

  it("lists lectures without status badges and says the assistant is not available", async () => {
    const { panel, assistant } = await openWorkspace();
    expect(within(panel).getByText("PPTX")).toBeInTheDocument();
    expect(within(panel).queryByText("Processing")).not.toBeInTheDocument();
    expect(within(assistant).getByText("Not available")).toBeInTheDocument();
    expect(within(assistant).getByRole("button", { name: "Send message" })).toBeDisabled();
    expect(api.history.post.filter((r) => r.url.includes("assistant"))).toHaveLength(0);
  });

  it("never calls endpoints the backend doesn't have (probe, file, content, reprocess, ask)", async () => {
    const { user, panel } = await openWorkspace();
    await user.click(within(panel).getByRole("button", { name: /^Reading/ }));
    await screen.findByRole("region", { name: /PDF viewer: Reading/ });
    await user.click(within(await openMaterialsMenu()).getByRole("button", { name: /^Intro slides/ }));
    await screen.findByRole("region", { name: "Lecture: Intro slides" });

    const requested = [...api.history.get, ...api.history.post].map((request) => request.url);
    const missing = /\/lectures\/[^/]+(\/(file|content|reprocess))?$|\/assistant\/ask/;
    expect(requested.filter((url) => missing.test(url))).toEqual([]);
  });

  it("opens a PDF straight from its S3 URL", async () => {
    const { user, panel } = await openWorkspace();
    await user.click(within(panel).getByRole("button", { name: /^Reading/ }));
    const frame = await screen.findByTitle("Reading");
    expect(frame.getAttribute("src")).toMatch(/^https:\/\/bucket\.s3.+reading\.pdf#page=1/);
    expect(api.history.get.some((r) => r.url.endsWith("/file"))).toBe(false);
  });

  it("offers a download for slides instead of extracted text", async () => {
    const { user, panel } = await openWorkspace();
    await user.click(within(panel).getByRole("button", { name: /^Intro slides/ }));
    const viewer = await screen.findByRole("region", { name: "Lecture: Intro slides" });
    expect(within(viewer).getByRole("link", { name: "Download" })).toHaveAttribute("href", legacy.s3_url);
    expect(within(viewer).getByText(/can’t be previewed/)).toBeInTheDocument();
    expect(api.history.get.some((r) => r.url.endsWith("/content"))).toBe(false);
  });

  it("uploads only the file types that backend accepts, without a course field", async () => {
    const { user, panel } = await openWorkspace();
    await user.click(within(panel).getByRole("button", { name: "Upload materials" }));
    const dialog = screen.getByRole("dialog", { name: "Upload lecture materials" });
    expect(within(dialog).queryByLabelText("Course (optional)")).not.toBeInTheDocument();
    expect(within(dialog).getByTestId("upload-input")).toHaveAttribute("accept", ".pdf,.pptx,.ipynb");
    await userEvent.setup({ applyAccept: false }).upload(within(dialog).getByTestId("upload-input"), new File(["# x"], "notes.md"));
    expect(within(dialog).getByRole("alert")).toHaveTextContent("notes.md");
  });

  it("only renames, sending just the title", async () => {
    api.onPatch("/student_profile/lectures/old-1").reply((config) => {
      expect(JSON.parse(config.data)).toEqual({ title: "Intro (week 1)" });
      return [200, ok({ ...legacy, title: "Intro (week 1)" })];
    });
    const { user, panel } = await openWorkspace();
    await user.click(within(panel).getByRole("button", { name: "Edit Intro slides" }));
    const dialog = screen.getByRole("dialog", { name: "Edit lecture" });
    expect(within(dialog).queryByLabelText("Course")).not.toBeInTheDocument();
    expect(within(dialog).queryByRole("button", { name: "Replace file" })).not.toBeInTheDocument();
    expect(within(dialog).getByText(/supports renaming only/)).toBeInTheDocument();
    const title = within(dialog).getByLabelText("Title");
    await user.clear(title);
    await user.type(title, "Intro (week 1)");
    await user.click(within(dialog).getByRole("button", { name: "Save changes" }));
    expect(await within(panel).findByText("Intro (week 1)")).toBeInTheDocument();
  });
});
