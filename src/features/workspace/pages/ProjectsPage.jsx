import { useEffect, useState } from "react";
import { useOutletContext, useSearchParams } from "react-router-dom";

import Button from "../../../components/ui/Button.jsx";
import Icon from "../../../components/ui/Icon.jsx";
import { listProjects, PROJECTS_PAGE_SIZE } from "../../../api/services/projects.js";
import { useI18n } from "../../../i18n/i18n.js";
import { activityDate } from "../projectText.js";
import "../projects.css";

/*
  All projects (/workspace/projects?page=2): the student's projects, most recently active
  first, PROJECTS_PAGE_SIZE per page with page navigation. Each shows its name, how many chats
  and materials it has and its last activity; a click opens it. "New project" creates one.
*/
export default function ProjectsPage() {
  const { projectsView } = useOutletContext();
  const { t } = useI18n();
  const [searchParams, setSearchParams] = useSearchParams();
  const page = Math.max(1, Number.parseInt(searchParams.get("page") ?? "1", 10) || 1);
  const [result, setResult] = useState(null); // { projects, total, total_pages, page }
  const [error, setError] = useState(null);
  const { version = 0, onOpenProject, onNewProject } = projectsView;

  useEffect(() => {
    const controller = new AbortController();
    listProjects({ page, pageSize: PROJECTS_PAGE_SIZE, signal: controller.signal }).then(
      (found) => {
        setResult(found);
        setError(null);
      },
      (err) => {
        if (controller.signal.aborted || err?.name === "CanceledError") return;
        setError(err.message || t("Your projects could not be loaded."));
      }
    );
    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, version]);

  const goTo = (next) => setSearchParams(next > 1 ? { page: String(next) } : {});
  const totalPages = result?.total_pages ?? 0;

  return (
    <section className="project projects" aria-labelledby="projects-title">
      <div className="chat__bar project__bar">
        <Icon name="folder" size={18} />
        <h1 id="projects-title" className="chat__title">
          {t("Projects")}
        </h1>
        <Button size="sm" variant="secondary" icon="plus" onClick={onNewProject}>
          {t("New project")}
        </Button>
      </div>

      <div className="project__scroll">
        {error ? (
          <p className="project__error" role="alert">
            {error}
          </p>
        ) : !result ? (
          <p className="project__note" role="status">
            {t("Loading your projects…")}
          </p>
        ) : result.total === 0 ? (
          <div className="chat__empty">
            <h2 className="chat__empty-title">{t("No projects yet")}</h2>
            <p className="chat__empty-text">
              {t("A project keeps a course’s materials and chats together. Every chat in it answers from the project’s materials.")}
            </p>
            <Button variant="primary" icon="plus" onClick={onNewProject}>
              {t("New project")}
            </Button>
          </div>
        ) : (
          <>
            {result.projects.length === 0 ? (
              <div className="project__note">
                <p>{t("There are no projects on this page.")}</p>
                <button type="button" className="cf-link-button" onClick={() => goTo(1)}>
                  {t("Go to the first page")}
                </button>
              </div>
            ) : (
              <ul className="projects__list" aria-label={t("Projects")}>
                {result.projects.map((project) => (
                  <li key={project.id}>
                    <button type="button" className="projects__item" onClick={() => onOpenProject(project.id)}>
                      <span className="cf-material__icon">
                        <Icon name="folder" size={16} />
                      </span>
                      <span className="projects__text">
                        <span className="projects__name">{project.name}</span>
                        <span className="projects__meta">
                          {project.chat_count === 1 ? t("1 chat") : t("{count} chats", { count: project.chat_count })}
                          {" · "}
                          {project.material_count === 1 ? t("1 material") : t("{count} materials", { count: project.material_count })}
                          {" · "}
                          {t("Active {date}", { date: activityDate(project.updated_at) })}
                        </span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {totalPages > 1 && (
              <nav className="projects__pages" aria-label={t("Pages of projects")}>
                <Button size="sm" icon="chevronLeft" disabled={page <= 1} onClick={() => goTo(page - 1)}>
                  {t("Previous")}
                </Button>
                <span className="projects__page" aria-current="page">
                  {t("Page {page} of {pages}", { page, pages: totalPages })}
                </span>
                <Button size="sm" disabled={page >= totalPages} onClick={() => goTo(page + 1)}>
                  {t("Next")}
                  <Icon name="chevronRight" />
                </Button>
              </nav>
            )}
          </>
        )}
      </div>
    </section>
  );
}
