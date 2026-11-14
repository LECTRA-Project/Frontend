import { useCallback, useEffect, useState } from "react";

import { deleteExam, isUnfinished, listAllExams } from "../../api/services/exams.js";
import { t } from "../../i18n/i18n.js";

/*
  The student's unfinished exams (being generated or ready to answer), newest first, for
  the setup step's "Continue an exam" list, and discarding one of them.

  Returns { exams, loading, error, available, reload, discard }:
    available  false when this server has no exams API (404 / 405)
    discard    DELETE, then drops the exam from the list; throws the ApiError on failure
*/
export function useUnfinishedExams() {
  const [exams, setExams] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [available, setAvailable] = useState(true);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    listAllExams({ signal: controller.signal }).then(
      (list) => {
        setExams(list.filter(isUnfinished));
        setError(null);
        setAvailable(true);
        setLoading(false);
      },
      (err) => {
        if (controller.signal.aborted || err?.name === "CanceledError") return;
        if (err?.status === 404 || err?.status === 405) setAvailable(false);
        else setError(err.message || t("Your exams could not be loaded."));
        setLoading(false);
      }
    );
    return () => controller.abort();
  }, [attempt]);

  const reload = useCallback(() => {
    setLoading(true);
    setAttempt((value) => value + 1);
  }, []);

  const discard = useCallback(async (id) => {
    await deleteExam(id);
    setExams((list) => list.filter((item) => item.id !== id));
  }, []);

  return { exams, loading, error, available, reload, discard };
}
