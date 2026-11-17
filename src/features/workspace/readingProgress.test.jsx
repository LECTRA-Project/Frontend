import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { makeToken, mockApi, ok, renderApp, saveToken, TEST_USER } from "../../test/helpers.jsx";
import { daysAgo, installChatBackend, lectureFixture } from "../../test/chatBackend.js";
import { installFakeIntersectionObserver } from "../../test/intersectionObserver.js";
import { BATCH_INTERVAL_MS, DWELL_MS } from "../lectures/readingTracker.js";

/*
  Reading progress in the workspace: the viewer header shows "Read 1 of 3" from the
  backend, slides on screen for 2 s are sent with the next batch and the label counts up;
  a backend without the AI routes gets no progress requests at all.
*/
const token = makeToken();
const DECK = lectureFixture("l2", "Game playing", {
  fileType: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  count: 3,
});

const progressPosts = (api) => api.history.post.filter((request) => request.url.endsWith("/progress"));

describe("reading progress in the workspace", () => {
  let api;
  let backend;
  let io;

  beforeEach(() => {
    // The clock also moves on its own, so the app's own waiting (findBy…) still works.
    vi.useFakeTimers({ shouldAdvanceTime: true });
    io = installFakeIntersectionObserver();
    api = mockApi();
    backend = installChatBackend(api, {
      lectures: [DECK],
      sessions: [{ id: "s-1", title: "Week 2", lectureIds: [DECK.id], updated_at: daysAgo(0) }],
    });
    backend.viewed[DECK.id] = new Set([1]);
    saveToken(token);
  });

  afterEach(() => {
    api.restore();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("shows the pages read and counts up as slides are read", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    renderApp("/workspace?chat=s-1");
    const menu = await screen.findByRole("navigation", { name: "Chats and this chat's materials" });
    const list = within(menu).getByRole("list", { name: "Materials in this chat" });
    await user.click(await within(list).findByRole("button", { name: "Open Game playing beside the chat" }));
    const view = await screen.findByRole("region", { name: "Lecture: Game playing" });
    await within(view).findByText("Slide 3 of Game playing");
    expect(await within(view).findByTestId("reading-progress")).toHaveTextContent("Read 1 of 3");

    // Slide 2 on screen long enough, slide 3 only flipped past.
    io.show({ 1: 0, 2: 1 });
    await vi.advanceTimersByTimeAsync(DWELL_MS);
    io.show({ 2: 0, 3: 1 });
    await vi.advanceTimersByTimeAsync(1000);
    io.show({ 3: 0 });
    await vi.advanceTimersByTimeAsync(BATCH_INTERVAL_MS);

    await waitFor(() => expect(progressPosts(api)).toHaveLength(1));
    // The page, with the seconds the slides were on screen so far (the study time).
    const body = JSON.parse(progressPosts(api)[0].data);
    expect(body).toMatchObject({ pages: [2] });
    expect(body.seconds).toBeGreaterThan(0);
    await waitFor(() => expect(within(view).getByTestId("reading-progress")).toHaveTextContent("Read 2 of 3"));
  });

  it("sends what is left when the viewer closes", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    renderApp(`/workspace?chat=s-1&lecture=${DECK.id}`);
    const view = await screen.findByRole("region", { name: "Lecture: Game playing" });
    await within(view).findByText("Slide 3 of Game playing");
    await within(view).findByTestId("reading-progress");

    io.show({ 3: 1 });
    await vi.advanceTimersByTimeAsync(DWELL_MS);
    expect(progressPosts(api)).toHaveLength(0);
    await user.click(within(view).getByRole("button", { name: "Close the material viewer" }));
    await waitFor(() => expect(progressPosts(api)).toHaveLength(1));
    const body = JSON.parse(progressPosts(api)[0].data);
    expect(body).toMatchObject({ pages: [3] });
    expect(body.seconds).toBeGreaterThan(0); // the time it was on screen goes too
  });
});

describe("reading progress on a backend without the AI routes", () => {
  let api;
  const legacyPdf = {
    id: "old-2", user_id: TEST_USER.id, title: "Reading", original_filename: "reading.pdf", file_type: "application/pdf", file_size: 10,
    s3_url: "https://bucket.s3.eu-central-1.amazonaws.com/lectures/u/2/reading.pdf",
    uploaded_at: "2026-11-01T10:00:00Z", updated_at: "2026-11-01T10:00:00Z",
  };

  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    api = mockApi();
    api.onGet("/users/me").reply(200, ok(TEST_USER));
    api.onGet("/student_profile/lectures/00000000-0000-0000-0000-000000000000").reply(405, { status: false, message: "Method Not Allowed", data: null });
    api.onGet("/student_profile/lectures").reply(200, ok({ lectures: [legacyPdf], page: 1, page_size: 100, total: 1, total_pages: 1 }));
    api.onGet("/student_profile/chat/sessions").reply(404, { detail: "Not Found" });
    vi.stubGlobal("matchMedia", () => ({ matches: false, addEventListener() {}, removeEventListener() {} }));
    saveToken(token);
  });

  afterEach(() => {
    api.restore();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("neither loads nor sends progress, and shows no label", async () => {
    renderApp(`/workspace?lecture=${legacyPdf.id}`);
    await waitFor(() => expect(document.querySelector('iframe[title="Reading"]')).not.toBeNull());
    await vi.advanceTimersByTimeAsync(BATCH_INTERVAL_MS * 2);
    document.dispatchEvent(new Event("visibilitychange"));
    window.dispatchEvent(new Event("pagehide"));
    const progressRequests = [...api.history.get, ...api.history.post].filter((request) => request.url.endsWith("/progress"));
    expect(progressRequests).toEqual([]);
    expect(screen.queryByTestId("reading-progress")).not.toBeInTheDocument();
  });
});
