import { renderHook, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { makeToken, mockApi, ok, renderApp, saveToken } from "../../test/helpers.jsx";
import { daysAgo, installChatBackend, lectureFixture } from "../../test/chatBackend.js";
import { installFakeIntersectionObserver } from "../../test/intersectionObserver.js";
import { BATCH_INTERVAL_MS, DWELL_MS } from "../lectures/readingTracker.js";
import { useCompletionRefresh } from "../lectures/useCompletionRefresh.js";

/*
  The completion ring beside each material in the menu: its value and label from the
  lecture's completion_percent, none without the field, and how it follows the reading
  (a save that counts new pages answers with the lecture's completion_percent; an older
  backend without it: the lecture is read again).
*/
const token = makeToken();
const PDF = { ...lectureFixture("l1", "KI 02", { count: 65 }), completion_percent: 58 };
// Slide 1 of 3 was read before: 70% × 1/3 = 23%.
const DECK = {
  ...lectureFixture("l2", "Game playing", { fileType: "application/vnd.openxmlformats-officedocument.presentationml.presentation", count: 3 }),
  completion_percent: 23,
};
// An older backend: no completion_percent at all.
const NOTEBOOK = lectureFixture("l3", "Pandas basics", { fileType: "application/x-ipynb+json", count: 4 });

const lectureReads = (api, id) => api.history.get.filter((request) => request.url === `/student_profile/lectures/${id}`);
const progressSaves = (api) => api.history.post.filter((request) => request.url.endsWith("/progress"));

async function materialsList() {
  const menu = await screen.findByRole("navigation", { name: "Chats and this chat's materials" });
  return within(menu).getByRole("list", { name: "Materials in this chat" });
}

describe("completion rings in the menu", () => {
  let api;
  let backend;
  let io;

  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    io = installFakeIntersectionObserver();
    api = mockApi();
    backend = installChatBackend(api, {
      lectures: [PDF, DECK, NOTEBOOK],
      sessions: [{ id: "s-1", title: "Week 2", lectureIds: [PDF.id, DECK.id, NOTEBOOK.id], updated_at: daysAgo(0) }],
    });
    backend.viewed[DECK.id] = new Set([1]);
    saveToken(token);
  });

  afterEach(() => {
    api.restore();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("shows each material's completion, and no ring without the field", async () => {
    renderApp("/workspace?chat=s-1");
    const list = await materialsList();

    const pdf = await within(list).findByRole("button", { name: "Open KI 02 beside the chat" });
    expect(pdf).toHaveAccessibleDescription("58% complete");
    const ring = within(pdf).getByRole("img", { name: "58% complete" });
    expect(ring).toHaveAttribute("data-percent", "58");
    expect(ring).toHaveAttribute("title", "58% complete");

    expect(within(list).getByRole("button", { name: "Open Game playing beside the chat" })).toHaveAccessibleDescription("23% complete");

    const notebook = within(list).getByRole("button", { name: "Open Pandas basics beside the chat" });
    expect(notebook).not.toHaveAttribute("aria-describedby");
    expect(notebook.querySelector(".completion-ring")).toBeNull();
  });

  it("follows the pages read with the completion from the save, without reading the lecture again", async () => {
    renderApp(`/workspace?chat=s-1&lecture=${DECK.id}`);
    const view = await screen.findByRole("region", { name: "Lecture: Game playing" });
    await within(view).findByText("Slide 3 of Game playing");
    expect(await within(view).findByTestId("reading-progress")).toHaveTextContent("Read 1 of 3");
    const list = await materialsList();
    const deck = within(list).getByRole("button", { name: "Open Game playing beside the chat" });
    expect(deck).toHaveAccessibleDescription("23% complete");
    // Opening the lecture loads its progress, but doesn't read the lecture again.
    expect(lectureReads(api, DECK.id)).toHaveLength(0);

    // Slide 2 read: the next batch saves it, its answer has the new completion, the ring follows.
    io.show({ 2: 1 });
    await vi.advanceTimersByTimeAsync(DWELL_MS);
    io.show({ 2: 0 });
    await vi.advanceTimersByTimeAsync(BATCH_INTERVAL_MS);
    await waitFor(() => expect(deck).toHaveAccessibleDescription("47% complete"));
    expect(progressSaves(api)).toHaveLength(1);
    expect(lectureReads(api, DECK.id)).toHaveLength(0);

    // Slide 1 again (read in an earlier session): saved, but the count doesn't change.
    io.show({ 1: 1 });
    await vi.advanceTimersByTimeAsync(DWELL_MS);
    io.show({ 1: 0 });
    await vi.advanceTimersByTimeAsync(BATCH_INTERVAL_MS);
    await waitFor(() => expect(progressSaves(api)).toHaveLength(2));
    await vi.advanceTimersByTimeAsync(100);
    expect(lectureReads(api, DECK.id)).toHaveLength(0);
    expect(deck).toHaveAccessibleDescription("47% complete");
  });

  it("reads the lecture again when an older backend's save has no completion", async () => {
    backend.progressCompletion = false;
    renderApp(`/workspace?chat=s-1&lecture=${DECK.id}`);
    const view = await screen.findByRole("region", { name: "Lecture: Game playing" });
    await within(view).findByText("Slide 3 of Game playing");
    expect(await within(view).findByTestId("reading-progress")).toHaveTextContent("Read 1 of 3");
    const list = await materialsList();
    const deck = within(list).getByRole("button", { name: "Open Game playing beside the chat" });
    expect(lectureReads(api, DECK.id)).toHaveLength(0);

    io.show({ 2: 1 });
    await vi.advanceTimersByTimeAsync(DWELL_MS);
    io.show({ 2: 0 });
    await vi.advanceTimersByTimeAsync(BATCH_INTERVAL_MS);
    await waitFor(() => expect(deck).toHaveAccessibleDescription("47% complete"));
    expect(progressSaves(api)).toHaveLength(1);
    expect(lectureReads(api, DECK.id)).toHaveLength(1);

    // Pages the backend already had: no request.
    io.show({ 1: 1 });
    await vi.advanceTimersByTimeAsync(DWELL_MS);
    io.show({ 1: 0 });
    await vi.advanceTimersByTimeAsync(BATCH_INTERVAL_MS);
    await waitFor(() => expect(progressSaves(api)).toHaveLength(2));
    await vi.advanceTimersByTimeAsync(100);
    expect(lectureReads(api, DECK.id)).toHaveLength(1);
  });

  it("follows when the viewer closes with a page not sent yet", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    renderApp(`/workspace?chat=s-1&lecture=${DECK.id}`);
    const view = await screen.findByRole("region", { name: "Lecture: Game playing" });
    await within(view).findByText("Slide 3 of Game playing");
    await within(view).findByTestId("reading-progress");

    io.show({ 3: 1 });
    await vi.advanceTimersByTimeAsync(DWELL_MS);
    await user.click(within(view).getByRole("button", { name: "Close the material viewer" }));

    const list = await materialsList();
    await waitFor(() =>
      expect(within(list).getByRole("button", { name: "Open Game playing beside the chat" })).toHaveAccessibleDescription("47% complete")
    );
    expect(lectureReads(api, DECK.id)).toHaveLength(0);
  });
});

