import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  BATCH_INTERVAL_MS,
  createReadingTracker,
  DWELL_MS,
  IDLE_MS,
  MAX_PAGES_PER_CALL,
  MAX_SECONDS_PER_CALL,
  MIN_SECONDS_TO_SEND,
} from "./readingTracker.js";

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

  // These tests are about pages: study time is off (idleMs 0), see "study time" below.
  function makeTracker({ enabled = true, ...options } = {}) {
    tracker = createReadingTracker({ send, sendKeepalive, onProgress, idleMs: 0, ...options });
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

describe("study time", () => {
  let send;
  let sendKeepalive;
  let tracker;
  const MINUTE = 60000;

  function makeTracker(options = {}) {
    tracker = createReadingTracker({ send, sendKeepalive, ...options });
    tracker.start();
    tracker.setEnabled(true);
    return tracker;
  }
  // The student does something (any key, scroll, pointer, touch counts).
  const act = () => window.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown" }));
  // Reads for `minutes`, doing something every minute.
  async function read(minutes) {
    for (let minute = 0; minute < minutes; minute += 1) {
      act();
      await vi.advanceTimersByTimeAsync(MINUTE);
    }
  }
  const secondsSent = (fn) => fn.mock.calls.reduce((total, call) => total + (call[2] ?? 0), 0);

  beforeEach(() => {
    vi.useFakeTimers();
    send = vi.fn(async (id, pages) => answer(pages));
    sendKeepalive = vi.fn(async (id, pages) => answer(pages));
  });

  afterEach(() => {
    tracker?.stop();
    tracker = null;
    setVisibility("visible");
    vi.useRealTimers();
  });

  it("sends about 10 minutes for 10 minutes of reading", async () => {
    makeTracker();
    tracker.setVisible("lec", [1]);
    await read(10);
    await tracker.leave("lec");
    expect(secondsSent(send)).toBe(600);
    // The time goes with the pages, and alone once 30 seconds have gathered.
    expect(send.mock.calls[0]).toEqual(["lec", [1], 10]);
    // Later batches carry time alone, never less than 30 s, except the last one on closing.
    const alone = send.mock.calls.slice(1, -1);
    expect(alone.length).toBeGreaterThan(0);
    expect(alone.every(([, pages, seconds]) => pages.length === 0 && seconds >= MIN_SECONDS_TO_SEND)).toBe(true);
  });

  it("doesn't count a tab in the background", async () => {
    makeTracker();
    tracker.setVisible("lec", [1]);
    await read(1);
    setVisibility("hidden"); // the time so far goes with the keepalive
    await settle();
    const before = secondsSent(send) + secondsSent(sendKeepalive);
    expect(before).toBe(60);
    for (let minute = 0; minute < 10; minute += 1) {
      act();
      await vi.advanceTimersByTimeAsync(MINUTE);
    }
    expect(tracker.inspect("lec").seconds).toBe(0);
    setVisibility("visible");
    await read(1);
    await tracker.leave("lec");
    expect(secondsSent(send) + secondsSent(sendKeepalive)).toBe(120);
  });

  it("stops counting when the student is away, and starts again on the next input", async () => {
    makeTracker({ intervalMs: 24 * 60 * MINUTE });
    tracker.setVisible("lec", [1]);
    act();
    await vi.advanceTimersByTimeAsync(IDLE_MS + 20 * MINUTE); // nobody there after 5 minutes
    expect(tracker.inspect("lec").seconds).toBe(IDLE_MS / 1000);
    act();
    await vi.advanceTimersByTimeAsync(MINUTE);
    expect(tracker.inspect("lec").seconds).toBe(IDLE_MS / 1000 + 60);
  });

  it("counts nothing without a page on screen, or before it is enabled", async () => {
    makeTracker({ intervalMs: 24 * 60 * MINUTE });
    tracker.setVisible("lec", []);
    await read(3);
    expect(tracker.inspect("lec").seconds).toBe(0);
    tracker.setEnabled(false);
    tracker.setVisible("lec", [1]);
    await read(3);
    expect(tracker.inspect("lec").seconds).toBe(0);
    tracker.setEnabled(true);
    await read(1);
    expect(tracker.inspect("lec").seconds).toBe(60);
  });

  it("sends a little time only when the viewer closes", async () => {
    makeTracker();
    tracker.setVisible("lec", [1]);
    act();
    await vi.advanceTimersByTimeAsync(DWELL_MS);
    await vi.advanceTimersByTimeAsync(BATCH_INTERVAL_MS); // the page goes, with its seconds
    expect(send).toHaveBeenCalledWith("lec", [1], 10);
    send.mockClear();
    await vi.advanceTimersByTimeAsync(BATCH_INTERVAL_MS); // 12 s more (since the batch): not enough alone
    expect(send).not.toHaveBeenCalled();
    await tracker.leave("lec");
    expect(send).toHaveBeenCalledWith("lec", [], 12);
  });

  it("sends at most 5 minutes in one request and keeps the rest", async () => {
    makeTracker({ intervalMs: 24 * 60 * MINUTE });
    tracker.setVisible("lec", [1]);
    await read(12);
    tracker.setVisible("lec", []);
    await tracker.flush("lec");
    expect(send).toHaveBeenCalledTimes(1);
    expect(send.mock.calls[0][2]).toBe(MAX_SECONDS_PER_CALL);
    expect(tracker.inspect("lec").seconds).toBe(720 - MAX_SECONDS_PER_CALL);
  });

  it("keeps the time after a failure and drops it for a lecture that is gone", async () => {
    makeTracker({ intervalMs: 24 * 60 * MINUTE });
    tracker.setVisible("lec", [1]);
    await read(1);
    tracker.setVisible("lec", []);
    send.mockRejectedValueOnce(Object.assign(new Error("offline"), { status: null }));
    await tracker.flush("lec", { all: true });
    expect(tracker.inspect("lec").seconds).toBe(60);
    send.mockRejectedValueOnce(Object.assign(new Error("gone"), { status: 404 }));
    await tracker.flush("lec", { all: true });
    expect(tracker.inspect("lec").seconds).toBe(0);
  });
});

