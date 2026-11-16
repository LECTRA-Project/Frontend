/*
  READING TRACKER — reports which pages of a lecture the student actually read, for the
  course completion on the backend (POST /student_profile/lectures/{id}/progress).

  The viewers tell the tracker which pages (slides, notebook cells) are on screen now:
  setVisible(lectureId, [3, 4]). A page counts once it has stayed on screen for DWELL_MS
  without a break, so flipping through a file doesn't count as reading it. While the tab
  is hidden nothing is on screen: the clocks stop and start again from zero when the
  student comes back.

  Counted pages are batched per lecture and sent every BATCH_INTERVAL_MS, at most
  MAX_PAGES_PER_CALL per request. They are also sent at once when the viewer closes or
  switches lecture (leave), and when the tab is hidden or the page unloads; those two use
  `sendKeepalive` (a keepalive fetch), because a normal request can be cut off there.

  A page is sent once per session: the tracker remembers what was sent. A failed request
  keeps its pages for the next batch; a lecture that no longer exists (404) or a rejected
  body (422) drops them. Nothing is ever shown to the student for this.

  Until setEnabled(true) (and in basic mode, where it is never enabled) the tracker only
  remembers what is visible: no clocks run and nothing is sent.

    const tracker = createReadingTracker({ send, sendKeepalive, onProgress });
    tracker.start();                 // listens for tab hide / page unload, starts the batch timer
    tracker.setEnabled(true);
    tracker.setVisible(id, [1]);
    tracker.leave(id);               // viewer closed: stop the clocks, send what is left
    tracker.stop();

  send(lectureId, pages) and sendKeepalive(lectureId, pages) return promises of the
  backend's { viewed_pages, viewed, total, percent }; onProgress(lectureId, data) receives it.
*/

export const DWELL_MS = 2000;
export const BATCH_INTERVAL_MS = 10000;
export const MAX_PAGES_PER_CALL = 200;

// Errors after which sending the same pages again can't help.
const DROP_STATUSES = new Set([404, 422]);

function chunks(list, size) {
  const out = [];
  for (let index = 0; index < list.length; index += size) out.push(list.slice(index, index + size));
  return out;
}

export function createReadingTracker({
  send,
  sendKeepalive = send,
  onProgress = () => {},
  dwellMs = DWELL_MS,
  intervalMs = BATCH_INTERVAL_MS,
  maxPagesPerCall = MAX_PAGES_PER_CALL,
  win = typeof window !== "undefined" ? window : null,
  doc = typeof document !== "undefined" ? document : null,
} = {}) {
  let enabled = false;
  let started = false;
  let batchTimer = null;
  // Per lecture: { visible: Set, timers: Map(page → timeout), pending, inflight, sent: Set }
  const lectures = new Map();

  function entry(lectureId) {
    let item = lectures.get(lectureId);
    if (!item) {
      item = { visible: new Set(), timers: new Map(), pending: new Set(), inflight: new Set(), sent: new Set() };
      lectures.set(lectureId, item);
    }
    return item;
  }

  const hidden = () => doc?.visibilityState === "hidden";
  const counted = (item, page) => item.pending.has(page) || item.inflight.has(page) || item.sent.has(page);

  function stopClock(item, page) {
    clearTimeout(item.timers.get(page));
    item.timers.delete(page);
  }

  function stopClocks(item) {
    for (const page of [...item.timers.keys()]) stopClock(item, page);
  }

  // Start a clock for every visible page that isn't counted yet and has none running.
  function startClocks(item) {
    if (!enabled || !started || hidden()) return;
    for (const page of item.visible) {
      if (counted(item, page) || item.timers.has(page)) continue;
      item.timers.set(
        page,
        setTimeout(() => {
          item.timers.delete(page);
          if (item.visible.has(page) && !counted(item, page)) item.pending.add(page);
        }, dwellMs)
      );
    }
  }

  function setVisible(lectureId, pages) {
    if (lectureId == null) return;
    const item = entry(lectureId);
    item.visible = new Set((pages ?? []).filter((page) => Number.isInteger(page) && page >= 1));
    for (const page of [...item.timers.keys()]) if (!item.visible.has(page)) stopClock(item, page);
    startClocks(item);
  }

  /* Sends one lecture's pending pages with `transport`; failed pages go back to pending. */
  async function sendLecture(lectureId, item, transport) {
    if (item.pending.size === 0) return;
    const pages = [...item.pending].sort((a, b) => a - b);
    item.pending.clear();
    for (const page of pages) item.inflight.add(page);
    for (const part of chunks(pages, maxPagesPerCall)) {
      try {
        const data = await transport(lectureId, part);
        for (const page of part) {
          item.inflight.delete(page);
          item.sent.add(page);
        }
        if (data) onProgress(lectureId, data);
      } catch (error) {
        const drop = DROP_STATUSES.has(error?.status);
        for (const page of part) {
          item.inflight.delete(page);
          if (!drop) item.pending.add(page);
        }
      }
    }
  }

  /* Sends the pending pages of one lecture, or of all lectures. Never rejects. */
  function flush(lectureId) {
    if (!enabled) return Promise.resolve();
    const ids = lectureId === undefined ? [...lectures.keys()] : [lectureId];
    return Promise.all(ids.filter((id) => lectures.has(id)).map((id) => sendLecture(id, lectures.get(id), send))).then(() => {});
  }

  function flushKeepalive() {
    if (!enabled) return Promise.resolve();
    return Promise.all([...lectures].map(([id, item]) => sendLecture(id, item, sendKeepalive))).then(() => {});
  }

  /* The viewer closed or switched to another lecture: nothing of it is visible any more. */
  function leave(lectureId) {
    if (lectureId == null || !lectures.has(lectureId)) return Promise.resolve();
    setVisible(lectureId, []);
    return flush(lectureId);
  }

  function handleVisibility() {
    if (hidden()) {
      for (const item of lectures.values()) stopClocks(item);
      flushKeepalive();
    } else {
      for (const item of lectures.values()) startClocks(item);
    }
  }

  function handlePageHide() {
    flushKeepalive();
  }

  function startBatches() {
    if (enabled && started && batchTimer === null) batchTimer = setInterval(() => flush(), intervalMs);
  }

  function stopBatches() {
    clearInterval(batchTimer);
    batchTimer = null;
  }

  function setEnabled(value) {
    enabled = Boolean(value);
    if (enabled) {
      startBatches();
      for (const item of lectures.values()) startClocks(item);
    } else {
      stopBatches();
      for (const item of lectures.values()) stopClocks(item);
    }
  }

  function start() {
    if (started) return;
    started = true;
    doc?.addEventListener("visibilitychange", handleVisibility);
    win?.addEventListener("pagehide", handlePageHide);
    startBatches();
    for (const item of lectures.values()) startClocks(item);
  }

  /* Stops listening and sends what is pending (the page is still there). Can start() again. */
  function stop() {
    if (!started) return;
    started = false;
    doc?.removeEventListener("visibilitychange", handleVisibility);
    win?.removeEventListener("pagehide", handlePageHide);
    stopBatches();
    for (const item of lectures.values()) stopClocks(item);
    flush();
  }

  /* For tests and debugging: the pages in each state for one lecture. */
  function inspect(lectureId) {
    const item = lectures.get(lectureId);
    const sorted = (set) => [...(set ?? [])].sort((a, b) => a - b);
    return { pending: sorted(item?.pending), inflight: sorted(item?.inflight), sent: sorted(item?.sent), timing: sorted(item?.timers.keys()) };
  }

  return { start, stop, setEnabled, setVisible, leave, flush, flushKeepalive, inspect };
}
