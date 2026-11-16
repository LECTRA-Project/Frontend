import { useCallback, useEffect, useRef } from "react";

import { getLecture } from "../../api/services/lectures.js";

/*
  Keeps a lecture's course completion (the ring beside each material in the menu) current
  while the student reads.

  The reading tracker saves the pages read every 10 s, and at once when the viewer closes.
  When a save raises the count of pages read, refresh(lectureId) reads that one lecture
  again (GET /student_profile/lectures/{id}) and hands its completion_percent to
  onUpdate(lectureId, percent). So it costs one small request per save that counted new
  pages, and nothing while the student only looks at pages already read.

  At most one request per lecture is on its way: a refresh asked for meanwhile runs once
  after it, so the last answer is the newest. Failures are ignored (the ring keeps its
  value), and so is a backend that sends no completion_percent.
*/
export function useCompletionRefresh({ onUpdate }) {
  const onUpdateRef = useRef(onUpdate);
  useEffect(() => {
    onUpdateRef.current = onUpdate;
  });
  // lectureId → "running" | "again" (another refresh was asked for while running)
  const running = useRef(new Map());
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  return useCallback(function refresh(lectureId) {
    if (!lectureId) return;
    if (running.current.has(lectureId)) {
      running.current.set(lectureId, "again");
      return;
    }
    running.current.set(lectureId, "running");
    getLecture(lectureId)
      .then(
        (lecture) => {
          if (mounted.current && typeof lecture?.completion_percent === "number") onUpdateRef.current?.(lectureId, lecture.completion_percent);
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
