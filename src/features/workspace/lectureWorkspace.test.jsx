import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { makeToken, mockApi, ok, renderApp, saveToken, TEST_USER } from "../../test/helpers.jsx";
import { daysAgo, installChatBackend, lectureFixture } from "../../test/chatBackend.js";

/*
  Lecture materials in the chat-first workspace: the chat's materials in the menu, their
  processing status, uploads, managing them in the library (rename, delete), and what the
  viewer shows for each type — on the AI backend and on a backend without AI processing.
*/
const token = makeToken();

const PDF = lectureFixture("l1", "Search algorithms", { count: 12 });
const DECK = lectureFixture("l2", "Game playing", {
  fileType: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  count: 3,
});
const FAILED = lectureFixture("l3", "Scanned notes", { status: "failed", count: 0 });

describe("lecture materials in a chat", () => {
  let api;
  let backend;

  beforeEach(() => {
    api = mockApi();
    backend = installChatBackend(api, {
      lectures: [PDF, DECK, FAILED],
      sessions: [{ id: "s-1", title: "Week 2", lectureIds: [PDF.id, DECK.id, FAILED.id], updated_at: daysAgo(0) }],
    });
    saveToken(token);
  });

  afterEach(() => api.restore());

  async function openChat() {
    const user = userEvent.setup();
    renderApp("/workspace");
    const menu = await screen.findByRole("navigation", { name: "Chats and this chat's materials" });
    await user.click(await within(menu).findByRole("button", { name: "Week 2" }));
    const list = within(menu).getByRole("list", { name: "Materials in this chat" });
    await within(list).findByText("Search algorithms");
    return { user, menu, list };
  }

  it("lists the chat's materials with their type, size and processing status", async () => {
    const { list } = await openChat();
    expect(within(list).getByText("PDF · 12 pages")).toBeInTheDocument();
    expect(within(list).getByText("PPTX · 3 slides")).toBeInTheDocument();
    expect(within(list).getByText(/Failed/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "3 materials" })).toBeInTheDocument(); // the composer's scope chip
  });

  it("retries a failed lecture from its row in the menu", async () => {
    const { user, list } = await openChat();
    await user.click(within(list).getByRole("button", { name: "Retry processing Scanned notes" }));
    await waitFor(() => expect(within(list).queryByText(/Failed/)).not.toBeInTheDocument());
    expect(within(list).queryByRole("button", { name: /^Retry processing/ })).not.toBeInTheDocument();
    expect(api.history.post.map((request) => request.url)).toContain("/student_profile/lectures/l3/reprocess");
  });

  it("uploads into the chat with progress, then shows the new lecture as processing", async () => {
    api.onPost("/student_profile/upload-lecture").reply((config) => {
      expect([...config.data.keys()]).toEqual(["title", "file"]); // no course or description
      const created = lectureFixture("l9", config.data.get("title"), { status: "pending", count: 0 });
      backend.lectures = [created, ...backend.lectures];
      return [201, ok(created)];
    });
    const { user, menu, list } = await openChat();
    await user.click(within(menu).getByRole("button", { name: "Upload a material to this chat" }));
    const dialog = screen.getByRole("dialog", { name: "Upload lecture materials" });
    expect(within(dialog).getByText(/added to this chat/)).toBeInTheDocument();
    expect(within(dialog).queryByLabelText(/Course/)).not.toBeInTheDocument();
    await user.upload(within(dialog).getByTestId("upload-input"), new File(["%PDF-"], "neural_nets.pdf"));
    await user.click(within(dialog).getByRole("button", { name: "Upload" }));

    expect(await within(list).findByText("neural nets")).toBeInTheDocument();
    expect(within(list).getByText(/Processing/)).toBeInTheDocument();
    expect(JSON.parse(api.history.post.find((request) => request.url.endsWith("/s-1/lectures")).data)).toEqual({ lecture_id: "l9" });
  });

  it("offers exactly the file types the backend accepts: PDF, PPTX, IPYNB and images, not Markdown", async () => {
    const { user, menu } = await openChat();
    await user.click(within(menu).getByRole("button", { name: "Upload a material to this chat" }));
    const dialog = screen.getByRole("dialog", { name: "Upload lecture materials" });
    const input = within(dialog).getByTestId("upload-input");
    expect(input).toHaveAttribute("accept", ".pdf,.pptx,.ipynb,.png,.jpg,.jpeg,.gif,.webp");
    expect(within(dialog).getByText(/Supported: PDF, PPTX, IPYNB and images/)).toBeInTheDocument();

    await userEvent.setup({ applyAccept: false }).upload(input, [new File(["x"], "virus.exe"), new File(["# x"], "notes.md")]);
    expect(within(dialog).getByRole("alert")).toHaveTextContent("virus.exe, notes.md");
    expect(within(dialog).getByRole("button", { name: "Upload" })).toBeDisabled();

    await user.upload(input, new File(["png"], "whiteboard.png", { type: "image/png" }));
    expect(within(dialog).getByRole("list", { name: "Selected files" })).toHaveTextContent("whiteboard.png");
    expect(within(dialog).getByRole("button", { name: "Upload" })).toBeEnabled();
  });

  it("renames a material from its ⋯ menu, sending only the new title", async () => {
    const { user, list } = await openChat();
    await user.click(within(list).getByRole("button", { name: "More actions for Search algorithms" }));
    await user.click(screen.getByRole("menuitem", { name: "Rename" }));
    const dialog = screen.getByRole("dialog", { name: "Rename lecture" });
    const field = within(dialog).getByLabelText("Title");
    expect(field).toHaveValue("Search algorithms");
    await user.clear(field);
    await user.type(field, "  Uninformed search  ");
    await user.click(within(dialog).getByRole("button", { name: "Rename" }));

    expect(await within(list).findByText("Uninformed search")).toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    const patch = api.history.patch.find((request) => request.url === "/student_profile/lectures/l1");
    expect(JSON.parse(patch.data)).toEqual({ title: "Uninformed search" });
  });

  it("keeps the rename dialog open with the server's error", async () => {
    api.onPatch(/\/student_profile\/lectures\/[^/]+$/).reply(500, { status: false, message: "The lecture could not be renamed.", data: null });
    const { user, list } = await openChat();
    await user.click(within(list).getByRole("button", { name: "More actions for Search algorithms" }));
    await user.click(screen.getByRole("menuitem", { name: "Rename" }));
    const dialog = screen.getByRole("dialog", { name: "Rename lecture" });
    await user.type(within(dialog).getByLabelText("Title"), " 2");
    await user.click(within(dialog).getByRole("button", { name: "Rename" }));
    expect(await within(dialog).findByRole("alert")).toHaveTextContent("The lecture could not be renamed.");
    expect(within(list).getByText("Search algorithms")).toBeInTheDocument();
  });

  it("deletes a material from the library after confirmation: it leaves the chat and the viewer", async () => {
    const { user, list } = await openChat();
    await user.click(within(list).getByRole("button", { name: "Open Game playing beside the chat" }));
    await screen.findByRole("region", { name: "Lecture: Game playing" });

    await user.click(within(list).getByRole("button", { name: "More actions for Game playing" }));
    await user.click(screen.getByRole("menuitem", { name: "Delete from library" }));
    const dialog = screen.getByRole("dialog", { name: "Delete from library?" });
    expect(dialog).toHaveTextContent("removed from every chat that uses it");
    await user.click(within(dialog).getByRole("button", { name: "Cancel" }));
    expect(api.history.delete).toHaveLength(0);

    await user.click(within(list).getByRole("button", { name: "More actions for Game playing" }));
    await user.click(screen.getByRole("menuitem", { name: "Delete from library" }));
    await user.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Delete from library" }));

    await waitFor(() => expect(within(list).queryByText("Game playing")).not.toBeInTheDocument());
    expect(screen.queryByRole("region", { name: "Lecture: Game playing" })).not.toBeInTheDocument();
    expect(api.history.delete.map((request) => request.url)).toEqual(["/student_profile/lectures/l2"]);
    expect(screen.getByText("Lecture deleted.")).toBeInTheDocument();
    expect(backend.lectures.map((item) => item.id)).toEqual(["l1", "l3"]);
  });

  it("shows slides as their extracted text, slide by slide", async () => {
    const { user, list } = await openChat();
    await user.click(within(list).getByRole("button", { name: "Open Game playing beside the chat" }));
    const view = await screen.findByRole("region", { name: "Lecture: Game playing" });
    expect(await within(view).findByText("Slide 2 of Game playing")).toBeInTheDocument();
    expect(view.querySelector(".viewer__position")).toHaveTextContent("Slide 1");
    expect(within(view).getByRole("button", { name: "Previous slide" })).toBeDisabled();
    await user.click(within(view).getByRole("button", { name: "Next slide" }));
    expect(view.querySelector(".viewer__position")).toHaveTextContent("Slide 2");
    // No banner: it was opened from the menu, not from a source.
    expect(within(view).queryByText(/Opened from a source/)).not.toBeInTheDocument();
  });
});

