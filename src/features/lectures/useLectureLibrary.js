import { useCallback, useEffect, useRef, useState } from "react";

import {
  deleteLecture,
  detectServerFeatures,
  listAllLectures,
  reprocessLecture,
  updateLecture,
  uploadLecture,
} from "../../api/services/lectures.js";
import { detectChat } from "../../api/services/chat.js";
import { isInProgress, titleFromFileName } from "./materialTypes.js";

const POLL_INTERVAL_MS = 3000;

/*
  The signed-in student's lecture library, loaded from the backend.

  - Loads all lectures on mount.
  - While any lecture is still processing, polls every 3 s so statuses move from
    Processing to Completed / Failed without a reload.
  - `uploads` are files currently being sent (with progress %); they become real
    lectures once the backend answers.
*/
export function useLectureLibrary({ pollInterval = POLL_INTERVAL_MS } = {}) {
  const [lectures, setLectures] = useState([]);
  const [uploads, setUploads] = useState([]); // { id, name, progress, error }
  const [loading, setLoading] = useState(true);
  // { ai, chat } once known: whether the backend has AI processing (and the one-shot
  // assistant), and whether it has the Lecture Chat API (saved chat sessions).
  const [features, setFeatures] = useState(null);
  const [error, setError] = useState(null);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const refresh = useCallback(async ({ signal } = {}) => {
    try {
      const list = await listAllLectures({ signal });
      if (!mounted.current) return list;
      setLectures(list);
      setError(null);
      return list;
    } catch (err) {
      if (signal?.aborted || err?.name === "CanceledError") return null;
      if (mounted.current) setError(err);
      return null;
    } finally {
      if (mounted.current) setLoading(false);
    }
  }, []);

  // Initial load (state is only set once the request settles, like useApi).
  useEffect(() => {
    const controller = new AbortController();
    Promise.all([detectServerFeatures({ signal: controller.signal }), detectChat({ signal: controller.signal })]).then(
      ([server, chat]) => setFeatures({ ...server, chat }),
      () => {}
    );
    listAllLectures({ signal: controller.signal }).then(
      (list) => {
        setLectures(list);
        setLoading(false);
      },
      (err) => {
        if (controller.signal.aborted) return;
        setError(err);
        setLoading(false);
      }
    );
    return () => controller.abort();
  }, []);

  const anyProcessing = lectures.some(isInProgress);
  useEffect(() => {
    if (!anyProcessing) return undefined;
    const timer = setInterval(() => refresh(), pollInterval);
    return () => clearInterval(timer);
  }, [anyProcessing, pollInterval, refresh]);

  const replaceLecture = useCallback((updated) => {
    setLectures((list) => list.map((item) => (item.id === updated.id ? updated : item)));
  }, []);

  /* Upload files one after another; returns the created lectures. */
  const upload = useCallback(async (files, { course } = {}) => {
    const pending = files.map((file) => ({ id: crypto.randomUUID(), name: file.name, file, progress: 0, error: null }));
    setUploads((list) => [...list, ...pending]);
    const created = [];
    for (const item of pending) {
      try {
        const lecture = await uploadLecture({
          file: item.file,
          title: titleFromFileName(item.name),
          course,
          onProgress: (progress) =>
            setUploads((list) => list.map((u) => (u.id === item.id ? { ...u, progress } : u))),
        });
        created.push(lecture);
        setLectures((list) => [lecture, ...list.filter((l) => l.id !== lecture.id)]);
        setUploads((list) => list.filter((u) => u.id !== item.id));
      } catch (err) {
        setUploads((list) => list.map((u) => (u.id === item.id ? { ...u, error: err.message } : u)));
      }
    }
    return created;
  }, []);

  const dismissUpload = useCallback((id) => setUploads((list) => list.filter((u) => u.id !== id)), []);

  const update = useCallback(
    async (id, changes) => {
      const updated = await updateLecture(id, changes);
      replaceLecture(updated);
      return updated;
    },
    [replaceLecture]
  );

  const remove = useCallback(async (id) => {
    await deleteLecture(id);
    setLectures((list) => list.filter((item) => item.id !== id));
  }, []);

  const retry = useCallback(
    async (id) => {
      const updated = await reprocessLecture(id);
      replaceLecture(updated);
      return updated;
    },
    [replaceLecture]
  );

  return { lectures, uploads, loading, error, features, refresh, upload, dismissUpload, update, remove, retry };
}
