import { useCallback, useEffect, useState } from "react";

import { getExam, POLL_INTERVAL_MS } from "../../api/services/exams.js";

/*
  The exam with `examId` (null: none), read again every POLL_INTERVAL_MS while its status
  is "generating", so the page can show "2 of 5 questions ready" and then the questions.

  Returns { exam, error, loading, reload, seed }:
    error   the ApiError of the last read (polling stops; reload() tries again)
    seed    shows an exam already in hand (e.g. the one just started) until the read lands
*/
export function useExam(examId) {
  const [state, setState] = useState({ id: null, exam: null, error: null });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!examId) return undefined;
    const controller = new AbortController();
    let timer = null;
    const read = async () => {
      try {
        const exam = await getExam(examId, { signal: controller.signal });
        if (controller.signal.aborted) return;
        setState({ id: examId, exam, error: null });
        if (exam.status === "generating") timer = setTimeout(read, POLL_INTERVAL_MS);
      } catch (err) {
        if (controller.signal.aborted || err?.name === "CanceledError") return;
        setState((previous) => ({ id: examId, exam: previous.id === examId ? previous.exam : null, error: err }));
      }
    };
    read();
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [examId, attempt]);

  const reload = useCallback(() => {
    setState((previous) => ({ ...previous, error: null }));
    setAttempt((value) => value + 1);
  }, []);

  const seed = useCallback((exam) => setState({ id: exam.id, exam, error: null }), []);

  const current = examId && state.id === examId ? state : { exam: null, error: null };
  return {
    exam: current.exam,
    error: current.error,
    loading: Boolean(examId) && !current.exam && !current.error,
    reload,
    seed,
  };
}
