import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { makeToken, mockApi, ok, renderApp, saveToken, TEST_USER } from "../../test/helpers.jsx";

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
    await user.click(await screen.findByRole("button", { name: "Show course materials" }));
    const panel = screen.getByRole("region", { name: "Course materials" });
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

  it("retries a failed lecture", async () => {
    api.onPost("/student_profile/lectures/l3/reprocess").reply(() => {
      return [202, ok({ ...FAILED, processing_status: "pending", processing_error: null })];
    });
    const { user, panel } = await openWorkspace();
    await user.click(within(panel).getByRole("button", { name: "Retry processing Scanned notes" }));
    expect(await within(panel).findByText("Processing")).toBeInTheDocument();
  });

  it("uploads files, shows them as processing and polls until completed", async () => {
    api.onPost("/student_profile/upload-lecture").reply((config) => {
      const created = lecture({
        id: "l9",
        title: config.data.get("title"),
        course: config.data.get("course"),
        original_filename: "neural_nets.pdf",
        processing_status: "pending",
        source_count: null,
      });
      lectures = [created, ...lectures];
      return [201, ok(created)];
    });
    const { user, panel } = await openWorkspace();
    await user.click(within(panel).getByRole("button", { name: "Upload materials" }));
    const dialog = screen.getByRole("dialog", { name: "Upload lecture materials" });
    await user.upload(within(dialog).getByTestId("upload-input"), new File(["%PDF-"], "neural_nets.pdf"));
    await user.type(within(dialog).getByLabelText("Course (optional)"), "Deep Learning");
    await user.click(within(dialog).getByRole("button", { name: "Upload" }));

    expect(await within(panel).findByText("neural nets")).toBeInTheDocument();
    expect(within(panel).getByText("Processing")).toBeInTheDocument();
    expect(within(panel).getByText("PDF · Deep Learning")).toBeInTheDocument();
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

  it("replaces a lecture file through multipart PATCH", async () => {
    api.onPatch("/student_profile/lectures/l2").reply((config) => {
      expect(config.data.get("file").name).toBe("games_v2.pptx");
      return [200, ok({ ...DECK, original_filename: "games_v2.pptx", processing_status: "pending", content_version: 2 })];
    });
    const { user, panel } = await openWorkspace();
    await user.click(within(panel).getByRole("button", { name: "Edit Game playing" }));
    const dialog = screen.getByRole("dialog", { name: "Edit lecture" });
    await user.upload(within(dialog).getByTestId("replace-file-input"), new File(["x"], "games_v2.pptx"));
    expect(within(dialog).getByText(/processed again/)).toBeInTheDocument();
    await user.click(within(dialog).getByRole("button", { name: "Save changes" }));
    await waitFor(() => expect(within(panel).getAllByText("Processing").length).toBe(1));
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

  it("answers from the materials with sources that open the cited slide", async () => {
    api.onPost("/student_profile/assistant/ask").reply((config) => {
      expect(JSON.parse(config.data).question).toBe("How does minimax choose a move?");
      return [
        200,
        ok({
          found: true,
          answer: "It picks the move with the best worst case [S1].",
          references: [
            {
              id: "S1", lecture_id: "l2", lecture_title: "Game playing", file_type: DECK.file_type,
              source_type: "slide", source_number: 2, source_label: null, location: "Slide 2",
              snippet: "Minimax chooses the move with the best worst case",
            },
          ],
          searched_chunks: 8,
        }),
      ];
    });
    api.onGet("/student_profile/lectures/l2/content").reply(200, ok({
      lecture: DECK,
      sections: [
        { source_type: "slide", source_number: 1, source_label: null, location: "Slide 1", text: "Games" },
        { source_type: "slide", source_number: 2, source_label: null, location: "Slide 2", text: "Minimax chooses the move with the best worst case" },
      ],
      page: 1, page_size: 1000, total: 2, total_pages: 1,
    }));

    const { user } = await openWorkspace();
    const assistant = screen.getByRole("region", { name: "Study assistant" });
    expect(within(assistant).getByText("2 materials")).toBeInTheDocument();
    await user.type(within(assistant).getByLabelText("Message to the study assistant"), "How does minimax choose a move?");
    await user.click(within(assistant).getByRole("button", { name: "Send message" }));

    expect(await within(assistant).findByText(/best worst case/)).toBeInTheDocument();
    await user.click(within(assistant).getByRole("button", { name: /Game playing — Slide 2/ }));

    const viewer = await screen.findByRole("region", { name: "Lecture: Game playing" });
    const slide = await within(viewer).findByText("Minimax chooses the move with the best worst case");
    expect(slide.closest(".source-block")).toHaveClass("source-block--focused");
  });

  it("says clearly when the materials do not contain the answer", async () => {
    api.onPost("/student_profile/assistant/ask").reply(200, ok({
      found: false,
      answer: "I couldn't find the answer to this in your uploaded lecture materials.",
      references: [],
      searched_chunks: 8,
    }));
    const { user } = await openWorkspace();
    const assistant = screen.getByRole("region", { name: "Study assistant" });
    await user.type(within(assistant).getByLabelText("Message to the study assistant"), "Capital of France?");
    await user.click(within(assistant).getByRole("button", { name: "Send message" }));
    expect(await within(assistant).findByText(/couldn't find the answer/)).toBeInTheDocument();
    expect(within(assistant).queryByRole("list", { name: "Sources" })).not.toBeInTheDocument();
  });

  it("shows assistant errors from the backend", async () => {
    api.onPost("/student_profile/assistant/ask").reply(503, {
      status: false, message: "The AI assistant is not configured on the server (no LLM API key).", data: null,
    });
    const { user } = await openWorkspace();
    const assistant = screen.getByRole("region", { name: "Study assistant" });
    await user.type(within(assistant).getByLabelText("Message to the study assistant"), "Hi");
    await user.click(within(assistant).getByRole("button", { name: "Send message" }));
    expect(await within(assistant).findByText(/not configured on the server/)).toBeInTheDocument();
  });
});