describe("lecture materials on a backend without AI processing (e.g. today's Render deployment)", () => {
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
    api.onGet("/student_profile/lectures/00000000-0000-0000-0000-000000000000").reply(405, { status: false, message: "Method Not Allowed", data: null });
    api.onGet("/student_profile/lectures").reply(200, ok({ lectures: [legacy, legacyPdf], page: 1, page_size: 100, total: 2, total_pages: 1 }));
    api.onGet("/student_profile/chat/sessions").reply(404, { detail: "Not Found" });
    vi.stubGlobal("matchMedia", () => ({ matches: false, addEventListener() {}, removeEventListener() {} }));
    saveToken(token);
  });

  afterEach(() => {
    api.restore();
    vi.unstubAllGlobals();
  });

  async function openHome() {
    const user = userEvent.setup();
    renderApp("/workspace/home");
    const recent = await screen.findByRole("region", { name: "Recent uploads" });
    await within(recent).findByText("Intro slides");
    return { user, recent };
  }

  it("opens a PDF straight from its S3 URL beside the chat, which says it can't answer here", async () => {
    const { user, recent } = await openHome();
    await user.click(within(recent).getByRole("button", { name: /^Reading/ }));
    const frame = await waitFor(() => {
      const element = document.querySelector('iframe[title="Reading"]');
      expect(element).not.toBeNull();
      return element;
    });
    expect(frame.getAttribute("src")).toMatch(/^https:\/\/bucket\.s3.+reading\.pdf#page=1/);
    expect(api.history.get.some((r) => r.url.endsWith("/file"))).toBe(false);
    expect(await screen.findByText("This server has no chat assistant yet.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Send message" })).toBeDisabled();
  });

  it("shows PowerPoint slides in the Office Online viewer beside the chat, with a download", async () => {
    const { user, recent } = await openHome();
    await user.click(within(recent).getByRole("button", { name: /^Intro slides/ }));
    const viewer = await screen.findByRole("region", { name: "Lecture: Intro slides" });
    expect(within(viewer).getByRole("link", { name: "Download" })).toHaveAttribute("href", legacy.s3_url);
    const frame = within(viewer).getByTitle("Slides: Intro slides");
    expect(frame).toHaveAttribute("src", `https://view.officeapps.live.com/op/embed.aspx?src=${encodeURIComponent(legacy.s3_url)}`);
    expect(within(viewer).queryByText(/can’t be previewed/)).not.toBeInTheDocument();
    expect(screen.getByRole("complementary", { name: "Intro slides, open beside the chat" })).toContainElement(viewer);
    expect(api.history.get.some((r) => r.url.endsWith("/content"))).toBe(false);
  });

  it("offers the same file types as the AI backend, without a course field", async () => {
    const { user, recent } = await openHome();
    await user.click(within(recent).getByRole("button", { name: "Upload materials" }));
    const dialog = screen.getByRole("dialog", { name: "Upload lecture materials" });
    expect(within(dialog).queryByLabelText(/Course/)).not.toBeInTheDocument();
    expect(within(dialog).getByTestId("upload-input")).toHaveAttribute("accept", ".pdf,.pptx,.ipynb,.png,.jpg,.jpeg,.gif,.webp");
    await userEvent.setup({ applyAccept: false }).upload(within(dialog).getByTestId("upload-input"), new File(["# x"], "notes.md"));
    expect(within(dialog).getByRole("alert")).toHaveTextContent("notes.md");
  });
});
