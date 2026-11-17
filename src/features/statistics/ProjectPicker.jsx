import { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";

import { getCompletion } from "../../api/services/statistics.js";
import { t, useI18n } from "../../i18n/i18n.js";
import "./projectPicker.css";

/*
  Statistics → which numbers: all projects, or one project (a course: its materials, the
  exams on them and its chats). The list comes from GET /api/stats/completion (`projects`,
  with each one's completion). Nothing is shown for a student without projects.

  Props:
    projectId            the chosen project (from the URL), or null for all
    onChange(id, { replace, dropped })   another project, or null for all; `dropped` marks
                         the way back from a project that isn't there (see below)
  A project that isn't the student's any more (deleted, an old link) goes back to all
  projects, with a short notice (kept in the history entry's state, so it shows once).
*/
export default function ProjectPicker({ projectId, onChange }) {
  useI18n(); // re-render in a new interface language
  const [projects, setProjects] = useState(null);
  const notice = useLocation().state?.droppedProject
    ? t("That project isn’t in your projects any more. Showing all projects.")
    : null;

  useEffect(() => {
    const controller = new AbortController();
    getCompletion({ signal: controller.signal }).then(
      (data) => setProjects(data?.projects ?? []),
      () => {
        if (!controller.signal.aborted) setProjects([]);
      }
    );
    return () => controller.abort();
  }, []);

  const known = projects?.some((project) => project.project_id === projectId) ?? true;
  useEffect(() => {
    if (!projectId || known) return;
    onChange(null, { replace: true, dropped: true });
  }, [projectId, known, onChange]);

  if (!projects || (projects.length === 0 && !notice)) return null;
  return (
    <div className="stats-project">
      {projects.length > 0 && (
        <label className="stats-project__field">
          <span className="stats-project__label">{t("Project")}</span>
          <select
            className="stats-project__select"
            value={projectId && known ? projectId : ""}
            onChange={(event) => onChange(event.target.value || null)}
          >
            <option value="">{t("All projects")}</option>
            {projects.map((project) => (
              <option key={project.project_id} value={project.project_id}>
                {project.lectures > 0
                  ? t("{name} · {percent}% complete", { name: project.name, percent: project.overall_percent })
                  : project.name}
              </option>
            ))}
          </select>
        </label>
      )}
      {notice && (
        <p className="stats-project__notice" role="status">
          {notice}
        </p>
      )}
    </div>
  );
}