describe("useCompletionRefresh", () => {
  let api;

  beforeEach(() => {
    api = mockApi();
    saveToken(token);
  });

  afterEach(() => api.restore());

  it("keeps one request per lecture on its way and runs a refresh asked for meanwhile once after it", async () => {
    const percents = [30, 45, 60];
    const gates = [];
    api.onGet("/student_profile/lectures/a").reply(async () => {
      const percent = percents.shift();
      await new Promise((resolve) => gates.push(resolve));
      return [200, ok({ id: "a", completion_percent: percent })];
    });
    const onUpdate = vi.fn();
    const { result } = renderHook(() => useCompletionRefresh({ onUpdate }));

    result.current("a");
    result.current("a");
    result.current("a");
    await waitFor(() => expect(gates).toHaveLength(1));
    gates[0]();
    await waitFor(() => expect(onUpdate).toHaveBeenCalledWith("a", 30));
    await waitFor(() => expect(gates).toHaveLength(2));
    gates[1]();
    await waitFor(() => expect(onUpdate).toHaveBeenLastCalledWith("a", 45));
    expect(lectureReads(api, "a")).toHaveLength(2);
  });

  it("uses the completion of the save without a request", async () => {
    const onUpdate = vi.fn();
    const { result } = renderHook(() => useCompletionRefresh({ onUpdate }));

    result.current("a", { viewed: 2, total: 3, completion_percent: 47 });
    expect(onUpdate).toHaveBeenCalledWith("a", 47);
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(api.history.get).toHaveLength(0);
  });

  it("falls back to reading the lecture when the save has no completion, and lets a newer save's completion win", async () => {
    let release;
    api.onGet("/student_profile/lectures/a").reply(async () => {
      await new Promise((resolve) => {
        release = resolve;
      });
      return [200, ok({ id: "a", completion_percent: 30 })];
    });
    const onUpdate = vi.fn();
    const { result } = renderHook(() => useCompletionRefresh({ onUpdate }));

    result.current("a", { viewed: 1, total: 3 });
    await waitFor(() => expect(release).toBeTypeOf("function"));
    // A newer save answers with its completion while the request is on its way.
    result.current("a", { viewed: 2, total: 3, completion_percent: 47 });
    expect(onUpdate).toHaveBeenLastCalledWith("a", 47);
    release();
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(onUpdate).toHaveBeenCalledTimes(1);
    expect(lectureReads(api, "a")).toHaveLength(1);
  });

  it("ignores failures and a lecture without completion_percent", async () => {
    api.onGet("/student_profile/lectures/gone").reply(404, { detail: "Lecture not found" });
    api.onGet("/student_profile/lectures/old").reply(200, ok({ id: "old", title: "Old backend" }));
    const onUpdate = vi.fn();
    const { result } = renderHook(() => useCompletionRefresh({ onUpdate }));

    result.current("gone");
    result.current("old");
    await waitFor(() => expect(api.history.get).toHaveLength(2));
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(onUpdate).not.toHaveBeenCalled();
  });
});
