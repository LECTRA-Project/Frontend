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

  STUDY TIME: the tracker also counts how long each lecture had a page on screen, in a tab
  that is visible, while the student is there: after IDLE_MS without any input (pointer,
  keys, wheel, touch, scrolling) it stops counting until the next input, so a tab left open
  in the background or a walk away from the desk doesn't count. The seconds go with the
  pages: with any batch that has pages, alone once at least MIN_SECONDS_TO_SEND have
  gathered, and always when the viewer closes, the tab is hidden or the page unloads. At
  most MAX_SECONDS_PER_CALL go in one request (the rest follows); a failed request keeps
  them, a dropped one (404, 422) drops them.

    const tracker = createReadingTracker({ send, sendKeepalive, onProgress });
    tracker.start();                 // listens for tab hide / page unload, starts the batch timer
    tracker.setEnabled(true);
    tracker.setVisible(id, [1]);
    tracker.leave(id);               // viewer closed: stop the clocks, send what is left
    tracker.stop();

  send(lectureId, pages, seconds) and sendKeepalive(lectureId, pages, seconds) return
  promises of the backend's { viewed_pages, viewed, total, percent }; `pages` may be empty
  when only time is sent. onProgress(lectureId, data) receives the answer.
*/

export const DWELL_MS = 2000;
export const BATCH_INTERVAL_MS = 10000;
export const MAX_PAGES_PER_CALL = 200;
export const IDLE_MS = 5 * 60 * 1000;
export const MIN_SECONDS_TO_SEND = 30;
export const MAX_SECONDS_PER_CALL = 300;
// Pointer moves come in streams: one in this long is enough to know the student is there.
const INPUT_THROTTLE_MS = 1000;
const INPUT_EVENTS = ["pointerdown", "pointermove", "keydown", "wheel", "touchstart", "scroll"];

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
  idleMs = IDLE_MS,
  minSecondsToSend = MIN_SECONDS_TO_SEND,
  maxSecondsPerCall = MAX_SECONDS_PER_CALL,
  clock = () => Date.now(),
  win = typeof window !== "undefined" ? window : null,
  doc = typeof document !== "undefined" ? document : null,
} = {}) {
  let enabled = false;
  let started = false;
  let batchTimer = null;
  let lastInput = clock();
  // Per lecture: { visible: Set, timers: Map(page → timeout), pending, inflight, sent: Set,
  //   since: when its study time started counting (null: not counting), ms: time not sent yet }
  const lectures = new Map();

  function entry(lectureId) {
    let item = lectures.get(lectureId);
    if (!item) {
      item = { visible: new Set(), timers: new Map(), pending: new Set(), inflight: new Set(), sent: new Set(), since: null, ms: 0 };
      lectures.set(lectureId, item);
    }
    return item;
  }

  const hidden = () => doc?.visibilityState === "hidden";

  /* Adds the time counted so far (up to the moment the student went idle) and starts
     counting again from now if the lecture is still being read. */
  function settle(item, now = clock()) {
    const idleFrom = lastInput + idleMs;
    if (item.since !== null) {
      const end = Math.min(now, idleFrom);
      if (end > item.since) item.ms += end - item.since;
      item.since = null;
    }
    if (enabled && started && !hidden() && item.visible.size > 0 && now < idleFrom) item.since = now;
  }

  function settleAll(now = clock()) {
    for (const item of lectures.values()) settle(item, now);
  }

  function handleInput() {
    const now = clock();
    if (now - lastInput < INPUT_THROTTLE_MS) return;
    settleAll(now); // the time until now (or until the student went idle) is counted
    lastInput = now;
    settleAll(now); // and counting starts again if it had stopped
  }
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
    settle(item);
  }

  /* Sends one lecture's pending pages and study time with `transport`; what fails goes back
     to be sent later. `all`: send any time gathered, not only once there is enough of it. */
  async function sendLecture(lectureId, item, transport, { all = false } = {}) {
    settle(item);
    const gathered = Math.floor(item.ms / 1000);
    const enoughTime = gathered >= (all ? 1 : minSecondsToSend);
    if (item.pending.size === 0 && !enoughTime) return;
    const seconds = enoughTime || item.pending.size > 0 ? Math.min(gathered, maxSecondsPerCall) : 0;
    item.ms -= seconds * 1000;
    const pages = [...item.pending].sort((a, b) => a - b);
    item.pending.clear();
    for (const page of pages) item.inflight.add(page);
    // The time goes with the first request.
    const parts = pages.length > 0 ? chunks(pages, maxPagesPerCall) : [[]];
    for (const [index, part] of parts.entries()) {
      const time = index === 0 ? seconds : 0;
      try {
        const data = time > 0 ? await transport(lectureId, part, time) : await transport(lectureId, part);
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
        if (!drop) item.ms += time * 1000;
      }
    }
  }

  /* Sends the pending pages (and gathered time) of one lecture, or of all lectures. Never
     rejects. `all`: also a little time (the viewer closed, the tracker stops). */
  function flush(lectureId, { all = false } = {}) {
    if (!enabled) return Promise.resolve();
    const ids = lectureId === undefined ? [...lectures.keys()] : [lectureId];
    return Promise.all(ids.filter((id) => lectures.has(id)).map((id) => sendLecture(id, lectures.get(id), send, { all }))).then(() => {});
  }

  function flushKeepalive() {
    if (!enabled) return Promise.resolve();
    return Promise.all([...lectures].map(([id, item]) => sendLecture(id, item, sendKeepalive, { all: true }))).then(() => {});
  }

  /* The viewer closed or switched to another lecture: nothing of it is visible any more. */
  function leave(lectureId) {
    if (lectureId == null || !lectures.has(lectureId)) return Promise.resolve();
    setVisible(lectureId, []);
    return flush(lectureId, { all: true });
  }

  function handleVisibility() {
    settleAll(); // hidden: the time stops here; shown again: it starts from now
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
    settleAll();
    enabled = Boolean(value);
    settleAll();
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
    lastInput = clock();
    doc?.addEventListener("visibilitychange", handleVisibility);
    win?.addEventListener("pagehide", handlePageHide);
    for (const name of INPUT_EVENTS) win?.addEventListener(name, handleInput, { passive: true, capture: true });
    settleAll();
    startBatches();
    for (const item of lectures.values()) startClocks(item);
  }

  /* Stops listening and sends what is pending (the page is still there). Can start() again. */
  function stop() {
    if (!started) return;
    settleAll();
    started = false;
    settleAll();
    doc?.removeEventListener("visibilitychange", handleVisibility);
    win?.removeEventListener("pagehide", handlePageHide);
    for (const name of INPUT_EVENTS) win?.removeEventListener(name, handleInput, { capture: true });
    stopBatches();
    for (const item of lectures.values()) stopClocks(item);
    flush(undefined, { all: true });
  }

  /* For tests and debugging: the pages in each state for one lecture. */
  function inspect(lectureId) {
    const item = lectures.get(lectureId);
    const sorted = (set) => [...(set ?? [])].sort((a, b) => a - b);
    if (item) settle(item);
    return {
      pending: sorted(item?.pending),
      inflight: sorted(item?.inflight),
      sent: sorted(item?.sent),
      timing: sorted(item?.timers.keys()),
      seconds: Math.floor((item?.ms ?? 0) / 1000), // study time gathered, not sent yet
    };
  }

  return { start, stop, setEnabled, setVisible, leave, flush, flushKeepalive, inspect };
}
