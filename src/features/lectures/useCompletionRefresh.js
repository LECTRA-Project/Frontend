import { useCallback, useEffect, useRef } from "react";

import { getLecture } from "../../api/services/lectures.js";

/*
  Keeps a lecture's course completion (the ring beside each material in the menu) current
  while the student reads.

  The reading tracker saves the pages read every 10 s, and at once when the viewer closes.
  When a save raises the count of pages read, refresh(lectureId, progress) is called with
  the save's answer. The backend's answer carries the lecture's completion_percent after
  the save, which goes straight to onUpdate(lectureId, percent): no extra request.

  Fallback for an older backend whose save doesn't send completion_percent: that one lecture
  is read again (GET /student_profile/lectures/{id}) for its completion_percent. So it costs
  one small request per save that counted new pages, and nothing while the student only
  looks at pages already read. At most one such request per lecture is on its way: a
  refresh asked for meanwhile runs once after it, so the last answer is the newest; a
  completion that arrives with a save meanwhile wins over the request's answer. Failures
  are ignored (the ring keeps its value), and so is a lecture without completion_percent.
*/
export function useCompletionRefresh({ onUpdate }) {
  const onUpdateRef = useRef(onUpdate);
  useEffect(() => {
    onUpdateRef.current = onUpdate;
  });
  // lectureId → "running" | "again" (another refresh was asked for while running)
  //           | "stale" (a save brought a newer completion: the request's answer is dropped)
  const running = useRef(new Map());
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  return useCallback(function refresh(lectureId, progress) {
    if (!lectureId) return;
    const known = progress?.completion_percent;
    if (typeof known === "number") {
      if (running.current.has(lectureId)) running.current.set(lectureId, "stale");
      if (mounted.current) onUpdateRef.current?.(lectureId, known);
      return;
    }
    if (running.current.get(lectureId) === "stale") return;
    if (running.current.has(lectureId)) {
      running.current.set(lectureId, "again");
      return;
    }
    running.current.set(lectureId, "running");
    getLecture(lectureId)
      .then(
        (lecture) => {
          const stale = running.current.get(lectureId) === "stale";
          if (mounted.current && !stale && typeof lecture?.completion_percent === "number") {
            onUpdateRef.current?.(lectureId, lecture.completion_percent);
          }
        },
        () => {}
      )
      .finally(() => {
        const again = running.current.get(lectureId) === "again";
        running.current.delete(lectureId);
        if (again && mounted.current) refresh(lectureId);
      });
  }, []);
}
