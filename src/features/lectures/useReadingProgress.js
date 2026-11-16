import { useCallback, useEffect, useState } from "react";

import { getReadingProgress, recordReadingProgress, recordReadingProgressKeepalive } from "../../api/services/lectures.js";
import { createReadingTracker } from "./readingTracker.js";

/*
  Reading progress for the workspace: one reading tracker (readingTracker.js) for the
  signed-in session, and the "Read 12 of 65" numbers per lecture.

  `enabled` is false in basic mode (a backend without the AI routes) and while the
  backend's features are unknown: then nothing is sent or loaded.

  Returns:
    progressFor(id)        { viewed, total } once loaded (null before, or when disabled)
    load(id, { signal })   GET the lecture's progress (failures are ignored)
    setVisible(id, pages)  the pages on screen now (from the viewers)
    leave(id)              the viewer closed or switched lecture: send what is left
*/
export function useReadingProgress({ enabled }) {
  const [progress, setProgress] = useState({}); // lectureId → { viewed, total }

  const update = useCallback((lectureId, data) => {
    if (!data || typeof data.viewed !== "number" || typeof data.total !== "number") return;
    setProgress((previous) => {
      const known = previous[lectureId];
      // An older answer (e.g. a slow GET after a POST) never lowers the count.
      if (known && known.total === data.total && known.viewed > data.viewed) return previous;
      return { ...previous, [lectureId]: { viewed: data.viewed, total: data.total } };
    });
  }, []);

  const [tracker] = useState(() =>
    createReadingTracker({
      send: recordReadingProgress,
      sendKeepalive: recordReadingProgressKeepalive,
      onProgress: update,
    })
  );

  useEffect(() => {
    tracker.start();
    return () => tracker.stop();
  }, [tracker]);

  useEffect(() => {
    tracker.setEnabled(enabled);
  }, [tracker, enabled]);

  const load = useCallback(
    (lectureId, { signal } = {}) => {
      if (!enabled || !lectureId) return Promise.resolve();
      return getReadingProgress(lectureId, { signal }).then(
        (data) => {
          if (!signal?.aborted) update(lectureId, data);
        },
        () => {}
      );
    },
    [enabled, update]
  );

  const setVisible = useCallback((lectureId, pages) => tracker.setVisible(lectureId, pages), [tracker]);
  const leave = useCallback((lectureId) => tracker.leave(lectureId), [tracker]);
  const progressFor = useCallback((lectureId) => (enabled ? progress[lectureId] ?? null : null), [enabled, progress]);

  return { enabled, progressFor, load, setVisible, leave };
}
