import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { BATCH_INTERVAL_MS, createReadingTracker, DWELL_MS, MAX_PAGES_PER_CALL } from "./readingTracker.js";

const answer = (pages) => ({ viewed_pages: pages, viewed: pages.length, total: 65, percent: 0 });

function setVisibility(state) {
  Object.defineProperty(document, "visibilityState", { value: state, configurable: true });
  document.dispatchEvent(new Event("visibilitychange"));
}

/* Lets the promise callbacks of a finished request run (fake timers don't run them). */
const settle = () => vi.advanceTimersByTimeAsync(0);

describe("reading tracker", () => {
  let send;
  let sendKeepalive;
  let onProgress;
  let tracker;

  function makeTracker({ enabled = true } = {}) {
    tracker = createReadingTracker({ send, sendKeepalive, onProgress });
    tracker.start();
    tracker.setEnabled(enabled);
    return tracker;
  }

  beforeEach(() => {
    vi.useFakeTimers();
    send = vi.fn(async (id, pages) => answer(pages));
    sendKeepalive = vi.fn(async (id, pages) => answer(pages));
    onProgress = vi.fn();
  });

  afterEach(() => {
    tracker?.stop();
    tracker = null;
    setVisibility("visible");
    vi.useRealTimers();
  });

  it("counts a page only after it stayed on screen for 2 seconds", async () => {
    makeTracker();
    tracker.setVisible("lec", [1]);
    await vi.advanceTimersByTimeAsync(DWELL_MS - 1);
    expect(tracker.inspect("lec").pending).toEqual([]);
    await vi.advanceTimersByTimeAsync(1);
    expect(tracker.inspect("lec").pending).toEqual([1]);
  });

  it("does not count a page that was flipped past in under 2 seconds", async () => {
    makeTracker();
    tracker.setVisible("lec", [1]);
    await vi.advanceTimersByTimeAsync(1500);
    tracker.setVisible("lec", [2]); // page 1 left the screen: its clock starts again next time
    await vi.advanceTimersByTimeAsync(1500);
    tracker.setVisible("lec", [1]);
    await vi.advanceTimersByTimeAsync(1500);
    expect(tracker.inspect("lec").pending).toEqual([]);
    tracker.setVisible("lec", []);
    await vi.advanceTimersByTimeAsync(BATCH_INTERVAL_MS);
    expect(send).not.toHaveBeenCalled();
  });

  it("keeps a page's clock running while it stays visible next to others", async () => {
    makeTracker();
    tracker.setVisible("lec", [1]);
    await vi.advanceTimersByTimeAsync(1000);
    tracker.setVisible("lec", [1, 2]);
    await vi.advanceTimersByTimeAsync(1000);
    expect(tracker.inspect("lec").pending).toEqual([1]);
    await vi.advanceTimersByTimeAsync(1000);
    expect(tracker.inspect("lec").pending).toEqual([1, 2]);
  });

  it("sends the pages read every 10 seconds, batched per lecture", async () => {
    makeTracker();
    tracker.setVisible("a", [1, 2]);
    tracker.setVisible("b", [7]);
    await vi.advanceTimersByTimeAsync(DWELL_MS);
    expect(send).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(BATCH_INTERVAL_MS - DWELL_MS);
    expect(send).toHaveBeenCalledTimes(2);
    expect(send).toHaveBeenCalledWith("a", [1, 2]);
    expect(send).toHaveBeenCalledWith("b", [7]);
    expect(onProgress).toHaveBeenCalledWith("a", answer([1, 2]));
    expect(tracker.inspect("a").sent).toEqual([1, 2]);

    // Nothing new: the next tick sends nothing.
    await vi.advanceTimersByTimeAsync(BATCH_INTERVAL_MS);
    expect(send).toHaveBeenCalledTimes(2);
  });

  it("never sends the same page twice in a session", async () => {
    makeTracker();
    tracker.setVisible("lec", [3]);
    await vi.advanceTimersByTimeAsync(BATCH_INTERVAL_MS);
    expect(send).toHaveBeenCalledWith("lec", [3]);

    // Back to page 3 later, and on to page 4.
    tracker.setVisible("lec", []);
    tracker.setVisible("lec", [3, 4]);
    expect(tracker.inspect("lec").timing).toEqual([4]);
    await vi.advanceTimersByTimeAsync(BATCH_INTERVAL_MS);
    expect(send).toHaveBeenLastCalledWith("lec", [4]);
    expect(send.mock.calls.flatMap(([, pages]) => pages)).toEqual([3, 4]);
  });

  it("sends at most 200 pages per request", async () => {
    makeTracker();
    const pages = Array.from({ length: 450 }, (_, index) => index + 1);
    tracker.setVisible("big", pages);
    await vi.advanceTimersByTimeAsync(BATCH_INTERVAL_MS);
    expect(send.mock.calls.map(([, part]) => part.length)).toEqual([MAX_PAGES_PER_CALL, MAX_PAGES_PER_CALL, 50]);
    expect(send.mock.calls.flatMap(([, part]) => part)).toEqual(pages);
    expect(tracker.inspect("big").sent).toHaveLength(450);
  });

  it("keeps the pages after a failure and sends them with the next batch", async () => {
    makeTracker();
    send.mockRejectedValueOnce(Object.assign(new Error("Network Error"), { status: null }));
    tracker.setVisible("lec", [1]);
    await vi.advanceTimersByTimeAsync(BATCH_INTERVAL_MS);
    expect(send).toHaveBeenCalledTimes(1);
    expect(tracker.inspect("lec")).toMatchObject({ pending: [1], sent: [] });

    tracker.setVisible("lec", [1, 2]);
    await vi.advanceTimersByTimeAsync(BATCH_INTERVAL_MS);
    expect(send).toHaveBeenCalledTimes(2);
    expect(send).toHaveBeenLastCalledWith("lec", [1, 2]);
    expect(tracker.inspect("lec")).toMatchObject({ pending: [], sent: [1, 2] });
    expect(onProgress).toHaveBeenCalledTimes(1);
  });

  it("drops the pages of a lecture that no longer exists", async () => {
    makeTracker();
    send.mockRejectedValueOnce(Object.assign(new Error("Lecture not found"), { status: 404 }));
    tracker.setVisible("gone", [1]);
    await vi.advanceTimersByTimeAsync(BATCH_INTERVAL_MS * 2);
    expect(send).toHaveBeenCalledTimes(1);
    expect(tracker.inspect("gone")).toMatchObject({ pending: [], sent: [] });
  });

  it("does not send a page again while its request is still on its way", async () => {
    makeTracker();
    let finish;
    send.mockImplementationOnce((id, pages) => new Promise((resolve) => (finish = () => resolve(answer(pages)))));
    tracker.setVisible("lec", [1]);
    await vi.advanceTimersByTimeAsync(BATCH_INTERVAL_MS);
    expect(tracker.inspect("lec").inflight).toEqual([1]);
    await vi.advanceTimersByTimeAsync(BATCH_INTERVAL_MS);
    expect(send).toHaveBeenCalledTimes(1);
    finish();
    await settle();
    expect(tracker.inspect("lec")).toMatchObject({ inflight: [], sent: [1] });
  });

  it("sends at once when the viewer closes or switches lecture", async () => {
    makeTracker();
    tracker.setVisible("lec", [5, 6]);
    await vi.advanceTimersByTimeAsync(DWELL_MS);
    tracker.setVisible("lec", [6, 7]); // page 7 has been on screen for no time at all
    await tracker.leave("lec");
    expect(send).toHaveBeenCalledWith("lec", [5, 6]);
    expect(tracker.inspect("lec").timing).toEqual([]);
    await vi.advanceTimersByTimeAsync(BATCH_INTERVAL_MS);
    expect(send).toHaveBeenCalledTimes(1);
  });

  it("sends with keepalive when the tab is hidden, and stops the clocks meanwhile", async () => {
    makeTracker();
    tracker.setVisible("lec", [1, 2]);
    await vi.advanceTimersByTimeAsync(DWELL_MS);
    tracker.setVisible("lec", [1, 2, 3]);
    await vi.advanceTimersByTimeAsync(1000);

    setVisibility("hidden");
    expect(sendKeepalive).toHaveBeenCalledWith("lec", [1, 2]);
    expect(send).not.toHaveBeenCalled();
    await settle();
    expect(tracker.inspect("lec").sent).toEqual([1, 2]);
    expect(onProgress).toHaveBeenCalledWith("lec", answer([1, 2]));

    // Hidden: page 3 isn't being read.
    await vi.advanceTimersByTimeAsync(BATCH_INTERVAL_MS);
    expect(tracker.inspect("lec").pending).toEqual([]);

    // Back: page 3 needs 2 full seconds again.
    setVisibility("visible");
    await vi.advanceTimersByTimeAsync(DWELL_MS - 1);
    expect(tracker.inspect("lec").pending).toEqual([]);
    await vi.advanceTimersByTimeAsync(1);
    expect(tracker.inspect("lec").pending).toEqual([3]);
  });

  it("sends with keepalive when the page unloads", async () => {
    makeTracker();
    tracker.setVisible("lec", [9]);
    await vi.advanceTimersByTimeAsync(DWELL_MS);
    window.dispatchEvent(new Event("pagehide"));
    expect(sendKeepalive).toHaveBeenCalledWith("lec", [9]);
  });

  it("keeps the pages when the keepalive request fails", async () => {
    makeTracker();
    sendKeepalive.mockRejectedValueOnce(Object.assign(new Error("Failed to fetch"), { status: null }));
    tracker.setVisible("lec", [4]);
    await vi.advanceTimersByTimeAsync(DWELL_MS);
    setVisibility("hidden");
    await settle();
    expect(tracker.inspect("lec").pending).toEqual([4]);
    setVisibility("visible");
    await vi.advanceTimersByTimeAsync(BATCH_INTERVAL_MS);
    expect(send).toHaveBeenCalledWith("lec", [4]);
  });

  it("sends and counts nothing when disabled (basic mode)", async () => {
    makeTracker({ enabled: false });
    tracker.setVisible("lec", [1, 2, 3]);
    await vi.advanceTimersByTimeAsync(BATCH_INTERVAL_MS * 3);
    setVisibility("hidden");
    window.dispatchEvent(new Event("pagehide"));
    await tracker.leave("lec");
    await settle();
    expect(send).not.toHaveBeenCalled();
    expect(sendKeepalive).not.toHaveBeenCalled();
    expect(tracker.inspect("lec")).toMatchObject({ pending: [], timing: [] });
  });

  it("starts the clocks for the visible pages once enabled", async () => {
    makeTracker({ enabled: false });
    tracker.setVisible("lec", [2]);
    await vi.advanceTimersByTimeAsync(DWELL_MS * 2);
    tracker.setEnabled(true);
    await vi.advanceTimersByTimeAsync(DWELL_MS);
    expect(tracker.inspect("lec").pending).toEqual([2]);
  });

  it("stops listening after stop()", async () => {
    makeTracker();
    tracker.setVisible("lec", [1]);
    await vi.advanceTimersByTimeAsync(DWELL_MS);
    tracker.stop();
    expect(send).toHaveBeenCalledWith("lec", [1]); // what was pending is sent on stop
    await settle();
    tracker.setVisible("lec", [2]);
    await vi.advanceTimersByTimeAsync(BATCH_INTERVAL_MS);
    setVisibility("hidden");
    expect(send).toHaveBeenCalledTimes(1);
    expect(sendKeepalive).not.toHaveBeenCalled();
  });
});
