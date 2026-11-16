import { useCallback, useEffect, useRef, useState } from "react";

import { createProject, listProjects, RECENT_PROJECTS } from "../../api/services/projects.js";
import { t } from "../../i18n/i18n.js";

/*
  The student's most recently active projects for the menu (RECENT_PROJECTS of them) and how
  many there are in all ("View all projects" lists them page by page).

  - Loaded once `enabled`; reload() reads them again (after a question in a project chat, a
    rename, a delete, …). A server without projects shows none (no error in the menu).
  - create(name) creates a project and resolves it (rejects with the error to show).
*/
export function useProjects({ enabled }) {
  const [recent, setRecent] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const request = useRef(null);

  const reload = useCallback(async () => {
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    try {
      const first = await listProjects({ page: 1, pageSize: RECENT_PROJECTS, signal: controller.signal });
      if (controller.signal.aborted) return;
      setRecent(first.projects);
      setTotal(first.total);
      setError(null);
    } catch (err) {
      if (controller.signal.aborted || err?.name === "CanceledError") return;
      setError(err.message || t("Your projects could not be loaded."));
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  }, []);

  // Initial load (`loading` already starts true, so state is only set once it settles).
  useEffect(() => {
    if (!enabled) return undefined;
    const controller = new AbortController();
    request.current = controller;
    listProjects({ page: 1, pageSize: RECENT_PROJECTS, signal: controller.signal }).then(
      (first) => {
        setRecent(first.projects);
        setTotal(first.total);
        setLoading(false);
      },
      (err) => {
        if (controller.signal.aborted) return;
        setError(err.message || t("Your projects could not be loaded."));
        setLoading(false);
      }
    );
    return () => controller.abort();
  }, [enabled]);

  const create = useCallback(
    async (name) => {
      const project = await createProject(name);
      reload();
      return project;
    },
    [reload]
  );

  return { recent, total, loading, error, reload, create };
}
